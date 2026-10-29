// ============================================================
// DASHBOARD PAGE — User + Admin Görünümü
// ============================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CardBalance } from '../api';
import { api, bankApi, collectionApi, loadCardApi } from '../api';
import StatCard from '../components/StatCard';
import { useAuthStore } from '../stores/authStore';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuthStore();

  // ============================================================
  // STATE
  // ============================================================
  const [myStats, setMyStats] = useState<any>(null);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ============================================================
  // EFFECTS
  // ============================================================
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // DATA LOADING
  // ============================================================
  async function loadData() {
    setLoading(true);
    try {
      // Herkes için: kendi istatistikleri
      const myRes = await api.get('/my-stats').catch(() => null);
      if (myRes) setMyStats(myRes.data);

      // Admin için: sistem + dolum bilgileri
      if (isAdmin()) {
        const [adminRes, sum, banks, loadCards] = await Promise.all([
          api.get('/admin/user-stats').catch(() => null),
          collectionApi.summary().catch(() => null),
          bankApi.list().catch(() => []),
          loadCardApi.list().catch(() => []),
        ]);

        if (adminRes) setAdminStats(adminRes.data);
        setSummary(sum);
        // Keep loading both resources so their failures do not block the dashboard summary.
        void banks;
        void loadCards;
      }
    } catch (e) {
      console.error('[DASHBOARD]', e);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // COMPUTED
  // ============================================================
  const cardsWithRemaining: CardBalance[] = (summary?.balances || []).filter(
    (b: CardBalance) => parseFloat(String(b.remaining)) > 0
  );

  // ============================================================
  // LOADING
  // ============================================================
  if (loading) {
    return (
      <div className="text-center text-gray-500 py-12 text-sm">
        Yükleniyor...
      </div>
    );
  }

  const userName = user?.username || 'kullanıcı';

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div>
      {/* ============================================================
          HOŞ GELDİN
      ============================================================ */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          Hoş geldin, {userName}!
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin() ? '👑 Admin Paneli' : '👤 Kullanıcı Paneli'}
        </p>
      </div>

      {/* ============================================================
          KENDİ İSTATİSTİKLERİM (herkes görür)
      ============================================================ */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-accent mb-3">
          📊 Senin İstatistiklerin
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Toplam Kart Check"
            value={myStats?.totalCards || 0}
          />
          <StatCard
            label="Toplam BIN Check"
            value={myStats?.totalBins || 0}
            variant="live"
          />
          <StatCard
            label="Live Kart"
            value={myStats?.totalLiveCards || 0}
          />
          <StatCard
            label="Bugün Check"
            value={`${myStats?.todayCards || 0} / ${myStats?.todayBins || 0}`}
            variant="warn"
          />
        </div>
      </div>

      {/* ============================================================
          BUGÜN + BU HAFTA
      ============================================================ */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Bugün</div>
          <div className="text-lg font-bold text-accent">
            {myStats?.todayCards || 0} Kart
          </div>
          <div className="text-sm text-info">
            {myStats?.todayBins || 0} BIN
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Bu Hafta</div>
          <div className="text-lg font-bold text-accent">
            {myStats?.weekCards || 0} Kart
          </div>
          <div className="text-sm text-info">
            {myStats?.weekBins || 0} BIN
          </div>
        </div>
      </div>

      {/* ============================================================
          ADMİN PANELİ (sadece admin görür)
      ============================================================ */}
      {isAdmin() && adminStats && (
        <>
          <div className="mb-6 pt-6 border-t border-border">
            <h2 className="text-sm font-bold text-warn mb-3">
              👑 Tüm Kullanıcıların İstatistikleri
            </h2>

            {/* ============================================
                TOPLAM STATS
            ============================================ */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <StatCard
                label="Kullanıcı"
                value={adminStats.totals.users}
              />
              <StatCard
                label="Toplam Kart"
                value={adminStats.totals.cardChecks}
              />
              <StatCard
                label="Toplam BIN"
                value={adminStats.totals.binChecks}
                variant="live"
              />
              <StatCard
                label="Live Kart"
                value={adminStats.totals.liveCards}
              />
              <StatCard
                label="Bugün (K/B)"
                value={`${adminStats.totals.todayCardChecks}/${adminStats.totals.todayBinChecks}`}
                variant="warn"
              />
            </div>

            {/* ============================================
                KULLANICI BAZLI TABLO
            ============================================ */}
            <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-[#1f1f1f] border-b border-border text-xs font-bold text-gray-400 uppercase grid grid-cols-6 gap-2">
                <div className="col-span-2">Kullanıcı</div>
                <div className="text-right">Bugün</div>
                <div className="text-right">Kart</div>
                <div className="text-right">BIN</div>
                <div className="text-right">Live</div>
              </div>
              <div className="divide-y divide-border">
                {adminStats.users.map((u: any) => (
                  <div
                    key={u.id}
                    className="px-4 py-3 grid grid-cols-6 gap-2 items-center hover:bg-[#1a1a1a]"
                  >
                    <div className="col-span-2 min-w-0">
                      <div className="text-sm text-info truncate" title={u.username || `#${u.id}`}>
                        {u.username || `#${u.id}`}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {u.role === 'admin' ? '👑 Admin' : '👤 User'}
                      </div>
                    </div>
                    <div className="text-right text-sm text-warn font-mono">
                      {u.todayCards}/{u.todayBins}
                    </div>
                    <div className="text-right text-sm text-accent font-mono">
                      {u.totalCards}
                    </div>
                    <div className="text-right text-sm text-info font-mono">
                      {u.totalBins}
                    </div>
                    <div className="text-right text-sm text-live font-mono">
                      {u.liveCards}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ============================================================
              TAHSİLAT BİLDİRİMİ (admin — dolum sistemi)
          ============================================================ */}
          {cardsWithRemaining.length > 0 && (
            <div className="bg-warn/10 border border-warn rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔔</span>
                  <div>
                    <div className="font-bold text-warn text-sm">
                      {cardsWithRemaining.length} kartta tahsil edilecek tutar var
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Toplam: ${(summary.totalRemaining || 0).toLocaleString('en-US')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/collections')}
                  className="bg-warn hover:bg-yellow-600 text-black px-3 py-2 rounded-md text-xs font-bold"
                >
                  Tahsilat →
                </button>
              </div>

              <div className="space-y-2 max-h-[150px] overflow-y-auto">
                {cardsWithRemaining.slice(0, 5).map((card) => (
                  <div
                    key={card.load_card_id}
                    onClick={() => navigate('/collections')}
                    className="bg-bg-card border border-border rounded-md p-2 cursor-pointer hover:border-warn transition flex justify-between items-center text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-info truncate">
                        {card.card_number}
                      </div>
                      <div className="text-gray-500 mt-0.5 truncate">
                        {card.card_holder_name}
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-warn font-bold">
                        ${parseFloat(String(card.remaining)).toLocaleString('en-US')}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {card.load_count} dolum
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================
              HIZLI ERİŞİM (admin)
          ============================================================ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <QuickAccess icon="🏦" title="Banka Hesapları" to="/bank-accounts" />
            <QuickAccess icon="💳" title="Dolum Kartları" to="/load-cards" />
            <QuickAccess icon="💰" title="Dolumlar" to="/loads" />
            <QuickAccess icon="📥" title="Tahsilatlar" to="/collections" />
          </div>
        </>
      )}

      {/* ============================================================
          HIZLI ERİŞİM (herkes)
      ============================================================ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        <QuickAccess icon="📋" title="Kartlar" to="/cards" />
        <QuickAccess icon="🔍" title="BIN Check" to="/bin" />
        <QuickAccess icon="🔍" title="Check" to="/check" />
        {isAdmin() && (
          <QuickAccess icon="👥" title="Kullanıcılar" to="/admin/users" />
        )}
      </div>
    </div>
  );
}

// ============================================================
// QUICK ACCESS BUTTON
// ============================================================
function QuickAccess({
  icon,
  title,
  to,
}: {
  icon: string;
  title: string;
  to: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="bg-bg-card border border-border rounded-lg p-4 text-center hover:border-accent transition cursor-pointer"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-xs font-bold text-gray-300">{title}</div>
    </button>
  );
}
