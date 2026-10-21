// ============================================================
// REASON MAPPER
// Tek kaynak: reason → { short, long, severity } çevirisi
// Frontend ve backend aynı haritayı kullanır.
// ============================================================

const REASON_MAP = {
  // ----------------------------------------------------------
  // ✅ BAŞARI
  // ----------------------------------------------------------
  approved: {
    short: 'Onaylandı',
    long: 'İşlem başarıyla onaylandı.',
    severity: 'low',
  },
  captured: {
    short: 'Capture edildi',
    long: 'Preauth tutarı paraya çevrildi.',
    severity: 'low',
  },
  refunded: {
    short: 'İade edildi',
    long: 'İşlem iade edildi.',
    severity: 'low',
  },
  partial_refund: {
    short: 'Kısmi iade',
    long: 'Belirtilen tutar kadar iade yapıldı.',
    severity: 'low',
  },
  voided: {
    short: 'İptal edildi',
    long: 'İşlem void edildi.',
    severity: 'low',
  },

  // ----------------------------------------------------------
  // ❌ KART BAZLI REDDİ — banka/provider'ın kart için verdiği yanıt
  // ----------------------------------------------------------
  insufficient_funds: {
    short: 'Yetersiz bakiye',
    long: 'Kartın bakiyesi veya kullanılabilir limiti yetersiz.',
    severity: 'medium',
  },
  limit_exceeded: {
    short: 'Limit aşıldı',
    long: 'Kartın günlük/aylık işlem limiti aşılmış.',
    severity: 'medium',
  },
  activity_limit_exceeded: {
    short: 'Aktivite limiti',
    long: 'Kart sahibinin işlem aktivitesi limitine ulaşıldı.',
    severity: 'medium',
  },
  expired_card: {
    short: 'Kart süresi dolmuş',
    long: 'Kartın son kullanma tarihi geçmiş.',
    severity: 'high',
  },
  pick_up_card: {
    short: 'Kart saklayın',
    long: 'Kart çalıntı/kayıp olarak işaretli. Fiziksel kartı saklayın.',
    severity: 'critical',
  },
  invalid_account: {
    short: 'Geçersiz hesap',
    long: 'Kart numarası geçersiz veya hesap kapatılmış.',
    severity: 'high',
  },
  invalid_card_number: {
    short: 'Geçersiz kart no',
    long: 'Kart numarası geçersiz.',
    severity: 'high',
  },
  invalid_card_type: {
    short: 'Desteklenmeyen kart',
    long: 'Bu kart tipi işlem için desteklenmiyor.',
    severity: 'medium',
  },
  no_account: {
    short: 'Hesap yok',
    long: 'Kartın bağlı olduğu hesap bulunamadı.',
    severity: 'high',
  },
  restricted_card: {
    short: 'Kısıtlı kart',
    long: 'Kart işlem için kısıtlanmış.',
    severity: 'high',
  },
  revoked_card: {
    short: 'İptal edilmiş kart',
    long: 'Kart banka tarafından iptal edilmiş.',
    severity: 'high',
  },
  cvv_mismatch: {
    short: 'CVV hatalı',
    long: 'CVV kodu kart ile eşleşmiyor.',
    severity: 'medium',
  },
  avs_mismatch: {
    short: 'AVS hatalı',
    long: 'Adres/postakodu bilgileri banka kaydıyla eşleşmiyor.',
    severity: 'medium',
  },
  avs_rejected: {
    short: 'AVS reddedildi',
    long: 'Adres doğrulaması başarısız.',
    severity: 'medium',
  },
  cvv_rejected: {
    short: 'CVV reddedildi',
    long: 'CVV doğrulaması başarısız.',
    severity: 'medium',
  },
  security_violation: {
    short: 'Güvenlik ihlali',
    long: 'Banka güvenlik nedeniyle işlemi reddetti.',
    severity: 'high',
  },
  fraudulent: {
    short: 'Şüpheli işlem',
    long: 'Banka işlemi fraud şüphesiyle reddetti.',
    severity: 'critical',
  },
  declined: {
    short: 'Reddedildi',
    long: 'Banka veya ödeme sağlayıcısı işlemi reddetti; ayrıntılı neden yanıt koduna bağlıdır.',
    severity: 'medium',
  },
  do_not_honor: {
    short: 'Do not honor',
    long: 'Banka işlemi onaylamadı.',
    severity: 'medium',
  },
  duplicate: {
    short: 'Tekrarlanan işlem',
    long: 'Aynı işlem kısa süre önce yapılmış.',
    severity: 'low',
  },
  duplicate_transaction: {
    short: 'Tekrarlanan işlem',
    long: 'Aynı işlem zaten kayıtlı.',
    severity: 'low',
  },
  not_allowed: {
    short: 'İşleme izin yok',
    long: 'Bu kart bu tür işleme izinli değil.',
    severity: 'medium',
  },
  transaction_not_allowed: {
    short: 'İşlem yasak',
    long: 'Kart bu işlem tipine kapalı.',
    severity: 'medium',
  },
  invalid_expiry: {
    short: 'Geçersiz son kullanma',
    long: 'Son kullanma tarihi geçersiz formatta.',
    severity: 'high',
  },
  invalid_expiration_date: {
    short: 'Geçersiz son kullanma',
    long: 'Kartın son kullanma tarihi geçersiz.',
    severity: 'high',
  },
  invalid_pan: {
    short: 'Geçersiz PAN',
    long: 'Kart numarası geçersiz.',
    severity: 'high',
  },
  missing_fields: {
    short: 'Eksik bilgi',
    long: 'İşlem için gerekli alanlar eksik.',
    severity: 'low',
  },

  // ----------------------------------------------------------
  // ⚠️ PROVIDER / GEÇİCİ HATALAR — failover ile düzelebilir
  // ----------------------------------------------------------
  provider_error: {
    short: 'Sağlayıcı hatası',
    long: 'Ödeme sağlayıcısı geçici olarak yanıt vermedi. Tekrar deneyin.',
    severity: 'medium',
  },
  provider_timeout: {
    short: 'Zaman aşımı',
    long: 'Ödeme sağlayıcısı zamanında yanıt vermedi.',
    severity: 'medium',
  },
  network_error: {
    short: 'Ağ hatası',
    long: 'Ödeme sağlayıcısına ulaşılamadı. Bağlantıyı kontrol edin.',
    severity: 'medium',
  },
  invalid_response: {
    short: 'Geçersiz yanıt',
    long: 'Sağlayıcıdan beklenmeyen bir yanıt geldi.',
    severity: 'medium',
  },
  token_failed: {
    short: 'Token oluşturulamadı',
    long: 'Kart tokenize edilemedi.',
    severity: 'medium',
  },
  token_already_used: {
    short: 'Token kullanılmış',
    long: 'Kart tokenı daha önce kullanılmış.',
    severity: 'medium',
  },

  // ----------------------------------------------------------
  // 🔧 YAPILANDIRMA HATALARI — kullanıcı düzeltemez, yönetici gerekli
  // ----------------------------------------------------------
  provider_config_error: {
    short: 'Sağlayıcı yapılandırma hatası',
    long: 'Sağlayıcı yapılandırması geçersiz (merchant/terminal/anahtar). Yöneticiye bildirin.',
    severity: 'high',
  },
  all_providers_down: {
    short: 'Tüm sağlayıcılar kapalı',
    long: 'Kullanılabilir hiçbir ödeme sağlayıcısı yok. Yöneticiye bildirin.',
    severity: 'critical',
  },

  // ----------------------------------------------------------
  // 🚨 KOD HATALARI — provider değil, sunucu tarafı bug
  // ----------------------------------------------------------
  internal_error: {
    short: 'Sunucu hatası',
    long: 'Sunucu tarafında bir yazılım hatası oluştu. Yöneticiye bildirin.',
    severity: 'high',
  },

  // ----------------------------------------------------------
  // ❓ BİLİNMEYEN
  // ----------------------------------------------------------
  unknown: {
    short: 'Bilinmeyen hata',
    long: 'Bilinmeyen bir sebeple işlem başarısız oldu.',
    severity: 'medium',
  },
  unknown_response: {
    short: 'Bilinmeyen yanıt',
    long: 'Sağlayıcı tanımsız bir yanıt döndü.',
    severity: 'medium',
  },
};

// ============================================================
// mapReason — tek noktadan çeviri
// ============================================================
function mapReason(reason, rawMessage = null) {
  const r = String(reason || '').toLowerCase().trim();

  const match = REASON_MAP[r];
  if (match) {
    return {
      short: match.short,
      long: match.long,
      severity: match.severity,
      raw: rawMessage || null,
    };
  }

  // error_XXX → banka özel kod
  if (r.startsWith('error_')) {
    return {
      short: 'Banka hatası',
      long: rawMessage || 'Banka özel bir hata kodu döndü.',
      severity: 'medium',
      raw: rawMessage,
    };
  }

  // processor_XXX → banka özel kod
  if (r.startsWith('processor_')) {
    return {
      short: 'İşlemci hatası',
      long: rawMessage || 'Processor özel bir hata kodu döndü.',
      severity: 'medium',
      raw: rawMessage,
    };
  }

  // sdk_XXX → provider SDK hatası
  if (r.startsWith('sdk_')) {
    return {
      short: 'SDK hatası',
      long: rawMessage || 'Sağlayıcı SDK\'sı hata döndürdü.',
      severity: 'medium',
      raw: rawMessage,
    };
  }

  // Bilinmeyen — reason'ı olduğu gibi göster
  return {
    short: reason || 'Reddedildi',
    long: rawMessage || 'Bilinmeyen sebep',
    severity: 'medium',
    raw: rawMessage,
  };
}

// ============================================================
// STATUS → Türkçe
// ============================================================
function statusToTurkish(status) {
  const map = {
    approved: 'Onaylandı',
    declined: 'Reddedildi',
    error: 'Hata',
    captured: 'Capture edildi',
    refunded: 'İade edildi',
    partially_refunded: 'Kısmi iade',
    voided: 'İptal edildi',
    unknown: 'Bilinmiyor',
    internal_error: 'Sunucu hatası',       // ⭐ yeni
    provider_error: 'Sağlayıcı hatası',    // ⭐ yeni (audit status için)
    provider_timeout: 'Zaman aşımı',       // ⭐ yeni
    network_error: 'Ağ hatası',            // ⭐ yeni
  };
  return map[String(status || '').toLowerCase()] || status || '—';
}

// ============================================================
// Yardımcı: severity seviyesi kontrolü
// ============================================================
function isErrorSeverity(severity) {
  return ['high', 'critical'].includes(String(severity || '').toLowerCase());
}

function isTransientReason(reason) {
  const r = String(reason || '').toLowerCase();
  return ['provider_error', 'provider_timeout', 'network_error', 'invalid_response']
    .includes(r);
}

module.exports = {
  mapReason,
  statusToTurkish,
  isErrorSeverity,
  isTransientReason,
  REASON_MAP,
};