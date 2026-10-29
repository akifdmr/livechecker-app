import { useEffect, useState } from 'react';
import { posApi } from '../api/pos';
import { useAuthStore } from '../stores/authStore';

const operations = [
  { key: 'sale', label: '💰 Sale', permission: 'payments.sale' },
  { key: 'preauth', label: '🔒 Pre-Authorization', permission: 'payments.preauth' },
];

/** Case-insensitive, canceled/cancelled toleranslı */
function transactionStatus(status: string, operation: string) {
  const s = String(status || '').toLowerCase();
  const op = String(operation || '').toLowerCase();

  if (s === 'approved' && op === 'preauth') return 'Provizyon onaylandı · capture bekliyor';
  if (s === 'approved' && op === 'sale')    return 'Satış provider tarafından onaylandı';
  if (s === 'captured')  return 'Capture tamamlandı';
  if (s === 'refunded')  return 'İade tamamlandı';
  if (s === 'voided')    return 'Provizyon iptal edildi';
  if (s === 'declined')  return 'Provider işlemi reddetti';
  if (s === 'pending')   return 'Terminalde kart işlemi bekleniyor';
  if (s === 'requires_action' || s === 'requires_confirmation') return 'Provider doğrulaması gerekiyor';
  if (s === 'processing') return 'Provider işlemi sürdürüyor';
  if (s === 'canceled' || s === 'cancelled') return 'İşlem iptal edildi';
  if (s === 'error')     return 'Provider hatası';
  return status || 'Durum bilinmiyor';
}

function operationLabel(operation: string) {
  const o = String(operation || '').toLowerCase();
  if (o === 'preauth') return 'Provizyon';
  if (o === 'sale')    return 'Satış';
  if (o === 'capture') return 'Capture';
  if (o === 'refund')  return 'İade';
  if (o === 'void')    return 'Void';
  return operation || 'İşlem';
}

function actionError(error: any) {
  const data = error?.response?.data;
  const message = data?.error || error?.message || 'İşlem tamamlanamadı';
  const requestId = data?.requestId || error?.response?.headers?.['x-request-id'];
  return requestId ? `${message} (İstek kaydı: ${requestId})` : message;
}

const isApproved = (s?: string) =>
  ['approved', 'captured', 'refunded'].includes(String(s || '').toLowerCase());
const isPending = (s?: string) =>
  ['pending', 'requires_action', 'requires_confirmation', 'processing'].includes(String(s || '').toLowerCase());

export default function PosPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const isAdmin = useAuthStore((state) => state.isAdmin)();
  const [providers, setProviders] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [provider, setProvider] = useState('');
  const [enrollmentId, setEnrollmentId] = useState('');
  const [operation, setOperation] = useState('sale');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [orderId, setOrderId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [p, e, t] = await Promise.all([
        posApi.providers(),
        posApi.enrollments(),
        posApi.transactions(),
      ]);
      setProviders(p.providers || []);
      setEnrollments(e.enrollments || []);
      setTransactions(t.transactions || []);
      if (!provider && p.providers?.length) {
        const initial = p.providers[0];
        setProvider(initial.key);
        if (initial.defaultCurrency) setCurrency(initial.defaultCurrency);
      }
    } catch (e: any) {
      setError(actionError(e));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const selected = enrollments.find((e) => String(e.id) === enrollmentId);
  const providerForCard = selected?.provider || provider;
  const providerInfo = providers.find((p) => p.key === providerForCard);

  const visibleOperations = operations.filter((o) => {
    // capabilities yoksa hepsini göster (unknown)
    if (!providerInfo?.capabilities) return true;
    const caps = providerInfo.capabilities;
    if (o.key === 'sale') return caps.sale !== false;
    if (o.key === 'preauth') return caps.preAuthorization !== false;
    return true;
  });

  async function refreshTransaction(id: number) {
    if (actionBusy !== null) return;
    setActionBusy(id);
    setError('');
    try {
      const r = await posApi.refreshTransaction(id);
      setResult(r);
      await load();
    } catch (e: any) {
      setError(actionError(e));
    } finally {
      setActionBusy(null);
    }
  }

  async function submit() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      if (!selected && !providerInfo?.defaultTerminalId) {
        throw new Error('Önce enrolled payment method veya terminal seçin');
      }
      if (!amount || Number(amount) <= 0) throw new Error('Tutar girin');

      const r = await posApi.pay({
        operation,
        providerKey: providerForCard,
        enrollmentId: selected ? Number(selected.id) : undefined, // ⭐ number
        paymentMethodId: selected ? undefined : providerInfo?.defaultTerminalId,
        amount: Number(amount),
        currency,
        orderId: orderId || undefined,
        invoiceNumber: invoiceNumber || undefined,
      });
      setResult(r);
      await load();
    } catch (e: any) {
      const data = e.response?.data;
      if (data && (data.reason || data.providerCode || data.provider)) {
        setResult({ ...data, kind: 'payment' });
        try { await load(); } catch { /* ignore */ }
      } else {
        setError(actionError(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function action(id: number, op: string, amount?: number) {
    if (actionBusy !== null) return;
    const label = op === 'capture' ? 'capture' : op === 'void' ? 'void' : 'refund';
    const amountText = amount == null ? '' : ` ($${amount.toFixed(2)})`;
    if (!window.confirm(`${label}${amountText} işlemi #${id} için onaylansın mı?`)) return;
    setActionBusy(id);
    setError('');
    try {
      const r = await posApi.action(id, { operation: op, amount, captureMode: op === 'capture' ? 'FULL_AUTH' : undefined });
      setResult(r);
      await load();
    } catch (e: any) {
      setError(actionError(e));
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">💳 Multi-Provider POS</h1>
        <p className="mt-1 text-sm text-gray-400">
          Tokenlı ödeme yöntemleri ve myPOS ePOS terminal ödemelerini buradan başlatın.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        {/* --- PAYMENT TERMINAL --- */}
        <section className="rounded-2xl border border-white/10 bg-[#11151d] p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-semibold">Payment Terminal</span>
          </div>

          {error && (
            <div className="p-3 mb-3 text-sm text-red-300 border rounded-lg border-red-500/30 bg-red-500/10">
              {error}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-gray-400">
              {isAdmin ? 'Provider' : 'Varsayılan provider'}
              {isAdmin ? <select
                value={provider}
                onChange={(e) => {
                  const key = e.target.value;
                  const next = providers.find((p) => p.key === key);
                  setProvider(key);
                  setEnrollmentId('');
                  if (next?.defaultCurrency) setCurrency(next.defaultCurrency);
                  if (next?.capabilities?.preAuthorization === false) setOperation('sale');
                }}
                className="w-full px-3 py-2 mt-1 text-sm text-white border rounded-md outline-none border-white/10 bg-black/30 focus:border-accent"
              >
                {providers.length === 0 && <option value="">— Yükleniyor… —</option>}
                {providers.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name || p.key}
                  </option>
                ))}
              </select> : <div className="w-full px-3 py-2 mt-1 text-sm text-white border rounded-md border-white/10 bg-black/30">{providerInfo?.name || 'Yönetici provider ayarı yapmalı'}</div>}
            </label>

            <label className="text-xs text-gray-400">
              Operation
              <select
                value={operation}
                onChange={(e) => setOperation(e.target.value)}
                className="w-full px-3 py-2 mt-1 text-sm text-white border rounded-md outline-none border-white/10 bg-black/30 focus:border-accent"
              >
                {visibleOperations.length === 0 && <option value="sale">💰 Sale</option>}
                {visibleOperations.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-gray-400 md:col-span-2">
              Payment method / terminal
              <select
                value={enrollmentId}
                onChange={(e) => setEnrollmentId(e.target.value)}
                className="w-full px-3 py-2 mt-1 text-sm text-white border rounded-md outline-none border-white/10 bg-black/30 focus:border-accent"
              >
                <option value="">
                  {providerInfo?.defaultTerminalId
                    ? `myPOS terminal · ${providerInfo.defaultTerminalId}`
                    : '— Seçin —'}
                </option>
                {enrollments
                  .filter((e) => !provider || e.provider === provider)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.provider.toUpperCase()} · {e.brand || 'CARD'} •••• {e.last4 || '----'}
                    </option>
                  ))}
              </select>
            </label>

            <label className="text-xs text-gray-400">
              Amount
              <input
                className="w-full px-3 py-2 mt-1 text-sm text-white border rounded-md outline-none border-white/10 bg-black/30 focus:border-accent"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100.00"
              />
            </label>

            <label className="text-xs text-gray-400">
              Currency
              <select
                className="w-full px-3 py-2 mt-1 text-sm text-white border rounded-md outline-none border-white/10 bg-black/30 focus:border-accent disabled:opacity-60"
                value={currency}
                disabled={!!providerInfo?.defaultCurrency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option>USD</option>
                <option>CAD</option>
                <option>EUR</option>
              </select>
            </label>

            <input
              className="px-3 py-2 text-sm text-white border rounded-md outline-none border-white/10 bg-black/30 focus:border-accent"
              placeholder="Order ID"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
            <input
              className="px-3 py-2 text-sm text-white border rounded-md outline-none border-white/10 bg-black/30 focus:border-accent"
              placeholder="Invoice number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between p-3 mt-4 text-xs text-gray-400 border rounded-lg border-white/10 bg-black/20">
            <span>
              {providerInfo?.name || 'Provider'} ·{' '}
              {providerInfo?.capabilities?.terminalPayment
                ? 'Terminal payment'
                : providerInfo?.capabilities?.tokenizedPayment
                ? 'Tokenized'
                : 'Capability unknown'}
            </span>
            <button
              disabled={busy}
              onClick={submit}
              className="px-6 py-2 font-bold text-white rounded-lg bg-accent disabled:opacity-50"
            >
              {busy ? 'İşleniyor…' : operation === 'sale' ? 'Ödemeyi Al' : 'Provizyon Al'}
            </button>
          </div>

          {/* ⭐ Result — case-insensitive */}
          {result && (() => {
            const pending = result.pending || isPending(result.status);
            const success = !!result.success;
            return (
              <div
                className={`mt-4 rounded-lg border p-3 text-sm ${
                  pending
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : success
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-500/30 bg-red-500/10 text-red-200'
                }`}
                role="status"
                aria-live="polite"
              >
                <div className="font-semibold">
                  {pending
                    ? result.actionRequired ? 'Provider kimlik doğrulaması bekleniyor' : 'Ödeme terminale gönderildi; kart işlemi bekleniyor'
                    : success
                    ? 'İşlem provider tarafından onaylandı'
                    : 'İşlem tamamlanamadı'}
                </div>
                <div className="mt-1 text-xs opacity-90">
                  {(result.provider || providerForCard || '').toUpperCase()} ·{' '}
                  {operationLabel(result.operation || operation)}
                  {result.status ? ` · ${transactionStatus(result.status, result.operation || operation)}` : ''}
                </div>
                {result.message && <div className="mt-2 text-xs">{result.message}</div>}
                {!success && result.reason && (
                  <div className="mt-1 text-xs">Neden: {result.reason}</div>
                )}
                {result.providerCode && (
                  <div className="mt-1 text-xs opacity-75">
                    Provider kodu: {result.providerCode}
                  </div>
                )}
                {result.internalTransactionId && (
                  <div className="mt-2 text-xs opacity-75">
                    İşlem kayıt no: {result.internalTransactionId}
                  </div>
                )}
                {result.requestId && (
                  <div className="mt-1 text-xs opacity-75">
                    İstek kaydı: {result.requestId}
                  </div>
                )}
                {result.persistenceWarning && (
                  <div className="mt-2 font-medium">{result.persistenceWarning}</div>
                )}
                {result.actionRequired && result.redirectUrl && (
                  <a href={result.redirectUrl} className="mt-3 inline-flex rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white" rel="noreferrer">
                    Provider doğrulamasına devam et
                  </a>
                )}
              </div>
            );
          })()}
        </section>

        {/* --- SON İŞLEMLER --- */}
        <section className="rounded-2xl border border-white/10 bg-[#11151d] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Son İşlemler</h2>
            <button onClick={load} className="text-xs text-accent">
              Yenile
            </button>
          </div>

          <div className="space-y-2">
            {transactions.slice(0, 12).map((t) => {
              const s = String(t.status || '').toLowerCase();
              const op = String(t.operation || '').toLowerCase();
              const transactionProvider = providers.find(
                (item) => String(item.key).toLowerCase() === String(t.provider).toLowerCase()
              );
              const capabilities = transactionProvider?.capabilities || {};
              const statusColor = isApproved(t.status)
                ? 'text-emerald-300'
                : s === 'pending'
                ? 'text-amber-300'
                : 'text-gray-400';

              return (
                <div key={t.id} className="p-3 border rounded-lg border-white/10 bg-black/20">
                  <div className="flex justify-between gap-3 text-sm">
                    <span>
                      {String(t.provider || '').toUpperCase()} · {operationLabel(t.operation)}
                    </span>
                    <span className={statusColor}>
                      {transactionStatus(t.status, t.operation)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {t.amount} {t.currency} ·{' '}
                    {t.last4
                      ? `•••• ${t.last4}`
                      : String(t.provider).toLowerCase() === 'mypos'
                      ? 'myPOS terminal'
                      : 'tokenized'}
                  </div>
                  {t.error_message && (
                    <div className="mt-1 text-xs text-red-300">{t.error_message}</div>
                  )}

                  {/* Refresh only when the provider supports status queries. */}
                  {capabilities.paymentStatusQuery === true && isPending(t.status) && (
                    <button
                      disabled={actionBusy !== null}
                      onClick={() => refreshTransaction(t.id)}
                      className="px-2 py-1 mt-2 text-xs rounded bg-amber-600/20 text-amber-200 disabled:opacity-50"
                    >
                      {actionBusy === t.id ? 'Sorgulanıyor…' : 'Terminal durumunu yenile'}
                    </button>
                  )}

                  {/* Capture / Void / Refund */}
                  {isApproved(t.status) && ['preauth', 'sale'].includes(op) && (
                    <div className="flex gap-2 mt-2">
                      {op === 'preauth' && capabilities.capture === true && (
                        <button
                          disabled={actionBusy === t.id || actionBusy !== null}
                          onClick={() => action(t.id, 'capture', Number(t.amount))}
                          className="px-2 py-1 text-xs rounded bg-emerald-600/20 text-emerald-300 disabled:opacity-50"
                        >
                          {actionBusy === t.id ? 'İşleniyor…' : 'Capture'}
                        </button>
                      )}
                      {op === 'preauth' && capabilities.void === true && (
                          <button
                            disabled={actionBusy === t.id || actionBusy !== null}
                            onClick={() => action(t.id, 'void')}
                            className="px-2 py-1 text-xs text-red-300 rounded bg-red-600/20 disabled:opacity-50"
                          >
                            Void
                          </button>
                        )}
                      {op === 'sale' && capabilities.refund === true && (
                          <button
                            onClick={() => action(t.id, 'refund', Number(t.amount))}
                            className="px-2 py-1 text-xs text-yellow-200 rounded bg-yellow-600/20"
                          >
                            Refund
                          </button>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
            {!transactions.length && (
              <div className="py-10 text-center text-gray-500">İşlem yok.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
