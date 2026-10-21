// ============================================================
// LOAD CARDS PAGE — Dolum Kartları CRUD
// ============================================================
import { useEffect, useState } from 'react';
import type { LoadCard } from '../api';
import { loadCardApi } from '../api';

export default function LoadCardsPage() {
  const [cards, setCards] = useState<LoadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<LoadCard | null>(null);

  useEffect(() => {
    loadCards();
  }, []);

  async function loadCards() {
    setLoading(true);
    try {
      const data = await loadCardApi.list();
      setCards(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}" kartı silinsin mi?`)) return;
    try {
      await loadCardApi.delete(id);
      loadCards();
    } catch (e: any) {
      alert('Hata: ' + e.message);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-accent">💳 Dolum Kartları</h1>
        <button
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
          className="bg-accent hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm font-bold"
        >
          ➕ Yeni Kart
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-8 text-sm">Yükleniyor...</div>
      ) : cards.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <div className="text-4xl mb-3">💳</div>
          <div>Henüz dolum kartı yok</div>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className="bg-bg-card border border-border rounded-lg p-4 hover:border-accent transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white font-mono">
                    {card.card_number_masked || card.card_number}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    👤 {card.card_holder_name}
                  </div>
                  {(card.agent_first_name || card.agent_last_name) && (
                    <div className="text-xs text-[#9C27B0] mt-1">
                      🤝 Agent: {card.agent_first_name} {card.agent_last_name}
                      {card.agent_phone && ` — ${card.agent_phone}`}
                    </div>
                  )}
                  {card.mobile_username && (
                    <div className="text-xs text-info mt-1 font-mono">
                      📱 {card.mobile_bank || 'Mobil'}: {card.mobile_username}
                    </div>
                  )}
                  <div className="flex gap-3 mt-2 text-[10px] text-gray-500 flex-wrap">
                    {card.card_exp && <span>📅 {card.card_exp}</span>}
                    {card.phone && <span>📞 {card.phone}</span>}
                    {card.city && <span>🏙 {card.city}</span>}
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={() => {
                      setEditing(card);
                      setShowModal(true);
                    }}
                    className="px-3 py-1 text-xs bg-[#333] hover:bg-[#444] text-white rounded"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(card.id, card.card_number_masked || card.card_number)}
                    className="px-3 py-1 text-xs bg-dead hover:bg-red-700 text-white rounded"
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
        <LoadCardModal
          card={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setEditing(null);
            loadCards();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// MODAL
// ============================================================
function LoadCardModal({
  card,
  onClose,
  onSaved,
}: {
  card: LoadCard | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<any>({
    card_number: card?.card_number || '',
    card_holder_name: card?.card_holder_name || '',
    card_exp: card?.card_exp || '',
    card_cvv: card?.card_cvv || '',
    card_brand: card?.card_brand || '',
    card_bank: card?.card_bank || '',
    address_line1: card?.address_line1 || '',
    city: card?.city || '',
    state: card?.state || '',
    zip: card?.zip || '',
    country: card?.country || 'US',
    phone: card?.phone || '',
    email: card?.email || '',
    agent_first_name: card?.agent_first_name || '',
    agent_last_name: card?.agent_last_name || '',
    agent_phone: card?.agent_phone || '',
    agent_email: card?.agent_email || '',
    agent_notes: card?.agent_notes || '',
    mobile_username: card?.mobile_username || '',
    mobile_password: '',
    mobile_bank: card?.mobile_bank || '',
    notes: card?.notes || '',
  });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    setErr('');
    if (!form.card_number || !form.card_holder_name) {
      setErr('Kart no ve kart sahibi gerekli');
      return;
    }
    setLoading(true);
    try {
      if (card) {
        await loadCardApi.update(card.id, form);
      } else {
        await loadCardApi.create(form);
      }
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  const update = (key: string, value: any) =>
    setForm({ ...form, [key]: value });

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border-2 border-accent rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-border sticky top-0 bg-bg-card z-10">
          <h2 className="text-accent font-bold">
            {card ? '✏️ Kartı Düzenle' : '💳 Yeni Dolum Kartı'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-4 space-y-3">
          {/* KART BİLGİLERİ */}
          <div className="text-xs text-info font-bold pb-1 border-b border-border">
            💳 Kart Bilgileri
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Kart Numarası *</label>
              <input
                type="text"
                value={form.card_number}
                onChange={(e) => update('card_number', e.target.value.replace(/\D/g, ''))}
                maxLength={19}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Kart Sahibi *</label>
              <input
                type="text"
                value={form.card_holder_name}
                onChange={(e) => update('card_holder_name', e.target.value)}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Son Kullanma</label>
              <input
                type="text"
                placeholder="MM/YY"
                value={form.card_exp}
                onChange={(e) => update('card_exp', e.target.value)}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">CVV</label>
              <input
                type="text"
                value={form.card_cvv}
                onChange={(e) => update('card_cvv', e.target.value.replace(/\D/g, ''))}
                maxLength={4}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Marka</label>
              <input
                type="text"
                placeholder="VISA / MC"
                value={form.card_brand}
                onChange={(e) => update('card_brand', e.target.value)}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Banka</label>
              <input
                type="text"
                value={form.card_bank}
                onChange={(e) => update('card_bank', e.target.value)}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
              />
            </div>
          </div>

          {/* ADRES */}
          <div className="text-xs text-info font-bold pt-2 border-t border-border pb-1">
            📍 Kart Sahibi Adres
          </div>
          <input
            type="text"
            placeholder="Adres"
            value={form.address_line1}
            onChange={(e) => update('address_line1', e.target.value)}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Şehir"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="text"
              placeholder="Eyalet"
              value={form.state}
              onChange={(e) => update('state', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="text"
              placeholder="Zip"
              value={form.zip}
              onChange={(e) => update('zip', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Telefon"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>

          {/* AGENT */}
          <div className="text-xs text-[#9C27B0] font-bold pt-2 border-t border-border pb-1">
            🤝 Aracı Bilgileri (Agent)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Adı"
              value={form.agent_first_name}
              onChange={(e) => update('agent_first_name', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="text"
              placeholder="Soyadı"
              value={form.agent_last_name}
              onChange={(e) => update('agent_last_name', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="text"
              placeholder="Telefon"
              value={form.agent_phone}
              onChange={(e) => update('agent_phone', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="email"
              placeholder="Email"
              value={form.agent_email}
              onChange={(e) => update('agent_email', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>
          <textarea
            placeholder="Agent notları"
            value={form.agent_notes}
            onChange={(e) => update('agent_notes', e.target.value)}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none resize-y min-h-[50px]"
          />

          {/* MOBİL BANKACILIK */}
          <div className="text-xs text-warn font-bold pt-2 border-t border-border pb-1">
            📱 Mobil Bankacılık Giriş
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Kullanıcı adı"
              value={form.mobile_username}
              onChange={(e) => update('mobile_username', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
            <input
              type="password"
              placeholder={card ? 'Şifre (boş = değişmez)' : 'Şifre'}
              value={form.mobile_password}
              onChange={(e) => update('mobile_password', e.target.value)}
              className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
            />
          </div>
          <input
            type="text"
            placeholder="Mobil banka adı (örn: Chase)"
            value={form.mobile_bank}
            onChange={(e) => update('mobile_bank', e.target.value)}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none"
          />

          {/* NOTLAR */}
          <textarea
            placeholder="Genel notlar"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-accent outline-none resize-y min-h-[50px]"
          />

          {err && <div className="text-dead text-xs">{err}</div>}

          <div className="flex gap-2 pt-2 border-t border-border">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-accent hover:bg-green-600 disabled:bg-gray-600 text-white py-2 rounded-md text-sm font-bold"
            >
              {loading ? 'Kaydediliyor...' : card ? 'Güncelle' : 'Oluştur'}
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