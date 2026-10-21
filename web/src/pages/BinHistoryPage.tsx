import { useEffect, useState } from 'react';
import { binHistoryApi, subscriptionApi } from '../api';

interface BinCheckRow {
  id: number;
  bin: string;
  brand?: string;
  type?: string;
  category?: string;
  issuer?: string;
  country?: string;
  created_at: string;
}

export default function BinHistoryPage() {
  const [checks, setChecks] = useState<BinCheckRow[]>([]);
  const [subscriptionChecks, setSubscriptionChecks] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([binHistoryApi.list(), subscriptionApi.history()])
      .then(([bins, subscriptions]) => { setChecks(bins); setSubscriptionChecks(subscriptions); })
      .catch((e: any) => setError(e.response?.data?.error || e.message));
  }, []);

  return (
    <section className="rounded-lg border border-border bg-bg-card p-5">
      <h1 className="mb-1 text-lg font-bold text-accent">Kendi kontrol geçmişim</h1>
      <p className="mb-4 text-xs text-gray-400">Yalnızca bu hesapla yaptığınız BIN sorguları ve abonelik ön kontrolleri gösterilir.</p>
      {error && <p className="text-sm text-dead">{error}</p>}
      <h2 className="mb-2 mt-5 font-semibold text-gray-200">Abonelik ön kontrolleri</h2>
      {subscriptionChecks.length === 0 ? <p className="mb-4 text-xs text-gray-500">Henüz ön kontrol yok.</p> : <div className="mb-6 overflow-auto"><table className="w-full text-left text-xs"><thead className="text-gray-400"><tr><th className="p-2">Tarih</th><th className="p-2">Kart sahibi</th><th className="p-2">Son 4</th><th className="p-2">Sonuç</th><th className="p-2">Bulgular</th></tr></thead><tbody>{subscriptionChecks.map((row) => <tr key={row.id} className="border-t border-border"><td className="p-2">{new Date(row.created_at).toLocaleString('tr-TR')}</td><td className="p-2">{row.holder_name || '-'}</td><td className="p-2 font-mono">{row.last4 || '----'}</td><td className="p-2">{row.outcome}</td><td className="p-2">{(row.findings || []).join('; ') || 'Kayıt kontrolü uygun'}</td></tr>)}</tbody></table></div>}
      <h2 className="mb-2 mt-5 font-semibold text-gray-200">BIN metadata sorguları</h2>
      {!error && checks.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Henüz BIN sorgusu yok.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-gray-400"><tr><th className="p-2">Tarih</th><th className="p-2">BIN</th><th className="p-2">Marka</th><th className="p-2">Tür</th><th className="p-2">Banka / Kurum</th><th className="p-2">Ülke</th></tr></thead>
            <tbody>{checks.map((row) => <tr key={row.id} className="border-t border-border">
              <td className="p-2">{new Date(row.created_at).toLocaleString('tr-TR')}</td><td className="p-2 font-mono">{row.bin}</td><td className="p-2">{row.brand || '-'}</td><td className="p-2">{row.type || '-'}</td><td className="p-2">{row.issuer || '-'}</td><td className="p-2">{row.country || '-'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
