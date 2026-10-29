import { useEffect, useState } from 'react';
import { api } from '../api/client';

type Entry = { id: number; amount: number; balance_after: number; entry_type: string; reference_type?: string; reference_id?: string; note?: string; created_at: string };
type CreditRequest = { id: number; requested_amount: number; message?: string; status: string; created_at: string };

export default function LedgerPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(0);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const [ledger, credits, creditRequests] = await Promise.all([
        api.get('/ledger', { params: { limit: 200 } }),
        api.get('/credits/balance'),
        api.get('/credit-requests/me'),
      ]);
      setEntries(ledger.data.entries || []);
      setBalance(Number(credits.data.balance || 0));
      setRequests(creditRequests.data.requests || []);
    } catch (e: any) { setError(e?.response?.data?.error || 'Kredi verileri alınamadı'); }
  }
  useEffect(() => { load(); }, []);

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setSubmitting(true);
    try {
      await api.post('/credit-requests', { amount: Number(amount), message });
      setNotice('Kredi talebiniz yöneticiye iletildi.'); setAmount(''); setMessage(''); await load();
    } catch (e: any) { setError(e?.response?.data?.error || 'Talep gönderilemedi'); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-8">
      <header><h1 className="text-2xl font-bold">Kredi defterim</h1><p className="mt-1 text-sm text-gray-400">Yalnızca hesabınıza ait hareketler listelenir.</p></header>
      {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm">{error}</div>}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm text-gray-400">Kullanılabilir bakiye</div>
        <div className="mt-1 text-2xl font-bold">{balance.toFixed(2)} kredi</div>
        <form onSubmit={submitRequest} className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <input required type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Talep edilen kredi" className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm" />
          <input maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Yöneticiye not (isteğe bağlı)" className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm" />
          <button disabled={submitting || requests.some((r) => r.status === 'pending')} className="rounded bg-accent px-4 py-2 text-sm font-bold disabled:opacity-50">{requests.some((r) => r.status === 'pending') ? 'Talep beklemede' : 'Kredi iste'}</button>
        </form>
        {notice && <p className="mt-3 text-sm text-green-300">{notice}</p>}
        {requests.length > 0 && <div className="mt-4 border-t border-white/10 pt-3 text-sm"><strong>Kredi taleplerim</strong><div className="mt-2 space-y-1">{requests.map((request) => <p key={request.id} className="text-gray-400">{Number(request.requested_amount).toFixed(2)} kredi · {request.status} · {new Date(request.created_at).toLocaleString()}</p>)}</div></div>}
      </section>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-gray-400"><tr><th className="p-3">Zaman</th><th className="p-3">Tür</th><th className="p-3">Referans</th><th className="p-3">Tutar</th><th className="p-3">Bakiye</th><th className="p-3">Not</th></tr></thead>
          <tbody>{entries.map((entry) => <tr key={entry.id} className="border-t border-white/10"><td className="p-3">{new Date(entry.created_at).toLocaleString()}</td><td className="p-3">{entry.entry_type}</td><td className="p-3">{[entry.reference_type, entry.reference_id].filter(Boolean).join(' · ') || '—'}</td><td className="p-3">{Number(entry.amount).toFixed(2)}</td><td className="p-3">{Number(entry.balance_after).toFixed(2)}</td><td className="p-3">{entry.note || '—'}</td></tr>)}</tbody>
        </table>
        {!entries.length && !error && <p className="p-4 text-sm text-gray-500">Henüz hareket yok.</p>}
      </div>
    </main>
  );
}
