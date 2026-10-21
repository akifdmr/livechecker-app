// ============================================================
// TRANSACTIONS PAGE — charge_audit listesi + tıklanınca kart detayı
// ============================================================
import { useEffect, useState } from 'react';
import { cardsApi, chargeApi, favoritesApi, type Card, type FavList } from '../api';
import CardDetailModal from '../components/CardDetailModal';

const ACTIONS = ['', 'live_check', 'preauth', 'auth', 'sale', 'capture', 'refund', 'void'];
const STATUSES = ['', 'approved', 'declined', 'error', 'captured', 'refunded', 'voided'];
const PROVIDERS = ['', 'moneris', 'clover3', 'authorize3'];

export default function TransactionsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    action: '', status: 'approved', provider: '', reason: '',
    scope: 'all',                // ⭐ admin default "all"
    liveCardId: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kart detayı için
  const [cardModal, setCardModal] = useState<Card | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [favorites, setFavorites] = useState<FavList[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await chargeApi.history(filters);
      setRows(res.transactions || []);
      setSummary(res.summary || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Favorileri ilk açılışta çek (kart modalı için)
  useEffect(() => {
    if (favoritesLoaded) return;
    favoritesApi
      .list()
      .then((list) => {
        setFavorites(list);
        setFavoritesLoaded(true);
      })
      .catch(() => {});
  }, [favoritesLoaded]);

  // ⭐ Satıra tıklanınca kart detayını getir
  async function handleRowClick(txn: any) {
    if (!txn.live_card_id) {
      alert('Bu işlem canlı kart listesindeki bir karta bağlı değil.');
      return;
    }

    setCardLoading(true);
    try {
      const card = await cardsApi.get(txn.live_card_id);
      setCardModal(card);
    } catch (e: any) {
      alert(`Kart detayı alınamadı: ${e?.response?.data?.error || e.message}`);
    } finally {
      setCardLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-bold text-accent">📋 İşlem Geçmişi</h1>

      {/* FİLTRELER */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filters.action}
          onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          className="px-3 py-2 text-xs border rounded bg-bg-input border-border"
        >
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a || 'Tüm action'}</option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-2 text-xs border rounded bg-bg-input border-border"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || 'Tüm status'}</option>
          ))}
        </select>

        <select
          value={filters.provider}
          onChange={(e) => setFilters({ ...filters, provider: e.target.value })}
          className="px-3 py-2 text-xs border rounded bg-bg-input border-border"
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{p || 'Tüm provider'}</option>
          ))}
        </select>

        <input
          placeholder="Reason (ör. insufficient_funds)"
          value={filters.reason}
          onChange={(e) => setFilters({ ...filters, reason: e.target.value })}
          className="px-3 py-2 text-xs border rounded bg-bg-input border-border"
        />

        <select
          value={filters.scope}
          onChange={(e) => setFilters({ ...filters, scope: e.target.value })}
          className="px-3 py-2 text-xs border rounded bg-bg-input border-border"
        >
          <option value="mine">Sadece benim</option>
          <option value="all">Tümü (admin)</option>
        </select>

        <input
          placeholder="Live Card ID"
          value={filters.liveCardId}
          onChange={(e) =>
            setFilters({
              ...filters,
              liveCardId: e.target.value.replace(/\D/g, ''),
            })
          }
          className="px-3 py-2 text-xs border rounded bg-bg-input border-border"
        />

        <button
          onClick={load}
          className="px-3 py-2 text-xs font-bold text-white rounded bg-accent hover:bg-green-600"
        >
          🔄
        </button>
      </div>

      {/* ÖZET */}
      <div className="flex flex-wrap gap-2 mb-4">
        {summary.map((s, i) => (
          <div
            key={i}
            className="px-3 py-2 text-xs border rounded bg-bg-card border-border"
          >
            <div className="text-gray-500">{s.action} / {s.status}</div>
            <div className="font-bold">{s.cnt} × ${Number(s.total).toFixed(2)}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="p-3 mb-3 text-xs border rounded bg-dead/10 border-dead text-dead">
          ❌ {error}
        </div>
      )}

      {/* TABLO */}
      {loading ? (
        <div className="py-8 text-sm text-center text-gray-500">Yükleniyor...</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-sm text-center text-gray-500">Kayıt yok</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg bg-bg-card border-border">
          <table className="w-full text-xs">
            <thead className="bg-[#1f1f1f]">
              <tr>
                <th className="p-2 text-left">ID</th>
                <th className="p-2 text-left">Action</th>
                <th className="p-2 text-left">Provider</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-right">Amount</th>
                <th className="p-2 text-left">Kart</th>
                <th className="p-2 text-left">Açıklama</th>
                <th className="p-2 text-left">Txn ID</th>
                <th className="p-2 text-left">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const clickable = !!r.live_card_id;
                return (
                  <tr
                    key={r.id}
                    onClick={() => clickable && handleRowClick(r)}
                    className={`border-t border-border ${
                      clickable
                        ? 'cursor-pointer hover:bg-[#1a1a1a]'
                        : 'opacity-70'
                    }`}
                    title={clickable ? 'Kart detayını görmek için tıkla' : ''}
                  >
                    <td className="p-2 font-mono">
                      {r.id}
                      {clickable && (
                        <span className="ml-1 text-[10px] text-info">
                          🔗
                        </span>
                      )}
                    </td>
                    <td className="p-2">{r.operation || r.action}</td>
                    <td className="p-2">
                      <code className="text-accent">{r.provider}</code>
                    </td>
                    <td
                      className={`p-2 font-bold ${
                        r.status === 'approved'
                          ? 'text-live'
                          : r.status === 'declined'
                          ? 'text-dead'
                          : 'text-warn'
                      }`}
                      title={r.display_message || r.message || ''}
                    >
                      {r.status}
                    </td>
                    <td className="p-2 font-mono text-right">
                      ${Number(r.amount || 0).toFixed(2)}
                    </td>
                    <td className="p-2">
                      <code className="text-info">{r.pan_masked}</code>
                    </td>
                    <td className="p-2 text-[11px] text-gray-400">
                      {r.display_reason || r.reason || '—'}
                    </td>
                    <td className="p-2">
                      <code className="text-[10px] text-gray-500">
                        {r.provider_txn_id || '—'}
                      </code>
                    </td>
                    <td className="p-2 text-gray-500">
                      {new Date(r.created_at).toLocaleString('tr-TR')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Kart yükleniyor overlay */}
      {cardLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="px-6 py-3 text-sm text-white rounded bg-bg-card">
            🔄 Kart yükleniyor...
          </div>
        </div>
      )}

      {/* Kart detay modalı */}
      {cardModal && (
        <CardDetailModal
          card={cardModal}
          favorites={favorites}
          onClose={() => setCardModal(null)}
          onFavUpdate={() => {
            // Favorileri yenile (opsiyonel)
            favoritesApi.list().then(setFavorites).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
