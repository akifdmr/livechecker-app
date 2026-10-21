// ============================================================
// LOADS PAGE — Dolum İşlemleri
// ============================================================
import { useEffect, useState } from 'react';
import type { BankAccount, Load, LoadCard } from '../api';
import { bankApi, loadApi, loadCardApi } from '../api';
import StatCard from '../components/StatCard';

export default function LoadsPage() {
  const [loads, setLoads] = useState<Load[]>([]);
  const [cards, setCards] = useState<LoadCard[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ count: 0, amount: 0 });
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [l, c, b] = await Promise.all([
        loadApi.list(),
        loadCardApi.list(),
        bankApi.list(),
      ]);
      setLoads(l.loads || []);
      setTotals({ count: l.total || 0, amount: l.totalAmount || 0 });
      setCards(c);
      setBanks(b);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Bu dolum silinsin mi?')) return;
    try {
      await loadApi.delete(id);
      loadAll();
    } catch (e: any) {
      alert('Hata: ' + e.message);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-accent">💰 Dolumlar</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-accent hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm font-bold"
        >
          ➕ Yeni Dolum
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Toplam Dolum" value={totals.count} />
        <StatCard
          label="Toplam Tutar"
          value={`$${totals.amount.toLocaleString('en-US')}`}
          variant="warn"
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-8 text-sm">Yükleniyor...</div>
      ) : loads.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <div className="text-4xl mb-3">💰</div>
          <div>Henüz dolum yok</div>
        </div>
      ) : (
        <div className="space-y-2">
          {loads.map((load) => (
            <div
              key={load.id}
              className="bg-bg-card border border-border rounded-lg p-3 hover:border-accent transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white font-mono truncate">
                    {load.card_number || '—'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 truncate">
                    👤 {load.card_holder_name || '-'}
                  </div>
                  <div className="text-xs text-[#9C27B0] mt-1">
                    🏦 {load.bank_name || '-'} | {load.account_name || '-'}
                  </div>
                  <div className="flex gap-3 mt-2 text-[10px] text-gray-500 flex-wrap">
                    <span>📅 {new Date(load.load_date).toLocaleDateString('tr-TR')}</span>
                    <span>📝 {load.method || '-'}</span>
                    {load.reference && <span>🔖 {load.reference}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <div className="text-right">
                    <div className="text-warn font-bold text-base">
                      ${Number(load.amount).toLocaleString('en-US')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(load.id)}
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
        <LoadModal
          cards={cards}
          banks={banks}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
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
function LoadModal({
  cards,
  banks,
  onClose,
  onSaved,
}: {
  cards: LoadCard[];
  banks: BankAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loadCardId, setLoadCardId] = useState<number | ''>(cards[0]?.id || '');
  const [bankAccountId, setBankAccountId] = useState<number | ''>(banks[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [loadDate, setLoadDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('wire');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    setErr('');
    if (!loadCardId || !amount || !loadDate) {
      setErr('Kart, tutar ve tarih gerekli');
      return;
    }
    if (parseFloat(amount) <= 0) {
      setErr('Tutar > 0 olmalı');
      return;
    }
    setLoading(true);
    try {
      await loadApi.create({
        load_card_id: Number(loadCardId),
        bank_account_id: bankAccountId ? Number(bankAccountId) : undefined,
        amount: parseFloat(amount),
        load_date: loadDate,
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
          <h2 className="text-accent font-bold">💰 Yeni Dolum</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Dolum Kartı *</label>
            <select
              value={loadCardId}
              onChange={(e) => setLoadCardId(e.target.value ? Number(e.target.value) : '')}
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

          <div>
            <label className="text-xs text-gray-500 block mb-1">Banka Hesabı (opsiyonel)</label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            >
              <option value="">Seçme</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.account_name} — {b.bank_name || b.routing_number}
                </option>
              ))}
            </select>
          </div>

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
              value={loadDate}
              onChange={(e) => setLoadDate(e.target.value)}
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
              <option value="wire">Wire Transfer</option>
              <option value="ach">ACH</option>
              <option value="mobile">Mobile Deposit</option>
              <option value="cash">Cash</option>
              <option value="zelle">Zelle</option>
              <option value="cashapp">CashApp</option>
              <option value="other">Diğer</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Referans</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="WIRE-001"
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