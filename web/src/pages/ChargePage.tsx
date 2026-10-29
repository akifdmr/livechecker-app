// ============================================================
// src/pages/ChargePage.tsx
// 3 tab: Enrolled / Live / Manuel
// API: chargeApi.charge / chargeById / execute
// Post: chargeApi.capture / void / refund
// ============================================================
import { useEffect, useState } from 'react';
import { cardsApi, posApi } from '../api';
import { chargeApi, type ChargeOperation } from '../api/charge';
import { useAuthStore } from '../stores/authStore';

type TabKey = 'enrolled' | 'live' | 'manual';

export default function ChargePage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [tab, setTab] = useState<TabKey>('enrolled');

  const [amount, setAmount] = useState('1.00');
  const [currency, setCurrency] = useState('USD');
  const [provider, setProvider] = useState('');
  const [operation, setOperation] = useState<ChargeOperation>('sale');
  const [orderId, setOrderId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [liveCards, setLiveCards] = useState<any[]>([]);
  const [liveSearch, setLiveSearch] = useState('');

  const [manual, setManual] = useState({
    pan: '', expMonth: '', expYear: '', cvv: '',
    name: '', address: '', city: '', state: '', zip: '',
    country: 'US', email: '',
  });

  useEffect(() => {
    if (tab === 'enrolled' && enrollments.length === 0) {
      posApi.enrollments()
        .then((d) => setEnrollments(d.enrollments || []))
        .catch(() => setEnrollments([]));
    }
    if (tab === 'live' && liveCards.length === 0) {
      cardsApi.list({ limit: '200', status: 'LIVE' })
        .then((d) => setLiveCards(d.cards || []))
        .catch(() => setLiveCards([]));
    }
  }, [tab]);

  // ============================================================
  // CHARGE
  // ============================================================
  async function chargeLive(cardId: number) {
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await chargeApi.chargeById(cardId, {
        amount: Number(amount),
        currency,
        provider: provider || undefined,
        operation,
        orderId: orderId || undefined,
      });
      setResult(r);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function chargeManual() {
    if (!manual.pan || !manual.cvv || !manual.expMonth || !manual.expYear) {
      setError('PAN / Exp / CVV zorunlu');
      return;
    }
    const cardStr = [
      manual.pan,
      `${manual.expMonth.padStart(2, '0')}/${manual.expYear}`,
      manual.cvv,
      manual.name, manual.address, manual.city, manual.state,
      manual.zip, manual.country, manual.email,
    ].filter(Boolean).join('|');

    setLoading(true); setError(''); setResult(null);
    try {
      const r = await chargeApi.charge(cardStr, {
        amount: Number(amount),
        currency,
        provider: provider || undefined,
        operation,
        orderId: orderId || undefined,
      });
      setResult(r);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function chargeEnrolled(enrollmentId: number) {
    setLoading(true); setError(''); setResult(null);
    try {
      // ⚠️ Backend /charge enrolled'i desteklemiyorsa 501 döner.
      // Bu durumda POS'a yönlendir.
      const r = await chargeApi.execute({
        enrollmentId,
        amount: Number(amount),
        currency,
        operation,
        orderId: orderId || undefined,
      } as any);
      setResult(r);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e.message;
      if (e?.response?.status === 501) {
        if (confirm('Enrolled kart için POS sayfasına gitmek ister misin?')) {
          window.location.href = '/pos';
        }
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // POST-CHARGE (capture / void / refund)
  // ============================================================
  async function runPostAction(
    action: 'capture' | 'void' | 'refund',
    txnId: number,
    refundAmount?: number
  ) {
    setActionBusy(action);
    try {
      if (action === 'capture') {
        await chargeApi.capture(txnId, Number(amount));
        alert('✅ Capture başarılı');
      } else if (action === 'void') {
        await chargeApi.void(txnId);
        alert('✅ Void başarılı');
      } else if (action === 'refund') {
        const amt = refundAmount ?? Number(prompt('Refund tutarı:', String(result?.amount || amount)));
        if (!amt || amt <= 0) return;
        await chargeApi.refund(txnId, amt);
        alert('✅ Refund başarılı');
      }
    } catch (e: any) {
      alert(`❌ ${action} hata: ${e?.response?.data?.error || e.message}`);
    } finally {
      setActionBusy(null);
    }
  }

  const filteredLive = liveCards.filter((c) =>
    !liveSearch || String(c.pan || '').includes(liveSearch.replace(/\D/g, ''))
  );

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="max-w-6xl p-6 mx-auto">
      <h1 className="mb-1 text-2xl font-bold">💳 Kart Çekim</h1>
      <p className="mb-4 text-xs text-gray-500">
        Enrolled / Live / Manuel — üç kaynaktan da işlem başlatabilirsiniz.
      </p>

      {/* ---- Ortak form ---- */}
      <div className="flex flex-wrap gap-3 p-3 mb-4 border rounded bg-bg-card border-border">
        <div>
          <label className="block mb-1 text-xs text-gray-500">Tutar</label>
          <input type="number" step="0.01" min="0.5" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="px-3 py-2 border rounded w-28 bg-bg-input border-border" />
        </div>
        <div>
          <label className="block mb-1 text-xs text-gray-500">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="px-3 py-2 border rounded bg-bg-input border-border">
            <option>USD</option><option>CAD</option><option>EUR</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-xs text-gray-500">Operation</label>
          <select value={operation} onChange={(e) => setOperation(e.target.value as ChargeOperation)}
            className="px-3 py-2 border rounded bg-bg-input border-border">
            <option value="sale">sale</option>
            <option value="preauth">preauth</option>
            <option value="live_check">live_check ($0)</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-xs text-gray-500">Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}
            className="px-3 py-2 border rounded bg-bg-input border-border">
            <option value="">Auto (failover)</option>
            <option value="clover3">clover3</option>
            <option value="authorize3">authorize3</option>
            <option value="moneris">moneris</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-xs text-gray-500">Order ID</label>
          <input value={orderId} onChange={(e) => setOrderId(e.target.value)}
            placeholder="opsiyonel"
            className="px-3 py-2 border rounded bg-bg-input border-border" />
        </div>
      </div>

      {/* ---- Tabs ---- */}
      <div className="flex gap-1 mb-3 border-b border-border">
        {([
          ['enrolled', `📋 Enrolled (${enrollments.length})`],
          ['live', `🔴 Live (${liveCards.length})`],
          ['manual', '✍️ Manuel'],
        ] as [TabKey, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-xs font-bold border-b-2 ${
              tab === key ? 'border-accent text-accent' : 'border-transparent text-gray-400'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ---- Enrolled ---- */}
      {tab === 'enrolled' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((e) => (
            <div key={e.id} className="p-3 border rounded bg-bg-card border-border">
              <div className="font-mono text-sm">{e.brand} •••• {e.last4}</div>
              <div className="text-xs text-gray-500">{e.exp_month}/{e.exp_year}</div>
              <div className="mt-1 text-xs text-gray-500">{e.provider}</div>
              <button onClick={() => chargeEnrolled(e.id)} disabled={loading}
                className="w-full px-3 py-2 mt-2 text-xs font-bold text-white rounded bg-accent disabled:opacity-50">
                {loading ? '...' : `💳 ${amount} ${currency}`}
              </button>
            </div>
          ))}
          {enrollments.length === 0 && (
            <div className="col-span-3 py-8 text-center text-gray-500">
              Kayıtlı kart yok.{' '}
              <a href="/enrollments" className="underline text-info">Enroll et →</a>
            </div>
          )}
        </div>
      )}

      {/* ---- Live ---- */}
      {tab === 'live' && (
        <div>
          <input placeholder="PAN ara (son 4 veya tam)"
            value={liveSearch}
            onChange={(e) => setLiveSearch(e.target.value)}
            className="w-full px-3 py-2 mb-3 border rounded bg-bg-input border-border" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredLive.map((c) => (
              <div key={c.id} className="p-3 border rounded bg-bg-card border-border">
                <div className="font-mono text-sm">
                  {String(c.pan).slice(0, 6)}••••{String(c.pan).slice(-4)}
                </div>
                <div className="text-xs text-gray-500">{c.exp}</div>
                <div className={`mt-1 text-xs ${c.status === 'LIVE' ? 'text-live' : 'text-dead'}`}>
                  {c.status}
                </div>
                {isAdmin && c.user_id && (
                  <div className="mt-1 text-[10px] text-gray-600">user: {c.user_id}</div>
                )}
                <button onClick={() => chargeLive(c.id)} disabled={loading}
                  className="w-full px-3 py-2 mt-2 text-xs font-bold text-white rounded bg-accent disabled:opacity-50">
                  {loading ? '...' : `💳 ${amount} ${currency}`}
                </button>
              </div>
            ))}
            {filteredLive.length === 0 && (
              <div className="col-span-3 py-8 text-center text-gray-500">Live kart yok</div>
            )}
          </div>
        </div>
      )}

      {/* ---- Manuel ---- */}
      {tab === 'manual' && (
        <div className="grid grid-cols-1 gap-3 p-4 border rounded md:grid-cols-2 bg-bg-card border-border">
          <input placeholder="PAN *" value={manual.pan}
            onChange={(e) => setManual({ ...manual, pan: e.target.value.replace(/\D/g, '').slice(0, 19) })}
            className="col-span-2 px-3 py-2 border rounded bg-bg-input border-border" />
          <div className="flex gap-2">
            <input placeholder="MM *" maxLength={2} value={manual.expMonth}
              onChange={(e) => setManual({ ...manual, expMonth: e.target.value.replace(/\D/g, '') })}
              className="w-20 px-3 py-2 border rounded bg-bg-input border-border" />
            <input placeholder="YYYY *" maxLength={4} value={manual.expYear}
              onChange={(e) => setManual({ ...manual, expYear: e.target.value.replace(/\D/g, '') })}
              className="w-24 px-3 py-2 border rounded bg-bg-input border-border" />
          </div>
          <input placeholder="CVV *" maxLength={4} value={manual.cvv}
            onChange={(e) => setManual({ ...manual, cvv: e.target.value.replace(/\D/g, '') })}
            className="px-3 py-2 border rounded bg-bg-input border-border" />
          <input placeholder="İsim" value={manual.name}
            onChange={(e) => setManual({ ...manual, name: e.target.value })}
            className="col-span-2 px-3 py-2 border rounded bg-bg-input border-border" />
          <input placeholder="Adres" value={manual.address}
            onChange={(e) => setManual({ ...manual, address: e.target.value })}
            className="col-span-2 px-3 py-2 border rounded bg-bg-input border-border" />
          <input placeholder="Şehir" value={manual.city}
            onChange={(e) => setManual({ ...manual, city: e.target.value })}
            className="px-3 py-2 border rounded bg-bg-input border-border" />
          <input placeholder="Eyalet" value={manual.state}
            onChange={(e) => setManual({ ...manual, state: e.target.value })}
            className="px-3 py-2 border rounded bg-bg-input border-border" />
          <input placeholder="ZIP" value={manual.zip}
            onChange={(e) => setManual({ ...manual, zip: e.target.value })}
            className="px-3 py-2 border rounded bg-bg-input border-border" />
          <input placeholder="Ülke" value={manual.country}
            onChange={(e) => setManual({ ...manual, country: e.target.value.toUpperCase() })}
            className="px-3 py-2 border rounded bg-bg-input border-border" />
          <input placeholder="E-posta" value={manual.email}
            onChange={(e) => setManual({ ...manual, email: e.target.value })}
            className="col-span-2 px-3 py-2 border rounded bg-bg-input border-border" />

          <button onClick={chargeManual} disabled={loading}
            className="col-span-2 px-4 py-3 text-sm font-bold text-white rounded bg-accent disabled:opacity-50">
            {loading ? 'İşleniyor...' : `💳 ${amount} ${currency} çek`}
          </button>
        </div>
      )}

      {/* ---- Result ---- */}
      {error && (
        <div className="p-3 mt-4 text-sm border rounded bg-dead/10 border-dead text-dead">
          ❌ {error}
        </div>
      )}
      {result && (
        <div className="p-4 mt-4 border rounded bg-bg-card border-border">
          <h3 className="mb-2 font-bold">
            {result.success ? '✅ Onaylandı' : '❌ Reddedildi'} — {result.status}
          </h3>

          <div className="grid grid-cols-2 gap-2 mb-3 text-xs md:grid-cols-4">
            <div><span className="text-gray-500">Provider:</span> {result.provider || '-'}</div>
            <div><span className="text-gray-500">Auth:</span> {result.authCode || '-'}</div>
            <div><span className="text-gray-500">Tutar:</span> {result.amount} {result.currency}</div>
            <div><span className="text-gray-500">Txn ID:</span> {result.txnId || '-'}</div>
            {result.reasonLong && (
              <div className="col-span-4">
                <span className="text-gray-500">Açıklama:</span> {result.reasonLong}
              </div>
            )}
            {result.attempts && result.attempts.length > 0 && (
              <div className="col-span-4">
                <span className="text-gray-500">Denenenler:</span>{' '}
                {result.attempts.map((a: any, i: number) => (
                  <span key={i} className="mr-2">
                    {a.provider} {a.success ? '✅' : '❌'}
                    {i < result.attempts!.length - 1 ? ' →' : ''}
                  </span>
                ))}
              </div>
            )}
            {result.actedByAdmin && (
              <div className="col-span-4 text-warn">
                ⚠️ Admin olarak işlem (kullanıcı: {result.cardOwnerUserId})
              </div>
            )}
          </div>

          {/* Post-charge aksiyonları */}
          {result.success && result.txnId && (
            <div className="flex flex-wrap gap-2 mt-2">
              {operation === 'preauth' && (
                <>
                  <button
                    onClick={() => runPostAction('capture', result.txnId)}
                    disabled={actionBusy !== null}
                    className="px-3 py-2 text-xs font-bold text-white rounded bg-live disabled:opacity-50"
                  >
                    {actionBusy === 'capture' ? '...' : 'Capture'}
                  </button>
                  <button
                    onClick={() => runPostAction('void', result.txnId)}
                    disabled={actionBusy !== null}
                    className="px-3 py-2 text-xs font-bold text-white rounded bg-warn disabled:opacity-50"
                  >
                    {actionBusy === 'void' ? '...' : 'Void'}
                  </button>
                </>
              )}
              {(operation === 'sale' || operation === 'preauth') && (
                <button
                  onClick={() => runPostAction('refund', result.txnId)}
                  disabled={actionBusy !== null}
                  className="px-3 py-2 text-xs font-bold text-white rounded bg-info disabled:opacity-50"
                >
                  {actionBusy === 'refund' ? '...' : 'Refund'}
                </button>
              )}
            </div>
          )}

          <details className="mt-3">
            <summary className="text-xs text-gray-500 cursor-pointer">Ham yanıt</summary>
            <pre className="p-2 mt-2 text-[10px] overflow-auto rounded bg-black/40">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}