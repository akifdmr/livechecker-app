// ============================================================
// services/CardChecker.js — v2
// Kart Kontrol + Provizyon + Capture + Refund Servisi
// Provider-aware (Clover / Moneris / Authorize) + Paralel bulk
//
// ⭐ v2 değişiklikler:
//  - _classifyError() → internal_error | provider_error | network_error |
//    provider_timeout | provider_config_error
//  - Internal error'da FAILOVER YOK (tüm providerlar aynı kod hatası verir)
//  - preAuth() "reason: network_error" hardcoded bug'ı düzeltildi
//  - enrichResult() ERROR_REASONS set'i ile statü belirleme
//  - bulkProcess() internal_error'u error olarak sayıyor
// ============================================================
const { maskPan } = require('../utils/mask');
const config = require('../config');

// ============================================================
// HATA SINIFLANDIRMA — tek kaynak
// ============================================================
const JS_ERROR_NAMES = new Set([
  'ReferenceError', 'TypeError', 'SyntaxError', 'RangeError', 'EvalError', 'URIError',
]);

// Failover yapılmayacak sebepler — kod/config kökenli, tüm providerlarda aynı
const NON_FAILOVER_REASONS = new Set([
  'internal_error',
  'all_providers_down',
]);

// ERROR statüsü üretecek sebepler (DEAD değil)
const ERROR_REASONS = new Set([
  'network_error',
  'provider_error',
  'provider_timeout',
  'provider_config_error',
  'invalid_response',
  'all_providers_down',
  'internal_error',
  'unknown_response',
]);

function classifyError(err) {
  if (!err) return 'internal_error';

  const e = typeof err === 'object' ? err : { message: String(err) };
  const errMsg = String(e.message || e.error || '').trim();
  const errName = String(e.name || 'Error');
  const errLower = errMsg.toLowerCase();

  // 1) Network — fetch/socket seviyesi
  if (
    /fetch failed|network\s*error|network_error|socket hang|premature close|aborted|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ENETUNREACH|EAI_AGAIN|ENOTFOUND/i.test(errMsg)
  ) {
    return 'network_error';
  }

  // 2) Timeout
  if (/timeout|timed out|aborterror|request aborted/i.test(errMsg)) {
    return 'provider_timeout';
  }

  // 3) Provider'lar tarafından fırlatılan PROVIDER_ERROR: prefix
  if (errMsg.startsWith('PROVIDER_ERROR:')) {
    if (/inv\s*term\s*id/i.test(errLower)) return 'provider_config_error';
    if (/missing.*(key|credential|config)|no\s+(key|credential)/i.test(errLower)) {
      return 'provider_config_error';
    }
    // Authentication / rate limit / HTTP 5xx → failover edilebilir
    return 'provider_error';
  }

  // 4) JS kod hataları — ReferenceError, TypeError, SyntaxError vs.
  //    (network check yukarıda olduğu için TypeError: fetch failed buraya düşmez)
  if (JS_ERROR_NAMES.has(errName)) {
    return 'internal_error';
  }

  // 5) Bilinmeyen — internal_error olarak sınıflandır (safer)
  return 'internal_error';
}

// ============================================================
// CardChecker
// ============================================================
class CardChecker {
  constructor(providers, healths, loadBalancer, binDb, externalApi, proxyManager = null) {
    this.providers = providers;
    this.healths = healths;
    this.loadBalancer = loadBalancer;
    this.binDb = binDb;
    this.externalApi = externalApi;
    this.proxyManager = proxyManager;

    this.isDev = config.IS_DEV === true;
    this.appEnv = config.APP_ENV || 'development';
    this.devPriority = config.DEV_PROVIDER_PRIORITY || ['clover3', 'moneris', 'authorize3'];

    this.monerisMode = config.MONERIS_MODE || 'verify';
    this.defaultPreAuthAmount = config.MONERIS_PREAUTH_AMOUNT || 1.0;
    this.preferMoneris = config.MONERIS_PRIORITY === true;
  }

  // ============================================================
  // ORTAM / YARDIMCILAR
  // ============================================================
  setEnvironment({ isDev, appEnv }) {
    this.isDev = isDev === true;
    this.appEnv = appEnv || this.appEnv;
    console.log(`[CardChecker] Ortam: ${this.appEnv} (dev: ${this.isDev})`);
  }

  _isProviderUsable(key) {
    const provider = this.providers[key];
    const health = this.healths[key];
    if (!provider) return false;
    if (health && typeof health.isAvailable === 'function' && !health.isAvailable()) {
      return false;
    }
    return true;
  }

  _getProxy(_manualProxyStr = null) {
    // Processor requests always use the server's direct network connection.
    return { proxy: null, proxyStr: null };
  }

  _recordOutcome({ providerKey, health, proxy, t0, result, error, isNetwork }) {
    const duration = Date.now() - t0;

    if (error) {
      if (health && typeof health.recordError === 'function') {
        health.recordError(error, duration, isNetwork === true);
      }
      if (proxy && this.proxyManager) {
        this.proxyManager.recordFailure(proxy, isNetwork === true);
      }
      return;
    }

    const success = result?.success === true;
    if (health && typeof health.recordSuccess === 'function') {
      health.recordSuccess(duration, success);
    }
    if (proxy && this.proxyManager) {
      if (success || (result?.reason && !/network_error|timeout/i.test(result.reason))) {
        this.proxyManager.recordSuccess(proxy);
      } else {
        this.proxyManager.recordFailure(proxy);
      }
    }
  }

  /**
   * Yakalanan hatayı sınıflandır + 🚨 log (internal error ise).
   * @returns {{ reason: string, isInternal: boolean, isNetwork: boolean }}
   */
  _classifyAndLog(e, providerKey) {
    const reason = classifyError(e);
    const isInternal = reason === 'internal_error';
    const isNetwork = reason === 'network_error';

    if (isInternal) {
      const stackLine = (e?.stack || '').split('\n').slice(1, 4).join('\n   ');
      console.error(
        `[CHECK] 🚨 INTERNAL_ERROR — this is a CODE BUG, not a provider issue\n` +
        `   provider: ${providerKey}\n` +
        `   name: ${e?.name || 'Error'}\n` +
        `   message: ${e?.message || 'unknown'}\n` +
        `   stack:\n   ${stackLine}\n` +
        `   → Bu hata provider değiştirilerek düzelmez; kod fix gerekir.`
      );
    }

    return { reason, isInternal, isNetwork };
  }

  // ============================================================
  // YETENEK KONTROLÜ
  // ============================================================
  _supports(providerKey, method) {
    const p = this.providers[providerKey];
    if (!p) return false;
    if (typeof p[method] === 'function') return true;
    if (method === 'sale' && typeof p.purchase === 'function') return true;
    if (method === 'voidTransaction' && providerKey.startsWith('clover')) return false;
    return false;
  }

  _providerName(providerKey) {
    const p = this.providers[providerKey];
    return p?.name || providerKey;
  }

  // ============================================================
  // DEV PROVIDER SEÇİMİ — FALLBACK
  // ============================================================
  selectDevProvider() {
    const devList = Array.isArray(this.devPriority) ? this.devPriority : [];
    for (const key of devList) {
      if (this._isProviderUsable(key)) {
        console.log(`[CardChecker] Dev provider: ${key}`);
        return key;
      }
    }

    const liveCfg = config.LIVE_CHECK || {};
    const liveList = Array.isArray(liveCfg.providerPriority) ? liveCfg.providerPriority : [];
    for (const key of liveList) {
      if (this._isProviderUsable(key)) {
        console.log(`[CardChecker] Live provider (fallback): ${key}`);
        return key;
      }
    }

    const anyKey = Object.keys(this.providers).find((k) => !!this.providers[k]);
    if (anyKey) {
      console.warn(`[CardChecker] ⚠️ Tüm providerlar unhealthy — "${anyKey}" zorla seçildi`);
      return anyKey;
    }

    console.error('[CardChecker] 🚨 Hiçbir provider yok');
    return null;
  }

  // ============================================================
  // LIVE CHECK (verify)
  // ============================================================
  async checkCard(card, options = {}) {
    const startTime = Date.now();
    const IS_DEV = this.isDev;
    const preferProvider = options.preferProvider || null;

    const hasCvv = card.cvv && card.cvv.length >= 3;
    const resinAvailable = this._isProviderUsable('resin');

    const liveCfg = config.LIVE_CHECK || {};
    const livePrimary = liveCfg.provider || 'moneris';
    const livePriority = Array.isArray(liveCfg.providerPriority)
      ? liveCfg.providerPriority
      : [livePrimary, 'clover3'];

    let currentKey;

    if (preferProvider && this._isProviderUsable(preferProvider)) {
      currentKey = preferProvider;
    } else if (!hasCvv && resinAvailable && liveCfg.preferResinWhenNoCvv !== false) {
      currentKey = 'resin';
    } else {
      currentKey = livePriority.find(
        (k) => this._isProviderUsable(k) && this._supports(k, 'verify')
      );

      if (!currentKey) {
        currentKey = IS_DEV
          ? this.selectDevProvider()
          : this.loadBalancer.selectProvider();
      } else {
        console.log(`[CHECK] Live check provider: ${currentKey} (config priority)`);
      }
    }

    if (!currentKey) {
      return {
        success: false,
        reason: 'all_providers_down',
        status: 'ERROR',
        provider: 'NONE',
        providerKey: 'none',
        actionType: 'verify',
        duration: 0,
        tried: [],
        voided: false,
        failover: true,
      };
    }

    const tried = new Set();
    let lastError = null;
    let lastReason = null;       // ⭐ sınıflandırılmış sebep
    let lastProviderKey = null;  // ⭐ hata veren provider

    while (currentKey && !tried.has(currentKey)) {
      tried.add(currentKey);
      const provider = this.providers[currentKey];

      if (!provider) {
        const fallbacks = this._getFallbacks([...tried], IS_DEV);
        if (fallbacks.length > 0) { currentKey = fallbacks[0]; continue; }
        break;
      }

      const health = this.healths[currentKey];
      const t0 = Date.now();
      const { proxy, proxyStr } = this._getProxy();

      try {
  const result = await provider.verify(card, proxyStr);
  this._recordOutcome({ providerKey: currentKey, health, proxy, t0, result });

  let voided = false;
  const paymentId = result.raw?.id || result.raw?.paymentId || result.raw?.transId;

  if (result.success && paymentId && typeof provider.voidTransaction === 'function') {
    try {
      const voidResult = await provider.voidTransaction(paymentId, proxyStr);
      voided = voidResult.success;
    } catch {}
  }

  // ⭐ BAŞARILI → return
  if (result.success) {
    return {
      ...result,
      provider: provider.name,
      providerKey: currentKey,
      actionType: 'verify',
      duration: Date.now() - startTime,
      tried: [...tried],
      proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      voided,
    };
  }

  // ⭐ BAŞARISIZ — failover denenmeli mi?
  // ⭐ BAŞARISIZ — failover denenmeli mi?
  const FAILOVER_ON_DECLINE = new Set([
    'declined',
    'do_not_honor',
    'restricted_card',
    'currency_mismatch',
    'unknown_response',
    'invalid_response',
    'cvv_mismatch',
    'avs_mismatch',
    'avs_rejected',
    'cvv_rejected',
    // ⭐ YENİ: $0 auth desteklenmeyen merchant
    'invalid_amount',
    'zero_auth_unsupported',
    // ⭐ YENİ: provider config/auth hataları
    'invalid_payment_method',
    'token_failed',
    'token_already_used',
    'invalid_card_type',
    'invalid_expiry',
    'invalid_pan',
  ]);

  if (FAILOVER_ON_DECLINE.has(result.reason)) {
    console.log(
      `[CHECK] ${currentKey} declined (${result.reason}) → failover deneniyor`
    );
    lastError = result.message || result.reason;
    lastReason = result.reason;
    lastProviderKey = currentKey;

    const fallbacks = this._getFallbacks([...tried], IS_DEV);
    const nextKey = fallbacks.find((k) => !tried.has(k));
    if (nextKey) { currentKey = nextKey; continue; }
  }

  // Failover edilemeyen (definitive) decline — return
  return {
    ...result,
    provider: provider.name,
    providerKey: currentKey,
    actionType: 'verify',
    duration: Date.now() - startTime,
    tried: [...tried],
    proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
    voided,
  };
      } catch (e) {
        const { reason, isInternal, isNetwork } = this._classifyAndLog(e, currentKey);

        this._recordOutcome({
          providerKey: currentKey, health, proxy, t0,
          error: e.message || 'unknown', isNetwork,
        });

        lastError = e.message || 'unknown';
        lastReason = reason;
        lastProviderKey = currentKey;

        // ⭐ Internal error → failover YOK (tüm providerlar aynı hatayı verir)
        if (NON_FAILOVER_REASONS.has(reason)) {
          break;
        }

        // Provider/network/timeout hatalarında failover dene
        const fallbacks = this._getFallbacks([...tried], IS_DEV);
        const nextKey = fallbacks.find((k) => !tried.has(k));
        if (nextKey) { currentKey = nextKey; continue; }
        break;
      }
    }

    // ⭐ Loop bitti — sınıflandırılmış reason varsa onu kullan
    const triedArr = [...tried];
    let finalReason;
    let finalStatus = 'ERROR';

    if (triedArr.length === 0) {
      finalReason = 'all_providers_down';
    } else if (lastReason) {
      finalReason = lastReason;
    } else {
      finalReason = 'internal_error';
    }

    return {
      success: false,
      reason: finalReason,
      status: finalStatus,
      provider: lastProviderKey ? this._providerName(lastProviderKey) : 'FAILED',
      providerKey: lastProviderKey || 'none',
      actionType: 'verify',
      error: lastError,
      message: lastError,
      // ⭐ failover: sadece denendiği ve başarısız olduğu zaman true
      failover: !NON_FAILOVER_REASONS.has(finalReason) && triedArr.length > 1,
      internalError: finalReason === 'internal_error',
      duration: Date.now() - startTime,
      tried: triedArr,
      voided: false,
    };
  }

  // ============================================================
  // PRE-AUTH
  // ============================================================
  async preAuth(card, amount, providerKey = null, proxyStr = null) {
    const startTime = Date.now();
    const IS_DEV = this.isDev;

    if (!amount || amount <= 0) throw new Error('preAuth: amount > 0 olmalı');

    let currentKey;
    if (providerKey && this._isProviderUsable(providerKey)) {
      currentKey = providerKey;
    } else if (this.preferMoneris && this._isProviderUsable('moneris')) {
      currentKey = 'moneris';
    } else if (IS_DEV) {
      currentKey = this.selectDevProvider();
    } else {
      currentKey = this.loadBalancer.selectProvider();
    }

    if (!currentKey) {
      return {
        success: false, reason: 'all_providers_down',
        provider: 'NONE', providerKey: 'none',
        actionType: 'preauth', preAuthAmount: amount,
        duration: 0, tried: [], internalError: false,
      };
    }

    const tried = new Set();
    let lastError = null;
    let lastReason = null;
    let lastProviderKey = null;

    while (currentKey && !tried.has(currentKey)) {
      tried.add(currentKey);
      const provider = this.providers[currentKey];

      if (!provider) {
        const fallbacks = this._getFallbacks([...tried], IS_DEV);
        if (fallbacks.length > 0) { currentKey = fallbacks[0]; continue; }
        break;
      }

      const health = this.healths[currentKey];
      const t0 = Date.now();
      const { proxy, proxyStr: finalProxyStr } = this._getProxy(proxyStr);

      try {
        let result;

        if (currentKey === 'moneris' && typeof provider.preAuth === 'function') {
          result = await provider.preAuth(card, amount, finalProxyStr);
        } else if (currentKey.startsWith('clover')) {
          result = await this._cloverPreAuth(provider, card, amount, finalProxyStr);
        } else if (typeof provider.preAuth === 'function') {
          result = await provider.preAuth(card, amount, finalProxyStr);
        } else if (typeof provider.preauth === 'function') {
          result = await provider.preauth(card, amount, finalProxyStr);
        } else {
          throw new Error(`${currentKey} preAuth desteklemiyor`);
        }

        this._recordOutcome({ providerKey: currentKey, health, proxy, t0, result });

        return {
          ...result,
          provider: provider.name,
          providerKey: currentKey,
          actionType: 'preauth',
          preAuthAmount: amount,
          duration: Date.now() - startTime,
          tried: [...tried],
          proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
        };
      } catch (e) {
        const { reason, isInternal, isNetwork } = this._classifyAndLog(e, currentKey);

        this._recordOutcome({
          providerKey: currentKey, health, proxy, t0,
          error: e.message || 'unknown', isNetwork,
        });

        lastError = e.message || 'unknown';
        lastReason = reason;
        lastProviderKey = currentKey;

        if (NON_FAILOVER_REASONS.has(reason)) {
          break;
        }

        const fallbacks = this._getFallbacks([...tried], IS_DEV);
        const nextKey = fallbacks.find((k) => !tried.has(k));
        if (nextKey) { currentKey = nextKey; continue; }
        break;
      }
    }

    // ⭐ v2 fix: hardcoded 'network_error' yerine sınıflandırılmış reason
    const finalReason = lastReason || 'internal_error';

    return {
      success: false,
      reason: finalReason,
      provider: lastProviderKey ? this._providerName(lastProviderKey) : 'FAILED',
      providerKey: lastProviderKey || 'none',
      actionType: 'preauth',
      preAuthAmount: amount,
      error: lastError,
      message: lastError,
      failover: !NON_FAILOVER_REASONS.has(finalReason) && tried.size > 1,
      internalError: finalReason === 'internal_error',
      duration: Date.now() - startTime,
      tried: [...tried],
    };
  }

  async _cloverPreAuth(provider, card, amount, proxyStr) {
    const modifiedCard = { ...card, _amount: amount, _capture: false };
    return await provider.verify(modifiedCard, proxyStr);
  }

  // ============================================================
  // CAPTURE / REFUND (generic — providerKey zorunlu)
  // ============================================================
  async capture(paymentId, amount, providerKey) {
    if (!paymentId) throw new Error('capture: paymentId gerekli');
    if (!amount || amount <= 0) throw new Error('capture: amount > 0 olmalı');
    if (!providerKey) throw new Error('capture: providerKey gerekli');

    const provider = this.providers[providerKey];
    if (!provider) throw new Error(`Provider bulunamadı: ${providerKey}`);

    const { proxy, proxyStr } = this._getProxy();

    try {
      if (typeof provider.capture !== 'function') {
        throw new Error(`${providerKey} capture desteklemiyor`);
      }

      const result = await provider.capture(paymentId, amount, proxyStr);

      if (proxy && this.proxyManager) {
        result.success
          ? this.proxyManager.recordSuccess(proxy)
          : this.proxyManager.recordFailure(proxy);
      }

      return {
        ...result,
        provider: provider.name,
        providerKey,
        actionType: 'capture',
        paymentId,
        capturedAmount: amount,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      };
    } catch (e) {
      const reason = classifyError(e);
      return {
        success: false, reason,
        error: e.message, provider: provider.name, providerKey,
        actionType: 'capture', paymentId, capturedAmount: amount,
        internalError: reason === 'internal_error',
      };
    }
  }

  async refund(paymentId, amount, providerKey) {
    if (!paymentId) throw new Error('refund: paymentId gerekli');
    if (!amount || amount <= 0) throw new Error('refund: amount > 0 olmalı');
    if (!providerKey) throw new Error('refund: providerKey gerekli');

    const provider = this.providers[providerKey];
    if (!provider) throw new Error(`Provider bulunamadı: ${providerKey}`);

    const { proxy, proxyStr } = this._getProxy();

    try {
      if (typeof provider.refund !== 'function') {
        throw new Error(`${providerKey} refund desteklemiyor`);
      }

      const result = await provider.refund(paymentId, amount, proxyStr);

      if (proxy && this.proxyManager) {
        result.success
          ? this.proxyManager.recordSuccess(proxy)
          : this.proxyManager.recordFailure(proxy);
      }

      return {
        ...result,
        provider: provider.name, providerKey,
        actionType: 'refund', paymentId,
        refundedAmount: amount,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      };
    } catch (e) {
      const reason = classifyError(e);
      return {
        success: false, reason,
        error: e.message, provider: provider.name, providerKey,
        actionType: 'refund', paymentId, refundedAmount: amount,
        internalError: reason === 'internal_error',
      };
    }
  }

  // ============================================================
  // COMPLETE / CANCEL (Moneris)
  // ============================================================
  async completePreAuth(paymentId, finalAmount, providerKey = 'moneris') {
    const provider = this.providers[providerKey];
    if (!provider || typeof provider.complete !== 'function') {
      throw new Error(`${providerKey} completion desteklenmiyor`);
    }
    const { proxy, proxyStr } = this._getProxy();
    try {
      const result = await provider.complete(paymentId, finalAmount, proxyStr);
      return {
        ...result, provider: provider.name, providerKey,
        actionType: 'completion', paymentId, finalAmount,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      };
    } catch (e) {
      return {
        success: false, reason: classifyError(e),
        error: e.message, paymentId, finalAmount, providerKey,
        internalError: classifyError(e) === 'internal_error',
      };
    }
  }

  async cancelPreAuth(paymentId, providerKey = 'moneris') {
    const provider = this.providers[providerKey];
    if (!provider || typeof provider.voidTransaction !== 'function') {
      throw new Error(`${providerKey} void desteklemiyor`);
    }
    const { proxy, proxyStr } = this._getProxy();
    try {
      const result = await provider.voidTransaction(paymentId, proxyStr);
      return {
        success: result.success, paymentId, providerKey,
        actionType: 'void',
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
        raw: result.raw,
      };
    } catch (e) {
      return {
        success: false, reason: classifyError(e),
        error: e.message, paymentId, providerKey,
        internalError: classifyError(e) === 'internal_error',
      };
    }
  }

  // ============================================================
  // FALLBACK / SEÇİM
  // ============================================================
  _getFallbacks(tried, isDev) {
    if (typeof this.loadBalancer.getFallbacks === 'function') {
      const lbFallbacks = this.loadBalancer.getFallbacks(tried, isDev);
      if (lbFallbacks.length > 0) {
        return lbFallbacks.filter((k) => !tried.includes(k));
      }
    }

    const liveCfg = config.LIVE_CHECK || {};
    const priority = Array.isArray(liveCfg.providerPriority) && liveCfg.providerPriority.length
      ? liveCfg.providerPriority
      : (isDev
          ? this.devPriority
          : ['moneris', 'clover3', 'authorize3', 'resin', 'braintree']);

    return priority.filter((key) => {
      if (tried.includes(key)) return false;
      if (isDev && key === 'braintree') return false;
      return this._isProviderUsable(key);
    });
  }

  // ============================================================
  // PROVIDER LİSTESİ
  // ============================================================
  getProviders() {
    return Object.keys(this.providers).map((key) => {
      const p = this.providers[key];
      return {
        key,
        name: p.name,
        type: p.type || key,
        supportsVerify: typeof p.verify === 'function',
        supportsPreAuth:
          typeof p.preAuth === 'function' ||
          typeof p.preauth === 'function' ||
          key.startsWith('clover'),
        supportsSale: typeof p.sale === 'function' || typeof p.purchase === 'function',
        supportsCapture: typeof p.capture === 'function',
        supportsRefund: typeof p.refund === 'function',
        supportsComplete: typeof p.complete === 'function',
        supportsVoid: typeof p.voidTransaction === 'function',
      };
    });
  }

  // ============================================================
  // CHECK + ENRICH
  // ============================================================
  async checkAndEnrich(card, options = {}) {
    const result = await this.checkCard(card, options);
    let binData = {};
    try {
      binData = await this.binDb.lookupWithFallback(
        card.pan.slice(0, 6),
        this.externalApi
      );
    } catch (e) {
      console.warn('[ENRICH] BIN lookup hatası:', e.message);
    }
    return this.enrichResult(card, result, binData);
  }

  // ============================================================
  // ENRICH — v2: ERROR_REASONS set kullanılıyor
  // ============================================================
  enrichResult(card, result, binData = {}) {
    const provider = this.providers[result.providerKey];

    let checks = {
      cvc: null, avsAddress: null, avsZip: null, networkStatus: null,
      avsMessage: null, cvvMessage: null, avsStatus: null, cvvStatus: null,
    };
    let transaction = { authCode: null, chargeId: null };

    if (provider && result.raw) {
      try {
        checks = { ...checks, ...(provider.extractChecks(result.raw) || {}) };
      } catch (e) {
        console.error('[ENRICH] extractChecks:', e.message);
      }
      try {
        transaction = provider.extractTransaction(result.raw) || transaction;
      } catch (e) {
        console.error('[ENRICH] extractTransaction:', e.message);
      }
    }

    if (result.avs !== undefined) checks.avsAddress = result.avs || checks.avsAddress;
    if (result.cvv !== undefined) checks.cvc = result.cvv || checks.cvc;

    // ⭐ v2: ERROR_REASONS set + internalError flag
    let status;
    if (result.success) {
      status = 'LIVE';
    } else if (result.unknown === true) {
      status = 'UNKNOWN';
    } else if (
      ERROR_REASONS.has(result.reason) ||
      result.internalError === true ||
      result.failover === true
    ) {
      status = 'ERROR';
    } else {
      status = 'DEAD';
    }

    return {
      pan: card.pan,
      panMasked: maskPan(card.pan),
      exp: `${card.expMonth}/${card.expYear}`,
      cvv: card.cvv,
      brand: card.brand,
      status,
      reason: result.reason || 'unknown',
      actionType: result.actionType || 'verify',
      preAuthAmount: result.preAuthAmount || null,
      avsMessage: result.avsMessage || null,
      avsStatus: result.avsStatus || null,
      cvvMessage: result.cvvMessage || null,
      cvvStatus: result.cvvStatus || null,
      provider: result.provider,
      providerKey: result.providerKey,
      proxy: result.proxy || null,
      bin: {
        bin: card.pan.slice(0, 6),
        brand: binData.brand || '',
        type: binData.type || '',
        category: binData.category || '',
        issuer: binData.issuer || '',
        country: binData.country || '',
        isoCode2: binData.isoCode2 || '',
        isoCode3: binData.isoCode3 || '',
      },
      checks,
      transaction,
      duration: result.duration || 0,
      timestamp: new Date().toISOString(),
      tried: result.tried || [],
      voided: result.voided || false,
      failover: result.failover === true,
      unknown: result.unknown === true,
      internalError: result.internalError === true,   // ⭐ v2
      raw: result.raw,
      providerCode: result.providerCode || null,
      message: result.message || result.error || null,
      error: result.error || null,
    };
  }

  // ============================================================
  // PROVIDER'A ZORLANMIŞ VERIFY
  // ============================================================
  async verifyWithProvider(card, providerKey, proxyStr = null) {
    const provider = this.providers[providerKey];
    if (!provider) throw new Error(`Provider bulunamadı: ${providerKey}`);
    if (typeof provider.verify !== 'function') {
      throw new Error(`${providerKey} verify desteklemiyor`);
    }

    const t0 = Date.now();
    const { proxy, proxyStr: finalProxy } = this._getProxy(proxyStr);
    const health = this.healths[providerKey];

    try {
      const probeCard = { ...card };
      if (providerKey.startsWith('clover')) {
        probeCard._amount = 0;
        probeCard._capture = false;
      }

      const result = await provider.verify(probeCard, finalProxy);
      this._recordOutcome({ providerKey, health, proxy, t0, result });

      return {
        ...result,
        success: result.success === true,
        provider: provider.name || providerKey,
        providerKey,
        actionType: 'verify',
        duration: Date.now() - t0,
        checkoutId: result.checkoutId || null,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      };
    } catch (e) {
      const reason = classifyError(e);
      this._recordOutcome({
        providerKey, health, proxy, t0, error: e.message,
        isNetwork: reason === 'network_error' || reason === 'provider_timeout',
      });
      // Not throw — callers expect success:false
      throw e;
    }
  }

  // ============================================================
  // PROVIDER'A ZORLANMIŞ PREAUTH
  // ============================================================
  async preAuthWithProvider(card, amount, providerKey, proxyStr = null) {
    if (!amount || amount <= 0) throw new Error('preAuthWithProvider: amount > 0 olmalı');
    const provider = this.providers[providerKey];
    if (!provider) throw new Error(`Provider bulunamadı: ${providerKey}`);
    if (!this._supports(providerKey, 'preauth') && !this._supports(providerKey, 'preAuth')) {
      throw new Error(`${providerKey} preauth desteklemiyor`);
    }

    const t0 = Date.now();
    const { proxy, proxyStr: finalProxy } = this._getProxy(proxyStr);
    const health = this.healths[providerKey];

    try {
      const fn = provider.preAuth || provider.preauth;
      const result = await fn.call(provider, card, amount, finalProxy);
      this._recordOutcome({ providerKey, health, proxy, t0, result });

      return {
        ...result,
        provider: provider.name || providerKey,
        providerKey,
        actionType: 'preauth',
        preAuthAmount: amount,
        duration: Date.now() - t0,
        checkoutId: result.checkoutId || null,
        transactionId:
          result.transactionId ||
          result.raw?.id ||
          result.raw?.transactionId ||
          null,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      };
    } catch (e) {
      const reason = classifyError(e);
      this._recordOutcome({
        providerKey, health, proxy, t0, error: e.message,
        isNetwork: reason === 'network_error' || reason === 'provider_timeout',
      });
      throw e;
    }
  }

  // ============================================================
  // PROVIDER'A ZORLANMIŞ SALE
  // ============================================================
  async saleWithProvider(card, amount, providerKey, proxyStr = null) {
    if (!amount || amount <= 0) throw new Error('saleWithProvider: amount > 0 olmalı');
    const provider = this.providers[providerKey];
    if (!provider) throw new Error(`Provider bulunamadı: ${providerKey}`);
    if (!this._supports(providerKey, 'sale')) {
      throw new Error(`${providerKey} sale desteklemiyor`);
    }

    const t0 = Date.now();
    const { proxy, proxyStr: finalProxy } = this._getProxy(proxyStr);
    const health = this.healths[providerKey];

    try {
      const fn = provider.sale || provider.purchase;
      const result = await fn.call(provider, card, amount, finalProxy);
      this._recordOutcome({ providerKey, health, proxy, t0, result });

      return {
        ...result,
        provider: provider.name || providerKey,
        providerKey,
        actionType: 'sale',
        amount,
        duration: Date.now() - t0,
        checkoutId: result.checkoutId || null,
        transactionId:
          result.transactionId ||
          result.raw?.id ||
          result.raw?.transactionId ||
          null,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      };
    } catch (e) {
      const reason = classifyError(e);
      this._recordOutcome({
        providerKey, health, proxy, t0, error: e.message,
        isNetwork: reason === 'network_error' || reason === 'provider_timeout',
      });
      throw e;
    }
  }

  async sale(card, amount, providerKey = null, proxyStr = null) {
    const key = providerKey || this.selectDevProvider();
    if (!key) throw new Error('sale: kullanılabilir provider yok');
    return this.saleWithProvider(card, amount, key, proxyStr);
  }

  // ============================================================
  // PROVIDER'A ZORLANMIŞ CAPTURE
  // ============================================================
  async captureWithProvider(paymentId, amount, providerKey, proxyStr = null) {
    if (!paymentId) throw new Error('captureWithProvider: paymentId gerekli');
    if (!amount || amount <= 0) throw new Error('captureWithProvider: amount > 0 olmalı');

    const provider = this.providers[providerKey];
    if (!provider) throw new Error(`Provider bulunamadı: ${providerKey}`);
    if (typeof provider.capture !== 'function') {
      throw new Error(`${providerKey} capture desteklemiyor`);
    }

    const t0 = Date.now();
    const { proxy, proxyStr: finalProxy } = this._getProxy(proxyStr);
    const health = this.healths[providerKey];

    try {
      const result = await provider.capture(paymentId, amount, finalProxy);
      this._recordOutcome({ providerKey, health, proxy, t0, result });

      return {
        ...result,
        provider: provider.name || providerKey,
        providerKey,
        actionType: 'capture',
        paymentId,
        capturedAmount: amount,
        duration: Date.now() - t0,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      };
    } catch (e) {
      const reason = classifyError(e);
      this._recordOutcome({
        providerKey, health, proxy, t0, error: e.message,
        isNetwork: reason === 'network_error' || reason === 'provider_timeout',
      });
      throw e;
    }
  }

  // ============================================================
  // PROVIDER'A ZORLANMIŞ REFUND
  // ============================================================
  async refundWithProvider(paymentId, amount, providerKey, proxyStr = null) {
    if (!paymentId) throw new Error('refundWithProvider: paymentId gerekli');
    if (!amount || amount <= 0) throw new Error('refundWithProvider: amount > 0 olmalı');

    const provider = this.providers[providerKey];
    if (!provider) throw new Error(`Provider bulunamadı: ${providerKey}`);
    if (typeof provider.refund !== 'function') {
      throw new Error(`${providerKey} refund desteklemiyor`);
    }

    const t0 = Date.now();
    const { proxy, proxyStr: finalProxy } = this._getProxy(proxyStr);
    const health = this.healths[providerKey];

    try {
      const result = await provider.refund(paymentId, amount, finalProxy);
      this._recordOutcome({ providerKey, health, proxy, t0, result });

      return {
        ...result,
        provider: provider.name || providerKey,
        providerKey,
        actionType: 'refund',
        paymentId,
        refundedAmount: result.success ? amount : 0,
        duration: Date.now() - t0,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      };
    } catch (e) {
      const reason = classifyError(e);
      this._recordOutcome({
        providerKey, health, proxy, t0, error: e.message,
        isNetwork: reason === 'network_error' || reason === 'provider_timeout',
      });
      throw e;
    }
  }

  // ============================================================
  // PROVIDER'A ZORLANMIŞ VOID
  // ============================================================
  async voidWithProvider(paymentId, providerKey, proxyStr = null, fallbackAmount = null) {
    if (!paymentId) throw new Error('voidWithProvider: paymentId gerekli');

    const provider = this.providers[providerKey];
    if (!provider) throw new Error(`Provider bulunamadı: ${providerKey}`);

    const t0 = Date.now();
    const { proxy, proxyStr: finalProxy } = this._getProxy(proxyStr);
    const health = this.healths[providerKey];

    if (typeof provider.voidTransaction === 'function') {
      try {
        const result = await provider.voidTransaction(paymentId, finalProxy);
        this._recordOutcome({ providerKey, health, proxy, t0, result });
        return {
          ...result,
          provider: provider.name || providerKey,
          providerKey,
          actionType: 'void',
          paymentId,
          method: 'native_void',
          duration: Date.now() - t0,
        };
      } catch (e) {
        const reason = classifyError(e);
        this._recordOutcome({
          providerKey, health, proxy, t0, error: e.message,
          isNetwork: reason === 'network_error' || reason === 'provider_timeout',
        });
        throw e;
      }
    }

    if (typeof provider.refund === 'function' && fallbackAmount && fallbackAmount > 0) {
      try {
        console.log(`[VOID→REFUND] ${providerKey}: $${fallbackAmount} refund ile kapatılıyor`);
        const result = await provider.refund(paymentId, fallbackAmount, finalProxy);
        this._recordOutcome({ providerKey, health, proxy, t0, result });
        return {
          ...result,
          provider: provider.name || providerKey,
          providerKey,
          actionType: 'void',
          paymentId,
          method: 'fallback_refund',
          refundedAmount: result.success ? fallbackAmount : 0,
          duration: Date.now() - t0,
        };
      } catch (e) {
        const reason = classifyError(e);
        this._recordOutcome({
          providerKey, health, proxy, t0, error: e.message,
          isNetwork: reason === 'network_error' || reason === 'provider_timeout',
        });
        throw e;
      }
    }

    console.warn(`[VOID] ${providerKey} void/refund desteklemiyor — paymentId=${paymentId}`);
    return {
      success: false,
      reason: 'void_not_supported',
      provider: provider.name || providerKey,
      providerKey,
      actionType: 'void',
      paymentId,
      method: 'unsupported',
    };
  }

  // ============================================================
  // PROVIDER-AWARE LIFECYCLE
  // ============================================================
  async runLifecycle(card, opts = {}) {
    const {
      provider = 'moneris',
      authAmount = 1.00,
      refundAmount = 0.30,
      doVerify = true,
      doPreAuth = true,
      doCapture = false,
      doRefund = false,
      doVoid = true,
      proxyStr = null,
    } = opts;

    const log = {
      provider,
      providerName: this._providerName(provider),
      capabilities: {
        verify: this._supports(provider, 'verify'),
        preauth: this._supports(provider, 'preauth') || this._supports(provider, 'preAuth'),
        sale: this._supports(provider, 'sale'),
        capture: this._supports(provider, 'capture'),
        refund: this._supports(provider, 'refund'),
        void: this._supports(provider, 'voidTransaction'),
      },
      steps: [],
      success: false,
      startedAt: new Date().toISOString(),
    };

    if (!this.providers[provider]) {
      log.finalReason = 'provider_not_found';
      return log;
    }

    let verifyResult = null;
    if (doVerify && log.capabilities.verify) {
      try {
        verifyResult = await this.verifyWithProvider(card, provider, proxyStr);
        log.steps.push({
          step: 'verify',
          ok: verifyResult.success,
          reason: verifyResult.reason,
          checkoutId: verifyResult.checkoutId || null,
          transactionId: verifyResult.transactionId || null,
        });
        if (!verifyResult.success) {
          log.finalReason = verifyResult.reason;
          log.finishedAt = new Date().toISOString();
          return log;
        }
      } catch (e) {
        log.steps.push({ step: 'verify', ok: false, error: e.message, reason: classifyError(e) });
        log.finalReason = classifyError(e);
        log.finishedAt = new Date().toISOString();
        return log;
      }
    }

    let preauthResult = null;
    let txnId = null;
    if (doPreAuth && log.capabilities.preauth) {
      try {
        preauthResult = await this.preAuthWithProvider(card, authAmount, provider, proxyStr);
        txnId = preauthResult.transactionId || null;
        log.steps.push({
          step: 'preauth',
          ok: preauthResult.success,
          reason: preauthResult.reason,
          amount: authAmount,
          transactionId: txnId,
          checkoutId: preauthResult.checkoutId || null,
        });
        if (!preauthResult.success) {
          log.finalReason = preauthResult.reason;
          log.finishedAt = new Date().toISOString();
          return log;
        }
      } catch (e) {
        log.steps.push({ step: 'preauth', ok: false, error: e.message, reason: classifyError(e) });
        log.finalReason = classifyError(e);
        log.finishedAt = new Date().toISOString();
        return log;
      }
    }

    if (doCapture && txnId && log.capabilities.capture) {
      try {
        const cap = await this.captureWithProvider(txnId, authAmount, provider, proxyStr);
        log.steps.push({
          step: 'capture',
          ok: cap.success,
          reason: cap.reason,
          paymentId: txnId,
          amount: authAmount,
        });
        if (!cap.success) {
          log.finalReason = cap.reason;
          log.finishedAt = new Date().toISOString();
          return log;
        }
      } catch (e) {
        log.steps.push({ step: 'capture', ok: false, error: e.message, reason: classifyError(e) });
        log.finalReason = classifyError(e);
        log.finishedAt = new Date().toISOString();
        return log;
      }
    }

    if (doRefund && txnId && refundAmount > 0 && log.capabilities.refund) {
      try {
        const r = await this.refundWithProvider(txnId, refundAmount, provider, proxyStr);
        log.steps.push({
          step: 'refund',
          ok: r.success,
          reason: r.reason,
          amount: refundAmount,
          paymentId: txnId,
        });
      } catch (e) {
        log.steps.push({ step: 'refund', ok: false, error: e.message, reason: classifyError(e) });
      }
    }

    if (doVoid && !doCapture && txnId) {
      try {
        const v = await this.voidWithProvider(txnId, provider, proxyStr, authAmount);
        log.steps.push({
          step: 'void',
          ok: v.success,
          reason: v.reason,
          method: v.method,
          paymentId: txnId,
        });
      } catch (e) {
        log.steps.push({ step: 'void', ok: false, error: e.message, reason: classifyError(e) });
      }
    }

    log.success = true;
    log.finalReason = 'approved';
    log.finishedAt = new Date().toISOString();
    return log;
  }

  // ============================================================
  // PARALEL TOPLU İŞLEM
  // ============================================================
  async bulkProcess(cards, operation, opts = {}) {
    const {
      concurrency = 5,
      provider = null,
      amount = 1.00,
      refundAmount = 0.30,
      doCapture = false,
      onProgress = null,
      abortSignal = null,
    } = opts;

    const queue = [...cards];
    const indexMap = new Map(cards.map((c, i) => [c, i]));
    const results = new Array(cards.length);
    let done = 0;

    const summary = {
      total: cards.length, live: 0, dead: 0, errors: 0, internalErrors: 0,
      operation, provider: provider || 'auto',
    };

    const runOne = async (card) => {
      const idx = indexMap.get(card);
      if (abortSignal?.aborted) {
        results[idx] = { success: false, reason: 'aborted' };
        return;
      }

      try {
        let r;

        switch (operation) {
          case 'verify':
            r = provider
              ? await this.verifyWithProvider(card, provider)
              : await this.checkCard(card);
            break;

          case 'preauth':
            r = provider
              ? await this.preAuthWithProvider(card, amount, provider)
              : await this.preAuth(card, amount);
            break;

          case 'sale':
            r = provider
              ? await this.saleWithProvider(card, amount, provider)
              : await this.sale(card, amount);
            break;

          case 'lifecycle':
            if (!provider) throw new Error('lifecycle için provider zorunlu');
            r = await this.runLifecycle(card, {
              provider, authAmount: amount, refundAmount, doCapture,
            });
            break;

          default:
            throw new Error(`Bilinmeyen operation: ${operation}`);
        }

        results[idx] = r;

        // ⭐ v2: internal_error ayrı sayaç
        const reasonOf = r?.finalReason || r?.reason;
        if (r.internalError === true || reasonOf === 'internal_error') {
          summary.internalErrors++;
          summary.errors++;
        } else if (r.success === true || r.status === 'LIVE') {
          summary.live++;
        } else if (
          r.status === 'ERROR' ||
          ERROR_REASONS.has(reasonOf)
        ) {
          summary.errors++;
        } else {
          summary.dead++;
        }
      } catch (e) {
        const reason = classifyError(e);
        results[idx] = { success: false, reason, error: e.message, internalError: reason === 'internal_error' };
        if (reason === 'internal_error') summary.internalErrors++;
        summary.errors++;
      } finally {
        done++;
        if (onProgress) {
          try { onProgress(done, cards.length, results[idx]); } catch {}
        }
      }
    };

    const worker = async () => {
      while (queue.length > 0) {
        if (abortSignal?.aborted) break;
        const c = queue.shift();
        if (!c) break;
        await runOne(c);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, cards.length) }, () => worker())
    );

    summary.done = done;
    summary.aborted = !!abortSignal?.aborted;
    return { summary, results };
  }
}

module.exports = CardChecker;