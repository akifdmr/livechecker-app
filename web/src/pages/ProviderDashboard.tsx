// ============================================================
// ProviderDashboard.tsx
// Provider işlem özeti — günlük/haftalık rapor
// ============================================================
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { providerTransactionsApi } from '../api';

// ============================================================
// TYPES
// ============================================================
type Scope = 'mine' | 'all';

interface SummaryTotals {
  approved: number;
  declined: number;
  error: number;
  voided: number;
  amount: number;
  captured: number;
  refunded: number;
}

interface ProviderSummary {
  approved: number;
  declined: number;
  error: number;
  voided: number;
  amount: number;
  captured: number;
  refunded: number;
}

interface BreakdownRow {
  provider: string;
  action: string;
  status: string;
  count: number;
  total_amount: number | string;
  total_captured: number | string;
  total_refunded: number | string;
  avg_duration_ms: number | null;
}

interface SummaryResponse {
  success: boolean;
  totals: SummaryTotals;
  byProvider: Record<string, ProviderSummary>;
  breakdown: BreakdownRow[];
}


// ============================================================
// API CLIENT
// ============================================================
function getSummary(params: {
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
  scope?: Scope;
}) {
  return providerTransactionsApi.summary(params);
}

// ============================================================
// HELPERS
// ============================================================
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatMoney(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function formatInt(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

// ============================================================
// COMPONENT
// ============================================================
export default function ProviderDashboard(): ReactElement {
  // ---- State ----
  const [dateFrom, setDateFrom] = useState<string>(todayISO());
  const [dateTo, setDateTo] = useState<string>(todayISO());
  const [scope, setScope] = useState<Scope>('mine');
  const [providerFilter, setProviderFilter] = useState<string>('');

  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ---- Yükleme ----
  const load = useCallback(
    async (override?: { dateFrom?: string; dateTo?: string }): Promise<void> => {
      setLoading(true);
      setErr(null);
      try {
        const d = await getSummary({
          dateFrom: override?.dateFrom ?? dateFrom,
          dateTo: override?.dateTo ?? dateTo,
          scope,
          provider: providerFilter || undefined,
        });
        setData(d);
        setLastUpdated(new Date());
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
        setErr(msg);
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, scope, providerFilter]
  );

  // İlk yükleme
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Hızlı tarih aralıkları ----
  const setRangeToday = () => {
    const t = todayISO();
    setDateFrom(t);
    setDateTo(t);
    void load({ dateFrom: t, dateTo: t });
  };

  const setRangeLast7 = () => {
    const to = todayISO();
    const from = shiftDays(to, -6);
    setDateFrom(from);
    setDateTo(to);
    void load({ dateFrom: from, dateTo: to });
  };

  const setRangeLast30 = () => {
    const to = todayISO();
    const from = shiftDays(to, -29);
    setDateFrom(from);
    setDateTo(to);
    void load({ dateFrom: from, dateTo: to });
  };

  const setRangeThisMonth = () => {
    const now = new Date();
    const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const to = todayISO();
    setDateFrom(from);
    setDateTo(to);
    void load({ dateFrom: from, dateTo: to });
  };

  // ---- Türetilmiş ----
  const providerKeys = useMemo<string[]>(() => {
    if (!data) return [];
    return Object.keys(data.byProvider).sort();
  }, [data]);

  const breakdownSorted = useMemo<BreakdownRow[]>(() => {
    if (!data) return [];
    return [...data.breakdown].sort((a, b) => {
      if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
      if (a.action !== b.action) return a.action.localeCompare(b.action);
      return a.status.localeCompare(b.status);
    });
  }, [data]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="p-6 mx-auto space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Provider İşlem Özeti</h1>
          <p className="text-sm text-gray-500">
            Hangi provider ne kadar ödeme geçirdi, ne kadar void/refund oldu
          </p>
        </div>
        {lastUpdated && (
          <span className="text-xs text-gray-500">
            Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}
          </span>
        )}
      </div>

      {/* Filtreler */}
      <div className="p-4 space-y-3 border rounded bg-gray-50">
        {/* Hızlı aralık butonları */}
        <div className="flex flex-wrap gap-2">
          <QuickRangeButton label="Bugün" onClick={setRangeToday} />
          <QuickRangeButton label="Son 7 gün" onClick={setRangeLast7} />
          <QuickRangeButton label="Son 30 gün" onClick={setRangeLast30} />
          <QuickRangeButton label="Bu ay" onClick={setRangeThisMonth} />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-600">Başlangıç</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 border rounded"
            />
          </label>

          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-600">Bitiş</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 border rounded"
            />
          </label>

          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-600">Kapsam</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
              className="px-2 py-1 border rounded"
            >
              <option value="mine">Benim İşlemlerim</option>
              <option value="all">Tümü (Admin)</option>
            </select>
          </label>

          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-600">Provider</span>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-2 py-1 border rounded"
            >
              <option value="">Tümü</option>
              <option value="clover">Clover</option>
              <option value="moneris">Moneris</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Yükleniyor...' : 'Getir'}
          </button>
        </div>
      </div>

      {/* Hata */}
      {err && (
        <div className="px-4 py-3 text-red-700 border border-red-200 rounded bg-red-50">
          <b>Hata:</b> {err}
        </div>
      )}

      {/* İçerik */}
      {data && (
        <>
          {/* Toplam İstatistikler */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Genel Toplamlar</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Onaylanan"
                value={formatInt(data.totals.approved)}
                variant="green"
              />
              <StatCard
                label="Reddedilen"
                value={formatInt(data.totals.declined)}
                variant="red"
              />
              <StatCard
                label="Void Edilen"
                value={formatInt(data.totals.voided)}
                variant="gray"
              />
              <StatCard
                label="Hata"
                value={formatInt(data.totals.error)}
                variant="orange"
              />
              <StatCard
                label="Toplam Tutar"
                value={formatMoney(data.totals.amount)}
                variant="blue"
                subtitle="Onaylanan işlem tutarı"
              />
              <StatCard
                label="Capture"
                value={formatMoney(data.totals.captured)}
                variant="emerald"
                subtitle="Capture edilen"
              />
              <StatCard
                label="Refund"
                value={formatMoney(data.totals.refunded)}
                variant="purple"
                subtitle="Geri ödenen"
              />
              <StatCard
                label="Net"
                value={formatMoney(
                  Number(data.totals.captured) - Number(data.totals.refunded)
                )}
                variant="blue"
                subtitle="Capture − Refund"
              />
            </div>
          </section>

          {/* Provider Bazlı */}
          {providerKeys.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Provider Bazlı</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {providerKeys.map((provider) => {
                  const p = data.byProvider[provider];
                  return (
                    <div
                      key={provider}
                      className="p-4 bg-white border rounded-lg shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-bold capitalize">
                          {provider}
                        </h3>
                        <span className="text-xs text-gray-500">
                          Toplam işlem:{' '}
                          {formatInt(
                            p.approved + p.declined + p.error + p.voided
                          )}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 text-sm gap-y-2 gap-x-4">
                        <Metric label="Onay" value={formatInt(p.approved)} tone="green" />
                        <Metric label="Red" value={formatInt(p.declined)} tone="red" />
                        <Metric label="Void" value={formatInt(p.voided)} tone="gray" />
                        <Metric label="Hata" value={formatInt(p.error)} tone="orange" />
                        <Metric
                          label="Tutar"
                          value={formatMoney(p.amount)}
                          tone="blue"
                        />
                        <Metric
                          label="Capture"
                          value={formatMoney(p.captured)}
                          tone="emerald"
                        />
                        <Metric
                          label="Refund"
                          value={formatMoney(p.refunded)}
                          tone="purple"
                        />
                      </div>

                      {/* Mini progress bar: approved vs declined */}
                      <div className="mt-3">
                        <div className="mb-1 text-xs text-gray-500">
                          Onay oranı
                        </div>
                        <ProgressBar
                          approved={p.approved}
                          declined={p.declined + p.error}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Breakdown Tablosu */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Detaylı Kırılım (Provider × Action × Status)
            </h2>
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Provider</th>
                    <th className="p-2 text-left">Action</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-right">Adet</th>
                    <th className="p-2 text-right">Tutar</th>
                    <th className="p-2 text-right">Capture</th>
                    <th className="p-2 text-right">Refund</th>
                    <th className="p-2 text-right">Ort. Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownSorted.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-gray-500">
                        Seçili aralıkta işlem yok
                      </td>
                    </tr>
                  )}
                  {breakdownSorted.map((r, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="p-2 capitalize">{r.provider}</td>
                      <td className="p-2 font-mono text-xs">{r.action}</td>
                      <td className="p-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="p-2 text-right">
                        {formatInt(r.count)}
                      </td>
                      <td className="p-2 font-mono text-right">
                        {formatMoney(r.total_amount)}
                      </td>
                      <td className="p-2 font-mono text-right">
                        {formatMoney(r.total_captured)}
                      </td>
                      <td className="p-2 font-mono text-right">
                        {formatMoney(r.total_refunded)}
                      </td>
                      <td className="p-2 text-xs text-right text-gray-500">
                        {r.avg_duration_ms != null
                          ? `${r.avg_duration_ms} ms`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Loading overlay */}
      {loading && !data && (
        <div className="py-10 text-center text-gray-500">Yükleniyor...</div>
      )}
    </div>
  );
}

// ============================================================
// ALT BİLEŞENLER
// ============================================================

type StatVariant =
  | 'blue'
  | 'green'
  | 'red'
  | 'gray'
  | 'orange'
  | 'emerald'
  | 'purple';

const STAT_STYLES: Record<StatVariant, string> = {
  blue: 'bg-blue-50 border-blue-200 text-blue-800',
  green: 'bg-green-50 border-green-200 text-green-800',
  red: 'bg-red-50 border-red-200 text-red-800',
  gray: 'bg-gray-50 border-gray-200 text-gray-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  purple: 'bg-purple-50 border-purple-200 text-purple-800',
};

interface StatCardProps {
  label: string;
  value: string;
  variant?: StatVariant;
  subtitle?: string;
}

function StatCard({
  label,
  value,
  variant = 'blue',
  subtitle,
}: StatCardProps): ReactElement {
  return (
    <div className={`border rounded-lg p-3 ${STAT_STYLES[variant]}`}>
      <div className="text-xs opacity-80 mb-0.5">{label}</div>
      <div className="font-mono text-xl font-bold">{value}</div>
      {subtitle && (
        <div className="text-[10px] opacity-70 mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
  tone?: StatVariant;
}

const TONE_TEXT: Record<StatVariant, string> = {
  blue: 'text-blue-700',
  green: 'text-green-700',
  red: 'text-red-700',
  gray: 'text-gray-700',
  orange: 'text-orange-700',
  emerald: 'text-emerald-700',
  purple: 'text-purple-700',
};

function Metric({ label, value, tone = 'gray' }: MetricProps): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`font-mono font-semibold ${TONE_TEXT[tone]}`}>
        {value}
      </span>
    </div>
  );
}

interface ProgressBarProps {
  approved: number;
  declined: number;
}

function ProgressBar({ approved, declined }: ProgressBarProps): ReactElement {
  const total = approved + declined;
  const pct = total > 0 ? (approved / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 overflow-hidden bg-gray-200 rounded-full">
        <div
          className="h-full transition-all bg-green-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-600 min-w-[45px] text-right">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
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

function StatusBadge({ status }: StatusBadgeProps): ReactElement {
  const cls = STATUS_STYLES[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

interface QuickRangeButtonProps {
  label: string;
  onClick: () => void;
}

function QuickRangeButton({ label, onClick }: QuickRangeButtonProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1 text-xs bg-gray-100 border rounded hover:bg-white"
    >
      {label}
    </button>
  );
}
