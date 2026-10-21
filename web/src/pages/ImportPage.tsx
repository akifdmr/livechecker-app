// ============================================================
// IMPORT PAGE — Smart Import (CVV'li API + CVV'siz Resin)
// ============================================================
import { useRef, useState } from 'react';
import { importApi } from '../api';
import StatCard from '../components/StatCard';

interface LogLine {
  text: string;
  cls: 'live' | 'dead' | 'error' | 'info';
}

export default function ImportPage() {
  const [input, setInput] = useState('');
  const [routeCvvless, setRouteCvvless] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    live: 0,
    dead: 0,
    error: 0,
    saved: 0,
    processed: 0,
  });
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  async function start() {
    const cards = input
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    if (cards.length === 0) {
      alert('Liste boş');
      return;
    }

    const modeMsg = routeCvvless
      ? "CVV'sizler Resin'e yönlendirilecek"
      : "Tüm kartlar API'ye gidecek";

    setLog([{ text: `▶ ${cards.length} kart işlenecek (${modeMsg})...`, cls: 'info' }]);
    setStats({ total: cards.length, live: 0, dead: 0, error: 0, saved: 0, processed: 0 });
    setProgress(0);
    setRunning(true);

    abortRef.current = new AbortController();
    const localStats = {
      total: cards.length,
      live: 0,
      dead: 0,
      error: 0,
      saved: 0,
      processed: 0,
    };

    try {
      await importApi.smart(
        cards,
        routeCvvless,
        (data) => {
          if (data.type === 'start') {
            let msg = `📊 Toplam: ${data.total} kart`;
            if (data.cvvCards !== undefined) {
              msg += ` (CVV'li: ${data.cvvCards} ⚡ | CVV'siz: ${data.cvvlessCards} 🌐)`;
            }
            setLog((l) => [...l, { text: msg, cls: 'info' }]);
          } else if (data.type === 'log') {
            setLog((l) => [...l, { text: `  ${data.message || ''}`, cls: 'info' }]);
          } else if (data.type === 'result') {
            localStats.processed++;
            const status = (data.status || '?').toUpperCase();
            let cls: LogLine['cls'] = 'info';
            let icon = '•';

            if (status === 'LIVE') {
              cls = 'live';
              icon = '✔';
              localStats.live++;
            } else if (status === 'DEAD') {
              cls = 'dead';
              icon = '✖';
              localStats.dead++;
            } else {
              cls = 'error';
              icon = '!';
              localStats.error++;
            }

            const source = data.source === 'resin' ? '🌐 ' : data.source === 'provider' ? '⚡ ' : '';
            const saved = data.liveCardSaved ? ' 💾' : '';
            if (data.liveCardSaved) localStats.saved++;

            const text = `${icon} ${source}[${data.index}/${data.total}] ${
              data.panMasked || '?'
            } → ${status} (${data.reason || '-'})${saved}`;

            setLog((l) => [...l, { text, cls }]);
            setStats({ ...localStats });
            setProgress((data.index / data.total) * 100);
          } else if (data.type === 'end') {
            const s = data.summary || {};
            let msg = `\n✅ Bitti! LIVE: ${s.live || 0} | DEAD: ${s.dead || 0}`;
            if (s.savedToLiveCards !== undefined) msg += ` | DB: ${s.savedToLiveCards}`;
            if (s.viaProvider !== undefined || s.viaResin !== undefined) {
              msg += `\n   ⚡ Provider: ${s.viaProvider || 0} | 🌐 Resin: ${s.viaResin || 0}`;
            }
            setLog((l) => [...l, { text: msg, cls: 'info' }]);
            window.dispatchEvent(
              new CustomEvent('cards-updated', {
                detail: { source: 'import', saved: s.savedToLiveCards },
              })
            );
          }
        },
        abortRef.current.signal
      );
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setLog((l) => [...l, { text: `❌ Hata: ${e.message}`, cls: 'error' }]);
      }
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg p-5">
      <h2 className="text-accent font-bold text-lg mb-2">📥 Import & Check</h2>
      <p className="text-xs text-gray-500 mb-4">
        Her satıra bir kart:{' '}
        <span className="bg-bg-input px-1.5 py-0.5 rounded text-warn">
          PAN|MM|YYYY|CVV
        </span>
        <br />
        LIVE çıkan kartlar <strong>Aiven DB</strong>'ye kaydedilir.
      </p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="4179030703512388|05|2029|633|Elizabeth|Green|..."
        className="w-full min-h-[120px] bg-bg-input border border-border rounded-md p-3 font-mono text-xs mb-3 focus:border-accent outline-none resize-y"
      />

      <label className="flex items-center gap-2 p-2 bg-bg-input border border-border rounded-md mb-3 cursor-pointer text-xs">
        <input
          type="checkbox"
          checked={routeCvvless}
          onChange={(e) => setRouteCvvless(e.target.checked)}
          className="accent-accent"
        />
        <span>
          🌐 CVV'siz kartları otomatik <strong>Resin (Selenium)</strong>'e yönlendir
        </span>
      </label>

      <div className="flex gap-2 mb-4">
        <button
          onClick={start}
          disabled={running}
          className="flex-1 bg-accent hover:bg-green-600 disabled:bg-gray-600 text-white py-2 rounded-md text-sm font-bold"
        >
          ▶ BAŞLAT (DB)
        </button>
        <button
          onClick={stop}
          disabled={!running}
          className="bg-dead hover:bg-red-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-bold"
        >
          ⏹ DURDUR
        </button>
        <button
          onClick={() => {
            setInput('');
            setLog([]);
            setStats({ total: 0, live: 0, dead: 0, error: 0, saved: 0, processed: 0 });
          }}
          className="bg-[#555] hover:bg-[#666] text-white px-3 py-2 rounded-md text-sm"
        >
          🗑️
        </button>
      </div>

      {(running || log.length > 0) && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
            <StatCard label="Toplam" value={stats.total} />
            <StatCard label="LIVE" value={stats.live} variant="live" />
            <StatCard label="DEAD" value={stats.dead} variant="dead" />
            <StatCard label="DB" value={stats.saved} />
            <StatCard label="İşlenen" value={stats.processed} />
          </div>

          <div className="h-1.5 bg-[#333] rounded overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-accent to-green-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] text-gray-500 text-right mb-3">
            {stats.processed} / {stats.total}
          </div>
        </>
      )}

      {log.length > 0 && (
        <div className="bg-bg-input border border-border rounded-md p-3 font-mono text-[10px] leading-relaxed max-h-[300px] overflow-y-auto">
          {log.map((line, i) => (
            <div
              key={i}
              className={
                line.cls === 'live'
                  ? 'text-live'
                  : line.cls === 'dead'
                  ? 'text-dead'
                  : line.cls === 'error'
                  ? 'text-warn'
                  : 'text-info'
              }
            >
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}