// ============================================================
// COLLECTIONS PAGE — Tahsilat İşlemleri
// ============================================================
import { useEffect, useState } from 'react';
import type { CardBalance, Collection, LoadCard } from '../api';
import { collectionApi, loadCardApi } from '../api';
import StatCard from '../components/StatCard';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [cards, setCards] = useState<LoadCard[]>([]);
  const [balances, setBalances] = useState<CardBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ count: 0, amount: 0 });
  const [summary, setSummary] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [preselectCardId, setPreselectCardId] = useState<number | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [c, cards, sum] = await Promise.all([
        collectionApi.list(),
        loadCardApi.list(),
        collectionApi.summary(),
      ]);
      setCollections(c.collections || []);
      setTotals({ count: c.total || 0, amount: c.totalAmount || 0 });
      setCards(cards);
      setSummary(sum);
      setBalances(sum.balances || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Bu tahsilat silinsin mi?')) return;
    try {
      await collectionApi.delete(id);
      loadAll();
    } catch (e: any) {
      alert('Hata: ' + e.message);
    }
  }

  const cardsWithRemaining = balances.filter(
    (b) => parseFloat(String(b.remaining)) > 0
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-accent">📥 Tahsilatlar</h1>
        <button
          onClick={() => {
            setPreselectCardId(null);
            setShowModal(true);
          }}
          className="bg-accent hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm font-bold"
        >
          ➕ Yeni Tahsilat
        </button>
      </div>

      {/* TOPLAM */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Toplam Tahsilat" value={totals.count} />
        <StatCard
          label="Toplam Tutar"
          value={`$${totals.amount.toLocaleString('en-US')}`}
          variant="live"
        />
        <StatCard
          label="Bekleyen"
          value={`$${Number(summary?.totalRemaining || 0).toLocaleString('en-US')}`}
          variant="warn"
        />
      </div>

      {/* BEKLEYEN TAHSİLATLAR */}
      {cardsWithRemaining.length > 0 && (
        <div className="bg-warn/10 border border-warn rounded-lg p-3 mb-4">
          <div className="text-xs font-bold text-warn mb-2">
            🔔 {cardsWithRemaining.length} kartta tahsil edilecek var
          </div>
          <div className="space-y-1 max-h-[180px] overflow-y-auto">
            {cardsWithRemaining.map((b) => (
              <div
                key={b.load_card_id}
                onClick={() => {
                  setPreselectCardId(b.load_card_id);
                  setShowModal(true);
                }}
                className="bg-bg-card border border-border rounded p-2 flex justify-between items-center text-xs cursor-pointer hover:border-warn"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-info truncate">
                    {b.card_number}
                  </div>
                  <div className="text-gray-500 truncate">
                    {b.card_holder_name}
                  </div>
                </div>
                <div className="text-warn font-bold ml-2">
                  ${parseFloat(String(b.remaining)).toLocaleString('en-US')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-8 text-sm">Yükleniyor...</div>
      ) : collections.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <div className="text-4xl mb-3">📥</div>
          <div>Henüz tahsilat yok</div>
        </div>
      ) : (
        <div className="space-y-2">
          {collections.map((col) => (
            <div
              key={col.id}
              className="bg-bg-card border border-border rounded-lg p-3 hover:border-accent transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white font-mono truncate">
                    {col.card_number || '—'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 truncate">
                    👤 {col.card_holder_name || '-'}
                  </div>
                  <div className="flex gap-3 mt-2 text-[10px] text-gray-500 flex-wrap">
                    <span>📅 {new Date(col.collection_date).toLocaleDateString('tr-TR')}</span>
                    <span>📝 {col.method || '-'}</span>
                    {col.reference && <span>🔖 {col.reference}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <div className="text-right">
                    <div className="text-live font-bold text-base">
                      ${Number(col.amount).toLocaleString('en-US')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(col.id)}
                    className="px-2 py-1 text-xs bg-dead hover:bg-red-700 text-white rounded"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CollectionModal
          cards={cards}
          balances={balances}
          preselectCardId={preselectCardId}
          onClose={() => {
            setShowModal(false);
            setPreselectCardId(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setPreselectCardId(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// MODAL
// ============================================================
function CollectionModal({
  cards,
  balances,
  preselectCardId,
  onClose,
  onSaved,
}: {
  cards: LoadCard[];
  balances: CardBalance[];
  preselectCardId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loadCardId, setLoadCardId] = useState<number | ''>(
    preselectCardId || cards[0]?.id || ''
  );
  const [amount, setAmount] = useState('');
  const [collectionDate, setCollectionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [method, setMethod] = useState('zelle');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const selectedBalance = balances.find(
    (b) => b.load_card_id === Number(loadCardId)
  );

  async function handleSave() {
    setErr('');
    if (!loadCardId || !amount || !collectionDate) {
      setErr('Kart, tutar ve tarih gerekli');
      return;
    }
    if (parseFloat(amount) <= 0) {
      setErr('Tutar > 0 olmalı');
      return;
    }
    setLoading(true);
    try {
      await collectionApi.create({
        load_card_id: Number(loadCardId),
        amount: parseFloat(amount),
        collection_date: collectionDate,
        method,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border-2 border-accent rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-accent font-bold">📥 Yeni Tahsilat</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Dolum Kartı *</label>
            <select
              value={loadCardId}
              onChange={(e) =>
                setLoadCardId(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            >
              <option value="">Seç...</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.card_number_masked || c.card_number} — {c.card_holder_name}
                </option>
              ))}
            </select>
          </div>

          {/* KALAN BAKİYE */}
          {selectedBalance && (
            <div className="bg-warn/10 border border-warn rounded-md p-2 text-xs">
              <div className="text-warn">
                💰 Toplam Yüklenen: $
                {parseFloat(String(selectedBalance.total_loaded)).toLocaleString('en-US')}
              </div>
              <div className="text-live">
                ✅ Tahsil Edilen: $
                {parseFloat(String(selectedBalance.total_collected)).toLocaleString('en-US')}
              </div>
              <div className="text-accent font-bold">
                🔔 Kalan: $
                {parseFloat(String(selectedBalance.remaining)).toLocaleString('en-US')}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 block mb-1">Tutar ($) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Tarih *</label>
            <input
              type="date"
              value={collectionDate}
              onChange={(e) => setCollectionDate(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Yöntem</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            >
              <option value="zelle">Zelle</option>
              <option value="cashapp">CashApp</option>
              <option value="wire">Wire</option>
              <option value="cash">Cash</option>
              <option value="venmo">Venmo</option>
              <option value="paypal">PayPal</option>
              <option value="other">Diğer</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Referans</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="ZEL-001"
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Notlar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none resize-y min-h-[50px]"
            />
          </div>

          {err && <div className="text-dead text-xs">{err}</div>}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-accent hover:bg-green-600 disabled:bg-gray-600 text-white py-2 rounded-md text-sm font-bold"
            >
              {loading ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button
              onClick={onClose}
              className="bg-[#555] hover:bg-[#666] text-white px-4 py-2 rounded-md text-sm"
            >
              İptal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}