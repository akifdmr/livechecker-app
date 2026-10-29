import { useEffect, useState } from 'react';
import { api } from '../api/client';

type Provision = { id: number; provider: string; network_ref: string | null; amount: number; captured_total: number; currency: string; status: string; brand?: string; last4?: string; created_at: string };

export default function ProvisionsPage() {
  const [rows, setRows] = useState<Provision[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/provisions', { params: { limit: 200 } })
      .then(({ data }) => setRows(data.provisions || []))
      .catch((e) => setError(e?.response?.data?.error || 'Provizyonlar alınamadı'));
  }, []);

  return (
    <main className="space-y-4">
      <header><h1 className="text-2xl font-bold">Provizyonlar</h1><p className="mt-1 text-sm text-gray-400">Provider token işlemlerinden oluşan, hesabınıza ait provizyon kayıtları.</p></header>
      {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm">{error}</div>}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-gray-400"><tr><th className="p-3">Tarih</th><th className="p-3">Provider</th><th className="p-3">Yöntem</th><th className="p-3">Tutar</th><th className="p-3">Capture</th><th className="p-3">Durum</th><th className="p-3">Referans</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-white/10"><td className="p-3">{new Date(row.created_at).toLocaleString()}</td><td className="p-3">{row.provider}</td><td className="p-3">{row.brand || 'Payment method'} {row.last4 ? `•••• ${row.last4}` : ''}</td><td className="p-3">{Number(row.amount).toFixed(2)} {row.currency}</td><td className="p-3">{Number(row.captured_total).toFixed(2)} {row.currency}</td><td className="p-3">{row.status}</td><td className="p-3 font-mono text-xs">{row.network_ref || '—'}</td></tr>)}</tbody>
        </table>
        {!rows.length && !error && <p className="p-4 text-sm text-gray-500">Henüz provizyon yok.</p>}
      </div>
    </main>
  );
}
