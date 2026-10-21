import { useState } from 'react';
import { cardsApi, chargeApi, type Card } from '../api';

interface Props {
  card: Card;
  onClose: () => void;
  onSuccess?: () => void;
}

// ⭐ Provider seçenekleri — backend config ile senkron
const PROVIDER_OPTIONS = [
  { key: '',                label: '🔄 Otomatik (Config sırası)' },
  { key: 'clover3',         label: 'Clover · HamzaMedine (USD)' },
  { key: 'SNSAUTO',         label: 'Clover · S&S Auto express (CAD)' },
  { key: 'authorize-hamza', label: 'Authorize.net · Hamza (USD)' },
];

// ⭐ Merchant + provider display
function ProviderInfo({
  provider,
  merchantId,
  providerKey,
}: {
  provider?: string | null;
  merchantId?: string | null;
  providerKey?: string | null;
}) {
  const name = provider || providerKey;
  if (!name && !merchantId) return null;
  return (
    <span className="font-normal text-gray-500">
      {' · via '}
      <span className="text-gray-300">{name || '—'}</span>
      {merchantId && (
        <span className="text-[10px] opacity-75 font-mono ml-1">({merchantId})</span>
      )}
    </span>
  );
}

// ⭐ v8: Her değeri güvenli string'e çevirir — React child hatasını önler
function toMsg(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    if (typeof v.message === 'string') return v.message;
    if (typeof v.error === 'string') return v.error;
    try {
      const s = JSON.stringify(v);
      return s.length > 400 ? s.slice(0, 400) + '…' : s;
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export default function ChargeModal({ card, onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<'charge' | 'live_check'>('charge');
  const [amount, setAmount] = useState('1');
  const [operation, setOperation] = useState<'preauth' | 'sale'>('preauth');
  const [provider, setProvider] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [capture, setCapture] = useState(false);

  // ⭐ Auto default — backend config priority + failover
  const [liveCheckProvider, setLiveCheckProvider] = useState('');

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [authTxnId, setAuthTxnId] = useState<number | null>(null);
  const [postBusy, setPostBusy] = useState(false);
  const [postResult, setPostResult] = useState<any>(null);

  const cardString = `${card.pan}|${card.exp || ''}|${card.cvv || ''}`;

  // ⭐ v8: Tek merkezden hata okuma
  function extractError(e: any): string {
    return (
      toMsg(e?.response?.data?.error) ||
      toMsg(e?.response?.data?.message) ||
      toMsg(e?.response?.data?.reasonLong) ||
      toMsg(e?.parsed?.message) ||
      toMsg(e?.message) ||
      'Bilinmeyen hata'
    );
  }

  async function runCharge() {
    setBusy(true);
    setError(null);
    setResult(null);
    setPostResult(null);
    setAuthTxnId(null);
    try {
      const res = await chargeApi.execute({
        card: cardString,
        amount: Number(amount),
        provider: provider || undefined,
        operation,
        refundAmount: refundAmount === '' ? undefined : Number(refundAmount),
        capture,
        liveCardId: card.id,
      });
      setResult({ ...res, kind: 'charge' });
      if (res.success && operation === 'preauth' && res.txnId && !res.capturedAmount) {
        setAuthTxnId(res.txnId);
      }
      onSuccess?.();
    } catch (e: any) {
      // Backend hata gövdesi de payload içerebilir — result olarak göster
      const data = e?.response?.data;
      if (data && (data.reason || data.providerCode || data.provider || data.status)) {
        setResult({ ...data, kind: 'charge', success: false });
      } else {
        setError(extractError(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function runLiveCheck() {
    setBusy(true);
    setError(null);
    setResult(null);
    setPostResult(null);
    setAuthTxnId(null);
    try {
      const res = await cardsApi.balanceCheckById(card.id, 0, {
        provider: liveCheckProvider || undefined,
        operation: 'live_check',
      });
      setResult({ ...res, kind: 'live_check' });
      onSuccess?.();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data && (data.reason || data.providerCode || data.provider || data.status)) {
        setResult({ ...data, kind: 'live_check', success: false });
      } else {
        setError(extractError(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function runCapture() {
    if (!authTxnId) return;
    setPostBusy(true);
    setPostResult(null);
    try {
      const res = await chargeApi.capture(authTxnId, Number(amount));
      setPostResult({ ...res, kind: 'capture' });
      onSuccess?.();
    } catch (e: any) {
      setPostResult({ success: false, kind: 'capture', error: extractError(e) });
    } finally {
      setPostBusy(false);
    }
  }

  async function runVoid() {
    if (!authTxnId) return;
    if (!confirm('Preauth void edilsin mi?')) return;
    setPostBusy(true);
    setPostResult(null);
    try {
      const res = await chargeApi.void(authTxnId);
      setPostResult({ ...res, kind: 'void' });
      onSuccess?.();
    } catch (e: any) {
      setPostResult({ success: false, kind: 'void', error: extractError(e) });
    } finally {
      setPostBusy(false);
    }
  }

  async function runRefund() {
    if (!authTxnId) return;
    const amt = prompt('Refund tutarı ($):', refundAmount || '0.30');
    if (!amt) return;
    setPostBusy(true);
    setPostResult(null);
    try {
      const res = await chargeApi.refund(authTxnId, Number(amt));
      setPostResult({ ...res, kind: 'refund' });
      onSuccess?.();
    } catch (e: any) {
      setPostResult({ success: false, kind: 'refund', error: extractError(e) });
    } finally {
      setPostBusy(false);
    }
  }

  // ---- Result display ----
  function renderResult() {
    if (!result) return null;
    const ok = result.success;
    const isPreauth = result.kind === 'charge' && result.operation === 'preauth';
    const statusLabel = ok
      ? isPreauth || result.status === 'APPROVED'
        ? '✅ APPROVED (Provizyon)'
        : result.kind === 'live_check'
        ? '✅ LIVE'
        : '✅ ONAYLANDI'
      : `❌ ${toMsg(result.status) || 'DECLINED'}`;

    return (
      <div
        className={`mt-3 p-3 rounded border text-xs ${
          ok
            ? 'bg-accent/10 border-accent text-accent'
            : 'bg-dead/10 border-dead text-dead'
        }`}
      >
        <div className="mb-1 font-bold">
          {statusLabel}
          {/* ⭐ Merchant + provider display */}
          <ProviderInfo
            provider={result.provider}
            merchantId={result.merchantId}
            providerKey={result.providerKey}
          />
        </div>

        {/* ⭐ ECOM retry bilgisi */}
        {result.retry?.attempted && (
          <div
            className={`mb-1 px-2 py-1 rounded text-[10px] ${
              result.retry.success
                ? 'bg-live/15 text-live'
                : 'bg-warn/15 text-warn'
            }`}
          >
            🔄 ECOM Retry:{' '}
            {result.retry.success
              ? `✅ ${result.retry.from} → ${result.retry.to} başarılı`
              : `❌ ${result.retry.from} → ${result.retry.to} başarısız`}
            {result.retry.motoReason && (
              <span className="ml-1 opacity-75">
                ({result.retry.motoReason})
              </span>
            )}
          </div>
        )}

        {result.authCode && (
          <div>
            Auth: <code>{toMsg(result.authCode)}</code>
          </div>
        )}
        <div>
          Amount: ${toMsg(result.amount) ?? '0'} {toMsg(result.currency) ?? 'USD'}
        </div>
        {result.refundedAmount > 0 && <div>Refunded: ${result.refundedAmount}</div>}
        {result.netAmount != null && <div>Net: ${result.netAmount}</div>}
        {result.capturedAmount > 0 && <div>Captured: ${result.capturedAmount}</div>}
        <div>
          <b>Reason:</b> {toMsg(result.reasonShort) || toMsg(result.reason) || '-'}
        </div>
        {!ok && result.reasonLong && (
          <div className="mt-1 italic text-dead/90">{toMsg(result.reasonLong)}</div>
        )}
        {!ok && result.reason && (
          <div className="text-[10px] opacity-75">
            Kod: <code>{toMsg(result.reason)}</code>
          </div>
        )}
        {(result.providerMessage || result.message) && (
          <div className="mt-1 text-[10px] italic opacity-90">
            "{toMsg(result.providerMessage) || toMsg(result.message)}"
          </div>
        )}
        {result.providerCode && (
          <div className="text-gray-500">
            Provider code: <code>{toMsg(result.providerCode)}</code>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border-2 border-accent rounded-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-accent">💳 Kart İşlemi</h2>
          <button onClick={onClose} className="text-lg text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="mb-3 font-mono text-xs text-gray-400">
          {card.pan.slice(0, 6)}****{card.pan.slice(-4)}
          {card.type && ` • ${card.type}`}
          {card.last_provider && ` • son: ${card.last_provider}`}
        </div>

        <div className="flex flex-wrap gap-3 mb-3 text-[11px] text-gray-500">
          <span>
            Auth: <b className="text-live">${(card.total_auth || 0).toFixed(2)}</b>
          </span>
          <span>
            Sale: <b className="text-info">${(card.total_sold || 0).toFixed(2)}</b>
          </span>
          <span>
            Capture: <b>${(card.total_captured || 0).toFixed(2)}</b>
          </span>
          <span>
            Refund: <b className="text-warn">${(card.total_refunded || 0).toFixed(2)}</b>
          </span>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('charge')}
            className={`px-3 py-1.5 rounded text-xs font-bold ${
              tab === 'charge' ? 'bg-accent text-white' : 'bg-[#222] text-gray-400'
            }`}
          >
            Charge / Auth
          </button>
          <button
            onClick={() => setTab('live_check')}
            className={`px-3 py-1.5 rounded text-xs font-bold ${
              tab === 'live_check' ? 'bg-[#2196F3] text-white' : 'bg-[#222] text-gray-400'
            }`}
          >
            Live Check ($0)
          </button>
        </div>

        {tab === 'charge' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-gray-500">
                Operation
                <select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as any)}
                  className="w-full mt-1 bg-bg-input border border-border rounded px-2 py-1.5 text-xs"
                >
                  <option value="preauth">Preauth</option>
                  <option value="sale">Sale</option>
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Amount ($)
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full mt-1 bg-bg-input border border-border rounded px-2 py-1.5 text-xs"
                />
              </label>
              <label className="text-xs text-gray-500">
                Provider
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full mt-1 bg-bg-input border border-border rounded px-2 py-1.5 text-xs"
                  title="Auto = backend config priority + failover"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {operation === 'preauth' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-500">
                  Kısmi Refund ($)
                  <input
                    type="number"
                    step="0.01"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="ör. 0.30"
                    className="w-full mt-1 bg-bg-input border border-border rounded px-2 py-1.5 text-xs"
                  />
                </label>
                <label className="flex items-center gap-2 mt-5 text-xs">
                  <input
                    type="checkbox"
                    checked={capture}
                    onChange={(e) => setCapture(e.target.checked)}
                  />
                  Preauth sonrası capture
                </label>
              </div>
            )}

            <button
              onClick={runCharge}
              disabled={busy || !amount}
              className="w-full py-2 text-sm font-bold text-white rounded bg-accent hover:bg-green-600 disabled:bg-gray-600"
            >
              {busy ? 'İşleniyor…' : 'Çalıştır'}
            </button>

            {authTxnId && (
              <div className="p-3 mt-3 border rounded border-warn/50 bg-warn/5">
                <div className="mb-2 text-xs font-bold text-warn">
                  🔧 Provizyon Açık — aksiyon seç (txnId: {authTxnId})
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={runCapture}
                    disabled={postBusy}
                    className="py-1.5 text-xs font-bold text-white rounded bg-accent hover:bg-green-600 disabled:bg-gray-600"
                  >
                    💰 Capture
                  </button>
                  <button
                    onClick={runVoid}
                    disabled={postBusy}
                    className="py-1.5 text-xs font-bold text-white rounded bg-dead hover:bg-red-700 disabled:bg-gray-600"
                  >
                    ⛔ Void
                  </button>
                  <button
                    onClick={runRefund}
                    disabled={postBusy}
                    className="py-1.5 text-xs font-bold text-black rounded bg-warn hover:bg-yellow-600 disabled:bg-gray-600"
                  >
                    ↩️ Refund
                  </button>
                </div>
              </div>
            )}

            {postResult && (
              <div
                className={`p-2 rounded text-xs border ${
                  postResult.success
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'bg-dead/10 border-dead text-dead'
                }`}
              >
                <b>{toMsg(postResult.kind)?.toUpperCase()}:</b>{' '}
                {postResult.success
                  ? '✅ OK'
                  : `❌ ${toMsg(postResult.error) || toMsg(postResult.reason) || 'Hata'}`}
                {postResult.capturedAmount > 0 && ` — $${postResult.capturedAmount} captured`}
                {postResult.refundedAmount > 0 && ` — $${postResult.refundedAmount} refunded`}
              </div>
            )}
          </div>
        )}

        {tab === 'live_check' && (
          <div className="space-y-3">
            <label className="block text-xs text-gray-500">
              Provider
              <select
                value={liveCheckProvider}
                onChange={(e) => setLiveCheckProvider(e.target.value)}
                className="w-full mt-1 bg-bg-input border border-border rounded px-2 py-1.5 text-xs"
                title="Auto = backend config priority + failover"
              >
                {/* ⭐ Auto + tüm provider'lar */}
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[10px] text-gray-500">
              $0 doğrulama — para bloke etmez, karta dokunmaz.
            </p>
            <button
              onClick={runLiveCheck}
              disabled={busy}
              className="w-full bg-[#2196F3] hover:bg-[#1976d2] disabled:bg-gray-600 text-white py-2 rounded text-sm font-bold"
            >
              {busy ? 'İşleniyor…' : 'Live Check ($0)'}
            </button>
          </div>
        )}

        {/* ⭐ v8: error artık garanti string|null */}
        {error && typeof error === 'string' && (
          <div className="mt-3 text-xs text-dead">{error}</div>
        )}

        {renderResult()}
      </div>
    </div>
  );
}