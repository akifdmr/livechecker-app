// ============================================================
// BANK ACCOUNTS PAGE — Banka Hesapları CRUD
// ============================================================
import { useEffect, useState } from 'react';
import type { BankAccount } from '../api';
import { bankApi, routingApi } from '../api';

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    try {
      const data = await bankApi.list();
      setAccounts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}" hesabı silinsin mi?`)) return;
    try {
      await bankApi.delete(id);
      loadAccounts();
    } catch (e: any) {
      alert('Hata: ' + e.message);
    }
  }

  async function handleEdit(id: number) {
    try {
      const account = await bankApi.get(id);
      setEditing(account);
      setShowModal(true);
    } catch (e: any) {
      alert('Hesap yüklenemedi: ' + e.message);
    }
  }

  const filteredAccounts = accounts.filter((acc) => {
    const query = search.trim().toLocaleLowerCase('tr');
    const matchesSearch = !query || [acc.account_name, acc.bank_name, acc.account_type,
      acc.routing_number, acc.account_last4, acc.city, acc.state]
      .some((value) => String(value || '').toLocaleLowerCase('tr').includes(query));
    return matchesSearch && (typeFilter === 'all' || acc.account_type === typeFilter) &&
      (statusFilter === 'all' || String(acc.is_active) === statusFilter);
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-accent">🏦 Banka Hesapları</h1>
        <button
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
          className="bg-accent hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm font-bold"
        >
          ➕ Yeni Hesap
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad, banka, routing veya son 4 hane ara"
          className="rounded-md border border-border bg-bg-input px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-1" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-md border border-border bg-bg-input px-3 py-2 text-sm">
          <option value="all">Tüm hesap türleri</option><option value="checking">Checking</option><option value="savings">Savings</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-border bg-bg-input px-3 py-2 text-sm">
          <option value="all">Tüm durumlar</option><option value="true">Aktif</option><option value="false">Pasif</option>
        </select>
      </div>
      {loading ? <div className="py-8 text-center text-sm text-gray-500">Yükleniyor...</div> : (
        <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase text-gray-400"><tr>
              <th className="px-4 py-3">Hesap</th><th className="px-4 py-3">Banka</th><th className="px-4 py-3">Hesap No</th>
              <th className="px-4 py-3">Routing</th><th className="px-4 py-3">Tür</th><th className="px-4 py-3">Bakiye</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">İşlem</th>
            </tr></thead>
            <tbody className="divide-y divide-white/5">
              {filteredAccounts.map((acc) => <tr key={acc.id} className="hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-semibold">{acc.account_name}</td>
                <td className="px-4 py-3 text-gray-300">{acc.bank_name || '—'}{acc.bank_city ? ` · ${acc.bank_city}` : ''}</td>
                <td className="px-4 py-3 font-mono text-gray-300">•••• {acc.account_last4 || '—'}</td>
                <td className="px-4 py-3 font-mono text-gray-300">{acc.routing_number}</td>
                <td className="px-4 py-3 capitalize text-gray-300">{acc.account_type}</td>
                <td className="px-4 py-3 text-accent">{acc.balance == null ? '—' : `$${Number(acc.balance).toLocaleString()}`}</td>
                <td className="px-4 py-3"><span className={acc.is_active ? 'text-accent' : 'text-gray-500'}>{acc.is_active ? 'Aktif' : 'Pasif'}</span></td>
                <td className="px-4 py-3"><div className="flex gap-2">
                  <button onClick={() => handleEdit(acc.id)} className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20">Düzenle</button>
                  <button onClick={() => handleDelete(acc.id, acc.account_name)} className="rounded bg-dead px-2 py-1 text-xs hover:bg-red-700">Sil</button>
                </div></td>
              </tr>)}
              {!filteredAccounts.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">{accounts.length ? 'Filtreye uygun hesap bulunamadı.' : 'Henüz banka hesabı yok.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <BankAccountModal
          account={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setEditing(null);
            loadAccounts();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// MODAL
// ============================================================
function BankAccountModal({
  account,
  onClose,
  onSaved,
}: {
  account: BankAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<any>({
    account_name: account?.account_name || '',
    account_number: account?.account_number || '',
    routing_number: account?.routing_number || '',
    account_type: account?.account_type || 'checking',
    address_line1: account?.address_line1 || '',
    address_line2: account?.address_line2 || '',
    city: account?.city || '',
    state: account?.state || '',
    zip: account?.zip || '',
    country: account?.country || 'US',
    phone: account?.phone || '',
    email: account?.email || '',
    ein_number: account?.ein_number || '',
    balance: account?.balance || 0,
    notes: account?.notes || '',
  });

  const [routingInfo, setRoutingInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleRoutingChange(value: string) {
    const clean = value.replace(/\D/g, '').slice(0, 9);
    setForm({ ...form, routing_number: clean });

    if (clean.length === 9) {
      try {
        const info = await routingApi.lookup(clean);
        setRoutingInfo(info);
      } catch {
        setRoutingInfo(null);
      }
    } else {
      setRoutingInfo(null);
    }
  }

  async function handleSave() {
    setErr('');
    if (!form.account_name || !form.account_number || !form.routing_number) {
      setErr('Hesap adı, hesap no ve routing no gerekli');
      return;
    }
    setLoading(true);
    try {
      if (account) {
        await bankApi.update(account.id, form);
      } else {
        await bankApi.create(form);
      }
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border-2 border-accent rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-border sticky top-0 bg-bg-card z-10">
          <h2 className="text-accent font-bold">
            {account ? '✏️ Hesabı Düzenle' : '🏦 Yeni Banka Hesabı'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Hesap Adı *</label>
            <input
              type="text"
              value={form.account_name}
              onChange={(e) => setForm({ ...form, account_name: e.target.value })}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Hesap No *</label>
              <input
                type="text"
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Routing No *</label>
              <input
                type="text"
                value={form.routing_number}
                onChange={(e) => handleRoutingChange(e.target.value)}
                maxLength={9}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none font-mono"
              />
            </div>
          </div>

          {routingInfo && !routingInfo.error && routingInfo.bank_name && (
            <div className="bg-accent/10 border border-accent rounded-md p-2 text-xs">
              🏛 <strong className="text-accent">{routingInfo.bank_name}</strong>
              {routingInfo.city && ` — ${routingInfo.city}, ${routingInfo.state}`}
            </div>
          )}
          {routingInfo?.error && (
            <div className="bg-dead/10 border border-dead rounded-md p-2 text-xs text-dead">
              ⚠️ {routingInfo.error}
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 block mb-1">Hesap Tipi</label>
            <select
              value={form.account_type}
              onChange={(e) => setForm({ ...form, account_type: e.target.value })}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
          </div>

          <div className="text-xs text-info font-bold pt-2 border-t border-border">
            📍 Adres
          </div>
          <input
            type="text"
            placeholder="Adres satır 1"
            value={form.address_line1}
            onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Şehir"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="text"
              placeholder="Eyalet"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="text"
              placeholder="Zip"
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>

          <div className="text-xs text-info font-bold pt-2 border-t border-border">
            📞 İletişim
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Telefon"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                EIN (opsiyonel)
              </label>
              <input
                type="text"
                value={form.ein_number}
                onChange={(e) => setForm({ ...form, ein_number: e.target.value })}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Bakiye ($)</label>
              <input
                type="number"
                value={form.balance}
                onChange={(e) =>
                  setForm({ ...form, balance: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
              />
            </div>
          </div>

          <textarea
            placeholder="Notlar"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none resize-y min-h-[60px]"
          />

          {err && <div className="text-dead text-xs">{err}</div>}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-accent hover:bg-green-600 disabled:bg-gray-600 text-white py-2 rounded-md text-sm font-bold"
            >
              {loading ? 'Kaydediliyor...' : account ? 'Güncelle' : 'Oluştur'}
            </button>
            <button
              onClick={onClose}
              className="bg-[#555] hover:bg-[#666] text-white px-4 py-2 rounded-md text-sm"
            >
              İptal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
