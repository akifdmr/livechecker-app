// ============================================================
// SECTION 1: IMPORTS
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Card, FavList } from '../api';
import { cardsApi, favoritesApi } from '../api';
import { posApi } from '../api/pos';
import CardDetailModal from '../components/CardDetailModal';
import CardItem from '../components/CardItem';
import ChargeModal from '../components/ChargeModal';
import StatCard from '../components/StatCard';

// ============================================================
// SECTION 2: SABİTLER
// ============================================================
const PAGE_SIZE = 50;
const BULK_CONCURRENCY = 3; // ⭐ 5 → 3 (rate limit)

// ============================================================
// SECTION 3: COMPONENT + STATE
// ============================================================
export default function CardsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const detailCardId = searchParams.get('cardId');
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    bin: '',
    cardNumber: '',
    banka: '',
    country: '',
    status: '',
    cardType: '',
  });
  const [cardNumberSearch, setCardNumberSearch] = useState('');
  const [cardNumberError, setCardNumberError] = useState('');

  const [favorites, setFavorites] = useState<FavList[]>([]);
  const [filterOptions, setFilterOptions] = useState({
    countries: [] as string[],
    banks: [] as string[],
    statuses: [] as string[],
    cardTypes: [] as string[],
  });
  const [enrolledCardIds, setEnrolledCardIds] = useState<Set<number>>(new Set());
  const [selectedFavList, setSelectedFavList] = useState<number | ''>('');

  const [page, setPage] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const cardsRequestsRef = useRef(new Map<string, Promise<void>>());
  const latestCardsRequestRef = useRef(0);
  const filterOptionsRequestRef = useRef<Promise<void> | null>(null);

  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [detailLoadError, setDetailLoadError] = useState('');
  const [chargeCard, setChargeCard] = useState<Card | null>(null);

  const [recheckLoadingId, setRecheckLoadingId] = useState<number | null>(null);
  const [balanceLoadingId, setBalanceLoadingId] = useState<number | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const [bulkRecheck, setBulkRecheck] = useState<{
    running: boolean;
    done: number;
    total: number;
    live: number;
    dead: number;
    errors: number;
    cooldown: number;
    scope: string;
  } | null>(null);

  // ============================================================
  // SECTION 4: TÜRETİLMİŞ STATE
  // ============================================================
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPageSelected = cards.length > 0 && selectedIds.size === cards.length;
  const someOnPageSelected = selectedIds.size > 0 && !allOnPageSelected;
  const selectedCount = selectedIds.size;

  // ============================================================
  // SECTION 5: useEffect — indeterminate checkbox
  // ============================================================
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someOnPageSelected;
    }
  }, [someOnPageSelected]);

  useEffect(() => {
    if (!detailCardId) return;
    if (!/^\d+$/.test(detailCardId)) {
      setDetailLoadError('Kart detay bağlantısı geçersiz.');
      return;
    }

    let cancelled = false;
    setDetailLoadError('');
    cardsApi.get(Number(detailCardId))
      .then((card) => {
        if (!cancelled) setCurrentCard(card);
      })
      .catch(() => {
        if (!cancelled) setDetailLoadError('Bu kartın detayına erişilemiyor.');
      });

    return () => { cancelled = true; };
  }, [detailCardId]);

  // ============================================================
  // SECTION 6: OPTIMISTIC UPDATE HELPERS
  // ============================================================
  function updateCardInList(cardId: number, patch: Partial<Card>) {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, ...patch } : c))
    );
    setCurrentCard((prev) =>
      prev && prev.id === cardId ? { ...prev, ...patch } : prev
    );
  }

  function applyRecheckToLocalCard(card: Card, data: any) {
    const isLive = data.status === 'LIVE';
    const isDead = data.status === 'DEAD';
    const now = new Date().toISOString();

    updateCardInList(card.id, {
      status: data.status || card.status,
      last_provider: data.provider || card.last_provider,
      last_checked_at: now,
      check_count: (card.check_count || 0) + 1,
      dead_reason: isDead ? data.reason : null,
      dead_reason_short: isDead ? data.reasonShort : null,
      dead_reason_long: isDead ? data.reasonLong : null,
      dead_message: isDead ? data.reasonLong : null,
      dead_at: isDead ? now : null,
      total_declined_count: isDead
        ? (card.total_declined_count || 0) + 1
        : card.total_declined_count,
    });

    return isLive;
  }

  // ============================================================
  // SECTION 7-10: EFFECTS
  // ============================================================
  useEffect(() => {
    if (!filterOptionsRequestRef.current) {
      filterOptionsRequestRef.current = cardsApi
        .filterOptions()
        .then(setFilterOptions)
        .catch((e) => console.error('[CARDS] Filtre seçenekleri yüklenemedi:', e));
    }
    loadFavorites();
    loadEnrollments();
  }, []);

  useEffect(() => {
    function onCardsUpdated(e: Event) {
      const detail = (e as CustomEvent).detail;
      console.log('[CARDS] Auto-refresh:', detail.source, '→', detail.saved);
      loadCards();
      loadFavorites();
    }
    window.addEventListener('cards-updated', onCardsUpdated);
    return () => window.removeEventListener('cards-updated', onCardsUpdated);
  }, []);

  useEffect(() => {
    loadCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.bin,
    filters.cardNumber,
    filters.banka,
    filters.country,
    filters.status,
    filters.cardType,
    page,
    selectedFavList,
  ]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    page,
    filters.bin,
    filters.cardNumber,
    filters.banka,
    filters.country,
    filters.status,
    filters.cardType,
    selectedFavList,
  ]);

  // ============================================================
  // SECTION 11: DATA LOADING
  // ============================================================
  async function loadEnrollments() {
    try {
      const data = await posApi.enrollments();
      setEnrolledCardIds(
        new Set(
          (data.enrollments || [])
            .filter((e: any) => e.live_card_id)
            .map((e: any) => Number(e.live_card_id))
        )
      );
    } catch {
      setEnrolledCardIds(new Set());
    }
  }

  async function loadFavorites() {
    try {
      const raw = await favoritesApi.list();
      const enriched: FavList[] = await Promise.all(
        raw.map(async (l) => {
          try {
            const stats = await favoritesApi.matchingCards(l.id);
            const count = (stats.stats || []).reduce(
              (s: number, x: { count: number }) => s + x.count,
              0
            );
            return { ...l, cardCount: count };
          } catch {
            return { ...l, cardCount: 0 };
          }
        })
      );
      setFavorites(enriched);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadCards() {
    const params: Record<string, string> = {
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    };

    if (filters.bin) params.bin = filters.bin;
    if (filters.cardNumber) params.cardNumber = filters.cardNumber;
    if (filters.banka) params.banka = filters.banka;
    if (filters.country) params.country = filters.country;
    if (filters.status) params.status = filters.status;
    if (filters.cardType) params.cardType = filters.cardType;
    if (selectedFavList) params.favoriteId = String(selectedFavList);

    const requestKey = JSON.stringify(params);
    const inFlight = cardsRequestsRef.current.get(requestKey);
    if (inFlight) return inFlight;

    const requestId = ++latestCardsRequestRef.current;
    setLoading(true);
    const request = (async () => {
      try {
        const data = await cardsApi.list(params);
        if (requestId === latestCardsRequestRef.current) {
          setTotal(data.total || 0);
          setCards(data.cards || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        cardsRequestsRef.current.delete(requestKey);
        if (requestId === latestCardsRequestRef.current) setLoading(false);
      }
    })();
    cardsRequestsRef.current.set(requestKey, request);
    return request;
  }

  // ============================================================
  // SECTION 12: SELECTION HANDLERS
  // ============================================================
  function toggleSelect(cardId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allOnPageSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(cards.map((c) => c.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ============================================================
  // SECTION 13: INPUT HANDLERS
  // ============================================================
  function onBinInput(value: string) {
    setFilters((f) => ({ ...f, bin: value.replace(/\D/g, '').slice(0, 6) }));
    setPage(0);
    setPageInput('1');
  }
  function onCardNumberSearchInput(value: string) {
    const panOnly = value.includes('|') ? value.slice(0, value.indexOf('|')) : value;
    setCardNumberSearch(panOnly.replace(/\D/g, '').slice(0, 19));
    setCardNumberError('');
  }
  function applyCardNumberSearch() {
    const digits = cardNumberSearch.replace(/\D/g, '');
    if (digits && digits.length !== 4 && (digits.length < 13 || digits.length > 19)) {
      setCardNumberError('Son 4 hane veya tam kart numarası girin.');
      return;
    }
    setCardNumberError('');
    setFilters((f) => ({ ...f, cardNumber: digits }));
    setPage(0);
    setPageInput('1');
  }
  function onBankaInput(value: string) {
    setFilters((f) => ({ ...f, banka: value }));
    setPage(0);
    setPageInput('1');
  }
  function onCountryChange(value: string) {
    setFilters((f) => ({ ...f, country: value }));
    setPage(0);
    setPageInput('1');
  }
  function onStatusChange(value: string) {
    setFilters((f) => ({ ...f, status: value }));
    setPage(0);
    setPageInput('1');
  }
  function onCardTypeChange(value: string) {
    setFilters((f) => ({ ...f, cardType: value }));
    setPage(0);
    setPageInput('1');
  }
  function onFavListChange(value: string) {
    setSelectedFavList(value ? Number(value) : '');
    setPage(0);
    setPageInput('1');
  }

  function clearAll() {
    setFilters({
      bin: '', cardNumber: '', banka: '', country: '', status: '', cardType: '',
    });
    setCardNumberSearch('');
    setCardNumberError('');
    setSelectedFavList('');
    setSelectedIds(new Set());
    setPage(0);
    setPageInput('1');
  }

  // ============================================================
  // SECTION 14: PAGINATION
  // ============================================================
  function goToPage(p: number) {
    if (p < 0 || p >= totalPages) return;
    setPage(p);
    setPageInput(String(p + 1));
  }

  function onPageInputSubmit() {
    const n = parseInt(pageInput, 10);
    if (isNaN(n) || n < 1 || n > totalPages) {
      setPageInput(String(page + 1));
      return;
    }
    goToPage(n - 1);
  }

  function refresh() {
    loadCards();
  }

  // ============================================================
  // SECTION 15: RECHECK (TEKLİ)
  // ============================================================
  async function handleRecheck(card: Card) {
    if (recheckLoadingId !== null) return;
    if (!confirm(`${card.pan} tekrar check edilsin mi?`)) return;

    setRecheckLoadingId(card.id);
    try {
      // ⭐ Tekli recheck — bulkMode yok (1h cooldown, $0/$1 fallback)
      const data = await cardsApi.recheck(card.id);

      if (data.reason === 'recheck_cooldown') {
        alert(`⏱ Cooldown: ${data.reasonLong || 'Bu kart için son 1 saat içinde check yapılmış.'}`);
        return;
      }

      applyRecheckToLocalCard(card, data);

      const statusIcon =
        data.status === 'LIVE' ? '✅'
        : data.status === 'DEAD' ? '❌'
        : data.status === 'ERROR' ? '⚠️' : 'ℹ️';

      let msg = `${statusIcon} ${data.status}\n`;
      msg += `Sebep: ${data.reasonShort || data.reason || '-'}\n`;
      if (data.reasonLong) msg += `Açıklama: ${data.reasonLong}\n`;
      msg += `Provider: ${data.provider || '-'}`;
      if (data.merchantId) msg += ` (merchant: ${data.merchantId})`;
      if (data.providerCode) msg += ` (kod: ${data.providerCode})`;
      if (data.bin) {
        const binInfo = [
          data.bin.bin, data.bin.brand, data.bin.type,
          data.bin.issuer, data.bin.country,
        ].filter(Boolean).join(' / ');
        if (binInfo) msg += `\nBIN: ${binInfo}`;
      }
      msg += `\nSüre: ${data.duration || 0}ms`;
      alert(msg);

      loadCards();
    } catch (e: any) {
      alert('Hata: ' + e.message);
    } finally {
      setRecheckLoadingId(null);
    }
  }

  // ============================================================
  // SECTION 15b: BULK RECHECK
  // ============================================================
  async function runBulkRecheck(scope: Card[], label: string) {
    if (bulkRecheck?.running) return;

    if (scope.length === 0) {
      alert('Yeniden check edilecek kart yok');
      return;
    }

    if (
      !confirm(
        `${scope.length} kart yeniden check edilsin mi?\n\n` +
          `Kapsam: ${label}\n` +
          `Sayfa: ${page + 1} / ${totalPages}\n` +
          `Provider: Clover3 (USD, $0 auth)\n` +
          `Cooldown: 24 saat\n` +
          `Eşzamanlılık: ${BULK_CONCURRENCY}\n\n` +
          `Bu işlem birkaç dakika sürebilir.`
      )
    )
      return;

    // ⭐ Her worker kendi local counter'ını tutar (race condition yok)
    const local = { live: 0, dead: 0, errors: 0, cooldown: 0 };
    const initial = {
      running: true,
      done: 0,
      total: scope.length,
      live: 0,
      dead: 0,
      errors: 0,
      cooldown: 0,
      scope: label,
    };
    setBulkRecheck({ ...initial });

    const queue: Card[] = [...scope];

    async function worker() {
      while (queue.length > 0) {
        const card = queue.shift();
        if (!card) break;

        try {
          // ⭐ bulkMode: true → $0 auth zorunlu, $1 yasak, 24h cooldown
          const data = await cardsApi.recheck(card.id, { bulkMode: true });

          if (data.reason === 'recheck_cooldown') {
            local.cooldown++;
          } else if (data.status === 'LIVE') {
            local.live++;
            applyRecheckToLocalCard(card, data);
          } else if (data.status === 'DEAD') {
            local.dead++;
            applyRecheckToLocalCard(card, data);
          } else {
            local.errors++;
          }
        } catch (e: any) {
          if (e?.response?.status === 429) {
            local.cooldown++;
          } else {
            local.errors++;
          }
        }

        // ⭐ Tek noktada state güncelle — race yok
        setBulkRecheck({
          ...initial,
          done: local.live + local.dead + local.errors + local.cooldown,
          live: local.live,
          dead: local.dead,
          errors: local.errors,
          cooldown: local.cooldown,
        });
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(BULK_CONCURRENCY, scope.length) }, () => worker())
    );

    setBulkRecheck({
      running: false,
      done: scope.length,
      total: scope.length,
      live: local.live,
      dead: local.dead,
      errors: local.errors,
      cooldown: local.cooldown,
      scope: label,
    });

    alert(
      `✅ Toplu Check Tamamlandı (${label})\n\n` +
        `Toplam: ${scope.length}\n` +
        `✔ LIVE: ${local.live}\n` +
        `✖ DEAD: ${local.dead}\n` +
        `⚠ Hata: ${local.errors}\n` +
        `⏱ Cooldown: ${local.cooldown}`
    );

    await loadCards();
    loadFavorites();
  }

  async function handleRecheckSelected() {
    const scope = cards.filter((c) => selectedIds.has(c.id));
    await runBulkRecheck(scope, `Seçili (${scope.length})`);
  }

  async function handleRecheckAll() {
    await runBulkRecheck([...cards], `Bu sayfa (${cards.length})`);
  }

  // ============================================================
  // SECTION 16: BALANCE CHECK (TEKLİ)
  // ============================================================
  async function handleBalanceCheck(card: Card) {
    if (balanceLoadingId !== null) return;

    const isLive = confirm(
      'OK = Live Check ($0)\nCancel = Auth + Kısmi Refund'
    );

    let amount = 0;
    let refund = 0;

    if (!isLive) {
      const a = prompt('Auth tutarı ($):', '1');
      if (!a) return;
      amount = parseFloat(a);
      if (isNaN(amount) || amount < 1) {
        alert('Geçerli bir tutar girin (min $1)');
        return;
      }
      const r = prompt('Kısmi refund tutarı ($):', '0.30');
      refund = r ? parseFloat(r) || 0 : 0;
    }

    setBalanceLoadingId(card.id);
    try {
      const data = await cardsApi.balanceCheckById(card.id, amount, {
        operation: isLive ? 'live_check' : 'preauth',
        refundAmount: refund,
      });

      if (data.success) {
        updateCardInList(card.id, {
          status: 'LIVE',
          last_provider: data.provider || card.last_provider,
          last_checked_at: new Date().toISOString(),
          dead_reason: null,
          dead_reason_short: null,
          dead_reason_long: null,
          dead_message: null,
          dead_at: null,
        });
      }

      if (data.success) {
        const head = isLive ? '✅ LIVE' : '✅ APPROVED (preauth)';
        let msg = `${head}\nProvider: ${data.provider || '-'}`;
        if (data.merchantId) msg += ` (${data.merchantId})`;
        msg += `\nTutar: $${data.amount}`;
        if (data.authCode) msg += `\nAuth Code: ${data.authCode}`;
        if ((data.refundedAmount || 0) > 0) {
          msg += `\nRefunded: $${data.refundedAmount}`;
          msg += `\nNet: $${data.netAmount}`;
        }
        alert(msg);
      } else {
        alert(
          `❌ ${data.reasonShort || data.reason || data.error?.message || 'Bilinmeyen'}`
        );
      }
      loadCards();
    } catch (e: any) {
      alert('Hata: ' + e.message);
    } finally {
      setBalanceLoadingId(null);
    }
  }

  // ============================================================
  // SECTION 17: RENDER
  // ============================================================
  const bulkPct = bulkRecheck
    ? Math.round((bulkRecheck.done / Math.max(1, bulkRecheck.total)) * 100)
    : 0;

  return (
    <div>
      {/* STATS */}
      <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-3">
        <StatCard label="Toplam" value={total} />
        <StatCard label="Bu Sayfa" value={cards.length} />
        <StatCard
          label="Sayfa"
          value={`${totalPages > 0 ? page + 1 : 0} / ${totalPages}`}
        />
      </div>

      {/* BULK RECHECK PROGRESS */}
      {bulkRecheck && (bulkRecheck.running || bulkRecheck.done > 0) && (
        <div className="p-3 mb-4 border rounded-md bg-bg-card border-border">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="font-bold text-info">
              {bulkRecheck.running
                ? `🔄 Toplu Check Çalışıyor... (${bulkRecheck.scope})`
                : `✅ Toplu Check Bitti (${bulkRecheck.scope})`}
            </span>
            <span className="text-gray-400">
              {bulkRecheck.done} / {bulkRecheck.total}
            </span>
          </div>

          <div className="w-full h-2 mb-2 overflow-hidden rounded bg-[#222]">
            <div
              className="h-full transition-all bg-accent"
              style={{ width: `${bulkPct}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-4 text-[11px]">
            <span className="text-live">✔ LIVE: {bulkRecheck.live}</span>
            <span className="text-dead">✖ DEAD: {bulkRecheck.dead}</span>
            <span className="text-warn">⚠ Hata: {bulkRecheck.errors}</span>
            <span className="text-gray-500">⏱ Cooldown: {bulkRecheck.cooldown}</span>
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex flex-1 min-w-[240px] gap-2">
          <input
            type="search"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Kart no. (son 4 veya tam numara)"
            maxLength={128}
            value={cardNumberSearch}
            onChange={(e) => onCardNumberSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyCardNumberSearch();
            }}
            className="flex-1 min-w-0 px-3 py-2 text-xs border rounded-md outline-none bg-bg-card border-border focus:border-accent"
            aria-label="Kart numarasıyla ara"
          />
          <button
            type="button"
            onClick={applyCardNumberSearch}
            className="px-3 py-2 text-xs font-bold text-white rounded-md bg-accent hover:bg-green-600"
          >
            Ara
          </button>
        </div>

        <input
          type="text"
          placeholder="BIN (6 hane)"
          maxLength={6}
          value={filters.bin}
          onChange={(e) => onBinInput(e.target.value)}
          className="flex-1 min-w-[100px] bg-bg-card border border-border rounded-md px-3 py-2 text-xs focus:border-accent outline-none"
        />

        <select
          value={filters.banka}
          onChange={(e) => onBankaInput(e.target.value)}
          className="flex-1 min-w-[140px] bg-bg-card border border-border rounded-md px-3 py-2 text-xs focus:border-accent outline-none"
          title="Banka"
        >
          <option value="">Tüm bankalar</option>
          {filterOptions.banks.map((bank) => (
            <option key={bank} value={bank}>{bank}</option>
          ))}
        </select>

        <select
          value={filters.country}
          onChange={(e) => onCountryChange(e.target.value)}
          className="px-3 py-2 text-xs border rounded-md outline-none bg-bg-card border-border focus:border-accent"
        >
          <option value="">Tüm ülkeler</option>
          {filterOptions.countries.map((country) => (
            <option key={country} value={country}>{country}</option>
          ))}
        </select>

        <select
          value={filters.cardType}
          onChange={(e) => onCardTypeChange(e.target.value)}
          className="px-3 py-2 text-xs border rounded-md outline-none bg-bg-card border-border focus:border-accent"
          title="Kart Tipi"
        >
          <option value="">Tüm tipler</option>
          {filterOptions.cardTypes.map((type) => (
            <option key={type} value={type}>
              {type === 'DEBIT' ? '🔵 Debit' : type === 'CREDIT' ? '🟢 Credit' : '🟡 Prepaid'}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="px-3 py-2 text-xs border rounded-md outline-none bg-bg-card border-border focus:border-accent"
        >
          <option value="">Tüm durumlar</option>
          {filterOptions.statuses.map((status) => (
            <option key={status} value={status}>
              {status === 'LIVE' ? '✔ LIVE' : status === 'DEAD' ? '✖ DEAD' : status}
            </option>
          ))}
        </select>

        <button
          onClick={refresh}
          className="px-3 py-2 text-xs font-bold text-white rounded-md bg-accent hover:bg-green-600"
          title="Yenile"
        >
          🔄
        </button>

        <button
          onClick={handleRecheckAll}
          disabled={bulkRecheck?.running || cards.length === 0}
          className="bg-[#2196F3] hover:bg-[#1976d2] disabled:bg-gray-600 disabled:opacity-50 text-white px-3 py-2 rounded-md text-xs font-bold"
          title="Bu sayfadaki tüm kartları yeniden check et (Clover3 $0, 24h cooldown)"
        >
          {bulkRecheck?.running
            ? `🔄 ${bulkRecheck.done}/${bulkRecheck.total}`
            : '🔄 Bu Sayfayı Check'}
        </button>

        <button
          onClick={clearAll}
          className="bg-[#555] hover:bg-[#666] text-white px-3 py-2 rounded-md text-xs font-bold"
          title="Temizle"
        >
          🗑️
        </button>
      </div>
      {cardNumberError && (
        <p className="mb-3 text-xs text-dead">{cardNumberError}</p>
      )}

      {/* FAV LIST FILTER */}
      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
        <span className="whitespace-nowrap">⭐ Favori:</span>
        <select
          value={selectedFavList}
          onChange={(e) => onFavListChange(e.target.value)}
          className="flex-1 px-3 py-2 text-xs border rounded-md outline-none bg-bg-card border-border focus:border-accent"
        >
          <option value="">— Tümü —</option>
          {favorites.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.cardCount} kart)
            </option>
          ))}
        </select>
      </div>

      {/* SELECTION TOOLBAR */}
      {!loading && cards.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 mb-3 text-xs border rounded-md bg-bg-card border-border">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-accent"
            />
            <span className="font-bold text-gray-300">Tümünü Seç</span>
          </label>

          <span className="text-gray-500">
            {selectedCount} / {cards.length} seçili
          </span>

          {selectedCount > 0 && (
            <button
              onClick={clearSelection}
              className="text-gray-400 hover:text-white"
            >
              ✕ Temizle
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={handleRecheckSelected}
            disabled={bulkRecheck?.running || selectedCount === 0}
            className="bg-[#9C27B0] hover:bg-[#7B1FA2] disabled:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-xs font-bold"
            title="Sadece seçili kartları check et (Clover3 $0, 24h cooldown)"
          >
            {bulkRecheck?.running
              ? `🔄 ${bulkRecheck.done}/${bulkRecheck.total}`
              : `🔄 Seçilileri Check (${selectedCount})`}
          </button>

          <button
            onClick={handleRecheckAll}
            disabled={bulkRecheck?.running}
            className="bg-[#2196F3] hover:bg-[#1976d2] disabled:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-xs font-bold"
          >
            🔄 Tümünü Check ({cards.length})
          </button>
        </div>
      )}

      {/* CARDS LIST */}
      {loading ? (
        <div className="py-8 text-sm text-center text-gray-500">Yükleniyor...</div>
      ) : cards.length === 0 ? (
        <div className="py-8 text-sm text-center text-gray-500">
          {total === 0 ? 'Kart bulunamadı' : 'Bu sayfada kart yok'}
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1">
          {cards.map((card) => {
            const isSelected = selectedIds.has(card.id);
            return (
              <div
                key={card.id}
                className={`flex items-stretch gap-2 rounded-md transition ${
                  isSelected ? 'ring-1 ring-accent/60 bg-accent/5' : ''
                }`}
              >
                <label
                  className="flex items-center justify-center w-8 cursor-pointer select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(card.id)}
                    className="w-4 h-4 accent-accent"
                  />
                </label>

                <div className="flex-1 min-w-0">
                  <CardItem
                    card={card}
                    onClick={setCurrentCard}
                    recheckLoading={recheckLoadingId === card.id}
                    balanceLoading={balanceLoadingId === card.id}
                    onRecheck={handleRecheck}
                    onBalanceCheck={handleBalanceCheck}
                    onCharge={setChargeCard}
                    onEnroll={(c) => navigate(`/enrollments?liveCardId=${c.id}`)}
                    isEnrolled={enrolledCardIds.has(card.id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-4 border-t border-border">
          <div className="text-xs text-gray-500">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(0)}
              disabled={page === 0}
              className="px-2 py-1 text-xs bg-[#333] hover:bg-[#444] disabled:opacity-30 rounded text-white"
            >
              ⏮
            </button>
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
              className="px-3 py-1 text-xs bg-[#333] hover:bg-[#444] disabled:opacity-30 rounded text-white"
            >
              ◀
            </button>

            <div className="flex items-center gap-1 mx-2">
              <input
                type="text"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onPageInputSubmit();
                }}
                onBlur={onPageInputSubmit}
                className="w-12 px-2 py-1 text-xs text-center border rounded outline-none bg-bg-input border-border focus:border-accent"
              />
              <span className="text-xs text-gray-500">/ {totalPages}</span>
            </div>

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs bg-[#333] hover:bg-[#444] disabled:opacity-30 rounded text-white"
            >
              ▶
            </button>
            <button
              onClick={() => goToPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 text-xs bg-[#333] hover:bg-[#444] disabled:opacity-30 rounded text-white"
            >
              ⏭
            </button>
          </div>

          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">Git:</span>
            {[1, 5, 10, 20, 50].map((step) => (
              <button
                key={step}
                onClick={() => goToPage(Math.min(step - 1, totalPages - 1))}
                className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-gray-400 hover:text-white"
              >
                {step}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailLoadError && (
        <div className="p-3 mb-3 text-xs border rounded bg-dead/10 border-dead text-dead">
          {detailLoadError}
        </div>
      )}
      {currentCard && (
        <CardDetailModal
          card={currentCard}
          favorites={favorites}
          onClose={() => {
            setCurrentCard(null);
            if (searchParams.has('cardId')) {
              const nextParams = new URLSearchParams(searchParams);
              nextParams.delete('cardId');
              setSearchParams(nextParams, { replace: true });
            }
          }}
          onFavUpdate={loadCards}
          onCardUpdated={(patch) => updateCardInList(currentCard.id, patch)}
        />
      )}

      {/* CHARGE MODAL */}
      {chargeCard && (
        <ChargeModal
          card={chargeCard}
          onClose={() => setChargeCard(null)}
          onSuccess={loadCards}
        />
      )}
    </div>
  );
}