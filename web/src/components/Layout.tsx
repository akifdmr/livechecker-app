import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuthStore } from '../stores/authStore';

const userLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/profile', label: 'Hesabım' },
  { to: '/ledger', label: 'Kredi defterim' },
  { to: '/messages', label: 'Mesajlar' },
  { to: '/cards', label: 'Kartlar' },
  { to: '/bin', label: 'BIN Ara' },
  { to: '/check', label: 'Kontrol' },
  { to: '/import', label: 'İçe Aktar' },
  { to: '/processor-dumps', label: 'Processor Dump' },
  { to: '/favs', label: 'Favoriler' },
  { to: '/processors', label: 'Processors' },
];

const checkerLinks = [
  { to: '/profile', label: 'Hesabım' },
  { to: '/messages', label: 'Mesajlar' },
  { to: '/subscriptions', label: 'Abonelik check' },
  { to: '/bin', label: 'BIN Check' },
  { to: '/bin-history', label: 'Kontrol geçmişim' },
];

const adminLinks = [
  {
    label: '⚙️ Admin',
    isDropdown: true,
    children: [
      { to: '/admin', label: '📊 Sistem İstatistikleri' },
      { to: '/admin/users', label: '👥 Kullanıcılar' },
      { to: '/admin/payments', label: '💳 Ödeme ayarları & krediler' },
      { to: '/provider-selection', label: '🎛️ Varsayılan POS Provider' },
      { to: '/roles', label: '🛡️ Roller & Aksiyonlar' },
      { to: '/bank-accounts', label: '🏦 Banka Hesapları' },
      { to: '/load-cards', label: '💳 Dolum Kartları' },
      { to: '/loads', label: '💰 Dolumlar' },
      { to: '/collections', label: '📥 Tahsilatlar' },
    ],
  },
];

const providerLinks = [
  {
    label: '💳 Provider İşlemleri',
    isDropdown: true,
    children: [
      { to: '/pos', label: '💳 Multi-Provider POS' },
      { to: '/enrollments', label: '🔗 Card Enrollments' },
      { to: '/provisions', label: '🔒 Provizyonlar' },
      { to: '/transactions', label: '📋 İşlem Geçmişi' },
      { to: '/analytics/routing', label: '📊 BIN Analiz' },   // ⭐ YENİ
      { to: '/processor-routing', label: '⚙️ Processor Routing' },
      { to: '/providers/summary', label: '📈 Provider Özet' },
      { to: '/providers/transactions', label: '🔧 Void/Capture/Refund' },
    ],
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const { user, token, isAdmin, hasPermission, logout, updateUser } = useAuthStore();
  const baseUserLinks = user?.role === 'admin'
    ? userLinks
    : Number(user?.credits || 0) <= 0
      ? userLinks.filter((link) => ['/dashboard', '/profile', '/ledger', '/messages'].includes(link.to))
      : user?.role === 'checker' ? checkerLinks : userLinks;
  const visibleUserLinks = hasPermission('payments.sale')
    ? [...baseUserLinks, { to: '/stripe-checkout', label: 'Stripe Checkout' }]
    : baseUserLinks;

  useEffect(() => {
    if (!token) return;
    let active = true;
    const refreshSession = async () => {
      try {
        const currentUser = await authApi.me();
        if (active) updateUser(currentUser);
      } catch { /* API interceptor handles a revoked or expired session. */ }
    };
    refreshSession();
    const timer = window.setInterval(refreshSession, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, updateUser]);

  function handleLogout() {
    if (token === 'cookie-session') void authApi.logout().catch(() => {});
    logout();
    navigate('/login', { replace: true });
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive
        ? 'bg-accent/15 text-accent'
        : 'text-gray-400 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-[#090b10] text-white md:flex">
      <aside className="border-b border-white/10 bg-[#0d1017] p-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between mb-5 md:block">
          <NavLink to="/dashboard" className="text-lg font-bold tracking-wide text-white">
            LiveChecker
          </NavLink>
          <span className="text-xs text-gray-500 md:mt-1 md:block">
            {user?.username || 'Hesap'}{user?.role !== 'admin' && ` · ${Number(user?.credits || 0).toFixed(2)} kredi`}
          </span>
        </div>

        <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:block md:space-y-1">
          {visibleUserLinks.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        {(isAdmin() || hasPermission('payments.view')) && (
          <>
            <p className="mb-2 mt-5 px-3 text-[10px] font-bold uppercase tracking-widest text-gray-600">
              Finans
            </p>
            <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:block md:space-y-1">
              {providerLinks.map((link) => (
                <div key={link.label}>
                  <p className="px-3 py-2 text-sm font-semibold text-gray-300">
                    {link.label}
                  </p>
                  {link.children.map((child) => (
                    <NavLink key={child.to} to={child.to} className={linkClass}>
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>

            <p className="mb-2 mt-5 px-3 text-[10px] font-bold uppercase tracking-widest text-gray-600">
              Yönetim
            </p>
            <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:block md:space-y-1">
              {isAdmin() && adminLinks.map((link) => (
                <div key={link.label}>
                  <p className="px-3 py-2 text-sm font-semibold text-gray-300">
                    {link.label}
                  </p>
                  {link.children.map((child) => (
                    <NavLink key={child.to} to={child.to} className={linkClass}>
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
          </>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="px-3 py-2 mt-5 text-sm text-gray-400 transition-colors rounded-lg hover:bg-red-500/10 hover:text-red-300"
        >
          Çıkış yap
        </button>
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
