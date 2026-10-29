import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi } from '../api/admin';

type LedgerEntry = { id: number; user_id: number; username?: string; amount: number; balance_after: number; entry_type: string; created_at: string };

export default function AdminPaymentsPage() {
  const [providers, setProviders] = useState<{ key: string; name: string }[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const [providerResult, settingsResult, ledgerResult] = await Promise.all([
      adminApi.providers(), adminApi.settings(), adminApi.creditLedger({ limit: 100 }),
    ]);
    setProviders(providerResult.providers || []);
    setSettings(settingsResult || {});
    setLedger(ledgerResult.entries || []);
  }

  useEffect(() => { refresh().catch((error) => setMessage(error?.response?.data?.error || 'Veriler alınamadı')); }, []);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const fees = {
        bin_check: Number(settings.fees?.bin_check ?? 0),
        capture: Number(settings.fees?.capture ?? 0),
      };
      await adminApi.saveSettings({
        fees,
        ...(settings.default_currency ? { default_currency: settings.default_currency } : {}),
      });
      setMessage('Ayarlar kaydedildi');
      await refresh();
    } catch (error: any) {
      setMessage(error?.response?.data?.error || 'Ayarlar kaydedilemedi');
    } finally { setBusy(false); }
  }

  async function setProvider(key: string) {
    if (!key) return;
    setBusy(true); setMessage('');
    try {
      await adminApi.setDefaultProvider(key);
      setMessage('Varsayılan provider güncellendi');
      await refresh();
    } catch (error: any) {
      setMessage(error?.response?.data?.error || 'Provider seçilemedi');
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">Ödeme ayarları ve kredi defteri</h1>
        <p className="mt-1 text-sm text-gray-400">Provider secret bilgileri burada tutulmaz; yalnızca varsayılan token provider ve ücret ayarları düzenlenir.</p>
      </header>
      {message && <div role="status" className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">{message}</div>}

      <section className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={saveSettings} className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold">Ücretler</h2>
          <label className="block text-sm">BIN metadata sorgusu
            <input className="mt-1 w-full rounded-lg bg-black/30 p-2" type="number" min="0" step="0.01" value={settings.fees?.bin_check ?? ''} onChange={(e) => setSettings({ ...settings, fees: { ...settings.fees, bin_check: e.target.value } })} />
          </label>
          <label className="block text-sm">Capture işlem ücreti
            <input className="mt-1 w-full rounded-lg bg-black/30 p-2" type="number" min="0" step="0.01" value={settings.fees?.capture ?? ''} onChange={(e) => setSettings({ ...settings, fees: { ...settings.fees, capture: e.target.value } })} />
          </label>
          <button disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50">Ayarları kaydet</button>
        </form>

        <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold">Varsayılan token provider</h2>
          <select className="w-full rounded-lg bg-black/30 p-2" value={settings.default_provider || ''} disabled={busy} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Provider seç</option>
            {providers.map((provider) => <option key={provider.key} value={provider.key}>{provider.name || provider.key}</option>)}
          </select>
          <p className="text-xs text-gray-500">Kullanıcı işlemleri bu provider’ı kullanır. Yönetici, işlem başına provider seçebilir.</p>
        </section>
      </section>

      <p className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">Kullanıcıya kredi yüklemek için Admin → Kullanıcılar tablosundaki ilgili satırı kullanın.</p>

      <section className="overflow-hidden rounded-xl border border-white/10">
        <h2 className="bg-white/[0.03] p-4 font-semibold">Son kredi hareketleri</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-gray-400"><tr><th className="p-3">Zaman</th><th className="p-3">Kullanıcı</th><th className="p-3">Tür</th><th className="p-3">Tutar</th><th className="p-3">Bakiye</th></tr></thead>
            <tbody>{ledger.map((entry) => <tr key={entry.id} className="border-t border-white/10"><td className="p-3">{new Date(entry.created_at).toLocaleString()}</td><td className="p-3">{entry.username || `#${entry.user_id}`}</td><td className="p-3">{entry.entry_type}</td><td className="p-3">{Number(entry.amount).toFixed(2)}</td><td className="p-3">{Number(entry.balance_after).toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
