import { useEffect, useState } from 'react';
import { adminApi } from '../api/admin';

type ProviderOption = { key: string; name?: string; type?: string; capabilities?: Record<string, boolean> };

export default function ProviderSelectionPage() {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const result = await adminApi.providers();
      setProviders(result.providers || []);
      setSelected(result.defaultProvider || '');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Provider listesi alınamadı.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function choose(key: string) {
    setBusy(true); setError('');
    try {
      await adminApi.setDefaultProvider(key);
      setSelected(key);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Varsayılan provider güncellenemedi.');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-accent">Varsayılan POS Provider</h1>
        <p className="mt-1 text-sm text-gray-400">Bu ayar tüm kullanıcı POS işlemlerinde varsayılan token tabanlı sağlayıcıyı belirler.</p>
      </header>
      {error && <div role="alert" className="rounded-md border border-dead/40 bg-dead/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase text-gray-400"><tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Tür</th><th className="px-4 py-3">POS yöntemi</th><th className="px-4 py-3">Seçim</th></tr></thead>
          <tbody className="divide-y divide-white/5">
            {providers.filter((p) => p.capabilities?.tokenizedPayment === true).map((provider) => (
              <tr key={provider.key} className="hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-semibold">{provider.name || provider.key}</td>
                <td className="px-4 py-3 text-gray-400">{provider.type || '—'}</td>
                <td className="px-4 py-3 text-gray-400">Provider token</td>
                <td className="px-4 py-3"><button type="button" disabled={busy || loading} onClick={() => choose(provider.key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${selected === provider.key ? 'bg-accent text-white' : 'bg-white/10 hover:bg-white/20'}`}>{selected === provider.key ? 'Varsayılan' : 'Varsayılan yap'}</button></td>
              </tr>
            ))}
            {!loading && providers.filter((p) => p.capabilities?.tokenizedPayment === true).length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">Etkin token tabanlı provider yok.</td></tr>}
            {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">Provider’lar yükleniyor…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
