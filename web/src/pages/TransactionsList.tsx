// ============================================================
// TransactionsList.tsx
// Provider işlem listesi — void / capture / refund aksiyonlu
// Auth: Bearer token + useAuthStore.backendUrl
// ============================================================
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { getApiBaseUrl, useAuthStore } from '../stores/authStore';

// ============================================================
// TYPES
// ============================================================
type Scope = 'mine' | 'all';

interface Transaction {
  id: number;
  user_id: number | null;
  card_id: number | null;
  provider: string;
  action: string;
  mode: string;

  provider_txn_id: string | null;
  provider_ref_id: string | null;
  order_id: string | null;

  amount: number | string;
  currency: string;
  captured_amount: number | string;
  refunded_amount: number | string;

  status: string;
  reason: string | null;

  // ⭐ YENİ — backend'den gelen kullanıcı dostu alanlar
  display_reason?: string | null;
  display_message?: string | null;

  provider_code: string | null;
  message: string | null;

  pan_masked: string | null;
  bin: string | null;
  brand: string | null;

  duration_ms: number | null;
  is_voided: boolean;
  is_captured: boolean;
  is_refunded: boolean;
  parent_txn_id: number | null;

  raw_request: unknown;
  raw_response: unknown;

  created_at: string;
  updated_at: string;
}

interface ListResponse {
  success: boolean;
  count: number;
  transactions: Transaction[];
}

interface ApiError {
  error?: string;
  message?: string;
}

interface Filters {
  provider: string;
  action: string;
  status: string;
  pan: string;
  dateFrom: string;
  dateTo: string;
  onlyVoidable: boolean;
  onlyCapturable: boolean;
  onlyRefundable: boolean;
  scope: Scope;
}

// ============================================================
// API — Bearer token + doğru base URL
// ============================================================
async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { token, backendUrl } = useAuthStore.getState();

  const res = await fetch(`${getApiBaseUrl(backendUrl)}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errObj = data as ApiError;
    const message = errObj.error || errObj.message || `HTTP ${res.status}`;
    const err = new Error(message) as Error & { status: number; response: unknown };
    err.status = res.status;
    err.response = data;
    throw err;
  }

  return data as T;
}

function listTransactions(
  filters: Partial<Filters> & { limit?: number; offset?: number }
): Promise<ListResponse> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    q.set(k, String(v));
  }
  return apiRequest<ListResponse>(`/provider-transactions?${q}`);
}

function voidTransaction(id: number) {
  return apiRequest<{ success: boolean; status: string; error?: string }>(
    `/provider-transactions/${id}/void`,
    { method: 'POST' }
  );
}

function captureTransaction(id: number, amount: number) {
  return apiRequest<{
    success: boolean;
    status: string;
    capturedAmount?: number;
    error?: string;
  }>(`/provider-transactions/${id}/capture`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

function refundTransaction(
  id: number,
  payload: { amount?: number; fullRefund?: boolean }
) {
  return apiRequest<{
    success: boolean;
    status: string;
    refundedAmount?: number;
    error?: string;
  }>(`/provider-transactions/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================================
// HELPERS
// ============================================================
const PAGE_SIZE = 50;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(
  v: number | string | null | undefined,
  currency = 'USD'
): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return `0.00 ${currency}`;
  return `${n.toFixed(2)} ${currency}`;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('tr-TR');
  } catch {
    return iso;
  }
}

function shortId(s: string | null): string {
  if (!s) return '—';
  return s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

// ============================================================
// ANA BİLEŞEN
// ============================================================
export default function TransactionsList(): ReactElement {
  const [filters, setFilters] = useState<Filters>({
    provider: '',
    action: '',
    status: '',
    pan: '',
    dateFrom: '',
    dateTo: '',
    onlyVoidable: false,
    onlyCapturable: false,
    onlyRefundable: false,
    scope: 'mine',
  });

  const [rows, setRows] = useState<Transaction[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<Transaction | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [actionModal, setActionModal] = useState<
    | { type: 'void'; txn: Transaction }
    | { type: 'capture'; txn: Transaction }
    | { type: 'refund'; txn: Transaction }
    | null
  >(null);

  // ---- Yükleme ----
  const load = useCallback(
    async (reset: boolean = false, customOffset?: number) => {
      setLoading(true);
      setErr(null);
      const nextOffset = reset ? 0 : customOffset ?? offset;
      try {
        const d = await listTransactions({
          ...filters,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setRows(reset ? d.transactions : (prev) => [...prev, ...d.transactions]);
        setOffset(nextOffset);
        setHasMore(d.transactions.length >= PAGE_SIZE);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
        setErr(msg);
      } finally {
        setLoading(false);
      }
    },
    [filters, offset]
  );

  // Filtre değişince reset
  useEffect(() => {
    void load(true, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.provider,
    filters.action,
    filters.status,
    filters.pan,
    filters.dateFrom,
    filters.dateTo,
    filters.onlyVoidable,
    filters.onlyCapturable,
    filters.onlyRefundable,
    filters.scope,
  ]);

  // ---- Aksiyonlar ----
  const onActionConfirm = useCallback(
    async (
      type: 'void' | 'capture' | 'refund',
      txn: Transaction,
      payload?: { amount?: number; fullRefund?: boolean }
    ) => {
      setActionLoadingId(txn.id);
      try {
        let result: { success: boolean; error?: string };

        if (type === 'void') {
          result = await voidTransaction(txn.id);
        } else if (type === 'capture') {
          result = await captureTransaction(txn.id, payload?.amount || 0);
        } else {
          result = await refundTransaction(txn.id, {
            amount: payload?.amount,
            fullRefund: payload?.fullRefund,
          });
        }

        if (result.success) {
          setActionModal(null);
          await load(true, 0);
        } else {
          alert(`Hata: ${result.error || 'Bilinmeyen'}`);
        }
      } catch (e) {
        alert(`Hata: ${e instanceof Error ? e.message : 'Bilinmeyen'}`);
      } finally {
        setActionLoadingId(null);
      }
    },
    [load]
  );

  // ---- Türetilmiş ----
  const canDo = useMemo(
    () => ({
      void: (t: Transaction) =>
        t.status === 'approved' &&
        t.action === 'preauth' &&
        !t.is_voided &&
        !!t.provider_txn_id,
      capture: (t: Transaction) =>
        t.status === 'approved' &&
        t.action === 'preauth' &&
        !t.is_captured &&
        !t.is_voided &&
        !!t.provider_txn_id,
      refund: (t: Transaction) =>
        (t.status === 'captured' || t.status === 'approved') &&
        (t.action === 'sale' || t.action === 'capture') &&
        !t.is_refunded &&
        !!t.provider_txn_id,
    }),
    []
  );

  // Bugün butonu için
  function setToday() {
    const t = todayISO();
    setFilters((f) => ({ ...f, dateFrom: t, dateTo: t }));
  }

  function clearDates() {
    setFilters((f) => ({ ...f, dateFrom: '', dateTo: '' }));
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="p-6 mx-auto space-y-4 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Provider İşlemleri</h1>
          <p className="text-sm text-gray-500">
            Void, capture ve refund işlemlerini buradan yönet
          </p>
        </div>
        <span className="text-xs text-gray-500">{rows.length} kayıt</span>
      </div>

      {/* ---- Filtre Bar ---- */}
      <div className="p-3 space-y-3 border rounded bg-gray-50">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <FilterSelect
            label="Provider"
            value={filters.provider}
            onChange={(v) => setFilters((f) => ({ ...f, provider: v }))}
            options={['', 'clover', 'moneris', 'clover3', 'authorize3']}
          />
          <FilterSelect
            label="Action"
            value={filters.action}
            onChange={(v) => setFilters((f) => ({ ...f, action: v }))}
            options={[
              '',
              'balance_check',
              'live_check',
              'preauth',
              'auth',
              'sale',
              'capture',
              'void',
              'refund',
            ]}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            options={[
              '',
              'approved',
              'declined',
              'error',
              'voided',
              'captured',
              'refunded',
              'partially_refunded',
            ]}
          />
          <FilterSelect
            label="Kapsam"
            value={filters.scope}
            onChange={(v) => setFilters((f) => ({ ...f, scope: v as Scope }))}
            options={['mine', 'all']}
          />
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-600">PAN</span>
            <input
              className="px-2 py-1 border rounded"
              value={filters.pan}
              onChange={(e) =>
                setFilters((f) => ({ ...f, pan: e.target.value }))
              }
              placeholder="5347..."
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-600">Tarih</span>
            <div className="flex gap-1">
              <input
                type="date"
                className="w-full px-2 py-1 border rounded"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateFrom: e.target.value }))
                }
              />
              <input
                type="date"
                className="w-full px-2 py-1 border rounded"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateTo: e.target.value }))
                }
              />
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <Checkbox
            label="Void edilebilir"
            checked={filters.onlyVoidable}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                onlyVoidable: v,
                onlyCapturable: false,
                onlyRefundable: false,
              }))
            }
          />
          <Checkbox
            label="Capture edilebilir"
            checked={filters.onlyCapturable}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                onlyCapturable: v,
                onlyVoidable: false,
                onlyRefundable: false,
              }))
            }
          />
          <Checkbox
            label="Refund edilebilir"
            checked={filters.onlyRefundable}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                onlyRefundable: v,
                onlyVoidable: false,
                onlyCapturable: false,
              }))
            }
          />

          {/* Tarih kısayolları */}
          <button
            type="button"
            onClick={setToday}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
          >
            Bugün
          </button>
          <button
            type="button"
            onClick={clearDates}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
          >
            Tüm zamanlar
          </button>

          <button
            type="button"
            onClick={() => void load(true, 0)}
            disabled={loading}
            className="ml-auto bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>
      </div>

      {err && (
        <div className="px-4 py-3 text-red-700 border border-red-200 rounded bg-red-50">
          <b>Hata:</b> {err}
        </div>
      )}

      {/* ---- Tablo ---- */}
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Tarih</th>
              <th className="p-2 text-left">Provider</th>
              <th className="p-2 text-left">Action</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-right">Tutar</th>
              <th className="p-2 text-left">Kart</th>
              <th className="p-2 text-left">Açıklama</th>
              <th className="p-2 text-left">Txn ID</th>
              <th className="p-2 text-right">Süre</th>
              <th className="p-2 text-center">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-500">
                  Kayıt yok
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr
                key={t.id}
                className="transition-colors border-t hover:bg-gray-50"
              >
                <td className="p-2 text-xs whitespace-nowrap">
                  {formatDateTime(t.created_at)}
                </td>
                <td className="p-2 capitalize">{t.provider}</td>
                <td className="p-2 font-mono text-xs">{t.action}</td>
                <td className="p-2">
                  <StatusBadge status={t.status} />
                  {t.provider_code && (
                    <span className="ml-1 text-xs text-gray-500">
                      ({t.provider_code})
                    </span>
                  )}
                </td>
                <td className="p-2 font-mono text-right">
                  {formatMoney(t.amount, t.currency)}
                </td>
                <td className="p-2 font-mono text-xs">
                  {t.pan_masked || '—'}
                </td>

                {/* ⭐ AÇIKLAMA */}
                <td
                  className="p-2 text-xs text-gray-600 max-w-[180px] truncate"
                  title={t.display_message || t.message || ''}
                >
                  {t.display_reason || t.reason || '—'}
                </td>

                <td
                  className="p-2 font-mono text-xs"
                  title={t.provider_txn_id || ''}
                >
                  {shortId(t.provider_txn_id)}
                </td>
                <td className="p-2 text-xs text-right text-gray-500">
                  {t.duration_ms != null ? `${t.duration_ms} ms` : '—'}
                </td>
                <td className="p-2">
                  <div className="flex justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelected(t)}
                      className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                    >
                      Detay
                    </button>

                    {canDo.void(t) && (
                      <button
                        type="button"
                        onClick={() =>
                          setActionModal({ type: 'void', txn: t })
                        }
                        disabled={actionLoadingId === t.id}
                        className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                      >
                        Void
                      </button>
                    )}

                    {canDo.capture(t) && (
                      <button
                        type="button"
                        onClick={() =>
                          setActionModal({ type: 'capture', txn: t })
                        }
                        disabled={actionLoadingId === t.id}
                        className="px-2 py-1 text-xs rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 disabled:opacity-50"
                      >
                        Capture
                      </button>
                    )}

                    {canDo.refund(t) && (
                      <button
                        type="button"
                        onClick={() =>
                          setActionModal({ type: 'refund', txn: t })
                        }
                        disabled={actionLoadingId === t.id}
                        className="px-2 py-1 text-xs text-purple-800 bg-purple-100 rounded hover:bg-purple-200 disabled:opacity-50"
                      >
                        Refund
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Daha Fazla ---- */}
      <div className="flex justify-center">
        {loading ? (
          <span className="text-sm text-gray-500">Yükleniyor...</span>
        ) : hasMore ? (
          <button
            type="button"
            onClick={() => void load(false, offset + PAGE_SIZE)}
            className="px-4 py-1.5 bg-gray-200 rounded hover:bg-gray-300"
          >
            Daha Fazla
          </button>
        ) : rows.length > 0 ? (
          <span className="text-sm text-gray-500">Liste sonu</span>
        ) : null}
      </div>

      {/* ---- Detay Modal ---- */}
      {selected && (
        <TransactionModal
          txn={selected}
          onClose={() => setSelected(null)}
          onVoid={() => {
            setSelected(null);
            setActionModal({ type: 'void', txn: selected });
          }}
          onCapture={() => {
            setSelected(null);
            setActionModal({ type: 'capture', txn: selected });
          }}
          onRefund={() => {
            setSelected(null);
            setActionModal({ type: 'refund', txn: selected });
          }}
          canDo={canDo}
        />
      )}

      {/* ---- Aksiyon Onay Modalı ---- */}
      {actionModal && (
        <ActionConfirmModal
          type={actionModal.type}
          txn={actionModal.txn}
          loading={actionLoadingId === actionModal.txn.id}
          onCancel={() => setActionModal(null)}
          onConfirm={(payload) =>
            void onActionConfirm(actionModal.type, actionModal.txn, payload)
          }
        />
      )}
    </div>
  );
}

// ============================================================
// ALT BİLEŞENLER
// ============================================================

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: FilterSelectProps): ReactElement {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 border rounded"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || '— tümü —'}
          </option>
        ))}
      </select>
    </label>
  );
}

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function Checkbox({ label, checked, onChange }: CheckboxProps): ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  captured: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-red-100 text-red-800',
  error: 'bg-orange-100 text-orange-800',
  voided: 'bg-gray-200 text-gray-700',
  refunded: 'bg-purple-100 text-purple-800',
  partially_refunded: 'bg-purple-50 text-purple-700',
  unknown: 'bg-yellow-100 text-yellow-800',
};

function StatusBadge({ status }: { status: string }): ReactElement {
  const cls = STATUS_STYLES[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ---- Detay Modal ----
interface TransactionModalProps {
  txn: Transaction;
  onClose: () => void;
  onVoid: () => void;
  onCapture: () => void;
  onRefund: () => void;
  canDo: {
    void: (t: Transaction) => boolean;
    capture: (t: Transaction) => boolean;
    refund: (t: Transaction) => boolean;
  };
}

function TransactionModal({
  txn,
  onClose,
  onVoid,
  onCapture,
  onRefund,
  canDo,
}: TransactionModalProps): ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-bold">
            İşlem #{txn.id} — <span className="capitalize">{txn.provider}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-gray-500 hover:text-black"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 text-sm md:grid-cols-3">
          <Field label="Action" value={txn.action} />
          <Field label="Status" value={<StatusBadge status={txn.status} />} />
          <Field
            label="Tutar"
            value={formatMoney(txn.amount, txn.currency)}
          />
          <Field label="Currency" value={txn.currency} />
          <Field label="Kart" value={txn.pan_masked || '—'} />
          <Field label="BIN" value={txn.bin || '—'} />
          <Field label="Brand" value={txn.brand || '—'} />
          <Field
            label="Provider Txn ID"
            value={txn.provider_txn_id || '—'}
            mono
          />
          <Field label="Provider Code" value={txn.provider_code || '—'} />

          {/* ⭐ Açıklama */}
          <Field
            label="Açıklama"
            value={txn.display_reason || txn.reason || '—'}
          />
          <Field
            label="Mesaj"
            value={txn.display_message || txn.message || '—'}
            wide
          />

          <Field label="Oluşturulma" value={formatDateTime(txn.created_at)} />
          <Field
            label="Süre"
            value={txn.duration_ms != null ? `${txn.duration_ms} ms` : '—'}
          />
          <Field label="Captured" value={txn.is_captured ? '✔' : '—'} />
          <Field label="Voided" value={txn.is_voided ? '✔' : '—'} />
          <Field label="Refunded" value={txn.is_refunded ? '✔' : '—'} />
        </div>

        {/* Aksiyonlar */}
        <div className="flex gap-2 mb-4">
          {canDo.void(txn) && (
            <button
              type="button"
              onClick={onVoid}
              className="px-3 py-1.5 bg-gray-200 rounded hover:bg-gray-300"
            >
              Void Et
            </button>
          )}
          {canDo.capture(txn) && (
            <button
              type="button"
              onClick={onCapture}
              className="px-3 py-1.5 bg-emerald-100 rounded hover:bg-emerald-200 text-emerald-800"
            >
              Capture Et
            </button>
          )}
          {canDo.refund(txn) && (
            <button
              type="button"
              onClick={onRefund}
              className="px-3 py-1.5 bg-purple-100 rounded hover:bg-purple-200 text-purple-800"
            >
              Refund Et
            </button>
          )}
        </div>

        {/* Ham veri */}
        <details className="mb-2">
          <summary className="text-sm font-semibold cursor-pointer">
            Ham Response
          </summary>
          <pre className="p-3 mt-2 overflow-x-auto text-xs bg-gray-100 rounded max-h-64">
            {JSON.stringify(txn.raw_response, null, 2)}
          </pre>
        </details>
        <details>
          <summary className="text-sm font-semibold cursor-pointer">
            Ham Request
          </summary>
          <pre className="p-3 mt-2 overflow-x-auto text-xs bg-gray-100 rounded max-h-64">
            {JSON.stringify(txn.raw_request, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: ReactNode;
  wide?: boolean;
  mono?: boolean;
}

function Field({ label, value, wide, mono }: FieldProps): ReactElement {
  return (
    <div className={wide ? 'col-span-2 md:col-span-3' : ''}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-medium ${mono ? 'font-mono text-xs break-all' : ''}`}>
        {value}
      </div>
    </div>
  );
}

// ---- Aksiyon Onay Modalı ----
interface ActionConfirmModalProps {
  type: 'void' | 'capture' | 'refund';
  txn: Transaction;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (payload?: { amount?: number; fullRefund?: boolean }) => void;
}

function ActionConfirmModal({
  type,
  txn,
  loading,
  onCancel,
  onConfirm,
}: ActionConfirmModalProps): ReactElement {
  const maxCapture = Number(txn.amount);
  const maxRefund = Number(txn.captured_amount || txn.amount);

  const [amount, setAmount] = useState<number>(
    type === 'capture' ? maxCapture : maxRefund
  );
  const [fullRefund, setFullRefund] = useState<boolean>(false);

  const title =
    type === 'void' ? 'Void Onayı' : type === 'capture' ? 'Capture' : 'Refund';

  const buttonColor =
    type === 'void'
      ? 'bg-gray-600'
      : type === 'capture'
      ? 'bg-emerald-600'
      : 'bg-purple-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md p-6 bg-white rounded-lg">
        <h3 className="mb-3 text-lg font-bold">{title}</h3>
        <div className="mb-4 text-sm text-gray-600">
          İşlem #{txn.id} — {txn.pan_masked} —{' '}
          {formatMoney(txn.amount, txn.currency)}
        </div>

        {type === 'void' && (
          <div className="p-3 mb-4 text-sm border border-yellow-200 rounded bg-yellow-50">
            Bu işlem void edilecek. Geri alınamaz.
          </div>
        )}

        {type === 'capture' && (
          <div className="mb-4 space-y-2">
            <label className="flex flex-col text-sm">
              <span className="mb-1 text-gray-600">
                Capture tutarı (max {formatMoney(maxCapture, txn.currency)})
              </span>
              <input
                type="number"
                min="0.01"
                max={maxCapture}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="px-2 py-1 border rounded"
              />
            </label>
          </div>
        )}

        {type === 'refund' && (
          <div className="mb-4 space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={fullRefund}
                onChange={(e) => {
                  setFullRefund(e.target.checked);
                  if (e.target.checked) setAmount(maxRefund);
                }}
              />
              Tamamını refund et
            </label>

            {!fullRefund && (
              <label className="flex flex-col text-sm">
                <span className="mb-1 text-gray-600">
                  Refund tutarı (max {formatMoney(maxRefund, txn.currency)})
                </span>
                <input
                  type="number"
                  min="0.01"
                  max={maxRefund}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="px-2 py-1 border rounded"
                />
              </label>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => {
              if (type === 'void') {
                onConfirm();
              } else if (type === 'capture') {
                onConfirm({ amount });
              } else {
                onConfirm({ amount, fullRefund });
              }
            }}
            disabled={loading}
            className={`px-3 py-1.5 text-white rounded hover:opacity-90 disabled:opacity-50 ${buttonColor}`}
          >
            {loading ? 'İşleniyor...' : 'Onayla'}
          </button>
        </div>
      </div>
    </div>
  );
}
