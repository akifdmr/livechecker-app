import { useEffect, useState } from 'react';
import { cardImageApi, type ArchivedImage } from '../api/cardImage';

export default function CardImageArchiveModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ArchivedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ img: ArchivedImage; side: 'front' | 'back' } | null>(null);

  async function load() {
    setLoading(true);
    try { const d = await cardImageApi.archive({ limit: 60 }); setItems(d.images); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: number) {
    if (!confirm('Silinsin mi?')) return;
    try { await cardImageApi.remove(id); await load(); } catch (e: any) { alert(e.message); }
  }

  function download(url: string, name: string) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-bg-card border border-border rounded-lg w-full max-w-5xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-bold">📦 Kart Görsel Arşivi</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-4">
          {loading && <div className="py-8 text-center text-gray-500">Yükleniyor...</div>}
          {!loading && items.length === 0 && (
            <div className="py-8 text-center text-gray-500">Henüz görsel üretilmemiş</div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {items.map((it) => (
              <div key={it.id} className="p-2 border rounded border-border bg-bg-input">
                <img src={it.images.front} alt="front"
                  className="w-full mb-2 border rounded cursor-pointer border-border"
                  onClick={() => setPreview({ img: it, side: 'front' })} />
                <div className="text-[11px] space-y-0.5">
                  <div className="font-mono">{it.cardholder_name}</div>
                  <div className="text-gray-500">{it.pan_masked} · {it.bin}</div>
                  <div className="text-gray-500">{it.meta?.brand} · {it.level}</div>
                  <div className="text-gray-600 text-[10px]">{new Date(it.created_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-1 mt-2">
                  <button onClick={() => download(it.images.front, `card-${it.bin}-front.png`)}
                    className="flex-1 px-2 py-1 text-[10px] rounded bg-accent text-white">⬇ Ön</button>
                  <button onClick={() => download(it.images.back, `card-${it.bin}-back.png`)}
                    className="flex-1 px-2 py-1 text-[10px] rounded bg-info text-white">⬇ Arka</button>
                  <button onClick={() => remove(it.id)}
                    className="px-2 py-1 text-[10px] rounded bg-dead/30 text-dead">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreview(null)}>
          <img src={preview.img.images[preview.side]} alt="preview"
            className="max-w-full max-h-full" />
        </div>
      )}
    </div>
  );
}