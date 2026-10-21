import { useEffect, useState } from 'react';
import { processorAccountsApi } from '../api/bank';

type ProcessorAccount = {
  id: number;
  processor_name: string;
  account_name: string;
  domain?: string;
  is_active: boolean;
  has_credentials?: boolean;
  created_at: string;
};

type ProcessorForm = {
  processor_name: string;
  account_name: string;
  domain: string;
  username: string;
  password: string;
  api_key: string;
  secret: string;
  api_token: string;
  notes: string;
  is_active: boolean;
};

const emptyForm: ProcessorForm = {
  processor_name: '', account_name: '', domain: '', username: '', password: '',
  api_key: '', secret: '', api_token: '', notes: '', is_active: true,
};
const inputClass = 'w-full rounded-md border border-border bg-bg-input px-3 py-2 text-sm outline-none focus:border-accent';

export default function ProcessorsPage() {
  const [accounts, setAccounts] = useState<ProcessorAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [processor, setProcessor] = useState('');
  const [domain, setDomain] = useState('');
  const [active, setActive] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProcessorForm>(emptyForm);

  async function loadAccounts() {
    setLoading(true);
    setError('');
    try {
      const filters: Record<string, string> = {};
      if (query.trim()) filters.q = query.trim();
      if (processor.trim()) filters.processor = processor.trim();
      if (domain.trim()) filters.domain = domain.trim();
      if (active) filters.active = active;
      setAccounts(await processorAccountsApi.list(filters));
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Kayıtlar yüklenemedi.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadAccounts(); }, [query, processor, domain, active]);

  async function openEdit(id: number) {
    setError('');
    try {
      const account = await processorAccountsApi.get(id);
      setEditingId(id);
      setForm({ ...emptyForm, ...account });
      setShowModal(true);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Kayıt açılamadı.');
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  async function save() {
    if (!form.processor_name.trim() || !form.account_name.trim()) {
      setError('Processor adı ve hesap etiketi gerekli.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) await processorAccountsApi.update(editingId, form);
      else await processorAccountsApi.create(form);
      setShowModal(false);
      await loadAccounts();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Kayıt kaydedilemedi.');
    } finally { setSaving(false); }
  }

  async function remove(account: ProcessorAccount) {
    if (!confirm(`“${account.account_name}” kaydı silinsin mi?`)) return;
    try {
      await processorAccountsApi.delete(account.id);
      await loadAccounts();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Kayıt silinemedi.');
    }
  }

  function setField<K extends keyof ProcessorForm>(key: K, value: ProcessorForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold text-accent">Processors</h1>
        <p className="mt-1 text-xs text-gray-500">Kendi processor hesapların ve erişim bilgilerin.</p></div>
      <button onClick={openCreate} className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-green-600">＋ Yeni hesap</button>
    </div>

    {error && <div className="mb-4 rounded-md border border-dead/40 bg-dead/10 px-3 py-2 text-sm text-red-200">{error}</div>}

    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hesap veya processor ara" />
      <input className={inputClass} value={processor} onChange={(e) => setProcessor(e.target.value)} placeholder="Processor adı" />
      <input className={inputClass} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Domain içinde ara" />
      <select className={inputClass} value={active} onChange={(e) => setActive(e.target.value)}>
        <option value="">Tüm durumlar</option><option value="true">Aktif</option><option value="false">Pasif</option>
      </select>
    </div>

    <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase text-gray-400"><tr>
          <th className="px-4 py-3">Processor</th><th className="px-4 py-3">Hesap etiketi</th><th className="px-4 py-3">Domain</th>
          <th className="px-4 py-3">Erişim bilgileri</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">İşlem</th>
        </tr></thead>
        <tbody className="divide-y divide-white/5">
          {accounts.map((account) => <tr key={account.id} className="hover:bg-white/[0.03]">
            <td className="px-4 py-3 font-semibold">{account.processor_name}</td>
            <td className="px-4 py-3 text-gray-300">{account.account_name}</td>
            <td className="px-4 py-3 text-gray-400">{account.domain || '—'}</td>
            <td className="px-4 py-3 text-gray-400">{account.has_credentials ? 'Şifreli olarak saklanıyor' : '—'}</td>
            <td className="px-4 py-3"><span className={account.is_active ? 'text-accent' : 'text-gray-500'}>{account.is_active ? 'Aktif' : 'Pasif'}</span></td>
            <td className="px-4 py-3"><div className="flex gap-2">
              <button onClick={() => void openEdit(account.id)} className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20">Aç / düzenle</button>
              <button onClick={() => void remove(account)} className="rounded bg-dead px-2 py-1 text-xs hover:bg-red-700">Sil</button>
            </div></td>
          </tr>)}
          {!loading && !accounts.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Filtreye uygun Processor hesabı bulunamadı.</td></tr>}
          {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Yükleniyor...</td></tr>}
        </tbody>
      </table>
    </div>

    {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowModal(false)}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border-2 border-accent bg-bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-card p-4">
          <h2 className="font-bold text-accent">{editingId ? 'Processor hesabını düzenle' : 'Yeni Processor hesabı'}</h2>
          <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-gray-400">Processor adı *<input className={inputClass} value={form.processor_name} onChange={(e) => setField('processor_name', e.target.value)} placeholder="Örn. Stripe" /></label>
            <label className="space-y-1 text-xs text-gray-400">Hesap etiketi *<input className={inputClass} value={form.account_name} onChange={(e) => setField('account_name', e.target.value)} placeholder="Örn. Ana mağaza" /></label>
          </div>
          <label className="block space-y-1 text-xs text-gray-400">Domain / panel adresi<input className={inputClass} value={form.domain} onChange={(e) => setField('domain', e.target.value)} placeholder="https://dashboard.example.com" /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-gray-400">Kullanıcı adı<input autoComplete="off" className={inputClass} value={form.username} onChange={(e) => setField('username', e.target.value)} /></label>
            <label className="space-y-1 text-xs text-gray-400">Şifre<input autoComplete="new-password" type="password" className={inputClass} value={form.password} onChange={(e) => setField('password', e.target.value)} /></label>
            <label className="space-y-1 text-xs text-gray-400">API key<input autoComplete="off" type="password" className={inputClass} value={form.api_key} onChange={(e) => setField('api_key', e.target.value)} /></label>
            <label className="space-y-1 text-xs text-gray-400">Secret<input autoComplete="off" type="password" className={inputClass} value={form.secret} onChange={(e) => setField('secret', e.target.value)} /></label>
          </div>
          <label className="block space-y-1 text-xs text-gray-400">API token<input autoComplete="off" type="password" className={inputClass} value={form.api_token} onChange={(e) => setField('api_token', e.target.value)} /></label>
          <label className="block space-y-1 text-xs text-gray-400">Ek notlar<textarea rows={5} className={inputClass} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Serbest metin" /></label>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} /> Aktif</label>
          <p className="text-xs text-gray-500">Kullanıcı adı, şifre, API bilgileri ve notlar sunucuda şifrelenerek saklanır.</p>
          <div className="flex justify-end gap-2"><button onClick={() => setShowModal(false)} className="rounded-md bg-white/10 px-4 py-2 text-sm">Vazgeç</button>
            <button disabled={saving} onClick={() => void save()} className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
        </div>
      </div>
    </div>}
  </div>;
}
