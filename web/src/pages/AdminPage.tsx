// ============================================================
// ADMIN PAGE — Kullanıcı Yönetimi + Sistem İstatistikleri
// ============================================================
import { useEffect, useState } from 'react';
import { adminApi, api } from '../api';
import StatCard from '../components/StatCard';

export default function AdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'checker' | 'admin'>('checker');
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userChecks, setUserChecks] = useState<any[]>([]);
  const [subscriptionChecks, setSubscriptionChecks] = useState<any[]>([]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [s, u, sys] = await Promise.all([
        adminApi.stats(),
        adminApi.users(),
        api.get('/admin/user-stats').then((r) => r.data).catch(() => null),
      ]);
      setStats(s);
      setUsers(u);
      setSystemStats(sys);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleAddUser() {
    setError('');
    if (!newEmail || !newPassword) return setError('Email ve şifre gerekli');
    try {
      await adminApi.addUser(newEmail, newPassword, newRole);
      setShowAdd(false);
      setNewEmail('');
      setNewPassword('');
      setNewRole('checker');
      loadAll();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
  }

  async function handleDelete(id: number, email: string) {
    if (!confirm(`${email} silinsin mi?`)) return;
    try {
      await adminApi.deleteUser(id);
      loadAll();
    } catch (e: any) {
      alert(e.response?.data?.error || e.message);
    }
  }

  async function showUserChecks(user: any) {
    setSelectedUser(user);
    setError('');
    try {
      const [bins, subscriptions] = await Promise.all([
        adminApi.binChecks(user.id),
        adminApi.subscriptionChecks(user.id),
      ]);
      setUserChecks(bins);
      setSubscriptionChecks(subscriptions);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
      setUserChecks([]);
      setSubscriptionChecks([]);
    }
  }

  async function changeRole(userId: number, role: string) {
    try {
      await adminApi.updateUserRoles(userId, [role]);
      await loadAll();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
  }

  return (
    <div>
      {/* STATS */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Kullanıcı" value={stats?.totalUsers || 0} />
        <StatCard label="Kart" value={stats?.totalCards || 0} />
        <StatCard label="Check" value={stats?.totalChecks || 0} />
      </div>

      {/* SİSTEM İSTATİSTİKLERİ */}
      {systemStats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Toplam Kart Check" value={systemStats.totals.cardChecks} />
          <StatCard label="Toplam BIN Check" value={systemStats.totals.binChecks} variant="live" />
          <StatCard label="Bugün Check" value={systemStats.totals.todayCardChecks + systemStats.totals.todayBinChecks} variant="warn" />
        </div>
      )}

      {/* KULLANICILAR */}
      <div className="bg-bg-card border border-border rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-accent font-bold text-lg">👥 Kullanıcılar</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-accent hover:bg-green-600 text-white px-4 py-2 rounded-md text-xs font-bold"
          >
            ➕ Ekle
          </button>
        </div>

        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="bg-bg-input border border-border rounded-md p-3 flex items-center justify-between"
            >
              <div>
                <div className="text-info text-sm font-mono">{u.email}</div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {u.role} | Kart: {u.card_count} | Kart check: {u.check_count} | BIN: {u.bin_check_count || 0} | Abonelik ön kontrol: {u.subscription_precheck_count || 0}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                  className="rounded bg-bg-input border border-border px-2 py-1 text-xs"
                  disabled={u.id === selectedUser?.id}
                >
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                  <option value="finance">Finance</option>
                  <option value="viewer">Viewer</option>
                  <option value="checker">Checker</option>
                </select>
                <button onClick={() => showUserChecks(u)} className="rounded bg-accent px-3 py-1 text-xs text-white">Geçmiş</button>
                <button onClick={() => handleDelete(u.id, u.email)} className="bg-dead hover:bg-red-700 text-white px-3 py-1 rounded text-xs">Sil</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="bg-bg-card border-2 border-accent rounded-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-accent font-bold text-lg mb-4">➕ Yeni Kullanıcı</h3>

            <input
              type="email"
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm mb-3 focus:border-accent outline-none"
            />
            <input
              type="password"
              placeholder="Şifre"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm mb-3 focus:border-accent outline-none"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as any)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm mb-3 focus:border-accent outline-none"
            >
              <option value="user">User</option>
              <option value="checker">Check-only (yalnızca BIN)</option>
              <option value="admin">Admin</option>
            </select>

            {error && <div className="text-dead text-xs mb-3">{error}</div>}

            <div className="flex gap-2">
              <button
                onClick={handleAddUser}
                className="flex-1 bg-accent hover:bg-green-600 text-white py-2 rounded-md text-sm font-bold"
              >
                Oluştur
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="bg-[#555] hover:bg-[#666] text-white px-4 py-2 rounded-md text-sm"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedUser(null)}>
          <section className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-xl border border-accent bg-bg-card p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-accent">Kullanıcı kontrol geçmişi</h3><p className="text-xs text-gray-400">{selectedUser.email} · BIN: {userChecks.length} · Abonelik ön kontrol: {subscriptionChecks.length}</p></div><button onClick={() => setSelectedUser(null)} className="rounded bg-[#555] px-3 py-1 text-xs">Kapat</button></div>
            {error && <p className="mb-3 text-xs text-dead">{error}</p>}
            <h4 className="mb-2 text-sm font-semibold text-gray-200">Abonelik ön kontrolleri</h4>
            {subscriptionChecks.length === 0 ? <p className="mb-5 text-xs text-gray-500">Abonelik ön kontrolü yok.</p> : <div className="mb-6 overflow-auto"><table className="w-full text-left text-xs"><thead className="text-gray-400"><tr><th className="p-2">Tarih</th><th className="p-2">Kart sahibi</th><th className="p-2">Son 4</th><th className="p-2">Sonuç</th><th className="p-2">Bulgular</th></tr></thead><tbody>{subscriptionChecks.map((row) => <tr key={row.id} className="border-t border-border"><td className="p-2">{new Date(row.created_at).toLocaleString('tr-TR')}</td><td className="p-2">{row.holder_name || '-'}</td><td className="p-2 font-mono">{row.last4 || '----'}</td><td className="p-2">{row.outcome}</td><td className="p-2">{(row.findings || []).join('; ') || 'Kayıt kontrolü uygun'}</td></tr>)}</tbody></table></div>}
            <h4 className="mb-2 text-sm font-semibold text-gray-200">BIN metadata sorguları</h4>
            {userChecks.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">BIN sorgusu bulunamadı.</p> : <table className="w-full text-left text-xs"><thead className="text-gray-400"><tr><th className="p-2">Tarih</th><th className="p-2">BIN</th><th className="p-2">Marka</th><th className="p-2">Tür</th><th className="p-2">Kurum</th><th className="p-2">Ülke</th></tr></thead><tbody>{userChecks.map((row) => <tr key={row.id} className="border-t border-border"><td className="p-2">{new Date(row.created_at).toLocaleString('tr-TR')}</td><td className="p-2 font-mono">{row.bin}</td><td className="p-2">{row.brand || '-'}</td><td className="p-2">{row.type || '-'}</td><td className="p-2">{row.issuer || '-'}</td><td className="p-2">{row.country || '-'}</td></tr>)}</tbody></table>}
          </section>
        </div>
      )}
    </div>
  );
}
