import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { posApi } from '../api/pos';

export default function EnrollmentsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [params] = useSearchParams();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<any>({ provider: '', status: 'active' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [enrollments, providerList] = await Promise.all([
        posApi.enrollments(),
        posApi.providers(),
      ]);
      setRows(enrollments.enrollments || []);
      const tokenProviders = (providerList.providers || []).filter((p: any) => p.capabilities?.tokenizedPayment);
      setProviders(tokenProviders);
      setForm((f: any) => ({ ...f, provider: f.provider || tokenProviders[0]?.key || '' }));
    }
    catch (e: any) { setError(e.response?.data?.error || e.message); }
  }
  useEffect(() => {
    const liveCardId = params.get('liveCardId');
    if (liveCardId) {
      const parsedId = Number(liveCardId);
      if (Number.isSafeInteger(parsedId) && parsedId > 0) {
        setForm((f: any) => ({ ...f, liveCardId: parsedId }));
      }
      setShow(true);
    }
    load();
  }, []);

  async function save() {
    setError('');
    setSaving(true);
    try {
      const provider = providers.find((p) => p.key === form.provider);
      const token = String(form.externalPaymentMethodId || '').trim();
      const digitsOnly = token.replace(/\D/g, '');
      if (!provider) throw new Error('Token destekleyen provider seçin');
      if (!token) throw new Error('Provider token/payment method ID gerekli');
      if (token.includes('|') || (/^[\d\s-]+$/.test(token) && digitsOnly.length >= 12 && digitsOnly.length <= 19)) {
        throw new Error('Buraya kart numarası değil, provider tarafından üretilen token girin');
      }
      if (!/^\d{0,4}$/.test(String(form.last4 || ''))) throw new Error('Last 4 alanına en fazla 4 rakam girin');
      await posApi.createEnrollment({
        liveCardId: form.liveCardId,
        provider: provider.key,
        externalPaymentMethodId: token,
        brand: form.brand || undefined,
        last4: form.last4 || undefined,
        status: 'active',
        notes: form.notes || undefined,
      });
      setShow(false);
      setForm({ provider: providers[0]?.key || '', status: 'active' });
      await load();
    } catch (e: any) { setError(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🔗 Card Enrollments</h1>
          <p className="mt-1 text-sm text-gray-400">Provider tokenlarını ve enrollment meta bilgilerini güvenli şekilde yönetin.</p>
        </div>
        <button onClick={() => setShow(true)} className="px-4 py-2 text-sm font-bold rounded-lg bg-accent">+ Enrollment</button>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#11151d] p-4">
        {error && <div className="p-3 mb-3 text-sm text-red-300 border rounded-lg border-red-500/30 bg-red-500/10">{error}</div>}
        {rows.length === 0 ? <div className="py-12 text-center text-gray-500">Henüz enrollment yok.</div> :
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <div key={r.id} className="p-4 border rounded-xl border-white/10 bg-black/20">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{r.provider?.toUpperCase()}</div>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">✓ ENROLLED</span>
                </div>
                <div className="mt-3 font-mono text-sm">{r.brand || 'CARD'} •••• {r.last4 || '----'}</div>
                  <div className="mt-1 text-xs text-gray-500">Token: {r.payment_method_hint || '********'}</div>                
                  <div className="mt-3 space-y-1 text-xs text-gray-400">
                  <div>URL: {r.enrollment_url ? <a className="text-sky-300 hover:underline" href={r.enrollment_url} target="_blank" rel="noreferrer">{r.enrollment_url}</a> : '-'}</div>
                  <div>Login referansı: {r.login_reference || '-'}</div>
                  <div>Ek bilgi: {r.notes || '-'}</div>
                </div>
              </div>
            ))}
          </div>}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setShow(false)}>
          <div className="w-full max-w-xl rounded-2xl border border-accent/40 bg-[#11151d] p-5" onClick={e => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold">Yeni Card Enrollment</h2>
            <p className="p-3 mb-4 text-xs text-yellow-200 border rounded-lg border-yellow-500/20 bg-yellow-500/5">
              Seçili kayıt burada provider’a bağlanır. Önce provider’ın onaylı tokenization akışında üretilmiş payment-method ID’yi girin; kart numarası veya CVV girmeyin.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-gray-400">Provider
                <select value={form.provider || ''} onChange={e => setForm({...form, provider:e.target.value})} className="field mt-1 w-full">
                  {providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-400">Seçili kart kaydı ID
                <input readOnly placeholder="Kart listesinden seçin" value={form.liveCardId || ''} className="field mt-1 w-full"/>
              </label>
              <input placeholder="Last 4" maxLength={4} value={form.last4 || ''} onChange={e => setForm({...form, last4:e.target.value})} className="field"/>
              <input placeholder="Brand (opsiyonel)" value={form.brand || ''} onChange={e => setForm({...form, brand:e.target.value})} className="field"/>
              <input autoComplete="off" placeholder="Provider payment-method ID / token *" value={form.externalPaymentMethodId || ''} onChange={e => setForm({...form, externalPaymentMethodId:e.target.value})} className="field md:col-span-2"/>
              <textarea placeholder="Not (opsiyonel)" rows={3} value={form.notes || ''} onChange={e => setForm({...form, notes:e.target.value})} className="field md:col-span-2"/>
            </div>
            <div className="flex gap-2 mt-4">
              {error && <div className="basis-full p-2 text-xs text-red-300">{error}</div>}
            </div>
            <div className="flex gap-2 mt-2">
              <button disabled={saving || providers.length === 0} onClick={save} className="flex-1 py-2 font-bold rounded-lg bg-accent disabled:opacity-50">{saving ? 'Kaydediliyor…' : 'Tokenı enroll et'}</button>
              <button onClick={() => setShow(false)} className="px-5 rounded-lg bg-white/10">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
