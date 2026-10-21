import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { providerTransactionsApi, type ProviderTxnFilters } from '../api';

const PROVIDERS = ['', 'clover3', 'authorize3', 'moneris'];
const ACTIONS = ['', 'live_check', 'preauth', 'auth', 'sale', 'capture', 'refund', 'void'];
const STATUSES = ['', 'approved', 'declined', 'error', 'captured', 'refunded', 'partially_refunded', 'voided'];

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00';
}

export default function ProviderTransactionsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<ProviderTxnFilters>({
    provider: '',
    action: '',
    status: '',
    scope: 'all',
    limit: 25,
    offset: 0,
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await providerTransactionsApi.list({
        ...filters,
        provider: filters.provider || undefined,
        action: filters.action || undefined,
        status: filters.status || undefined,
      });
      setRows(data.transactions || []);
      setTotal(Number(data.total || 0));
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'İşlemler alınamadı');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const pageSize = filters.limit || 25;
  const page = Math.floor((filters.offset || 0) / pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goToPage(nextPage: number) {
    const boundedPage = Math.min(Math.max(nextPage, 0), totalPages - 1);
    setFilters((current) => ({ ...current, offset: boundedPage * pageSize }));
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(
    row: any,
    action: 'void' | 'capture' | 'refund'
  ) {
    if (!row?.id) return;

    let amount: number | undefined;
    if (action === 'capture' || action === 'refund') {
      const defaultAmount =
        action === 'capture'
          ? Number(row.amount || 0)
          : Number(row.captured_amount || row.amount || 0);
      const input = window.prompt(
        action === 'capture' ? 'Capture tutarı ($):' : 'Refund tutarı ($):',
        defaultAmount.toFixed(2)
      );
      if (input === null) return;
      amount = Number(input);
      if (!Number.isFinite(amount) || amount <= 0) {
        window.alert('Geçerli bir tutar girin.');
        return;
      }
    }

    const labels = { void: 'void', capture: 'capture', refund: 'refund' };
    if (!window.confirm(`${labels[action]} işlemi ${row.id} için çalıştırılsın mı?`)) {
      return;
    }

    setBusy(row.id);
    setError('');
    try {
      if (action === 'void') {
        await providerTransactionsApi.void(row.id);
      } else if (action === 'capture') {
        await providerTransactionsApi.capture(row.id, amount!);
      } else {
        await providerTransactionsApi.refund(row.id, { amount });
      }
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || `${action} başarısız`);
    } finally {
      setBusy(null);
    }
  }

  function canCapture(row: any) {
    return !row.is_captured && !row.is_voided &&
      row.provider_txn_id && ['preauth', 'auth'].includes(row.action);
  }

  function canVoid(row: any) {
    return !row.is_voided && !row.is_captured &&
      row.provider_txn_id && ['preauth', 'auth'].includes(row.action);
  }

  function canRefund(row: any) {
    return !row.is_refunded && row.provider_txn_id &&
      ['sale', 'capture', 'preauth', 'auth'].includes(row.action) &&
      Number(row.captured_amount || row.amount || 0) > 0;
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-accent">🔧 Provider İşlemleri</h1>
          <p className="mt-1 text-xs text-gray-500">
            Provider transaction kayıtları ve mevcut void / capture / refund aksiyonları.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-2 text-xs font-bold text-white rounded bg-accent disabled:opacity-50"
        >
          {loading ? 'Yükleniyor...' : '🔄 Yenile'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 p-3 mb-4 border rounded-lg bg-bg-card border-border">
        <select
          value={filters.provider || ''}
          onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value || undefined, offset: 0 }))}
          className="px-2 py-2 text-xs border rounded bg-bg-input border-border"
        >
          {PROVIDERS.map((p) => <option key={p} value={p}>{p || 'Tüm provider'}</option>)}
        </select>

        <select
          value={filters.action || ''}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value || undefined, offset: 0 }))}
          className="px-2 py-2 text-xs border rounded bg-bg-input border-border"
        >
          {ACTIONS.map((a) => <option key={a} value={a}>{a || 'Tüm action'}</option>)}
        </select>

        <select
          value={filters.status || ''}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined, offset: 0 }))}
          className="px-2 py-2 text-xs border rounded bg-bg-input border-border"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'Tüm status'}</option>)}
        </select>

        <select
          value={filters.scope || 'mine'}
          onChange={(e) => setFilters((f) => ({ ...f, scope: e.target.value as 'mine' | 'all', offset: 0 }))}
          className="px-2 py-2 text-xs border rounded bg-bg-input border-border"
        >
          <option value="mine">Sadece benim</option>
          <option value="all">Tümü (admin)</option>
        </select>

        <select
          value={pageSize}
          onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), offset: 0 }))}
          aria-label="Sayfa başına işlem"
          className="px-2 py-2 text-xs border rounded bg-bg-input border-border"
        >
          {[25, 50, 100].map((size) => <option key={size} value={size}>{size} / sayfa</option>)}
        </select>
      </div>

      {error && (
        <div className="p-3 mb-3 text-xs border rounded bg-dead/10 border-dead text-dead">
          ❌ {error}
        </div>
      )}

      <div className="overflow-x-auto border rounded-lg bg-bg-card border-border">
        <table className="w-full text-xs">
          <thead className="bg-[#1f1f1f]">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Action</th>
              <th className="p-2 text-left">Provider</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-right">Capture</th>
              <th className="p-2 text-right">Refund</th>
              <th className="p-2 text-left">Card</th>
              <th className="p-2 text-left">Provider Txn</th>
              <th className="p-2 text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="p-2 font-mono">{row.id}</td>
                <td className="p-2">{row.action}</td>
                <td className="p-2 text-accent">{row.provider}</td>
                <td className="p-2 font-semibold">{row.status}</td>
                <td className="p-2 font-mono text-right">{money(row.amount)}</td>
                <td className="p-2 font-mono text-right">{money(row.captured_amount)}</td>
                <td className="p-2 font-mono text-right">{money(row.refunded_amount)}</td>
                <td className="p-2 font-mono">
                  {row.card_id ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/cards?cardId=${encodeURIComponent(row.card_id)}`)}
                      className="text-info underline-offset-2 hover:underline"
                      aria-label={`Kart detayını aç: ${row.pan_masked || row.card_id}`}
                      title="Kart detayını aç"
                    >
                      {row.pan_masked || `Kart #${row.card_id}`}
                    </button>
                  ) : (
                    <span className="text-gray-500">{row.pan_masked || '—'}</span>
                  )}
                </td>
                <td className="p-2 font-mono text-gray-500">{row.provider_txn_id || '—'}</td>
                <td className="p-2">
                  <div className="flex justify-end gap-1">
                    {canCapture(row) && (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void runAction(row, 'capture')}
                        className="px-2 py-1 rounded bg-live/20 text-live disabled:opacity-50"
                      >
                        Capture
                      </button>
                    )}
                    {canVoid(row) && (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void runAction(row, 'void')}
                        className="px-2 py-1 rounded bg-warn/20 text-warn disabled:opacity-50"
                      >
                        Void
                      </button>
                    )}
                    {canRefund(row) && (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void runAction(row, 'refund')}
                        className="px-2 py-1 rounded bg-info/20 text-info disabled:opacity-50"
                      >
                        Refund
                      </button>
                    )}
                    {!canCapture(row) && !canVoid(row) && !canRefund(row) && (
                      <span className="px-2 py-1 text-gray-600">—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-gray-500">
                  Kayıt bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs">
        <span className="text-gray-500">
          {total === 0 ? '0 işlem' : `${(filters.offset || 0) + 1}–${Math.min((filters.offset || 0) + rows.length, total)} / ${total} işlem`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={loading || page === 0}
            className="px-3 py-2 border rounded border-border disabled:opacity-40"
          >
            Önceki
          </button>
          <span className="text-gray-400">Sayfa {page + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={loading || page >= totalPages - 1}
            className="px-3 py-2 border rounded border-border disabled:opacity-40"
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}
