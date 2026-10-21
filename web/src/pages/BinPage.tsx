// ============================================================
// BIN PAGE — Full Kart veya Sadece BIN Check
// ============================================================
import { useEffect, useState } from 'react';
import type { FavList } from '../api';
import { binApi, favoritesApi } from '../api';
import FavoriteBadges from '../components/FavoriteBadges';
import { matchFavoritesByBin } from '../utils/favorites';
import { getApiBaseUrl, useAuthStore } from '../stores/authStore';

interface BinResult {
  bin: string;
  brand?: string;
  type?: string;
  category?: string;
  issuer?: string;
  country?: string;
  isoCode2?: string;
  isoCode3?: string;
  error?: string;
  loading?: boolean;
}

const STORAGE_KEY = 'bincheck_input';
const STORAGE_RESULTS_KEY = 'bincheck_results';
const STORAGE_MODE_KEY = 'bincheck_mode';

// YARDIMCI: Full kart satırından BIN çıkar
function extractBin(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (trimmed.includes('|')) {
    return trimmed.split('|')[0].replace(/\D/g, '').substring(0, 6);
  }
  if (trimmed.includes(' ')) {
    return trimmed.split(/\s+/)[0].replace(/\D/g, '').substring(0, 6);
  }
  return trimmed.replace(/\D/g, '').substring(0, 6);
}

// ============================================================
// ANA COMPONENT
// ============================================================
export default function BinPage() {
  const user = useAuthStore((state) => state.user);
  const isChecker = user?.role === 'checker';
  const storageSuffix = isChecker ? `_user_${user?.id}` : '';
  const inputStorageKey = `${STORAGE_KEY}${storageSuffix}`;
  const resultsStorageKey = `${STORAGE_RESULTS_KEY}${storageSuffix}`;
  const modeStorageKey = `${STORAGE_MODE_KEY}${storageSuffix}`;
  const [input, setInput] = useState<string>(() => {
    return (
      localStorage.getItem(inputStorageKey) ||
      (isChecker ? '434769\n486796\n552609\n417903' : '4266843558464149|08/31|240|Brent|Miles|1674 N 725 W|Clinton|UT|84015\n4510144003902385|06/27|648|Abby|Sicat|20723 Fraser Highway|Langley|BC|V3A 0K2\n5223036205040078|02/27|826|Leanne|Clement|877 E 62nd Ave|Vancouver|BC|V5X 2G8')
    );
  });

  const [results, setResults] = useState<BinResult[]>(() => {
    try {
      const saved = localStorage.getItem(resultsStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [mode, setMode] = useState<'full' | 'bin'>(() => {
    return isChecker ? 'bin' : (localStorage.getItem(modeStorageKey) as 'full' | 'bin') || 'full';
  });

  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<FavList[]>([]);
  const [addingBin, setAddingBin] = useState<string | null>(null);

  useEffect(() => {
    loadFavorites();
  }, []);

  useEffect(() => {
    localStorage.setItem(inputStorageKey, input);
  }, [input]);

  useEffect(() => {
    localStorage.setItem(modeStorageKey, mode);
  }, [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(resultsStorageKey, JSON.stringify(results));
    } catch (e) {
      console.warn('Results kaydedilemedi:', e);
    }
  }, [results]);

  async function loadFavorites() {
    try {
      const raw = await favoritesApi.list();
      setFavorites(raw);
    } catch (e) {
      console.error(e);
    }
  }

  // ============================================================
  // SORGU — Full kart veya sadece BIN
  // ============================================================
  async function handleCheck() {
    const lines = input
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    if (lines.length === 0) {
      alert('Liste boş');
      return;
    }

    if (isChecker && lines.some((line) => !/^\d{6}$/.test(line))) {
      alert('Check kullanıcısı yalnızca satır başına tam 6 haneli BIN sorgulayabilir.');
      return;
    }

    const payload = mode === 'full'
      ? lines
      : lines.map((line) => line.replace(/\D/g, '')).filter((bin) => bin.length >= 6);

    if (payload.length === 0) {
      alert('Geçerli kayıt bulunamadı');
      return;
    }

    // Önizleme: unique BIN'leri göster
    const uniqueBins = Array.from(new Set(payload.map(extractBin).filter((bin) => bin.length >= 6)));

    setLoading(true);
    setResults(uniqueBins.map((b) => ({ bin: b, loading: true })));

    try {
      const list = await binApi.check(payload);
      setResults(list);
    } catch (e: any) {
      alert('Hata: ' + e.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // TEMİZLE
  // ============================================================
  function clearAll() {
    if (!confirm('Tüm liste ve sonuçlar silinsin mi?')) return;
    setInput('');
    setResults([]);
    localStorage.removeItem(inputStorageKey);
    localStorage.removeItem(resultsStorageKey);
  }

  function clearResultsOnly() {
    setResults([]);
    localStorage.removeItem(resultsStorageKey);
  }

  // BIN → metin dönüşümü
  function getBinOnlyInput(): string {
    return input.split('\n').map(extractBin).filter((bin) => bin.length >= 6).join('\n');
  }

  // ============================================================
  // ============================================================
  // FAVORİ İŞLEMLERİ
  // ============================================================
  async function addBinToList(bin: string, listId: number) {
    try {
      const token = localStorage.getItem('token');
      const list = favorites.find((f) => f.id === listId);
      if (!list) return;

      if (list.bins.includes(bin)) {
        alert(`Bu BIN zaten "${list.name}" listesinde`);
        return;
      }

      const newBins = [...list.bins, bin];

      const res = await fetch(`${getApiBaseUrl()}/bin-favorites/${listId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bins: newBins }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await loadFavorites();
      setAddingBin(null);
    } catch (e: any) {
      alert('Hata: ' + e.message);
    }
  }

  async function createListWithBin(bin: string) {
    const name = prompt('Yeni liste adı:');
    if (!name) return;

    try {
      await favoritesApi.create({
        name,
        bins: [bin],
        color: '#4CAF50',
      });
      await loadFavorites();
      setAddingBin(null);
    } catch (e: any) {
      alert('Hata: ' + e.message);
    }
  }

  // ============================================================
  // İSTATİSTİK
  // ============================================================
  const foundCount = results.filter((r) => !r.error && r.brand).length;
  const errorCount = results.filter((r) => r.error).length;
  const favMatchedCount = results.filter(
    (r) => matchFavoritesByBin(r.bin, favorites).length > 0
  ).length;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="p-5 border rounded-lg bg-bg-card border-border">
      <h2 className="mb-2 text-lg font-bold text-accent">🔍 BIN Check</h2>
      <p className="mb-4 text-xs text-gray-500">
        {isChecker ? (
          <>Yalnızca tam 6 haneli BIN metadata sorgusu yapabilirsiniz. Kart bilgisi kabul edilmez.</>
        ) : (
          <><strong className="text-warn">Full kart</strong> (PAN|exp|cvv|isim|adres|...) veya{' '}
          <strong className="text-warn">sadece BIN</strong> (6 hane) girebilirsin.
          Sistem otomatik olarak ilk 6 haneyi alır ve unique BIN'leri sorgular.</>
        )}
        {favorites.length > 0 && (
          <span className="ml-2 text-info">⭐ {favorites.length} favori liste aktif</span>
        )}
      </p>

      {/* MOD SEÇİMİ */}
      {!isChecker && <div className="flex items-center gap-4 p-2 mb-3 text-xs border rounded-md bg-bg-input border-border">
        <span className="text-gray-500">Mod:</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="binmode" checked={mode === 'full'} onChange={() => setMode('full')} className="accent-accent" />
          <span className={mode === 'full' ? 'text-accent font-bold' : 'text-gray-400'}>📋 Full Kart</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="binmode" checked={mode === 'bin'} onChange={() => setMode('bin')} className="accent-accent" />
          <span className={mode === 'bin' ? 'text-accent font-bold' : 'text-gray-400'}>🔢 Sadece BIN</span>
        </label>
        <span className="ml-auto text-[10px] text-gray-600">
          {mode === 'full' ? `${input.split('\n').filter((line) => line.trim()).length} satır` : `${getBinOnlyInput().split('\n').filter(Boolean).length} BIN`}
        </span>
      </div>}

      {/* TEXTAREA */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={isChecker ? '434769\n486796\n552609\n417903' : (
          mode === 'full'
            ? '4266843558464149|08/31|240|Brent|Miles|1674 N 725 W|Clinton|UT|84015\n4510144003902385|06/27|648|Abby|Sicat|20723 Fraser Highway|Langley|BC'
            : '434769\n486796\n552609\n417903'
        )}
        className="w-full min-h-[140px] bg-bg-input border border-border rounded-md p-3 font-mono text-[11px] mb-3 focus:border-accent outline-none resize-y"
      />

      {/* ÖNİZLEME — kaç unique BIN sorgulanacak */}
      {input.trim() && (
        <div className="text-[10px] text-gray-500 mb-3">
          🔎 Önizleme:{' '}
          <strong className="text-info">
            {Array.from(new Set(input.split('\n').map(extractBin).filter((bin) => bin.length >= 6))).length}
          </strong>{' '}
          unique BIN sorgulanacak
        </div>
      )}

      {/* BUTONLAR */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleCheck}
          disabled={loading}
          className="flex-1 py-2 text-sm font-bold text-white rounded-md bg-accent hover:bg-green-600 disabled:bg-gray-600"
        >
          {loading ? 'Sorgulanıyor...' : '▶ SORGULA'}
        </button>

        <button
          onClick={clearResultsOnly}
          className="bg-[#555] hover:bg-[#666] text-white px-4 py-2 rounded-md text-sm"
          title="Sadece sonuçları temizle"
        >
          🧹
        </button>

        <button
          onClick={clearAll}
          className="px-4 py-2 text-sm font-bold text-white rounded-md bg-dead hover:bg-red-700"
          title="Hepsini temizle"
        >
          🗑️ Temizle
        </button>
      </div>

      {/* SONUÇ ÖZETİ */}
      {results.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-3 text-[11px]">
          <span className="text-gray-500">
            📊 Toplam: <strong className="text-info">{results.length}</strong>
          </span>
          <span className="text-gray-500">
            ✅ Bulundu: <strong className="text-accent">{foundCount}</strong>
          </span>
          {errorCount > 0 && (
            <span className="text-gray-500">
              ❌ Hata: <strong className="text-dead">{errorCount}</strong>
            </span>
          )}
          {favMatchedCount > 0 && (
            <span className="text-gray-500">
              ⭐ Favori: <strong className="text-warn">{favMatchedCount}</strong>
            </span>
          )}
        </div>
      )}

      {/* SONUÇ LİSTESİ */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {results.map((r) => {
          const favMatches = matchFavoritesByBin(r.bin, favorites);
          const isAdding = addingBin === r.bin;

          return (
            <div
              key={r.bin}
              className="p-3 text-xs leading-relaxed border rounded-md bg-bg-input border-border"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <FavoriteBadges matches={favMatches} size="sm" />
                  <span className="font-mono text-sm font-bold text-info">{r.bin}</span>
                </div>

                {!isChecker && !r.loading && !r.error && (
                  <div className="flex items-center gap-1">
                    {!isAdding ? (
                      <button
                        onClick={() => setAddingBin(r.bin)}
                        className="text-[11px] px-2 py-1 rounded bg-[#333] hover:bg-[#444] text-white"
                        title="Favori listeye ekle"
                      >
                        ⭐ Ekle
                      </button>
                    ) : (
                      <>
                        <select
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'new') {
                              createListWithBin(r.bin);
                            } else if (val) {
                              addBinToList(r.bin, Number(val));
                            }
                          }}
                          className="text-[11px] bg-[#222] border border-border rounded px-2 py-1"
                          autoFocus
                          defaultValue=""
                        >
                          <option value="" disabled>Liste seç...</option>
                          {favorites.map((f) => (
                            <option
                              key={f.id}
                              value={f.id}
                              disabled={f.bins.includes(r.bin)}
                            >
                              {f.name} {f.bins.includes(r.bin) ? '(zaten var)' : ''}
                            </option>
                          ))}
                          <option value="new">+ Yeni Liste Oluştur</option>
                        </select>
                        <button
                          onClick={() => setAddingBin(null)}
                          className="text-[11px] px-2 py-1 rounded bg-[#555] text-white"
                        >
                          İptal
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {r.loading ? (
                <div className="text-warn">sorgulanıyor...</div>
              ) : r.error ? (
                <div className="text-dead">{r.error}</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-accent">{r.brand || '?'}</strong>
                    {r.type && <span className="text-gray-400">• {r.type}</span>}
                    {r.category && <span className="text-gray-400">• {r.category}</span>}
                  </div>
                  <div className="text-gray-500 mt-0.5">
                    🏛 {r.issuer || '-'} • {r.country || '-'}
                    {r.isoCode2 && (
                      <span className="ml-1 text-gray-600">({r.isoCode2})</span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* HİÇ SONUÇ YOK */}
      {!loading && results.length === 0 && (
        <div className="py-8 text-xs text-center text-gray-600">
          <div className="mb-2 text-3xl">🔍</div>
          <div>Full kart veya BIN girin, sorgulayın</div>
        </div>
      )}

      {/* ALT BİLGİ */}
      {results.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-gray-500">
          <span>
            📊 {results.length} sonuç
            {favorites.length > 0 && (
              <span className="ml-2">
                ⭐ {favMatchedCount} listede
              </span>
            )}
          </span>
          <span className="text-info">💾 localStorage'da kayıtlı</span>
        </div>
      )}
    </div>
  );
}
