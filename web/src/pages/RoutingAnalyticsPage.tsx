// ============================================================
// ROUTING ANALYTICS — BIN × Provider performans matrisi
// ============================================================
import { useEffect, useState } from 'react';
import { api, processorRoutingApi } from '../api';

interface MatrixRow {
  bin: string;
  provider: string;
  total: number;
  approved: number;
  declined: number;
  errors: number;
  approval_rate: number;
}

interface Recommendation {
  bin: string;
  recommended_provider: string;
  recommended_rate: number;
  recommended_total: number;
  recommended_approved: number;
  worst_provider: string | null;
  worst_rate: number | null;
  worst_total: number | null;
  gain_pct: number;
  has_alternative: boolean;
}

export default function RoutingAnalyticsPage() {
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minTotal, setMinTotal] = useState('5');
  const [applying, setApplying] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/analytics/bin-provider-matrix', {
        params: { minTotal, scope: 'all' },
      });
      setMatrix(data.matrix || []);
      setRecommendations(data.recommendations || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minTotal]);

  // ⭐ Tek tıkla kural ekle
  async function applyRule(rec: Recommendation) {
    if (!rec.has_alternative) {
      alert('Bu BIN için alternatif provider yok, kural gereksiz.');
      return;
    }

    const confirm = window.confirm(
      `Kural ekle:\n\n` +
      `BIN: ${rec.bin}\n` +
      `${rec.worst_provider} (%${rec.worst_rate}) → ${rec.recommended_provider} (%${rec.recommended_rate})\n\n` +
      `Tahmini kazanç: +%${rec.gain_pct} approval`
    );
    if (!confirm) return;

    setApplying(rec.bin);
    try {
      await processorRoutingApi.create({
        name: `Auto: ${rec.bin} → ${rec.recommended_provider}`,
        bin_prefix: rec.bin,
        provider: rec.recommended_provider,
        priority: 5,
        notes: `Otomatik analiz. ${rec.recommended_provider} %${rec.recommended_rate} (${rec.recommended_approved}/${rec.recommended_total})`,
      });
      alert('✅ Kural eklendi');
    } catch (e: any) {
      alert(`Hata: ${e?.response?.data?.error || e.message}`);
    } finally {
      setApplying(null);
    }
  }

  // ⭐ Tümünü ekle
  async function applyAllRules() {
    const candidates = recommendations.filter(
      (r) => r.has_alternative && r.gain_pct >= 20 && r.recommended_total >= 5
    );

    if (candidates.length === 0) {
      alert('Kriterlere uyan öneri yok (kazanç ≥ %20, min 5 işlem).');
      return;
    }

    if (
      !confirm(
        `${candidates.length} kural eklenecek.\n\n` +
          `Kriter: kazanç ≥ %20 ve min 5 işlem\n\n` +
          `Onaylıyor musun?`
      )
    ) {
      return;
    }

    setApplying('ALL');

    let ok = 0;
    let fail = 0;

    for (const rec of candidates) {
      try {
        await processorRoutingApi.create({
          name: `Auto: ${rec.bin} → ${rec.recommended_provider}`,
          bin_prefix: rec.bin,
          provider: rec.recommended_provider,
          priority: 5,
          notes: `Toplu ekleme. ${rec.recommended_provider} %${rec.recommended_rate} (${rec.recommended_approved}/${rec.recommended_total})`,
        });
        ok++;
      } catch (_) {
        fail++;
      }
    }

    setApplying(null);
    alert(`✅ ${ok} kural eklendi\n❌ ${fail} hata`);
    load();
  }

  // Group matrix by BIN
  const byBin: Record<string, MatrixRow[]> = {};
  matrix.forEach((r) => {
    if (!byBin[r.bin]) byBin[r.bin] = [];
    byBin[r.bin].push(r);
  });

  const totalGain = recommendations
    .filter((r) => r.has_alternative)
    .reduce((s, r) => s + r.gain_pct, 0);

  return (
    <div className="p-6 mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-accent">
            📊 BIN × Provider Performans
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Hangi BIN hangi provider'da daha iyi geçiyor — routing kuralları
            için otomatik öneri
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Min. işlem:</label>
          <input
            type="number"
            value={minTotal}
            onChange={(e) => setMinTotal(e.target.value)}
            className="w-16 px-2 py-1 text-xs border rounded bg-bg-input border-border"
          />
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-bold text-white rounded bg-accent hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? '...' : '🔄'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 text-xs border rounded bg-dead/10 border-dead text-dead">
          ❌ {error}
        </div>
      )}

      {/* ÖNERİLER */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-bold text-info">
            💡 Öneriler ({recommendations.filter((r) => r.has_alternative).length})
          </h2>

          <div className="flex items-center gap-3">
            {totalGain > 0 && (
              <span className="text-xs text-live">
                Tahmini toplam kazanç: +%{totalGain.toFixed(1)} approval
              </span>
            )}
            <button
              onClick={applyAllRules}
              disabled={applying === 'ALL' || loading}
              className="px-3 py-1.5 text-xs font-bold text-white rounded bg-accent hover:bg-green-600 disabled:opacity-50"
              title="Kazancı %20 ve üzeri + min 5 işlem olan tüm önerileri tek tıkla ekle"
            >
              {applying === 'ALL' ? 'Ekleniyor...' : '⚡ Tümünü Ekle'}
            </button>
          </div>
        </div>

        {recommendations.length === 0 ? (
          <div className="p-4 text-xs text-gray-500 border rounded bg-bg-card border-border">
            Yeterli veri yok. En az {minTotal} işlem yapılmış BIN'ler
            listelenir.
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg bg-bg-card border-border">
            <table className="w-full text-xs">
              <thead className="bg-[#1f1f1f]">
                <tr>
                  <th className="p-2 text-left">BIN</th>
                  <th className="p-2 text-left">Önerilen</th>
                  <th className="p-2 text-right">Approval</th>
                  <th className="p-2 text-right">Örnek</th>
                  <th className="p-2 text-left">Kaçınılacak</th>
                  <th className="p-2 text-right">Onun Oranı</th>
                  <th className="p-2 text-right">Kazanç</th>
                  <th className="p-2 text-right">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((r) => (
                  <tr
                    key={r.bin}
                    className={`border-t border-border ${
                      r.has_alternative ? 'hover:bg-[#1a1a1a]' : 'opacity-60'
                    }`}
                  >
                    <td className="p-2 font-mono font-bold text-info">
                      {r.bin}
                    </td>
                    <td className="p-2">
                      <code className="px-2 py-0.5 rounded bg-live/20 text-live">
                        {r.recommended_provider}
                      </code>
                    </td>
                    <td className="p-2 font-bold text-right text-live">
                      %{r.recommended_rate}
                    </td>
                    <td className="p-2 text-right text-gray-500">
                      {r.recommended_approved}/{r.recommended_total}
                    </td>
                    <td className="p-2">
                      {r.worst_provider ? (
                        <code className="px-2 py-0.5 rounded bg-dead/20 text-dead">
                          {r.worst_provider}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2 text-right text-dead">
                      {r.worst_rate != null ? `%${r.worst_rate}` : '—'}
                    </td>
                    <td className="p-2 font-bold text-right">
                      {r.gain_pct > 0 ? (
                        <span className="text-warn">+%{r.gain_pct}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {r.has_alternative ? (
                        <button
                          onClick={() => applyRule(r)}
                          disabled={applying === r.bin || applying === 'ALL'}
                          className="px-3 py-1 text-xs font-bold text-white rounded bg-accent hover:bg-green-600 disabled:opacity-50"
                          title={`${r.bin} → ${r.recommended_provider} kuralı ekle`}
                        >
                          {applying === r.bin ? '...' : '➕ Kural Ekle'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-500">
                          Alternatif yok
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HAM MATRİS */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-info">
          📋 Ham Matris ({Object.keys(byBin).length} BIN)
        </h2>
        <div className="space-y-2">
          {Object.entries(byBin).map(([bin, rows]) => (
            <div
              key={bin}
              className="p-3 border rounded bg-bg-card border-border"
            >
              <div className="mb-2 font-mono text-xs font-bold text-info">
                BIN {bin}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {rows.map((r) => {
                  const rate = r.approval_rate ?? 0;
                  const color =
                    rate >= 80
                      ? 'border-live text-live'
                      : rate >= 50
                      ? 'border-warn text-warn'
                      : 'border-dead text-dead';
                  return (
                    <div
                      key={r.provider}
                      className={`p-2 border-l-2 rounded bg-[#111] ${color}`}
                    >
                      <div className="text-[10px] text-gray-400">
                        {r.provider}
                      </div>
                      <div className="text-lg font-bold">%{rate}</div>
                      <div className="text-[10px] text-gray-500">
                        {r.approved}✓ / {r.declined}✗ / {r.errors}⚠
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}