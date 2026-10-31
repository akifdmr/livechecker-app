import { useEffect, useState } from 'react';
import { cardImageApi, type GeneratedCardImage } from '../api/cardImage';

type Props = {
  cardId: number;
  defaultHolderName?: string;
  onClose: () => void;
};

export default function CardImageModal({ cardId, defaultHolderName, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<GeneratedCardImage | null>(null);
  const [side, setSide] = useState<'front' | 'back'>('front');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr('');
    cardImageApi.generateFromCard(cardId, defaultHolderName)
      .then((d) => { if (!cancelled) setResult(d); })
      .catch((e) => { if (!cancelled) setErr(e?.response?.data?.error || e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cardId, defaultHolderName]);

  function download(side: 'front' | 'back') {
    if (!result) return;
    const url = result.images[side];
    const a = document.createElement('a');
    a.href = url;
    a.download = `card-${result.bin}-${side}.png`;
    a.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-bg-card border border-border rounded-lg w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-bold">🖼️ Kart Görseli</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-4">
          {loading && <div className="py-8 text-center text-gray-500">Görsel üretiliyor... (30–60 sn)</div>}
          {err && <div className="p-3 text-xs border rounded bg-dead/10 border-dead text-dead">❌ {err}</div>}

          {result && (
            <>
              <div className="mb-3 text-xs">
                <span className="text-gray-500">BIN:</span> {result.bin} &nbsp;|&nbsp;
                <span className="text-gray-500">Brand:</span> {result.meta.brand} &nbsp;|&nbsp;
                <span className="text-gray-500">Level:</span> {result.meta.level} &nbsp;|&nbsp;
                <span className="text-gray-500">Issuer:</span> {result.meta.issuer || '—'}
              </div>

              <div className="flex gap-1 mb-3 border-b border-border">
                {(['front', 'back'] as const).map((s) => (
                  <button key={s} onClick={() => setSide(s)}
                    className={`px-4 py-2 text-xs font-bold border-b-2 ${
                      side === s ? 'border-accent text-accent' : 'border-transparent text-gray-400'
                    }`}>
                    {s === 'front' ? 'Ön Yüz' : 'Arka Yüz'}
                  </button>
                ))}
              </div>

              <img
                src={result.images[side]}
                alt={`card ${side}`}
                className="w-full mb-3 border rounded border-border"
              />

              <div className="flex gap-2">
                <button onClick={() => download(side)}
                  className="px-4 py-2 text-xs font-bold text-white rounded bg-accent">
                  ⬇ Bu Yüzü İndir
                </button>
                <button onClick={() => { download('front'); download('back'); }}
                  className="px-4 py-2 text-xs font-bold text-white rounded bg-info">
                  ⬇ İkisini İndir
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}