// ============================================================
// CARD ITEM — status + totals + provider + aksiyonlar
// Props: onClick, onRecheck, onBalanceCheck, onCharge
// ============================================================
import type { Card } from '../api';

interface CardItemProps {
  card: Card;
  onClick: (card: Card) => void;
  onRecheck?: (card: Card) => void;
  onBalanceCheck?: (card: Card) => void;
  onCharge?: (card: Card) => void;
  onEnroll?: (card: Card) => void;
  recheckLoading?: boolean;
  balanceLoading?: boolean;
  isLastChecked?: boolean;
  isEnrolled?: boolean;
}

export default function CardItem({
  card,
  onClick,
  onRecheck,
  onBalanceCheck,
  onCharge,
  onEnroll,
  recheckLoading = false,
  balanceLoading = false,
  isLastChecked = false,
  isEnrolled = false,
}: CardItemProps) {
  const isLoading = recheckLoading || balanceLoading;

  const checkCount = card.check_count || 0;
  const lastCheckedText = formatLastChecked(card.last_checked_at);
  const status = card.status || 'LIVE';
  const isDead = status === 'DEAD';
  const collectedTotal = Math.max(0, (card.total_sold || 0) + (card.total_captured || 0) - (card.total_refunded || 0));
  const favoriteNames = (card.favLists || []).map((favorite) => favorite.name).join(', ');

  return (
    <div
      onClick={() => !isLoading && onClick(card)}
      className={`bg-bg-card border rounded-md px-3 py-2 transition flex items-center gap-2 text-xs flex-wrap ${
        isLoading
          ? 'border-accent/50 bg-[#1a1a1a] cursor-wait'
          : isDead
          ? 'border-dead/40 opacity-60 hover:opacity-90 cursor-pointer'
          : isLastChecked
          ? 'border-info ring-1 ring-info ring-opacity-30'
          : 'border-border hover:border-accent hover:bg-[#222] cursor-pointer'
      }`}
      style={{ minHeight: '36px' }}
    >
      {/* ⭐ 1. STATUS */}
      <span
        className={`px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${
          isDead ? 'bg-dead text-white' : 'bg-live text-black'
        }`}
        title={
          isDead && card.dead_message
            ? card.dead_message
            : `Durum: ${status}`
        }
      >
        {isDead ? '✖ DEAD' : '✔ LIVE'}
      </span>

      {/* ⭐ 2. DEAD SEBEBİ */}
      {isDead && card.dead_reason && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] bg-dead/30 text-dead whitespace-nowrap"
          title={card.dead_message ?? card.dead_reason ?? undefined}
        >
          {humanizeReasonShort(card.dead_reason)}
        </span>
      )}

      {/* ⭐ 3. DECLINE SAYACI */}
      {isDead && (card.total_declined_count || 0) > 1 && (
        <span
          className="text-[9px] text-dead/70 whitespace-nowrap"
          title={`${card.total_declined_count} kez reddedildi`}
        >
          ❌ {card.total_declined_count}×
        </span>
      )}

      {/* ENROLLMENT */}
      {isEnrolled && (
        <span className="rounded border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300" title="Bu kart için provider enrollment kayıtlı">
          🔗 ENROLLED
        </span>
      )}

      {/* ⭐ 4. YENİ CHECK ROZETİ */}
      {isLastChecked && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-info text-white whitespace-nowrap">
          🆕
        </span>
      )}

      {/* Favori rozetleri */}
      {card.favLists && card.favLists.length > 0 && (
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold text-white"
          style={{ background: card.favLists[0].color || '#4CAF50' }}
          title={`Favori listeler: ${favoriteNames}`}
          aria-label={`Favori listeler: ${favoriteNames}`}
        >⭐</span>
      )}

      {card.name && <span className="text-gray-200 whitespace-nowrap" title={`Kart sahibi: ${card.name}`}>👤 {card.name}</span>}

      {/* PAN */}
      <span className="font-mono font-semibold text-info whitespace-nowrap">
        {card.pan}
      </span>

      {/* EXP | CVV */}
      <span className="font-mono text-gray-400 whitespace-nowrap">
        {card.exp} | {card.cvv || '—'}
      </span>

      {/* Marka */}
      {card.type && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1a1a1a] border border-border text-accent whitespace-nowrap">
          {card.type}
        </span>
      )}

      {/* Level */}
      {card.level && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#1a1a1a] border border-border text-warn whitespace-nowrap">
          {card.level}
        </span>
      )}

      {/* Banka */}
      <span
        className="text-[#9C27B0] truncate max-w-[120px]"
        title={card.banka ?? undefined}
      >
        {card.banka || '-'}
      </span>

      {/* Ülke */}
      <span className="text-gray-500 whitespace-nowrap">
        {card.country || '-'}
      </span>

      {/* ⭐ 5. TOTALLER */}
      {(card.total_auth || 0) > 0 && (
        <span
          className="text-[10px] text-live whitespace-nowrap"
          title="Toplam auth"
        >
          A:${card.total_auth?.toFixed(2)}
        </span>
      )}
      {(card.total_sold || 0) > 0 && (
        <span
          className="text-[10px] text-info whitespace-nowrap"
          title="Toplam sale"
        >
          S:${card.total_sold?.toFixed(2)}
        </span>
      )}
      {(card.total_captured || 0) > 0 && (
        <span
          className="text-[10px] text-gray-300 whitespace-nowrap"
          title="Toplam capture"
        >
          C:${card.total_captured?.toFixed(2)}
        </span>
      )}
      {(card.total_refunded || 0) > 0 && (
        <span
          className="text-[10px] text-warn whitespace-nowrap"
          title="Toplam refund"
        >
          R:${card.total_refunded?.toFixed(2)}
        </span>
      )}
      <span className="text-[10px] font-bold text-live whitespace-nowrap" title="Net tahsilat: satış + capture − iadeler">
        💵 Tahsilat ${collectedTotal.toFixed(2)}
      </span>

      {/* ⭐ 6. SON PROVIDER */}
      {card.last_provider && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] border border-border text-gray-300 whitespace-nowrap"
          title="Son işlem provider"
        >
          ⚙ {card.last_provider}
        </span>
      )}

      {/* ⭐ 7. CHECK SAYISI */}
      {checkCount > 0 && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#333] text-gray-300 whitespace-nowrap"
          title={`${checkCount} kez check edildi`}
        >
          🔁 {checkCount}×
        </span>
      )}

      {/* ⭐ 8. SON CHECK ZAMANI */}
      {lastCheckedText && (
        <span
          className="text-[9px] text-gray-400 whitespace-nowrap"
          title={
            card.last_checked_at
              ? new Date(card.last_checked_at).toLocaleString('tr-TR')
              : undefined
          }
        >
          ⏱ {lastCheckedText}
        </span>
      )}

      {/* ⭐ 9. KİM CHECK ETTİ */}
      {card.checked_by_email && (
        <span
          className="text-[9px] text-info/70 truncate max-w-[90px] whitespace-nowrap"
          title={`Check eden: ${card.checked_by_email}`}
        >
          👤 {card.checked_by_email.split('@')[0]}
        </span>
      )}

      {/* ⭐ 10. PROXY */}
      {card.proxy && (
        <span
          className="text-[9px] text-gray-600 font-mono truncate max-w-[100px] whitespace-nowrap"
          title={`Proxy: ${card.proxy}`}
        >
          🌐 {card.proxy}
        </span>
      )}

      {/* ⭐ 11. CHARGE İSTATİSTİKLERİ */}
      {(card.total_txn_count || 0) > 0 && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] bg-info/20 text-info whitespace-nowrap"
          title={`${card.total_txn_count} toplam işlem · ${card.success_txn_count} başarılı · ${card.failed_txn_count} başarısız`}
        >
          📊 {card.success_txn_count || 0}✓ / {card.failed_txn_count || 0}✗
        </span>
      )}

      {/* ⭐ 12. SON DECLINE NEDENİ */}
      {(card.failed_txn_count || 0) > 0 && card.last_decline_reason_short && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] bg-dead/20 text-dead whitespace-nowrap"
          title={
            card.last_decline_reason_long ??
            card.last_decline_message ??
            undefined
          }
        >
          ❗ {card.last_decline_reason_short}
        </span>
      )}

      {/* ⭐ 13. AKSİYONLAR / LOADER */}
      <div className="flex items-center gap-1 ml-auto">
        {/* 🔗 ENROLL */}
        {onEnroll && !isEnrolled && (
          <button
            onClick={(e) => { e.stopPropagation(); onEnroll(card); }}
            disabled={isLoading}
            className="flex h-6 w-6 items-center justify-center rounded bg-sky-400/15 text-[10px] text-sky-300 hover:bg-sky-400/25 disabled:opacity-40"
            title="Provider enrollment oluştur"
          >
            🔗
          </button>
        )}

        {/* 💳 CHARGE */}
        {onCharge && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCharge(card);
            }}
            disabled={isLoading}
            className="text-[10px] px-2 h-6 rounded bg-accent/20 hover:bg-accent/40 text-accent flex items-center justify-center disabled:opacity-40 font-bold"
            title="Charge"
          >
            💳
          </button>
        )}

        {/* 🔄 RECHECK */}
        {recheckLoading ? (
          <RecheckSpinner />
        ) : (
          onRecheck && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRecheck(card);
              }}
              disabled={isLoading}
              className="text-[10px] w-6 h-6 rounded bg-[#2196F3]/20 hover:bg-[#2196F3]/40 text-[#2196F3] flex items-center justify-center disabled:opacity-40"
              title="Tekrar Check"
            >
              🔄
            </button>
          )
        )}

        {/* 💰 BALANCE */}
        {balanceLoading ? (
          <BalanceSpinner />
        ) : (
          onBalanceCheck && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBalanceCheck(card);
              }}
              disabled={isLoading}
              className="text-[10px] w-6 h-6 rounded bg-[#9C27B0]/20 hover:bg-[#9C27B0]/40 text-[#9C27B0] flex items-center justify-center disabled:opacity-40"
              title="Bakiye Sorgula"
            >
              💰
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ⭐ REASON SHORT — insan okunur kısa açıklama
// ------------------------------------------------------------
function humanizeReasonShort(reason: string): string {
  const map: Record<string, string> = {
    insufficient_funds: 'yetersiz bakiye',
    limit_exceeded: 'limit aşıldı',
    activity_limit_exceeded: 'aktivite limiti',
    expired_card: 'süresi dolmuş',
    pick_up_card: 'kart saklayın',
    invalid_account: 'geçersiz hesap',
    invalid_card_number: 'geçersiz kart no',
    invalid_card_type: 'desteklenmeyen kart',
    no_account: 'hesap yok',
    restricted_card: 'kısıtlı kart',
    revoked_card: 'iptal edilmiş',
    cvv_mismatch: 'CVV hatalı',
    avs_mismatch: 'AVS hatalı',
    avs_rejected: 'AVS reddedildi',
    cvv_rejected: 'CVV reddedildi',
    security_violation: 'güvenlik ihlali',
    fraudulent: 'şüpheli işlem',
    declined: 'reddedildi',
    do_not_honor: 'do not honor',
    duplicate: 'tekrarlanan',
    duplicate_transaction: 'tekrarlanan',
    not_allowed: 'işleme izin yok',
    transaction_not_allowed: 'işlem yasak',
    invalid_expiry: 'geçersiz tarih',
    invalid_expiration_date: 'geçersiz tarih',
    invalid_pan: 'geçersiz PAN',
    missing_fields: 'eksik bilgi',
    provider_error: 'sağlayıcı hatası',
    provider_timeout: 'zaman aşımı',
    invalid_response: 'geçersiz yanıt',
    token_failed: 'token hatası',
    token_already_used: 'token kullanılmış',
    unknown: 'bilinmiyor',
    unknown_response: 'bilinmiyor',
  };
  return map[reason] || reason;
}

// ------------------------------------------------------------
// ⭐ ZAMAN FORMAT
// ------------------------------------------------------------
function formatLastChecked(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'şimdi';
    if (diffMin < 60) return `${diffMin} dk önce`;
    if (diffHour < 24) return `${diffHour} sa önce`;
    if (diffDay < 7) return `${diffDay} gün önce`;

    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  } catch {
    return '';
  }
}

// ------------------------------------------------------------
// LOADER: Recheck — Dairesel spinner (mavi)
// ------------------------------------------------------------
function RecheckSpinner() {
  return (
    <div
      className="flex items-center justify-center w-6 h-6"
      title="Check ediliyor..."
    >
      <svg
        className="animate-spin"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="#2196F3"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="50"
          strokeDashoffset="20"
          opacity="0.3"
        />
        <path
          d="M21 12a9 9 0 0 1-9 9"
          stroke="#2196F3"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// ------------------------------------------------------------
// LOADER: Balance — Para ikonu pulse
// ------------------------------------------------------------
function BalanceSpinner() {
  return (
    <div
      className="relative flex items-center justify-center w-6 h-6"
      title="Bakiye sorgulanıyor..."
    >
      <div className="absolute inset-0 rounded bg-[#9C27B0]/20 animate-ping" />
      <span className="relative text-[10px] animate-pulse">💰</span>
    </div>
  );
}
