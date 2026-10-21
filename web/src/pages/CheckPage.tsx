import { useEffect, useRef, useState } from 'react';
import type { BalanceResult, FavList } from '../api';
import { checkApi, favoritesApi, normalizeBalance } from '../api';
import FavoriteBadges from '../components/FavoriteBadges';
import StatCard from '../components/StatCard';
import { matchFavoritesByPan } from '../utils/favorites';

// ⭐ API'den gelen tek kaynak tip
type ChargeResult = BalanceResult;

interface BinMetadata {
  bin?: string;
  brand?: string;
  type?: string;
  category?: string;
  issuer?: string;
  country?: string;
}

interface ResultItem {
  index: number;
  total: number;
  pan?: string;
  panMasked?: string;
  exp?: string;
  cvv?: string;
  status: string;
  reason: string;
  provider?: string;
  avsMessage?: string;
  avsStatus?: string;
  cvvMessage?: string;
  cvvStatus?: string;
  bin?: BinMetadata;
  favMatches?: FavList[];
}

interface LogLine {
  text: string;
  cls: 'live' | 'dead' | 'error' | 'info';
  favMatches?: FavList[];
}

type BulkOperation = 'live_check' | 'preauth';

export default function CheckPage() {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    live: 0,
    dead: 0,
    error: 0,
    processed: 0,
  });
  const [progress, setProgress] = useState(0);
  const [favorites, setFavorites] = useState<FavList[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // ⭐ Provider + Operation + Amount
const [provider, setProvider] = useState<string>('clover3');   // moneris değil
  const [operation, setOperation] = useState<BulkOperation>('live_check');
  const [amount, setAmount] = useState('1');

  // ⭐ Son işlemin özet sonucu
  const [lastResult, setLastResult] = useState<ChargeResult | null>(null);

  useEffect(() => {
    loadFavorites();
  }, []);

  async function loadFavorites() {
    try {
      const raw = await favoritesApi.list();
      setFavorites(raw);
    } catch (e) {
      console.error(e);
    }
  }

  // ============================================================
  // DOWNLOAD
  // ============================================================
  function downloadTxt(mode: 'all' | 'live' | 'dead' | 'log') {
    let content = '';
    let filename = '';

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

    if (mode === 'log') {
      content = log.map((l) => l.text).join('\n');
      filename = `livecheck_log_${dateStr}.txt`;
    } else if (mode === 'live') {
      const lives = results.filter((r) => r.status === 'LIVE');
      if (lives.length === 0) {
        alert('LIVE kart yok');
        return;
      }
      content = lives
        .map((r) => {
          const parts = [r.pan || r.panMasked || '', r.exp || '', r.cvv || ''];
          return parts.filter(Boolean).join('|');
        })
        .join('\n');
      filename = `livecheck_LIVE_${dateStr}_${lives.length}kart.txt`;
    } else if (mode === 'dead') {
      const deads = results.filter((r) => r.status === 'DEAD');
      if (deads.length === 0) {
        alert('DEAD kart yok');
        return;
      }
      content = deads
        .map((r) => {
          const parts = [r.pan || r.panMasked || '', r.exp || '', r.cvv || ''];
          return parts.filter(Boolean).join('|');
        })
        .join('\n');
      filename = `livecheck_DEAD_${dateStr}_${deads.length}kart.txt`;
    } else {
      if (results.length === 0) {
        alert('İndirilecek sonuç yok');
        return;
      }
      const header =
        '# Live Check Sonuçları\n# Tarih: ' +
        now.toLocaleString('tr-TR') +
        '\n';
      const summary = `# Toplam: ${stats.total} | LIVE: ${stats.live} | DEAD: ${stats.dead} | ERROR: ${stats.error}\n\n`;

      const rows = results.map((r) => {
        let line = `[${r.index}/${r.total}] ${r.panMasked || r.pan || '?'} | ${r.status} | ${r.reason} | ${r.provider || '-'}`;
        if (r.bin) {
          const binInfo = [r.bin.bin, r.bin.brand, r.bin.type, r.bin.issuer, r.bin.country]
            .filter(Boolean)
            .join(' / ');
          if (binInfo) line += ` | BIN: ${binInfo}`;
        }
        if (r.avsMessage) line += ` | AVS: ${r.avsMessage}`;
        if (r.cvvMessage) line += ` | CVV: ${r.cvvMessage}`;
        return line;
      });

      content = header + summary + rows.join('\n');
      filename = `livecheck_all_${dateStr}.txt`;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // CHECK
  // ============================================================
  async function start() {
    const cards = input
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    if (cards.length === 0) {
      alert('Liste boş');
      return;
    }

    if (operation === 'preauth') {
      const amt = parseFloat(amount);
      if (!amt || amt < 1) {
        alert('Preauth için min $1');
        return;
      }
      if (
        !confirm(
          `⚠️ ${cards.length} kart için $${amt} PREAUTH çalıştırılacak.\n\n` +
            `Bu her kartta $${amt} bloke oluşturur.\n` +
            `Devam edilsin mi?`
        )
      )
        return;
    }

    setLog([
      {
        text: `▶ ${cards.length} kart işlenecek (op=${operation}, provider=${provider || 'auto'})...`,
        cls: 'info',
      },
    ]);
    setResults([]);
    setStats({ total: cards.length, live: 0, dead: 0, error: 0, processed: 0 });
    setProgress(0);
    setRunning(true);
    setLastResult(null);

    abortRef.current = new AbortController();
    const localStats = {
      total: cards.length,
      live: 0,
      dead: 0,
      error: 0,
      processed: 0,
    };

    try {
      await checkApi.stream(
        cards,
        (data) => {
          if (data.type === 'start') {
            setLog((l) => [
              ...l,
              { text: `📊 Toplam: ${data.total} kart`, cls: 'info' },
            ]);
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
            } else if (status === 'ERROR') {
              cls = 'error';
              icon = '!';
              localStats.error++;
            }

            const pan = data.pan || data.panMasked || '';
            const favMatches = pan ? matchFavoritesByPan(pan, favorites) : [];
            const savedIcon = data.liveCardSaved ? ' 💾' : '';
            const bin = data.bin || {};
            const binInfo = [bin.bin, bin.brand, bin.type, bin.issuer, bin.country]
              .filter(Boolean)
              .join(' / ');

            let avsCvvInfo = '';
            if (data.avsMessage) {
              const avsIcon =
                data.avsStatus === 'accept'
                  ? '✅'
                  : data.avsStatus === 'reject'
                  ? '❌'
                  : '⚠️';
              avsCvvInfo += ` ${avsIcon} AVS:${data.avsMessage}`;
            }
            if (data.cvvMessage && data.cvvStatus !== 'unknown') {
              const cvvIcon =
                data.cvvStatus === 'accept'
                  ? '✅'
                  : data.cvvStatus === 'reject'
                  ? '❌'
                  : '⚠️';
              avsCvvInfo += ` | ${cvvIcon} CVV:${data.cvvMessage}`;
            }

            const text = `${icon} [${data.index}/${data.total}] ${data.panMasked || '?'} → ${status} (${data.reason || '-'}) via ${data.provider || '-'}${savedIcon}${binInfo ? ` | BIN: ${binInfo}` : ''}${avsCvvInfo}`;

            setResults((prev) => [
              ...prev,
              {
                index: data.index,
                total: data.total,
                pan: data.pan,
                panMasked: data.panMasked,
                exp: data.exp,
                cvv: data.cvv,
                status,
                reason: data.reason || '-',
                provider: data.provider,
                avsMessage: data.avsMessage,
                avsStatus: data.avsStatus,
                cvvMessage: data.cvvMessage,
                cvvStatus: data.cvvStatus,
                bin: data.bin,
                favMatches,
              },
            ]);

            setLog((l) => [...l, { text, cls, favMatches }]);
            setStats({ ...localStats });
            setProgress((data.index / data.total) * 100);

            // ⭐ Son sonuç — normalizeBalance ile tek satırda
            setLastResult(
              normalizeBalance({
                ...data,
                success: status === 'LIVE',
                status,
                operation,
                amount: operation === 'preauth' ? parseFloat(amount) : 0,
                currency: 'USD',
              })
            );
          } else if (data.type === 'end') {
            const s = data.summary || {};
            const savedCount = s.savedToLiveCards || 0;

            setLog((l) => [
              ...l,
              {
                text: `\n✅ Bitti! LIVE: ${s.live || 0} | DEAD: ${s.dead || 0}${savedCount > 0 ? ` | DB: ${savedCount}` : ''}`,
                cls: 'info',
              },
            ]);

            if (savedCount > 0) {
              window.dispatchEvent(
                new CustomEvent('cards-updated', {
                  detail: { saved: savedCount, source: 'check' },
                })
              );
            }
          }
        },
        abortRef.current.signal,
        {
          provider: provider || undefined,
          operation,
          amount: operation === 'preauth' ? parseFloat(amount) : 0,
        }
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

  function clearAll() {
    setInput('');
    setLog([]);
    setResults([]);
    setStats({ total: 0, live: 0, dead: 0, error: 0, processed: 0 });
    setProgress(0);
    setLastResult(null);
  }

  return (
    <div className="p-5 border rounded-lg bg-bg-card border-border">
      <h2 className="mb-2 text-lg font-bold text-accent">🔍 Toplu Live Check</h2>
      <p className="mb-4 text-xs text-gray-500">
        Her satıra bir kart:{' '}
        <span className="bg-bg-input px-1.5 py-0.5 rounded text-warn">
          PAN|exp|cvv
        </span>
        {favorites.length > 0 && (
          <span className="ml-2 text-info">
            ⭐ {favorites.length} favori liste aktif
          </span>
        )}
      </p>

      {/* PROVIDER + OPERATION + AMOUNT */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <label className="text-xs text-gray-500">
          Operation
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value as BulkOperation)}
            disabled={running}
            className="w-full mt-1 bg-bg-input border border-border rounded px-2 py-1.5 text-xs"
          >
            <option value="live_check">🔍 Live Check ($0)</option>
            <option value="preauth">🔒 Preauth (Blokaj)</option>
          </select>
        </label>

        <label className="text-xs text-gray-500">
          Provider
<select
  value={provider}
  onChange={(e) => setProvider(e.target.value)}
  disabled={running}
  className="w-full mt-1 bg-bg-input border border-border rounded px-2 py-1.5 text-xs"
>
  <option value="clover3">Clover</option>
  <option value="authorize3">Authorize.net</option>
  <option value="">— Otomatik —</option>
</select>
        </label>

        <label className="text-xs text-gray-500">
          Amount ($)
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={running || operation === 'live_check'}
            className="w-full mt-1 bg-bg-input border border-border rounded px-2 py-1.5 text-xs disabled:opacity-50"
          />
        </label>
      </div>

      {operation === 'preauth' && (
        <div className="rounded border border-warn/40 bg-warn/10 p-2 text-[11px] text-warn mb-3">
          ⚠️ Preauth modunda her kart için $X bloke oluşur. Otomatik void
          yapılmaz — kartlar sayfasından manuel void/refund yapabilirsin.
        </div>
      )}

      {provider === 'moneris' && (
        <div className="rounded border border-warn/40 bg-warn/10 p-2 text-[11px] text-warn mb-3">
          ⚠️ Moneris Go terminali her kart için kart sahibinden kartı
          okutmasını ister. Toplu işlem pratikte kart sahibinin işbirliği
          gerektirir.
        </div>
      )}

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="4179030703512388|05/29|633&#10;4867960070261119|08/28|985"
        className="w-full min-h-[120px] bg-bg-input border border-border rounded-md p-3 font-mono text-xs mb-3 focus:border-accent outline-none resize-y"
      />

      {/* BAŞLAT / DURDUR / TEMİZLE */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={start}
          disabled={running}
          className="flex-1 py-2 text-sm font-bold text-white rounded-md bg-accent hover:bg-green-600 disabled:bg-gray-600"
        >
          ▶ BAŞLAT
        </button>
        <button
          onClick={stop}
          disabled={!running}
          className="px-4 py-2 text-sm font-bold text-white rounded-md bg-dead hover:bg-red-700 disabled:bg-gray-600"
        >
          ⏹ DURDUR
        </button>
        <button
          onClick={clearAll}
          className="bg-[#555] hover:bg-[#666] text-white px-3 py-2 rounded-md text-sm"
          title="Temizle"
        >
          🗑️
        </button>
      </div>

      {/* DOWNLOAD */}
      {(results.length > 0 || log.length > 0) && (
        <div className="flex flex-wrap gap-2 p-3 mb-4 border rounded-md bg-bg-input border-border">
          <span className="text-[11px] text-gray-500 self-center mr-2">
            📥 İNDİR:
          </span>

          <button
            onClick={() => downloadTxt('live')}
            disabled={stats.live === 0}
            className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold"
          >
            ✔ LIVE ({stats.live})
          </button>

          <button
            onClick={() => downloadTxt('dead')}
            disabled={stats.dead === 0}
            className="text-xs px-3 py-1.5 rounded bg-dead hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold"
          >
            ✖ DEAD ({stats.dead})
          </button>

          <button
            onClick={() => downloadTxt('all')}
            className="text-xs px-3 py-1.5 rounded bg-[#2196F3] hover:bg-[#1976d2] text-white font-bold"
          >
            📋 Tümü ({results.length})
          </button>

          <button
            onClick={() => downloadTxt('log')}
            className="text-xs px-3 py-1.5 rounded bg-[#555] hover:bg-[#666] text-white font-bold"
          >
            📄 Log
          </button>
        </div>
      )}

      {(running || log.length > 0) && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3 sm:grid-cols-5">
            <StatCard label="Toplam" value={stats.total} />
            <StatCard label="LIVE" value={stats.live} variant="live" />
            <StatCard label="DEAD" value={stats.dead} variant="dead" />
            <StatCard label="ERROR" value={stats.error} variant="warn" />
            <StatCard label="İşlenen" value={stats.processed} />
          </div>

          <div className="h-1.5 bg-[#333] rounded overflow-hidden mb-2">
            <div
              className="h-full transition-all bg-gradient-to-r from-accent to-green-400"
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
              className={`flex items-center gap-2 flex-wrap ${
                line.cls === 'live'
                  ? 'text-live'
                  : line.cls === 'dead'
                  ? 'text-dead'
                  : line.cls === 'error'
                  ? 'text-warn'
                  : 'text-info'
              }`}
            >
              {line.favMatches && line.favMatches.length > 0 && (
                <FavoriteBadges matches={line.favMatches} size="sm" />
              )}
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* SON SONUÇ KARTI */}
      {lastResult && (
        <div
          className={`mt-3 p-3 rounded border text-xs ${
            lastResult.success
              ? 'bg-accent/10 border-accent text-accent'
              : 'bg-dead/10 border-dead text-dead'
          }`}
        >
          <div className="mb-1 font-bold">
            {lastResult.success
              ? '✅ Son işlem: APPROVED'
              : `❌ Son işlem: ${lastResult.status || 'DECLINED'}`}
            {lastResult.provider && (
              <span className="font-normal text-gray-500">
                {' '}
                via {lastResult.provider}
              </span>
            )}
            {lastResult.providerCode && (
              <span className="ml-2 font-mono text-[10px] text-gray-500">
                [{lastResult.providerCode}]
              </span>
            )}
          </div>
          <div>
            <b>Reason:</b> {lastResult.reason}
          </div>
          {lastResult.reasonLong && (
            <div className="mt-1 italic opacity-90">{lastResult.reasonLong}</div>
          )}
        </div>
      )}
    </div>
  );
}
