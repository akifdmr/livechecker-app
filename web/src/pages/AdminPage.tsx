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
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'checker' | 'admin'>('checker');
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userChecks, setUserChecks] = useState<any[]>([]);
  const [subscriptionChecks, setSubscriptionChecks] = useState<any[]>([]);
  const [userDetails, setUserDetails] = useState<any>(null);
  const [creditRequests, setCreditRequests] = useState<any[]>([]);
  const [creditAmounts, setCreditAmounts] = useState<Record<number, string>>({});

  useEffect(() => {
    loadAll();
    const timer = window.setInterval(loadCreditRequests, 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadCreditRequests() {
    try { setCreditRequests(await adminApi.creditRequests()); } catch (e) { console.error(e); }
  }

  async function loadAll() {
    try {
      const [s, u, sys, requests] = await Promise.all([
        adminApi.stats(),
        adminApi.users(),
        api.get('/admin/user-stats').then((r) => r.data).catch(() => null),
        adminApi.creditRequests(),
      ]);
      setStats(s);
      setUsers(u);
      setSystemStats(sys);
      setCreditRequests(requests);
    } catch (e) {
      console.error(e);
    }
  }

  async function resolveCreditRequest(id: number, decision: 'approve' | 'reject', amount?: number) {
    try {
      await adminApi.resolveCreditRequest(id, decision, amount);
      await Promise.all([loadCreditRequests(), loadAll()]);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
  }

  async function handleAddUser() {
    setError('');
    if (!newUsername || !newPassword) return setError('Username ve şifre gerekli');
    try {
      await adminApi.addUser(newUsername, newPassword, newRole);
      setShowAdd(false);
      setNewUsername('');
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
    setUserDetails(null);
    try {
      const [details, bins, subscriptions] = await Promise.all([
        adminApi.userDetails(user.id),
        adminApi.binChecks(user.id),
        adminApi.subscriptionChecks(user.id),
      ]);
      setUserDetails(details);
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

  async function toggleUser(user: any) {
    try {
      await adminApi.updateUser(user.id, { is_active: !user.is_active });
      await loadAll();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
  }

  async function grantUserCredits(user: any) {
    const amount = Number(creditAmounts[user.id]);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Kredi tutarı 0’dan büyük olmalı');
    try {
      await adminApi.grantCredits({ userId: user.id, amount, idempotencyKey: crypto.randomUUID() });
      setCreditAmounts((values) => ({ ...values, [user.id]: '' }));
      setError('');
      await loadAll();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
  }

  async function resetPassword(user: any) {
    const password = prompt(`${user.username || `#${user.id}`} için yeni şifreyi girin (en az 8 karakter):`);
    if (password === null) return;
    if (password.length < 8) { setError('Şifre en az 8 karakter olmalı'); return; }
    try {
      await adminApi.updateUser(user.id, { password });
      setError('');
      alert('Şifre güncellendi.');
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
  }

  async function changeUsername(user: any) {
    const username = prompt(`${user.username || `#${user.id}`} için yeni username girin:`, user.username || '');
    if (username === null) return;
    try {
      await adminApi.updateUser(user.id, { username });
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

      {/* Kullanıcı ve kredi talepleri aynı yönetim tablosunda */}
      <div className="bg-bg-card border border-border rounded-lg p-5">
        <div className="flex justify-between items-center mb-4">
          <div><h2 className="text-accent font-bold text-lg">👥 Kullanıcılar ve krediler</h2><p className="text-xs text-gray-500">Bakiye, blok durumu ve kredi yükleme işlemleri burada yönetilir.</p></div>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-accent hover:bg-green-600 text-white px-4 py-2 rounded-md text-xs font-bold"
          >
            ➕ Ekle
          </button>
        </div>

        <section className="mb-6 rounded-lg border border-amber-400/30 bg-amber-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-amber-300">🔔 Bekleyen kredi talepleri</h3>
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs">{creditRequests.length}</span>
          </div>
          {creditRequests.length ? <div className="overflow-x-auto rounded border border-border"><table className="w-full min-w-[650px] text-left text-xs">
            <thead className="bg-bg-input text-gray-400"><tr><th className="p-2">Kullanıcı</th><th className="p-2">İstenen kredi</th><th className="p-2">Not</th><th className="p-2">Tarih</th><th className="p-2">Karar</th></tr></thead>
            <tbody>{creditRequests.map((request) => <tr key={request.id} className="border-t border-border">
              <td className="p-2 font-mono text-info">{request.username}</td><td className="p-2">{Number(request.requested_amount).toFixed(2)}</td>
              <td className="max-w-xs truncate p-2">{request.message || '—'}</td><td className="p-2">{new Date(request.created_at).toLocaleString('tr-TR')}</td>
              <td className="p-2"><div className="flex gap-2"><button onClick={() => resolveCreditRequest(request.id, 'approve')} className="rounded bg-accent px-2 py-1 font-bold">Onayla ve yükle</button><button onClick={() => resolveCreditRequest(request.id, 'reject')} className="rounded bg-dead px-2 py-1">Reddet</button></div></td>
            </tr>)}</tbody>
          </table></div> : <p className="text-sm text-gray-500">Bekleyen talep yok.</p>}
        </section>

        {error && <p role="alert" className="mb-3 rounded border border-red-400/30 bg-red-500/10 p-2 text-xs text-dead">{error}</p>}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-bg-input text-gray-400"><tr><th className="p-3">Kullanıcı</th><th className="p-3">Rol</th><th className="p-3">Kredi</th><th className="p-3">Durum</th><th className="p-3">Son görülme</th><th className="p-3">Kredi yükle</th><th className="p-3">Yönetim</th></tr></thead>
            <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-border hover:bg-white/[0.02]">
              <td className="p-3"><div className="font-mono text-info">{u.username || `#${u.id}`}</div><div className="mt-1 text-[10px] text-gray-500">Kart {u.card_count || 0} · Check {u.check_count || 0} · BIN {u.bin_check_count || 0}</div></td>
              <td className="p-3"><select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="rounded bg-bg-input border border-border px-2 py-1" disabled={u.id === selectedUser?.id}><option value="admin">Admin</option><option value="operator">Operator</option><option value="finance">Finance</option><option value="viewer">Viewer</option><option value="checker">Checker</option></select></td>
              <td className="p-3 font-semibold">{Number(u.credits || 0).toFixed(2)}</td>
              <td className="p-3"><span className={u.is_active ? 'text-green-300' : 'text-red-300'}>{u.is_active ? 'Aktif' : 'Bloklu'}</span><div className="mt-1 text-[10px] text-gray-500">{u.is_online ? '🟢 Online' : '⚪ Offline'}</div></td>
              <td className="p-3 text-gray-400">{u.last_seen_at ? new Date(u.last_seen_at).toLocaleString('tr-TR') : 'Henüz giriş yapmadı'}</td>
              <td className="p-3">{u.role === 'admin' ? <span className="text-gray-500">Admin hesabı</span> : !u.is_active ? <span className="text-gray-500">Önce engeli kaldırın</span> : <form onSubmit={(event) => { event.preventDefault(); grantUserCredits(u); }} className="flex items-center gap-1"><input aria-label={`${u.username} için kredi tutarı`} type="number" min="0.01" max="1000000" step="0.01" value={creditAmounts[u.id] || ''} onChange={(event) => setCreditAmounts((values) => ({ ...values, [u.id]: event.target.value }))} placeholder="Tutar" className="w-24 rounded border border-border bg-bg-input px-2 py-1" /><button className="rounded bg-accent px-2 py-1 font-bold text-white">Yükle</button></form>}</td>
              <td className="p-3"><div className="flex flex-wrap gap-1"><button onClick={() => showUserChecks(u)} className="rounded bg-indigo-700 px-2 py-1 text-white">Veriler</button><button onClick={() => changeUsername(u)} className="rounded bg-indigo-700 px-2 py-1 text-white">Username</button><button onClick={() => toggleUser(u)} className="rounded bg-yellow-700 px-2 py-1 text-white">{u.is_active ? 'Blokla' : 'Aç'}</button><button onClick={() => resetPassword(u)} className="rounded bg-blue-700 px-2 py-1 text-white">Şifre</button><button onClick={() => handleDelete(u.id, u.username || `#${u.id}`)} className="rounded bg-dead px-2 py-1 text-white">Sil</button></div></td>
            </tr>
          ))}
            </tbody>
          </table>
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
              type="text"
              placeholder="Username"
              value={newUsername}
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_.-]{3,32}"
              onChange={(e) => setNewUsername(e.target.value)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => { setSelectedUser(null); setUserDetails(null); }}>
          <section className="max-h-[90vh] w-full max-w-7xl overflow-auto rounded-xl border border-accent bg-bg-card p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-accent">Kullanıcı verileri</h3><p className="text-xs text-gray-400">{selectedUser.username || `#${selectedUser.id}`} · BIN: {userChecks.length} · Abonelik ön kontrol: {subscriptionChecks.length}</p></div><button onClick={() => { setSelectedUser(null); setUserDetails(null); }} className="rounded bg-[#555] px-3 py-1 text-xs">Kapat</button></div>
            {error && <p className="mb-3 text-xs text-dead">{error}</p>}
            {!userDetails ? <p className="py-4 text-xs text-gray-400">Kullanıcı verileri yükleniyor…</p> : <>
              <p className="mb-3 text-[11px] text-gray-500">İşlem geçmişi bölümlerinde son 500 kayıt gösterilir. Kart bilgileri maskelenir; parola, ödeme tokenı ve saklı processor kimlik bilgileri gösterilmez.</p>
              <div className="mb-5 grid grid-cols-2 gap-3 rounded border border-border p-3 text-xs md:grid-cols-4">
                <div><span className="text-gray-500">Kullanıcı adı</span><div>{userDetails.user.username}</div></div>
                <div><span className="text-gray-500">Rol / durum</span><div>{userDetails.user.role} · {userDetails.user.is_active ? 'Aktif' : 'Bloklu'}</div></div>
                <div><span className="text-gray-500">Kredi / online</span><div>{Number(userDetails.user.credits || 0).toFixed(2)} · {userDetails.user.is_online ? 'Online' : 'Offline'}</div></div>
                <div><span className="text-gray-500">Son giriş / görülme</span><div>{userDetails.user.last_login ? new Date(userDetails.user.last_login).toLocaleString('tr-TR') : '-'} / {userDetails.user.last_seen_at ? new Date(userDetails.user.last_seen_at).toLocaleString('tr-TR') : '-'}</div></div>
              </div>
              <AdminDataSection title="Kredi hareketleri" rows={userDetails.creditLedger} columns={[
                ['created_at', 'Tarih'], ['entry_type', 'Tür'], ['amount', 'Miktar'], ['balance_after', 'Bakiye'], ['reference_type', 'Referans türü'], ['reference_id', 'Referans'],
              ]} />
              <AdminDataSection title="Kayıtlı ödeme yöntemleri (maskeli)" rows={userDetails.enrollments} columns={[
                ['created_at', 'Tarih'], ['provider', 'Provider'], ['brand', 'Marka'], ['last4', 'Son 4'], ['status', 'Durum'],
              ]} />
              <AdminDataSection title="Provider işlemleri" rows={userDetails.transactions} columns={[
                ['created_at', 'Tarih'], ['provider', 'Provider'], ['operation', 'İşlem'], ['amount', 'Miktar'], ['currency', 'Para birimi'], ['status', 'Durum'], ['error_code', 'Hata kodu'], ['provider_transaction_id', 'Provider referansı'],
              ]} />
              <AdminDataSection title="Provizyonlar" rows={userDetails.provisions} columns={[
                ['created_at', 'Tarih'], ['provider', 'Provider'], ['amount', 'Tutar'], ['captured_total', 'Çekilen'], ['currency', 'Para birimi'], ['status', 'Durum'], ['failure_code', 'Hata kodu'],
              ]} />
              <AdminDataSection title="Processor hesapları (kimlik bilgileri gizli)" rows={userDetails.processorAccounts} columns={[
                ['processor_name', 'Processor'], ['account_name', 'Hesap adı'], ['domain', 'Domain'], ['is_active', 'Aktif'], ['has_credentials', 'Kimlik bilgisi kayıtlı'], ['updated_at', 'Güncelleme'],
              ]} />
              <AdminDataSection title="Hesap audit olayları" rows={userDetails.auditEvents} columns={[
                ['created_at', 'Tarih'], ['action', 'Aksiyon'], ['resource_type', 'Kaynak türü'], ['resource_id', 'Kaynak ID'],
              ]} />
              <AdminDataSection title="Maskeli ödeme audit kayıtları" rows={userDetails.paymentAudit} columns={[
                ['created_at', 'Tarih'], ['provider', 'Provider'], ['action', 'Aksiyon'], ['pan_masked', 'Maskeli kart'], ['bin', 'BIN'], ['brand', 'Marka'], ['amount', 'Tutar'], ['currency', 'Para birimi'], ['status', 'Durum'], ['provider_txn_id', 'Provider referansı'],
              ]} />
            </>}
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

function AdminDataSection({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: any[];
  columns: [string, string][];
}) {
  return <section className="mb-5">
    <h4 className="mb-2 text-sm font-semibold text-gray-200">{title} <span className="text-xs font-normal text-gray-500">({rows.length})</span></h4>
    {!rows.length ? <p className="mb-3 text-xs text-gray-500">Kayıt yok.</p> : <div className="mb-3 overflow-auto rounded border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-bg-input text-gray-400"><tr>{columns.map(([, label]) => <th key={label} className="whitespace-nowrap p-2">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id ?? index} className="border-t border-border">{columns.map(([key, label]) => {
          const value = row[key];
          const formatted = value == null || value === '' ? '-' : key.endsWith('_at') ? new Date(value).toLocaleString('tr-TR') : typeof value === 'boolean' ? (value ? 'Evet' : 'Hayır') : String(value);
          return <td key={key || label} className="max-w-xs whitespace-nowrap p-2">{formatted}</td>;
        })}</tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
