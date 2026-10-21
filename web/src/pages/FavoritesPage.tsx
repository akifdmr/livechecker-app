import { useEffect, useState } from 'react';
import type { FavList } from '../api';
import { favoritesApi } from '../api';


export default function FavoritesPage() {
  const [lists, setLists] = useState<(FavList & { matchingCards?: number; binStats?: any[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadLists();
  }, []);

  async function loadLists() {
    setLoading(true);
    try {
      const raw = await favoritesApi.list();
      const enriched = await Promise.all(
        raw.map(async (l: FavList) => {
          try {
            const stats = await favoritesApi.matchingCards(l.id);
            const total = (stats.stats || []).reduce((s: number, x: any) => s + x.count, 0);
            return { ...l, matchingCards: total, binStats: stats.stats || [] };
          } catch {
            return { ...l, matchingCards: 0, binStats: [] };
          }
        })
      );
      setLists(enriched);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg p-5">
      <h2 className="text-accent font-bold text-lg mb-2">⭐ Favori BIN Listeleri</h2>
      <p className="text-xs text-gray-500 mb-4">
        Kaydedilmiş BIN listeleri. Kartlarda eşleşen BIN'ler işaretlenir.
      </p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowModal(true)}
          className="flex-1 bg-accent hover:bg-green-600 text-white py-2 rounded-md text-sm font-bold"
        >
          ➕ Yeni Liste
        </button>
        <button
          onClick={loadLists}
          className="bg-[#555] hover:bg-[#666] text-white px-4 py-2 rounded-md text-sm"
        >
          🔄
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-8 text-xs">Yükleniyor...</div>
      ) : lists.length === 0 ? (
        <div className="text-gray-500 text-center py-8 text-xs">Henüz favori liste yok</div>
      ) : (
        <div className="space-y-2">
          {lists.map((l) => (
            <div
              key={l.id}
              className="bg-bg-input border border-border rounded-lg p-3 flex items-center gap-3 hover:border-accent transition"
            >
              <div
                className="w-5 h-5 rounded-full flex-shrink-0"
                style={{ background: l.color || '#4CAF50' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-accent font-bold text-sm">{l.name}</div>
                <div className="text-[10px] text-gray-500 font-mono truncate">
                  {l.bins.join(', ')}
                </div>
                {l.binStats && l.binStats.length > 0 && (
                  <div className="text-[10px] text-gray-600 mt-1">
                    {l.binStats
                      .filter((s: any) => s.count > 0)
                      .map((s: any) => `${s.bin}: ${s.count}`)
                      .join(' · ') || 'eşleşme yok'}
                  </div>
                )}
              </div>
              <div
                className={`px-3 py-1 rounded text-xs font-bold ${
                  (l.matchingCards || 0) > 0
                    ? 'bg-accent text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {l.matchingCards || 0} kart
              </div>
              <button
                onClick={async () => {
                  if (!confirm(`"${l.name}" silinsin mi?`)) return;
                  await favoritesApi.delete(l.id);
                  loadLists();
                }}
                className="bg-dead hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
              >
                Sil
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && <FavAddModal onClose={() => setShowModal(false)} onCreated={loadLists} />}
    </div>
  );
}

function FavAddModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [bins, setBins] = useState('');
  const [color, setColor] = useState('#4CAF50');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setError('');
    if (!name.trim()) { setError('Liste adı gerekli'); return; }
    const binList = bins.split('\n').map((b) => b.trim().replace(/\D/g, '')).filter((b) => b.length >= 6);
    if (binList.length === 0) { setError('En az 1 geçerli BIN gerekli'); return; }

    setSaving(true);
    try {
      await favoritesApi.create({ name, bins: binList, color });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-card border-2 border-accent rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-accent font-bold text-lg mb-4">⭐ Yeni Favori Liste</h3>

        <input
          type="text"
          placeholder="Liste adı (örn: Chase Debit)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm mb-3 focus:border-accent outline-none"
        />

        <textarea
          placeholder="434769&#10;486796&#10;552609"
          value={bins}
          onChange={(e) => setBins(e.target.value)}
          className="w-full min-h-[100px] bg-bg-input border border-border rounded-md p-3 font-mono text-xs mb-3 focus:border-accent outline-none resize-y"
        />

        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-full h-10 rounded-md mb-3 cursor-pointer"
        />

        {error && <div className="text-dead text-xs mb-3">{error}</div>}

        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 bg-accent hover:bg-green-600 disabled:bg-gray-600 text-white py-2 rounded-md text-sm font-bold"
          >
            {saving ? 'Kaydediliyor...' : 'Oluştur'}
          </button>
          <button onClick={onClose} className="bg-[#555] hover:bg-[#666] text-white px-4 py-2 rounded-md text-sm">
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}