// ============================================================
// utils/reasonMapper.js
// Reason → { short, long, severity, raw } dönüşümü.
// Tek kaynak: tüm route'lar buradan beslenir.
// ============================================================

const REASONS = {
  // ---------------- SUCCESS ----------------
  approved: { short: 'Onaylandı', long: 'İşlem başarıyla onaylandı.', severity: 'low' },
  hold_for_review: { short: 'İncelemede', long: 'İşlem banka tarafından incelemeye alındı.', severity: 'medium' },

  // ---------------- CARD DECLINES ----------------
  declined: { short: 'Reddedildi', long: 'Kart banka tarafından reddedildi.', severity: 'medium' },
  do_not_honor: { short: 'Do Not Honor', long: 'Banka genel ret cevabı döndü.', severity: 'medium' },
  insufficient_funds: { short: 'Yetersiz bakiye', long: 'Kartta yeterli bakiye bulunmuyor.', severity: 'medium' },
  restricted_card: { short: 'Kısıtlı kart', long: 'Kart bu işlem için kısıtlanmış.', severity: 'medium' },
  expired_card: { short: 'Süresi geçmiş', long: 'Kartın son kullanma tarihi geçmiş.', severity: 'medium' },
  invalid_account: { short: 'Geçersiz hesap', long: 'Kart hesabı geçersiz veya kapalı.', severity: 'medium' },
  invalid_card_number: { short: 'Geçersiz kart no', long: 'Kart numarası geçersiz.', severity: 'medium' },
  invalid_pan: { short: 'Geçersiz PAN', long: 'Kart numarası (PAN) geçersiz.', severity: 'medium' },
  invalid_expiry: { short: 'Geçersiz tarih', long: 'Son kullanma tarihi geçersiz.', severity: 'medium' },
  invalid_card_type: { short: 'Geçersiz kart tipi', long: 'Kart tipi desteklenmiyor.', severity: 'medium' },
  invalid_payment_method: { short: 'Geçersiz ödeme yöntemi', long: 'Ödeme yöntemi geçersiz.', severity: 'medium' },
  pick_up_card: { short: 'Karta el koy', long: 'Banka kartı almaya yönlendirdi.', severity: 'high' },
  currency_mismatch: { short: 'Para birimi uyuşmazlığı', long: 'İşlem para birimi kart ile uyumsuz.', severity: 'medium' },

  // ---------------- AVS / CVV ----------------
  cvv_mismatch: { short: 'CVV uyumsuz', long: 'CVV kodu kart bilgisiyle uyuşmuyor.', severity: 'medium' },
  cvv_rejected: { short: 'CVV reddedildi', long: 'CVV doğrulaması reddedildi.', severity: 'medium' },
  avs_mismatch: { short: 'AVS uyumsuz', long: 'Adres doğrulaması başarısız.', severity: 'medium' },
  avs_rejected: { short: 'AVS reddedildi', long: 'Adres doğrulaması reddedildi.', severity: 'medium' },

  // ---------------- INFRA / PROVIDER ----------------
  provider_error: {
    short: 'Provider hatası',
    long: 'Provider geçici bir hata döndürdü.',
    severity: 'high',
  },
  provider_timeout: {
    short: 'Provider zaman aşımı',
    long: 'Provider zamanında yanıt vermedi.',
    severity: 'high',
  },
  provider_config_error: {
    short: 'Provider kimlik hatası',
    long: 'Provider kimlik bilgileri (API key / transaction key / merchant ID) veya IP whitelist geçersiz. Provider panelini kontrol edin.',
    severity: 'high',
  },
  network_error: {
    short: 'Ağ hatası',
    long: 'Provider ile ağ bağlantısı başarısız.',
    severity: 'high',
  },
  invalid_response: {
    short: 'Geçersiz yanıt',
    long: 'Provider geçersiz veya boş yanıt döndü.',
    severity: 'high',
  },
  unknown_response: {
    short: 'Bilinmeyen yanıt',
    long: 'Provider bilinmeyen bir yanıt kodu döndü.',
    severity: 'medium',
  },
  all_providers_down: {
    short: 'Tüm providerlar kapalı',
    long: 'Hiçbir provider şu anda kullanılabilir değil.',
    severity: 'high',
  },
  internal_error: {
    short: 'Sistem hatası',
    long: 'Beklenmeyen bir sistem hatası oluştu.',
    severity: 'high',
  },

  // ---------------- ZERO-AUTH / LIVE CHECK ----------------
  zero_auth_unsupported: {
    short: 'Zero-auth yok',
    long: '$0 doğrulama bu merchant için desteklenmiyor; $1.2 + void fallback denenecek.',
    severity: 'low',
  },
  invalid_amount: {
    short: 'Geçersiz tutar',
    long: 'İşlem tutarı provider tarafından reddedildi.',
    severity: 'medium',
  },
  amount_required: {
    short: 'Tutar gerekli',
    long: 'Bu işlem için pozitif tutar gerekli.',
    severity: 'medium',
  },

  // ---------------- CAPTURE / VOID / REFUND ----------------
  capture_failed: { short: 'Capture başarısız', long: 'Capture işlemi tamamlanamadı.', severity: 'high' },
  void_failed: { short: 'Void başarısız', long: 'Void işlemi tamamlanamadı.', severity: 'high' },
  refund_failed: { short: 'Refund başarısız', long: 'Refund işlemi tamamlanamadı.', severity: 'high' },
  invalid_transaction_id: { short: 'Geçersiz işlem', long: 'İşlem kimliği geçersiz.', severity: 'high' },
  transaction_not_found: { short: 'İşlem bulunamadı', long: 'Provider tarafında işlem bulunamadı.', severity: 'high' },
  transaction_not_accepted: { short: 'İşlem kabul edilmedi', long: 'Provider işlemi kabul etmedi.', severity: 'high' },
  missing_trans_id: { short: 'İşlem ID yok', long: 'Provider işlem kimliği eksik.', severity: 'high' },
  already_settled: { short: 'Zaten kapatılmış', long: 'İşlem zaten kapatılmış, refund yapılamaz.', severity: 'medium' },
  duplicate_transaction: { short: 'Mükerrer işlem', long: 'Bu işlem kısa süre önce tekrar gönderilmiş.', severity: 'medium' },
  void_not_supported: { short: 'Void desteklenmiyor', long: 'Bu provider void desteklemiyor.', severity: 'medium' },
  sale_not_supported: { short: 'Sale desteklenmiyor', long: 'Bu provider sale desteklemiyor.', severity: 'medium' },
  missing_fields: { short: 'Eksik alanlar', long: 'Zorunlu alanlar eksik.', severity: 'medium' },
  token_failed: { short: 'Token hatası', long: 'Kart token oluşturulamadı.', severity: 'high' },
  token_already_used: { short: 'Token zaten kullanıldı', long: 'Bu token daha önce kullanılmış.', severity: 'medium' },

  // ---------------- MISC ----------------
  recheck_cooldown: { short: 'Cooldown', long: 'Bu kart için kısa süre önce check yapılmış.', severity: 'low' },
  aborted: { short: 'İptal edildi', long: 'İşlem kullanıcı tarafından iptal edildi.', severity: 'low' },
  unknown: { short: 'Bilinmeyen', long: 'Bilinmeyen bir hata oluştu.', severity: 'medium' },
};

function mapReason(reason, message = null) {
  const key = String(reason || 'unknown').toLowerCase();
  const entry = REASONS[key];

  if (entry) {
    return {
      short: entry.short,
      long: message || entry.long,
      severity: entry.severity,
      raw: message || null,
    };
  }

  return {
    short: key.replace(/_/g, ' ').slice(0, 40),
    long: message || `Bilinmeyen durum: ${key}`,
    severity: 'medium',
    raw: message || null,
  };
}

module.exports = { mapReason, REASONS };