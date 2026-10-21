import { useState } from 'react';
import type { Card, FavList } from '../api';
import { cardsApi, chargeApi } from '../api';
import { getApiBaseUrl } from '../stores/authStore';
import ChargeModal from './ChargeModal';

interface Props {
  card: Card;
  favorites: FavList[];
  onClose: () => void;
  onFavUpdate?: () => void;
  onCardUpdated?: (patch: Partial<Card>) => void;
}

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

// ⭐ Provider meta — label, currency, merchantId
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
  const name = provider || providerKey || '—';
  return (
    <span className="font-normal text-gray-400">
      {' · via '}
      <span className="text-gray-200">{name}</span>
      {merchantId && (
        <span className="text-[10px] opacity-75 font-mono ml-1">({merchantId})</span>
      )}
    </span>
  );
}

function CopyField({
  label, value, highlight = false, valueClass = 'text-gray-200',
}: {
  label: string;
  value: string | number | undefined;
  highlight?: boolean;
  valueClass?: string;
}) {
  const [copied, setCopied] = useState(false);
  const displayValue =
    value === undefined || value === null || value === '' ? '-' : String(value);
  const canCopy = displayValue !== '-';

  function handleCopy() {
    if (!canCopy) return;
    navigator.clipboard.writeText(displayValue).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div className="flex items-start justify-between gap-2 group">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">
          {label}
        </div>
        <div
          className={`font-mono text-xs break-all ${
            highlight ? 'text-info font-semibold' : valueClass
          }`}
        >
          {displayValue}
        </div>
      </div>
      <button
        onClick={handleCopy}
        disabled={!canCopy}
        className={`flex-shrink-0 text-[10px] px-2 py-1 rounded transition ${
          copied
            ? 'bg-accent text-white'
            : canCopy
            ? 'bg-[#333] hover:bg-[#444] text-gray-400 hover:text-white'
            : 'bg-[#222] text-gray-600 cursor-not-allowed'
        }`}
      >
        {copied ? '✅' : '📋'}
      </button>
    </div>
  );
}

function AvsCvvSection({ checks }: { checks: any }) {
  if (!checks) return null;
  const hasData =
    checks.avsAddress || checks.avsMessage || checks.cvc ||
    checks.cvvMessage || checks.networkStatus;
  if (!hasData) return null;

  function avsIcon(code?: string) {
    if (!code) return '⚪';
    const c = code.toUpperCase();
    if (['X', 'Y'].includes(c)) return '✅';
    if (['P', 'Z', 'W', 'A'].includes(c)) return '⚠️';
    if (['N', 'R', 'E'].includes(c)) return '❌';
    return '⚪';
  }
  function cvvIcon(code?: string) {
    if (!code) return '⚪';
    const c = code.toUpperCase();
    if (c === 'M') return '✅';
    if (c === 'N') return '❌';
    return '⚠️';
  }

  return (
    <div className="p-4 border-t border-border">
      <div className="pb-2 mb-3 text-xs font-bold tracking-wide uppercase border-b text-info border-border">
        🔍 AVS / CVV Kontrolü
      </div>
      <div className="space-y-3">
        {checks.avsAddress && (
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">
                AVS Sonucu
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-gray-200">
                <span>{avsIcon(checks.avsAddress)}</span>
                <span className="font-bold">{toMsg(checks.avsAddress)}</span>
                {checks.avsMessage && (
                  <span className="text-gray-400 text-[10px]">({toMsg(checks.avsMessage)})</span>
                )}
              </div>
            </div>
          </div>
        )}
        {checks.cvc && (
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">
                CVV Sonucu
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-gray-200">
                <span>{cvvIcon(checks.cvc)}</span>
                <span className="font-bold">{toMsg(checks.cvc)}</span>
                {checks.cvvMessage && (
                  <span className="text-gray-400 text-[10px]">({toMsg(checks.cvvMessage)})</span>
                )}
              </div>
            </div>
          </div>
        )}
        {checks.networkStatus && (
          <CopyField label="Network Mesajı" value={toMsg(checks.networkStatus) ?? undefined} />
        )}
      </div>
    </div>
  );
}

export default function CardDetailModal({
  card, favorites, onClose, onFavUpdate, onCardUpdated,
}: Props) {
  const [cardFavs, setCardFavs] = useState<number[]>(
    (card.favLists || []).map((f) => f.id)
  );

  const [rechecking, setRechecking] = useState(false);
  const [recheckResult, setRecheckResult] = useState<any>(null);

  const [preauthAmount, setPreauthAmount] = useState('1');
  const [preauthing, setPreauthing] = useState(false);
  const [preauthResult, setPreauthResult] = useState<any>(null);
  const [preauthTxnId, setPreauthTxnId] = useState<number | null>(null);

  const [postBusy, setPostBusy] = useState(false);
  const [postResult, setPostResult] = useState<any>(null);

  // ⭐ Default: '' (Auto)
  const [liveProvider, setLiveProvider] = useState<string>('');
  const [showCharge, setShowCharge] = useState(false);

  async function toggleFav(listId: number, checked: boolean) {
    try {
      const token = localStorage.getItem('token');
      if (checked) {
        await fetch(`${getApiBaseUrl()}/bin-favorites/${listId}/cards`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ cardId: card.id }),
        });
      } else {
        await fetch(
          `${getApiBaseUrl()}/bin-favorites/${listId}/cards/${card.id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        );
      }
      onFavUpdate?.();
    } catch (e: any) {
      alert('Hata: ' + toMsg(e?.message));
    }
  }

  async function handleRecheck() {
    setRechecking(true);
    setRecheckResult(null);
    try {
      const data = await cardsApi.recheck(card.id);
      setRecheckResult(data);

      const isDead = data.status === 'DEAD';
      const now = new Date().toISOString();

      onCardUpdated?.({
        status: data.status || card.status,
        last_provider: data.provider || card.last_provider,
        last_checked_at: now,
        check_count: (card.check_count || 0) + 1,
        dead_reason: isDead ? data.reason : null,
        dead_reason_short: isDead ? data.reasonShort : null,
        dead_reason_long: isDead ? data.reasonLong : null,
        dead_message: isDead ? data.reasonLong : null,
        dead_at: isDead ? now : null,
        total_declined_count: isDead
          ? (card.total_declined_count || 0) + 1
          : card.total_declined_count,
      });

      onFavUpdate?.();
    } catch (e: any) {
      const errData = e?.response?.data;
      setRecheckResult({
        success: false,
        status: errData?.status || 'ERROR',
        reason: errData?.reason || 'provider_error',
        reasonShort: toMsg(errData?.reasonShort),
        reasonLong: toMsg(errData?.reasonLong) || toMsg(e.message),
        provider: errData?.provider,
        providerKey: errData?.providerKey,
        merchantId: errData?.merchantId,
        providerCode: toMsg(errData?.providerCode),
        providerMessage: toMsg(errData?.message) || toMsg(e.message),
      });
    } finally {
      setRechecking(false);
    }
  }

  async function handleProvizyon() {
    const amount = parseFloat(preauthAmount);
    if (!amount || amount < 1) {
      alert('Geçerli bir tutar girin (min $1)');
      return;
    }

    setPreauthing(true);
    setPreauthResult(null);
    setPreauthTxnId(null);
    setPostResult(null);

    try {
      const data = await cardsApi.balanceCheckById(card.id, amount, {
        // ⭐ Boşsa undefined → backend config priority + failover
        provider: liveProvider || undefined,
        operation: 'preauth',
        refundAmount: 0,
      });
      setPreauthResult(data);
      if (data.success && data.txnId) setPreauthTxnId(data.txnId);

      if (data.success) {
        onCardUpdated?.({
          status: 'LIVE',
          last_provider: data.provider || card.last_provider,
          last_checked_at: new Date().toISOString(),
          dead_reason: null,
          dead_reason_short: null,
          dead_reason_long: null,
          dead_message: null,
          dead_at: null,
        });
      }

      onFavUpdate?.();
    } catch (e: any) {
      const errData = e?.response?.data;
      setPreauthResult({
        success: false,
        status: errData?.status || 'ERROR',
        reason: errData?.reason || 'provider_error',
        reasonShort: toMsg(errData?.reasonShort),
        reasonLong: toMsg(errData?.reasonLong) || toMsg(e.message),
        provider: errData?.provider,
        providerKey: errData?.providerKey,
        merchantId: errData?.merchantId,
        providerCode: toMsg(errData?.providerCode),
        providerMessage:
          toMsg(errData?.message) ||
          toMsg(errData?.error?.message) ||
          toMsg(e.message),
        error: { message: toMsg(e.message) },
      });
    } finally {
      setPreauthing(false);
    }
  }

  async function handleCapture() {
    if (!preauthTxnId) return;
    const amt = parseFloat(preauthAmount);
    if (!confirm(`$${amt} capture edilsin mi?`)) return;
    setPostBusy(true);
    setPostResult(null);
    try {
      const res = await chargeApi.capture(preauthTxnId, amt);
      setPostResult({ ...res, kind: 'capture' });
      setPreauthTxnId(null);
      onFavUpdate?.();
    } catch (e: any) {
      const data = e?.response?.data;
      setPostResult({
        success: false,
        kind: 'capture',
        error:
          toMsg(data?.error) ||
          toMsg(data?.reasonLong) ||
          toMsg(data?.reason) ||
          toMsg(e.message),
        status: toMsg(data?.status),
        txnId: data?.txnId,
      });
    } finally {
      setPostBusy(false);
    }
  }

  async function handleVoid() {
    if (!preauthTxnId) return;
    if (!confirm('Provizyon void edilsin mi?')) return;
    setPostBusy(true);
    setPostResult(null);
    try {
      const res = await chargeApi.void(preauthTxnId);
      setPostResult({ ...res, kind: 'void' });
      setPreauthTxnId(null);
      onFavUpdate?.();
    } catch (e: any) {
      const data = e?.response?.data;
      setPostResult({
        success: false,
        kind: 'void',
        error:
          toMsg(data?.error) ||
          toMsg(data?.reasonLong) ||
          toMsg(data?.reason) ||
          toMsg(e.message),
        status: toMsg(data?.status),
        txnId: data?.txnId,
      });
    } finally {
      setPostBusy(false);
    }
  }

  const fullCardLine = `${card.pan}|${card.exp}|${card.cvv}${
    card.name ? '|' + card.name : ''
  }${card.address ? '|' + card.address : ''}${card.city ? '|' + card.city : ''}${
    card.state ? '|' + card.state : ''
  }${card.zip ? '|' + card.zip : ''}${card.phone ? '|' + card.phone : ''}${
    card.email ? '|' + card.email : ''
  }${card.country ? '|' + card.country : ''}`;

  const [copiedAll, setCopiedAll] = useState(false);

  function copyFullCard() {
    navigator.clipboard.writeText(fullCardLine).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    });
  }

  function renderPreauthResult() {
    if (!preauthResult) return null;
    const r = preauthResult;
    const ok = r.success;

    return (
      <div
        className={`text-[11px] p-2 rounded mb-2 border ${
          ok
            ? 'bg-live/15 text-live border-live/40'
            : 'bg-dead/15 text-dead border-dead/40'
        }`}
      >
        <div className="font-bold">
          {ok ? '✅ Provizyon Onaylandı (APPROVED)' : `❌ ${toMsg(r.status) || 'DEAD'}`}
          {/* ⭐ Merchant + provider */}
          <ProviderInfo
            provider={r.provider}
            merchantId={r.merchantId}
            providerKey={r.providerKey}
          />
        </div>

        {ok && (
          <>
            <div className="mt-0.5">
              Tutar: <b>${toMsg(r.amount)} {toMsg(r.currency)}</b>
            </div>
            {r.authCode && <div>Auth Code: <code>{toMsg(r.authCode)}</code></div>}
            {r.chargeId && (
              <div className="text-[10px] opacity-75">
                Provider Txn: <code>{toMsg(r.chargeId)}</code>
              </div>
            )}
            {r.txnId && (
              <div className="text-[10px] opacity-75">
                Kayıt No: <code>{toMsg(r.txnId)}</code>
              </div>
            )}
            <div className="text-[10px] opacity-75">
              {toMsg(r.reasonLong) || 'Capture bekleniyor.'}
            </div>
          </>
        )}

        {!ok && (
          <>
            <div className="mt-0.5 font-bold">
              {toMsg(r.reasonShort) || toMsg(r.reason) || 'Reddedildi'}
            </div>
            {r.reasonLong && (
              <div className="text-[10px] mt-0.5 opacity-90">{toMsg(r.reasonLong)}</div>
            )}
            {r.reason && (
              <div className="text-[10px] mt-0.5 opacity-75">
                Kod: <code>{toMsg(r.reason)}</code>
              </div>
            )}
            {(r.providerMessage || r.message || r.error?.message) && (
              <div className="text-[10px] mt-1 italic opacity-90">
                Ayrıntı: {toMsg(r.providerMessage) || toMsg(r.message) || toMsg(r.error?.message)}
              </div>
            )}
            {r.providerCode && (
              <div className="text-[10px] opacity-75">
                Provider kodu: <code>{toMsg(r.providerCode)}</code>
              </div>
            )}
            {r.error?.declineCode && (
              <div className="text-[10px] opacity-75">
                Decline Code: <code>{toMsg(r.error.declineCode)}</code>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  function renderPostResult() {
    if (!postResult) return null;
    const r = postResult;
    const ok = r.success;
    const label = toMsg(r.kind)?.toUpperCase() || 'İŞLEM';

    return (
      <div
        className={`text-[11px] p-2 rounded mt-2 border ${
          ok
            ? 'bg-live/15 text-live border-live/40'
            : 'bg-dead/15 text-dead border-dead/40'
        }`}
      >
        <div className="font-bold">
          {label}: {ok ? '✅ OK' : '❌ Hata'}
        </div>
        {!ok && r.error && (
          <div className="mt-0.5 text-[10px] italic opacity-90">
            "{toMsg(r.error) || 'Bilinmeyen hata'}"
          </div>
        )}
        {r.capturedAmount > 0 && (
          <div className="text-[10px] mt-0.5">${r.capturedAmount} captured</div>
        )}
        {r.refundedAmount > 0 && (
          <div className="text-[10px] mt-0.5">${r.refundedAmount} refunded</div>
        )}
        {r.status && (
          <div className="text-[10px] mt-0.5 opacity-75">
            Status: <code>{toMsg(r.status)}</code>
          </div>
        )}
        {r.txnId && (
          <div className="text-[10px] opacity-75">
            Txn: <code>{toMsg(r.txnId)}</code>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
        onClick={onClose}
      >
        <div
          className="bg-bg-card border-2 border-accent rounded-xl w-full max-w-md max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between flex-shrink-0 p-4 border-b border-border">
            <h3 className="font-bold text-accent">Kart Detayları</h3>
            <button
              onClick={onClose}
              className="px-2 text-lg text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-4 bg-[#111] border-b border-border">
              <div className="flex flex-wrap gap-3 text-[11px] mb-2">
                <span
                  className={`px-2 py-0.5 rounded font-bold ${
                    card.status === 'DEAD'
                      ? 'bg-dead text-white'
                      : 'bg-live text-black'
                  }`}
                >
                  {card.status || 'LIVE'}
                </span>
                {card.last_provider && (
                  <span className="text-gray-400">
                    ⚙ son: <b className="text-white">{card.last_provider}</b>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-gray-500">Auth:</span>{' '}
                  <b className="text-live">${(card.total_auth || 0).toFixed(2)}</b>
                </div>
                <div>
                  <span className="text-gray-500">Sale:</span>{' '}
                  <b className="text-info">${(card.total_sold || 0).toFixed(2)}</b>
                </div>
                <div>
                  <span className="text-gray-500">Capt:</span>{' '}
                  <b>${(card.total_captured || 0).toFixed(2)}</b>
                </div>
                <div>
                  <span className="text-gray-500">Refd:</span>{' '}
                  <b className="text-warn">${(card.total_refunded || 0).toFixed(2)}</b>
                </div>
              </div>

              {card.status === 'DEAD' && card.dead_reason && (
                <div className="pt-3 mt-3 border-t border-border">
                  <div className="text-[10px] uppercase tracking-wide mb-1 text-dead">
                    ❌ DEAD Sebebi
                  </div>
                  <div className="text-xs font-bold text-dead mb-0.5">
                    {card.dead_reason_short || card.dead_reason}
                  </div>
                  {card.dead_message && (
                    <div className="text-[10px] text-gray-400">
                      {toMsg(card.dead_message)}
                    </div>
                  )}
                  {card.dead_at && (
                    <div className="text-[9px] text-gray-500 mt-1">
                      ⏱ {new Date(card.dead_at).toLocaleString('tr-TR')}
                    </div>
                  )}
                  {(card.total_declined_count || 0) > 1 && (
                    <div className="text-[9px] mt-0.5 text-dead/70">
                      Toplam {card.total_declined_count} kez reddedildi
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="pb-2 mb-3 text-xs font-bold tracking-wide uppercase border-b text-info border-border">
                💳 Kart Bilgileri
              </div>
              <div className="space-y-3">
                <CopyField label="PAN" value={card.pan} highlight />
                <CopyField label="Son Kullanma" value={card.exp} />
                <CopyField label="CVV" value={card.cvv} />
                <CopyField label="Marka" value={card.type} />
                <CopyField label="Seviye" value={card.level} />
                <CopyField label="Banka" value={card.banka} />
                <CopyField label="Ülke" value={card.country} />
              </div>
            </div>

            <AvsCvvSection checks={card.checks} />

            <div className="p-4 border-t border-border">
              <div className="pb-2 mb-3 text-xs font-bold tracking-wide uppercase border-b text-info border-border">
                🔄 İşlemler
              </div>

              <button
                onClick={handleRecheck}
                disabled={rechecking}
                className="w-full bg-[#2196F3] hover:bg-[#1976d2] disabled:bg-gray-600 text-white py-2 rounded-md text-sm font-bold mb-2"
              >
                {rechecking ? '🔄 Kontrol ediliyor...' : '🔄 Tekrar Check (Live Check)'}
              </button>

              {recheckResult && (
                <div
                  className={`text-xs p-2 rounded mb-3 border ${
                    recheckResult.status === 'LIVE'
                      ? 'bg-live/20 text-live border-live/40'
                      : recheckResult.status === 'DEAD'
                      ? 'bg-dead/20 text-dead border-dead/40'
                      : 'bg-warn/20 text-warn border-warn/40'
                  }`}
                >
                  <div className="font-bold">
                    {recheckResult.status === 'LIVE' ? '✅'
                      : recheckResult.status === 'DEAD' ? '❌' : '⚠️'}{' '}
                    {recheckResult.status}
                    <ProviderInfo
                      provider={recheckResult.provider}
                      merchantId={recheckResult.merchantId}
                      providerKey={recheckResult.providerKey}
                    />
                  </div>

                  <div className="mt-0.5">
                    {toMsg(recheckResult.reasonShort) || toMsg(recheckResult.reason)}
                  </div>

                  {recheckResult.reasonLong && (
                    <div className="mt-0.5 text-[10px] opacity-90">
                      {toMsg(recheckResult.reasonLong)}
                    </div>
                  )}

                  {(recheckResult.message || recheckResult.providerMessage) && (
                    <div className="mt-1 text-[10px] italic opacity-90">
                      "{toMsg(recheckResult.providerMessage) || toMsg(recheckResult.message)}"
                    </div>
                  )}

                  {recheckResult.providerCode && (
                    <div className="text-[10px] opacity-75 mt-0.5">
                      Provider kodu: <code>{toMsg(recheckResult.providerCode)}</code>
                    </div>
                  )}

                  {recheckResult.reason && (
                    <div className="text-[10px] opacity-75">
                      Kod: <code>{toMsg(recheckResult.reason)}</code>
                    </div>
                  )}
                </div>
              )}

              <div className="p-3 mt-3 border rounded border-info/40 bg-info/5">
                <div className="mb-2 text-xs font-bold text-info">
                  🔒 Provizyon (Pre-Authorization)
                </div>
                <label className="block mb-1 text-[10px] font-semibold text-gray-400">
                  Sağlayıcı seçin (Auto = config priority + failover)
                </label>
                {/* ⭐ Yeni dropdown */}
                <select
                  value={liveProvider}
                  onChange={(e) => setLiveProvider(e.target.value)}
                  className="w-full px-2 py-2 mb-2 text-xs border rounded bg-bg-input border-border"
                  aria-label="Provizyon sağlayıcısı"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 mb-2">
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={preauthAmount}
                    onChange={(e) => setPreauthAmount(e.target.value)}
                    placeholder="$"
                    className="flex-1 px-2 py-2 text-xs border rounded bg-bg-input border-border"
                  />
                  <button
                    onClick={handleProvizyon}
                    disabled={preauthing || postBusy}
                    className="bg-[#9C27B0] hover:bg-[#7B1FA2] disabled:bg-gray-600 text-white px-4 py-2 rounded text-xs font-bold whitespace-nowrap"
                  >
                    {preauthing ? 'İşleniyor…' : 'Provizyon Al'}
                  </button>
                </div>

                {renderPreauthResult()}

                {preauthTxnId && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={handleCapture}
                      disabled={postBusy}
                      className="py-2 text-xs font-bold text-white rounded bg-accent hover:bg-green-600 disabled:bg-gray-600"
                    >
                      {postBusy ? '…' : '💰 Capture'}
                    </button>
                    <button
                      onClick={handleVoid}
                      disabled={postBusy}
                      className="py-2 text-xs font-bold text-white rounded bg-dead hover:bg-red-700 disabled:bg-gray-600"
                    >
                      {postBusy ? '…' : '⛔ Void'}
                    </button>
                  </div>
                )}

                {renderPostResult()}
              </div>

              <button
                onClick={() => setShowCharge(true)}
                className="w-full py-2 mt-3 text-xs font-bold text-white rounded bg-accent hover:bg-green-600"
              >
                💳 Kart İşlemi (Charge / Sale / Live Check)
              </button>
            </div>

            <div className="p-4 border-t border-border">
              <div className="pb-2 mb-3 text-xs font-bold tracking-wide uppercase border-b text-info border-border">
                👤 Kart Sahibi
              </div>
              <div className="space-y-3">
                <CopyField label="İsim" value={card.name} />
                <CopyField label="Adres" value={card.address} />
                <CopyField label="Şehir" value={card.city} />
                <CopyField label="Eyalet" value={card.state} />
                <CopyField label="Posta Kodu" value={card.zip} />
                <CopyField label="Telefon" value={card.phone} />
                <CopyField label="Email" value={card.email} />
              </div>
            </div>

            <div className="p-4 border-t border-border">
              <div className="pb-2 mb-3 text-xs font-bold tracking-wide uppercase border-b text-info border-border">
                ⭐ Favori Listeler
              </div>
              {favorites.length === 0 ? (
                <div className="text-xs text-gray-500">
                  Önce Favoriler sekmesinden liste oluşturun.
                </div>
              ) : (
                <div className="space-y-2">
                  {favorites.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 p-2 text-xs border rounded cursor-pointer bg-bg-input border-border hover:border-accent"
                    >
                      <input
                        type="checkbox"
                        checked={cardFavs.includes(f.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCardFavs((prev) =>
                            checked ? [...prev, f.id] : prev.filter((x) => x !== f.id)
                          );
                          toggleFav(f.id, checked);
                        }}
                        className="accent-accent"
                      />
                      <span
                        className="flex-shrink-0 w-3 h-3 rounded-full"
                        style={{ background: f.color }}
                      />
                      <span className="flex-1">{f.name}</span>
                      <span className="text-[10px] text-gray-500">
                        {(f.bins || []).length} BIN
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 p-4 space-y-2 border-t border-border">
            <button
              onClick={copyFullCard}
              className={`w-full py-2 rounded-md text-sm font-bold transition ${
                copiedAll
                  ? 'bg-accent text-white'
                  : 'bg-[#2196F3] hover:bg-[#1976d2] text-white'
              }`}
            >
              {copiedAll ? '✅ Kopyalandı!' : '📋 Tüm Kartı Kopyala'}
            </button>
            <button
              onClick={onClose}
              className="w-full bg-[#555] hover:bg-[#666] text-white py-2 rounded-md text-sm"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>

      {showCharge && (
        <ChargeModal
          card={card}
          onClose={() => setShowCharge(false)}
          onSuccess={() => { onFavUpdate?.(); }}
        />
      )}
    </>
  );
}