// ============================================================
// CLOVER PROVIDER — v10
//
// ⭐ v10 değişiklikler:
//  - apiKey ReferenceError FIX: `const apiKey` _createToken içinde tanımlı
//  - currency: config.currency || 'USD' (SNSAUTO → CAD, clover3 → USD)
//  - TÜM log'larda `[CLOVER-<providerKey>-<tag>]` prefix
//    → hangi Clover'a gittiği kesin görünür
//  - 401/400/402 response body loglanır
//  - publicKey + privateKey UUID format kontrolü
//
// ⭐ Korunanlar:
//  - Token: apikey header (publicKey) → token.clover.com
//  - Charge: Bearer (privateKey) → scl.clover.com
//  - ecomind: 'moto', x-forwarded-for: 127.0.0.1
//  - verify() $0.00 Account Verification
// ============================================================
const BaseProvider = require('../core/BaseProvider');

class CloverProvider extends BaseProvider {
  constructor(key, config) {
    // BaseProvider hem `(key, config)` hem `({key, config})` kabul eder
    if (config === undefined && typeof key === 'object' && key !== null) {
      config = key;
      key = 'clover3';
    }
    super(key, config);
    this.config = config;

    // UUID format uyarıları — erken tespit
    for (const field of ['publicKey', 'privateKey']) {
      const v = String(config[field] || '').trim();
      if (v && !/^[0-9a-fA-F-]{36}$/.test(v)) {
        console.warn(
          `[CLOVER-INIT][${this.key}] ⚠ ${field} UUID formatında değil: ` +
          `${v.slice(0, 8)}... (${v.length} karakter)`
        );
      }
    }

    if (!config.tokenUrl || !config.chargeUrl) {
      console.warn(
        `[CLOVER-INIT][${this.key}] ⚠ tokenUrl veya chargeUrl eksik — ` +
        `provider çalışmayacak`
      );
    }
  }

  // ============================================================
  // Log prefix — hangi Clover olduğunu her satırda gösterir
  // ============================================================
  _p(tag) {
    return `[CLOVER-${this.key}-${tag}]`;
  }

  // ============================================================
  // Mesaj normalizasyonu — obje sızmasını engeller
  // ============================================================
  _safeStr(v, fallback = null) {
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'object') {
      if (typeof v.message === 'string') return v.message;
      if (typeof v.error === 'string') return v.error;
      try {
        const s = JSON.stringify(v);
        return s.length > 500 ? s.slice(0, 500) + '…' : s;
      } catch (_) {
        return String(v);
      }
    }
    return String(v);
  }

  // ============================================================
  // Kart doğrulama
  // ============================================================
  _parseExpiry(card) {
    let expMonth = card.expMonth;
    let expYear = card.expYear;
    if ((!expMonth || !expYear) && card.exp) {
      const parts = String(card.exp).split('/');
      expMonth = Number(parts[0]);
      const yearPart = parts[1] || '';
      expYear = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
    }
    return { expMonth, expYear };
  }

  _validateCard(card) {
    const cleanPan = card.pan ? String(card.pan).replace(/\D/g, '') : '';

    if (!cleanPan || cleanPan.length < 12 || cleanPan.length > 19) {
      return { ok: false, reason: 'invalid_pan', raw: { message: 'Invalid PAN length' } };
    }
    if (!/^\d+$/.test(cleanPan)) {
      return { ok: false, reason: 'invalid_pan', raw: { message: 'PAN contains non-numeric characters' } };
    }

    const { expMonth, expYear } = this._parseExpiry(card);

    if (!expMonth || expMonth < 1 || expMonth > 12) {
      return { ok: false, reason: 'invalid_expiry', raw: { message: `Invalid expMonth: ${expMonth}` } };
    }
    if (!expYear || expYear < 2024 || expYear > 2099) {
      return { ok: false, reason: 'invalid_expiry', raw: { message: `Invalid expYear: ${expYear}` } };
    }

    return { ok: true, pan: cleanPan, expMonth, expYear };
  }

  // ============================================================
  // PREAUTH / SALE / VERIFY — Public API
  // ============================================================
  async preauth(card, amount, proxyStr = null) {
    // İki kullanım şekli:
    //   preauth(card, amount)         → full card → token + charge
    //   preauth(paymentMethodId, ...) → "clv_..." token → sadece charge
    if (typeof card === 'string') {
      return this.preAuth(card, amount, proxyStr);
    }
    return this._chargeWithCapture(card, amount, false, proxyStr, 'PREAUTH');
  }

  async preAuth(paymentMethodId, amount, proxyStr = null) {
    return this._chargeWithToken(paymentMethodId, amount, false, proxyStr, 'POS-PREAUTH');
  }

  async sale(card, amount, proxyStr = null) {
    if (typeof card === 'string') {
      return this._chargeWithToken(card, amount, true, proxyStr, 'POS-SALE');
    }
    return this._chargeWithCapture(card, amount, true, proxyStr, 'SALE');
  }

  // ============================================================
  // Token'lı akış (POS için)
  // ============================================================
  async _chargeWithToken(paymentMethodId, amount, capture, proxyStr = null, tag = 'TOKEN') {
    if (!/^clv_[A-Za-z0-9]+$/.test(String(paymentMethodId || ''))) {
      return {
        success: false,
        reason: 'invalid_payment_method',
        message: 'Clover token gerekli (clv_...).',
      };
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return { success: false, reason: 'invalid_amount', message: 'Tutar pozitif olmalı.' };
    }
    return this._createCharge({
      amountCents: Math.round(value * 100),
      capture,
      source: paymentMethodId,
      tag,
      proxyStr,
    });
  }

  // ============================================================
  // Full card akış (token + charge)
  // ============================================================
  async _chargeWithCapture(card, amount, captureFlag, proxyStr = null, tag = 'CHARGE') {
  const v = this._validateCard(card);
  if (!v.ok) {
    console.error(`${this._p(tag)} ❌ Kart doğrulaması: ${v.reason}`);
    return { success: false, reason: v.reason, raw: v.raw };
  }
  const { pan, expMonth, expYear } = v;

  const amountCents = Math.round(Number(amount) * 100);
  if (amountCents <= 0) {
    return { success: false, reason: 'invalid_amount', message: 'Tutar sıfırdan büyük olmalı.' };
  }

  const currency = this.config.currency || 'USD';
  console.log(
    `${this._p(tag)} $${amount} → ${amountCents} cent (capture=${captureFlag}, currency=${currency})`
  );

  // ⭐ v11: ECOM retry destekli akış
  return this._chargeWithEcomRetry({
    cardData: { pan, expMonth, expYear, cvv: card.cvv },
    amountCents,
    capture: captureFlag === true,
    tag,
    proxyStr,
  });
}

  // ============================================================
  // TOKEN OLUŞTUR — token.clover.com
  // apikey: publicKey (UUID)
  // ============================================================
  async _createToken(card, tag = 'TOKEN') {
    const { config } = this;
    const { pan, expMonth, expYear, cvv } = card;

    // ⭐ v10: apiKey burada tanımlı — ReferenceError yok
    const apiKey = config.publicKey || config.apiToken;

    if (!apiKey) {
      throw new Error(`PROVIDER_ERROR: Clover ${tag} - publicKey config'te yok`);
    }

    const expYear2 = String(expYear).slice(-2);
    const expMonth2 = String(expMonth).padStart(2, '0');

    const requestBody = {
      card: {
        number: String(pan),
        exp_month: expMonth2,
        exp_year: expYear2,
        cvv: String(cvv || ''),
      },
      multipay: false,
    };

    console.log(
      `${this._p(tag + '-TOKEN')} PAN: ${String(pan).slice(0, 6)}****${String(pan).slice(-4)}`
    );
    console.log(
      `${this._p(tag + '-TOKEN')} apikey: ${String(apiKey).slice(0, 12)}... ` +
      `(merchant=${config.merchantId || 'YOK'})`
    );
    console.log(`${this._p(tag + '-TOKEN')} URL: ${config.tokenUrl}`);

    let tokenRes;
    try {
      tokenRes = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          apikey: apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
    } catch (fetchErr) {
      console.error(`${this._p(tag + '-TOKEN')} 💥 Fetch: ${fetchErr.message}`);
      throw new Error(
        `PROVIDER_ERROR: Clover ${tag} token fetch - ${this._safeStr(fetchErr.message, 'network')}`
      );
    }

    const tokenText = await tokenRes.text();
    console.log(`${this._p(tag + '-TOKEN')} HTTP ${tokenRes.status}`);

    // ---- 401 / 403 ----
    if (tokenRes.status === 401 || tokenRes.status === 403) {
      console.error(
        `${this._p(tag + '-TOKEN')} 🚨 ${tokenRes.status} UNAUTHORIZED\n` +
        `   apikey: ${String(apiKey).slice(0, 12)}...\n` +
        `   merchantId: ${config.merchantId || 'YOK'}\n` +
        `   body: ${tokenText.substring(0, 300)}\n` +
        `   → Clover dashboard'da publicKey'in geçerli olduğunu kontrol et`
      );
      throw new Error(
        `PROVIDER_ERROR: Clover ${tag} token ${tokenRes.status} - key geçersiz (${tokenText.substring(0, 150)})`
      );
    }

    if (tokenRes.status === 429) {
      throw new Error(`PROVIDER_ERROR: Clover ${tag} token 429 - rate limit`);
    }
    if (tokenRes.status >= 500) {
      throw new Error(`PROVIDER_ERROR: Clover ${tag} token ${tokenRes.status} - sunucu hatası`);
    }
    if (!tokenText || tokenText.trim() === '') {
      throw new Error(`PROVIDER_ERROR: Clover ${tag} token boş (HTTP ${tokenRes.status})`);
    }

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch (_) {
      console.error(`${this._p(tag + '-TOKEN')} Parse hatası: ${tokenText.substring(0, 300)}`);
      throw new Error(`PROVIDER_ERROR: Clover ${tag} token parse`);
    }

    if (!tokenData.id) {
      console.error(
        `${this._p(tag + '-TOKEN')} Token yok: ${JSON.stringify(tokenData).substring(0, 300)}`
      );

      if (tokenData.error) {
        const code = String(tokenData.error.code || '').toLowerCase();
        const msg = String(tokenData.error.message || '').toLowerCase();
        const safeMessage = this._safeStr(tokenData.error.message, null);

        if (code === 'incorrect_number' || code === 'invalid_request') {
          return { success: false, reason: 'invalid_pan', message: safeMessage || 'Geçersiz kart numarası', raw: tokenData };
        }
        if (code === 'incorrect_cvc') {
          return { success: false, reason: 'cvv_mismatch', message: safeMessage || 'CVV hatalı', raw: tokenData };
        }
        if (code === 'expired_card') {
          return { success: false, reason: 'expired_card', message: safeMessage || 'Kart süresi dolmuş', raw: tokenData };
        }
        if (code === 'invalid_expiry_month' || code === 'invalid_expiry_year') {
          return { success: false, reason: 'invalid_expiry', message: safeMessage || 'Geçersiz son kullanma tarihi', raw: tokenData };
        }
        if (code === 'invalid_card_type') {
          return { success: false, reason: 'invalid_card_type', message: safeMessage || 'Desteklenmeyen kart tipi', raw: tokenData };
        }
        if (code === 'missing') {
          return { success: false, reason: 'token_failed', message: safeMessage || 'Eksik alan', raw: tokenData };
        }
        if (
          msg.includes('api key') ||
          msg.includes('authentication') ||
          code === 'authentication_error' ||
          code === 'unauthorized'
        ) {
          throw new Error(`PROVIDER_ERROR: Clover ${tag} token - ${safeMessage || 'auth'}`);
        }
      }

      return {
        success: false,
        reason: 'token_failed',
        message: this._safeStr(tokenData.error?.message || tokenData.message, 'Token oluşturulamadı'),
        raw: tokenData,
      };
    }

    return { success: true, tokenId: tokenData.id, raw: tokenData };
  }

  // ============================================================
  // CHARGE — scl.clover.com
  // Authorization: Bearer privateKey
  // currency: config.currency (SNSAUTO → CAD)
  // ============================================================
  async _createCharge({ amountCents, capture, source, tag = 'CHARGE', ecomind, allowZero = false, proxyStr = null }) {
    const { config } = this;

    if (!allowZero && amountCents <= 0) {
      return { success: false, reason: 'invalid_amount', message: 'Geçersiz tutar.' };
    }

    const clientIp = (typeof proxyStr === 'string' && proxyStr.trim())
      ? proxyStr.trim()
      : '127.0.0.1';

    const currency = config.currency || 'USD';
    const finalEcomind = ecomind || config.ecomind || 'moto';

    const headers = {
      accept: 'application/json',
      Authorization: `Bearer ${config.privateKey}`,
      'content-type': 'application/json',
      'x-forwarded-for': clientIp,
    };

    console.log(
      `${this._p(tag + '-CHARGE')} amountCents=${amountCents} capture=${capture === true} ` +
      `currency=${currency} ecomind=${finalEcomind}`
    );
    console.log(`${this._p(tag + '-CHARGE')} URL: ${config.chargeUrl}`);
    console.log(
      `${this._p(tag + '-CHARGE')} privateKey: ${String(config.privateKey || '').slice(0, 12)}...`
    );

    let chargeRes;
    try {
      chargeRes = await fetch(config.chargeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: amountCents,
          currency,
          capture: capture === true,
          source,
          ecomind: finalEcomind,
        }),
      });
    } catch (fetchErr) {
      console.error(`${this._p(tag + '-CHARGE')} 💥 Fetch: ${fetchErr.message}`);
      throw new Error(
        `PROVIDER_ERROR: Clover ${tag} charge fetch - ${this._safeStr(fetchErr.message, 'network')}`
      );
    }

    const chargeText = await chargeRes.text();
    console.log(`${this._p(tag + '-CHARGE')} HTTP ${chargeRes.status}`);

    // ---- 401 ----
    if (chargeRes.status === 401) {
      console.error(
        `${this._p(tag + '-CHARGE')} 🚨 401 UNAUTHORIZED\n` +
        `   privateKey: ${String(config.privateKey || '').slice(0, 12)}...\n` +
        `   merchantId: ${config.merchantId || 'YOK'}\n` +
        `   body: ${chargeText.substring(0, 300)}\n` +
        `   → privateKey Clover dashboard'da geçerli mi?`
      );
      throw new Error(
        `PROVIDER_ERROR: Clover ${tag} charge 401 - privateKey geçersiz (${chargeText.substring(0, 150)})`
      );
    }

    // ---- 402 card_declined ----
// ---- 402 card_declined ----
// ---- 402 card_declined ----
if (chargeRes.status === 402) {
  let chargeData = {};
  try { chargeData = JSON.parse(chargeText); } catch (_) {}

  const declineCode = String(chargeData.error?.declineCode || '').toLowerCase();
  const providerCode = String(chargeData.error?.code || '').toLowerCase();
  const message = this._safeStr(chargeData.error?.message, null);
  const msg = (message || '').toLowerCase();

  // ⭐ Decline nedenini sınıflandır (Clover'ın ham mesajından)
  let reason = 'declined';

  // 1) Alt-tip: issuer_declined / card_declined → message içeriğiyle ayır
  if (
    declineCode === 'issuer_declined' ||
    declineCode === 'card_declined' ||
    providerCode === 'card_declined' ||
    providerCode === 'processing_error'
  ) {
    if (/insufficient\s*funds?|over\s*limit|yetersiz\s*bakiye/i.test(msg)) {
      reason = 'insufficient_funds';
    } else if (/limit\s*exceeded|activity\s*limit/i.test(msg)) {
      reason = 'limit_exceeded';
    } else if (/expired/i.test(msg)) {
      reason = 'expired_card';
    } else if (/pick\s*up|stolen|lost\s*card/i.test(msg)) {
      reason = 'pick_up_card';
    } else if (/do\s*not\s*honor/i.test(msg)) {
      reason = 'do_not_honor';
    } else if (/cvv|cvc|security\s*code/i.test(msg)) {
      reason = 'cvv_mismatch';
    } else if (/invalid\s*(card|account|number)/i.test(msg)) {
      reason = 'invalid_account';
    } else if (/restricted|blocked|not\s*allowed/i.test(msg)) {
      reason = 'restricted_card';
    }
    // else: generic 'declined'
  }

  // 2) Doğrudan declineCode eşleşmeleri
  if (declineCode === 'insufficient_funds') reason = 'insufficient_funds';
  else if (declineCode === 'expired_card') reason = 'expired_card';
  else if (declineCode === 'incorrect_cvc') reason = 'cvv_mismatch';
  else if (declineCode === 'pick_up_card') reason = 'pick_up_card';
  else if (declineCode === 'do_not_honor') reason = 'do_not_honor';
  else if (declineCode === 'invalid_account') reason = 'invalid_account';

  console.log(
    `${this._p(tag + '-CHARGE')} 402 DECLINED (${declineCode}): ${message} → reason=${reason}`
  );

  return {
    success: false,
    reason,
    message,
    providerCode: this._safeStr(chargeData.error?.code, null),
    declineCode: this._safeStr(chargeData.error?.declineCode, null),
    raw: chargeData,
  };
}

    // ---- 400 ----
    if (chargeRes.status === 400) {
      let chargeData = {};
      try { chargeData = JSON.parse(chargeText); } catch (_) {}
      console.error(
        `${this._p(tag + '-CHARGE')} 🚨 400 BAD REQUEST\n` +
        `   currency: ${currency}\n` +
        `   body: ${chargeText.substring(0, 300)}\n` +
        `   → Currency mismatch ise config.currency yanlış`
      );
      throw new Error(
        `PROVIDER_ERROR: Clover ${tag} charge 400 - ` +
        `${chargeData.error?.message || chargeText.substring(0, 100)}`
      );
    }

    if (chargeRes.status === 403) {
      throw new Error(`PROVIDER_ERROR: Clover ${tag} charge 403 - merchant kapalı`);
    }
    if (chargeRes.status === 429) {
      throw new Error(`PROVIDER_ERROR: Clover ${tag} charge 429 - rate limit`);
    }
    if (chargeRes.status >= 500) {
      throw new Error(`PROVIDER_ERROR: Clover ${tag} charge ${chargeRes.status}`);
    }
    if (!chargeText || chargeText.trim() === '') {
      throw new Error(`PROVIDER_ERROR: Clover ${tag} charge boş (HTTP ${chargeRes.status})`);
    }

    let chargeData;
    try {
      chargeData = JSON.parse(chargeText);
    } catch (_) {
      console.error(`${this._p(tag + '-CHARGE')} Parse: ${chargeText.substring(0, 300)}`);
      throw new Error(`PROVIDER_ERROR: Clover ${tag} charge parse`);
    }

    // ---- Başarılı ----
    if (
      chargeData.paid === true ||
      chargeData.captured === true ||
      chargeData.status === 'succeeded' ||
      chargeData.status === 'authorized' ||
      chargeData.status === 'captured'
    ) {
      console.log(`${this._p(tag + '-CHARGE')} ✅ Onaylandı: ${chargeData.id}`);
      return {
        success: true,
        reason: 'approved',
        authCode: chargeData.auth_code || null,
        transactionId: chargeData.id,
        providerKey: this.key,
        providerName: this.name,
        merchantId: this.config.merchantId || null,
        raw: chargeData,
      };
    }

    // ---- Hata objesi ----
    if (chargeData.error) {
      const code = String(chargeData.error.code || '').toLowerCase();
      const msg = String(chargeData.error.message || '').toLowerCase();
      const safeMessage = this._safeStr(chargeData.error.message, null);

      console.log(`${this._p(tag + '-CHARGE')} Hata: code=${code} msg=${msg}`);

      // inv term id → config hatası → failover
      if (/inv\s*term\s*id/i.test(msg)) {
        console.error(
          `${this._p(tag + '-CHARGE')} 🚨 TERMINAL/MERCHANT CONFIG HATASI\n` +
          `   msg=${safeMessage}\n` +
          `   merchantId=${config.merchantId || 'YOK'}\n` +
          `   ecomind=${finalEcomind}`
        );
        throw new Error(
          `PROVIDER_ERROR: Clover ${tag} - ${safeMessage || 'merchant/terminal config'}`
        );
      }

      // Provider/API hataları → failover
      if (
        code === 'authentication_error' ||
        code === 'unauthorized' ||
        code === 'rate_limit' ||
        msg.includes('api key') ||
        msg.includes('authentication') ||
        msg.includes('merchant account is not open') ||
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('sale count per card') ||
        msg.includes('sale count per ip') ||
        msg.includes('greater than configured')
      ) {
        console.error(`${this._p(tag + '-CHARGE')} Provider hatası (failover): ${code}`);
        throw new Error(
          `PROVIDER_ERROR: Clover ${tag} - ${safeMessage || code || 'provider error'}`
        );
      }

      // Kart bazlı ret → DEAD
      let reason = 'declined';
      if (code === 'expired_card') reason = 'expired_card';
      else if (code === 'incorrect_cvc') reason = 'cvv_mismatch';
      else if (code === 'token_already_used') reason = 'token_already_used';
      else if (code === 'card_on_file_missing') reason = 'invalid_account';
      else if (msg.includes('do not honor')) reason = 'do_not_honor';
      else if (msg.includes('insufficient')) reason = 'insufficient_funds';
      else if (msg.includes('pick up') || msg.includes('stolen')) reason = 'pick_up_card';
      else if (msg.includes('invalid') || msg.includes('cancelled') || msg.includes('closed')) reason = 'invalid_account';
      else if (msg.includes('cvv') || msg.includes('cvc')) reason = 'cvv_mismatch';

      console.log(`${this._p(tag + '-CHARGE')} Kart reddi → ${reason}`);

      return {
        success: false,
        reason,
        message: safeMessage,
        providerCode: this._safeStr(chargeData.error.code, null),
        raw: chargeData,
      };
    }

    // ---- Bilinmeyen ----
    console.warn(
      `${this._p(tag + '-CHARGE')} Bilinmeyen: ${JSON.stringify(chargeData).substring(0, 300)}`
    );
    return {
      success: false,
      reason: 'unknown_response',
      unknown: true,
      message: 'Sağlayıcıdan bilinmeyen yanıt.',
      raw: chargeData,
    };
  }

  // ============================================================
  // CAPTURE
  // ============================================================
  async capture(paymentId, amount, proxyStr = null) {
    const { config } = this;
    const cleanAmount = Math.round(Number(amount) * 100);

    if (!paymentId) {
      return { success: false, reason: 'missing_payment_id', message: 'Payment ID gerekli.' };
    }

    const clientIp = (typeof proxyStr === 'string' && proxyStr.trim())
      ? proxyStr.trim()
      : '127.0.0.1';

    console.log(`${this._p('CAPTURE')} paymentId=${paymentId} amount=${cleanAmount}`);

    let res;
    try {
      res = await fetch(`${config.chargeUrl}/${paymentId}/capture`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${config.privateKey}`,
          'content-type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({ amount: cleanAmount }),
      });
    } catch (err) {
      throw new Error(
        `PROVIDER_ERROR: Clover capture fetch - ${this._safeStr(err.message, 'network')}`
      );
    }

    const text = await res.text();
    console.log(`${this._p('CAPTURE')} HTTP ${res.status}`);

    if (res.status === 401 || res.status === 403) {
      console.error(`${this._p('CAPTURE')} 🚨 ${res.status}: ${text.substring(0, 200)}`);
      throw new Error(`PROVIDER_ERROR: Clover capture ${res.status} - yetki yok`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error('PROVIDER_ERROR: Clover capture parse');
    }

    if (
      data.status === 'captured' ||
      data.status === 'succeeded' ||
      data.captured === true ||
      data.paid === true
    ) {
      console.log(`${this._p('CAPTURE')} ✅ ${data.id || paymentId}`);
      return { success: true, reason: 'captured', transactionId: data.id || paymentId, raw: data };
    }

    if (data.error) {
      const code = String(data.error.code || '').toLowerCase();
      const safeMessage = this._safeStr(data.error.message, null);
      if (code === 'authentication_error' || code === 'unauthorized') {
        throw new Error(`PROVIDER_ERROR: Clover capture - ${safeMessage || 'auth'}`);
      }
      return { success: false, reason: code || 'capture_failed', message: safeMessage, raw: data };
    }

    return { success: false, reason: 'unknown_response', message: 'Bilinmeyen capture yanıtı.', raw: data };
  }

  // ============================================================
  // REFUND
  // ============================================================
  async refund(paymentId, amount, proxyStr = null) {
    const { config } = this;
    const cleanAmount = Math.round(Number(amount) * 100);

    if (!paymentId) {
      return { success: false, reason: 'missing_payment_id', message: 'Payment ID gerekli.' };
    }

    const clientIp = (typeof proxyStr === 'string' && proxyStr.trim())
      ? proxyStr.trim()
      : '127.0.0.1';

    console.log(`${this._p('REFUND')} paymentId=${paymentId} amount=${cleanAmount}`);

    let res;
    try {
      res = await fetch(`${config.chargeUrl}/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${config.privateKey}`,
          'content-type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({ amount: cleanAmount }),
      });
    } catch (err) {
      throw new Error(
        `PROVIDER_ERROR: Clover refund fetch - ${this._safeStr(err.message, 'network')}`
      );
    }

    const text = await res.text();
    console.log(`${this._p('REFUND')} HTTP ${res.status}`);

    if (res.status === 401 || res.status === 403) {
      console.error(`${this._p('REFUND')} 🚨 ${res.status}: ${text.substring(0, 200)}`);
      throw new Error(`PROVIDER_ERROR: Clover refund ${res.status} - yetki yok`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error('PROVIDER_ERROR: Clover refund parse');
    }

    if (data.status === 'refunded' || data.refunded === true || data.type === 'REFUND') {
      console.log(`${this._p('REFUND')} ✅ ${data.id}`);
      return { success: true, reason: 'refunded', message: 'İade başarılı.', raw: data };
    }

    if (data.error) {
      const code = String(data.error.code || '').toLowerCase();
      const safeMessage = this._safeStr(data.error.message, null);
      if (code === 'authentication_error' || code === 'unauthorized') {
        throw new Error(`PROVIDER_ERROR: Clover refund - ${safeMessage || 'auth'}`);
      }
      return { success: false, reason: code || 'refund_failed', message: safeMessage, raw: data };
    }

    return { success: false, reason: 'unknown_response', message: 'Bilinmeyen refund yanıtı.', raw: data };
  }

  // ============================================================
  // VERIFY — $0.00 Account Verification
  // ============================================================
  async verify(card, proxyStr = null, options = {}) {
  // İki çağrı şekli: verify(card, options) vs verify(card, proxyStr, options)
  if (
    proxyStr !== null &&
    typeof proxyStr === 'object' &&
    !Array.isArray(proxyStr) &&
    (options === undefined || options === null || Object.keys(options).length === 0)
  ) {
    options = proxyStr;
    proxyStr = null;
  }
  if (options == null) options = {};

  let amount = Number(
    options.amount != null
      ? options.amount
      : card._amount != null
        ? card._amount
        : 0
  );
  if (!Number.isFinite(amount) || amount < 0) amount = 0;

  const amountCents = Math.round(amount * 100);
  const capture = options.capture === true || card._capture === true;

  const v = this._validateCard(card);
  if (!v.ok) {
    console.error(`${this._p('VERIFY')} ❌ Kart: ${v.reason}`);
    return { success: false, reason: v.reason, message: 'Kart doğrulaması başarısız.', raw: v.raw };
  }
  const { pan, expMonth, expYear } = v;

  console.log(`${this._p('VERIFY')} amount=$${amount.toFixed(2)} (${amountCents} cent) capture=${capture}`);

  // ⭐ v11: ECOM retry destekli akış
  return this._chargeWithEcomRetry({
    cardData: { pan, expMonth, expYear, cvv: card.cvv },
    amountCents,
    capture,
    tag: 'VERIFY',
    proxyStr,
    allowZero: true,
  });
}

// ============================================================
// ⭐ v11: ECOM retry helper
//   İlk deneme moto + restricted_card → yeni token + ecom ile tekrar dene
//   (Clover token single-use; yeni token şart)
// ============================================================
async _chargeWithEcomRetry({
  cardData,
  amountCents,
  capture,
  tag,
  proxyStr,
  allowZero = false,
}) {
  const ecomind = this.config.ecomind || 'moto';

  // 1) İlk deneme (default: moto)
  const tokenResult = await this._createToken(cardData, tag);
  if (!tokenResult.success) return tokenResult;

  console.log(`${this._p(tag)} ✅ Token: ${tokenResult.tokenId}`);

  let result = await this._createCharge({
    amountCents,
    capture,
    source: tokenResult.tokenId,
    tag,
    ecomind,
    allowZero,
    proxyStr,
  });

  // 2) restricted_card + moto → ecom ile yeniden dene
  if (
    !result.success &&
    result.reason === 'restricted_card' &&
    ecomind === 'moto'
  ) {
    console.log(
      `${this._p(tag)} 🔄 restricted_card (moto) → ecom ile yeniden deneniyor...`
    );

    const retryTag = tag + '-ECOM';
    const tokenResult2 = await this._createToken(cardData, retryTag);
    if (!tokenResult2.success) {
      return {
        ...result,
        ecomind,
        retry: {
          attempted: true,
          success: false,
          from: 'moto',
          to: 'ecom',
          step: 'token_create',
          error: tokenResult2.message || tokenResult2.reason,
        },
      };
    }

    console.log(`${this._p(retryTag)} ✅ Token (ecom): ${tokenResult2.tokenId}`);

    const result2 = await this._createCharge({
      amountCents,
      capture,
      source: tokenResult2.tokenId,
      tag: retryTag,
      ecomind: 'ecom',
      allowZero,
      proxyStr,
    });

    if (result2.success) {
      console.log(`${this._p(tag)} ✅ ECOM retry BAŞARILI (moto reddedilmişti)`);
      return {
        ...result2,
        ecomind: 'ecom',
        retriedFrom: 'moto',
        retry: {
          attempted: true,
          success: true,
          from: 'moto',
          to: 'ecom',
          motoReason: result.reason,
          motoMessage: result.message,
        },
      };
    }

    console.log(
      `${this._p(tag)} ❌ ECOM retry de başarısız: ${result2.reason} - ${result2.message || ''}`
    );

    return {
      ...result2,
      ecomind: 'ecom',
      retry: {
        attempted: true,
        success: false,
        from: 'moto',
        to: 'ecom',
        moto: {
          reason: result.reason,
          message: result.message,
          providerCode: result.providerCode,
        },
        ecom: {
          reason: result2.reason,
          message: result2.message,
          providerCode: result2.providerCode,
        },
      },
    };
  }

  return { ...result, ecomind };
}

  // ============================================================
  // Extraction helpers
  // ============================================================
  extractChecks(raw) {
    const cloverSource = raw.source || raw.response?.source;
    return {
      cvc: cloverSource?.cvc_check || null,
      avsAddress: cloverSource?.address_line1_check || null,
      avsZip: cloverSource?.address_zip_check || null,
      networkStatus:
        raw.outcome?.network_status ||
        raw.response?.outcome?.network_status ||
        this._safeStr(raw.error?.message || raw.error?.declineCode, null),
    };
  }


  extractTransaction(raw) {
    return {
      authCode: raw.auth_code || raw.response?.auth_code || null,
      chargeId: raw.id || raw.response?.id || raw.error?.charge || null,
    };
  }

  capabilities() {
    return {
      sale: true,
      preAuthorization: true,
      capture: true,
      refund: true,
      void: false,
      tokenizedPayment: true,
      rawCardVerification: true,
      requiresClientSideTokenization: true,
    };
  }
}

module.exports = CloverProvider;