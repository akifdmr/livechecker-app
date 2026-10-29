// ============================================================
// CARDS ROUTES — Live Cards + Verify + Balance + Recheck
// Live Check: cardChecker.checkAndEnrich() (Recheck ile AYNI akış)
// Preauth: cardChecker provider metodları (unified)
// + Partial Refund (Auth + Kısmi Refund akışı)
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');
const CardParser = require('../services/CardParser');
const { mapReason } = require('../utils/reasonMapper');

module.exports = (deps) => {
  const { cardChecker, dbService, processorRoutingService } = deps;

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * DB'deki provider adını cardChecker.providers key'ine çevirir.
   * 'clover' → 'clover3', 'authorize' → 'authorize3', vs.
   */
  function normalizeProviderKey(key) {
    const k = String(key || '').toLowerCase();
    if (k === 'clover' || k === 'clover3') return 'clover3';
    if (k === 'authorize' || k === 'authorize2' || k === 'authorize3') return 'authorize3';
    if (k === 'moneris') return 'moneris';
    return k;
  }

  /**
   * Provider instance'ından merchant bilgisini çıkar (defensive).
   */
  function extractMerchantInfo(cardChecker, providerKey) {
    if (!providerKey) {
      return { merchantId: null, merchantName: null };
    }
    const provider = cardChecker?.providers?.[providerKey];
    if (!provider) {
      return { merchantId: null, merchantName: null };
    }
    return {
      merchantId: provider.config?.merchantId || null,
      merchantName: provider.name || providerKey,
    };
  }

  function normalizeEnriched(enriched) {
    if (!enriched || typeof enriched !== 'object') {
      const mapped = mapReason('invalid_response', null);
      return {
        success: false, status: 'UNKNOWN', reason: 'invalid_response',
        reasonShort: mapped.short, reasonLong: mapped.long,
        severity: mapped.severity, rawMessage: mapped.raw,
        provider: null, providerKey: null,
        merchantId: null, merchantName: null,      // ⭐
        providerCode: null,
        message: null, bin: null, raw: null,
        providerRaw: null, providerMessage: null,
        failover: false, unknown: false, error: null,
      };
    }

    const success =
      enriched.success === true ||
      enriched.status === 'LIVE' ||
      enriched.reason === 'approved';

    const isFailover = enriched.failover === true;
    const isUnknown = enriched.unknown === true;

    let status = enriched.status;
    if (!status) {
      if (success) status = 'LIVE';
      else if (
        isFailover ||
        enriched.reason === 'provider_error' ||
        enriched.reason === 'provider_timeout' ||
        enriched.reason === 'invalid_response' ||
        enriched.reason === 'provider_config_error' ||
        enriched.reason === 'network_error'
      ) status = 'ERROR';
      else if (isUnknown) status = 'UNKNOWN';
      else status = 'DEAD';
    }

    const reason = enriched.reason || (success ? 'approved' : 'declined');
    const mapped = mapReason(reason, enriched.message || null);

    return {
      success, status, reason,
      reasonShort: mapped.short, reasonLong: mapped.long,
      severity: mapped.severity, rawMessage: mapped.raw,
      provider: enriched.provider || enriched.providerKey || null,
      providerKey: enriched.providerKey || enriched.provider || null,
      merchantId: enriched.merchantId ?? null,      // ⭐
      merchantName: enriched.merchantName ?? null,  // ⭐
      providerCode: enriched.providerCode ?? null,
      message: enriched.message ?? null,
      avs: enriched.avs ?? null,
      cvv: enriched.cvv ?? null,
      authCode: enriched.authCode ?? null,
      transactionId: enriched.transactionId ?? null,
      bin: enriched.bin ?? null,
      raw: enriched.raw ?? enriched,
      providerRaw: enriched.raw ?? null,
      providerMessage: enriched.message ?? null,
      failover: isFailover,
      unknown: isUnknown,
      error: enriched.error ?? null,
    };
  }

  /**
   * Balance response normalize.
   * operation: 'preauth' | 'live_check'
   */
  function normalizeBalanceResponse(raw, operation = 'preauth') {
    const success = !!raw.success;
    let reason = raw.reason || (success ? 'approved' : 'declined');
    if (!success && reason === 'approved') reason = 'declined';

    const mapped = mapReason(reason, raw.message || raw.error?.message || null);

    let status;
    if (success) {
      status = operation === 'live_check' ? 'LIVE' : 'APPROVED';
    } else {
      status = raw.status && raw.status !== 'LIVE' && raw.status !== 'APPROVED'
        ? raw.status
        : (['provider_error', 'provider_timeout', 'invalid_response',
            'provider_config_error', 'network_error'].includes(reason)
            ? 'ERROR' : 'DEAD');
    }

    const txnId = raw.txnId ?? null;
    const chargeId = raw.chargeId ?? raw.transactionId ?? null;

    return {
      success,
      status,
      operation,
      reason,
      reasonShort: mapped.short,
      reasonLong: mapped.long,
      severity: mapped.severity,
      rawMessage: mapped.raw,

      provider: raw.provider || null,
      providerKey: raw.providerKey || raw.provider || null,
      merchantId: raw.merchantId ?? null,       // ⭐ EKLENDİ
      merchantName: raw.merchantName ?? null,   // ⭐ EKLENDİ
      providerCode: raw.providerCode ?? null,
      message: raw.message ?? null,

      amount: typeof raw.amount === 'number' ? raw.amount : 0,
      currency: raw.currency || 'USD',
      authCode: raw.authCode ?? null,
      chargeId,
      transactionId: chargeId,
      txnId,
      refundedAmount: raw.refundedAmount ?? 0,
      refundTxnId: raw.refundTxnId ?? null,
      capturedAmount: raw.capturedAmount ?? 0,
      netAmount: raw.netAmount ?? null,
      captured: !!raw.captured,
      voided: !!raw.voided,

      capturable: !!success && operation === 'preauth' && !!txnId && !raw.captured && !raw.voided,
      voidable:   !!success && operation === 'preauth' && !!txnId && !raw.captured && !raw.voided,

      failover: raw.failover === true,
      attempts: raw.attempts ?? [],

      error: raw.error ? {
        code: raw.error.code || null,
        message: raw.error.message || null,
        declineCode: raw.error.declineCode || null,
      } : null,

      raw: raw.raw ?? null,
      providerRaw: raw.raw ?? null,
      providerMessage: raw.message ?? raw.error?.message ?? null,
      bin: raw.bin ?? null,
      duration: raw.duration ?? null,
    };
  }

  function buildTxnBase({ userId, card, action, provider, amount, currency }) {
    const pan = String(card.pan || '').replace(/\D/g, '');
    return {
      userId, cardId: card.id || null, provider, action, mode: 'live',
      amount: Number(amount) || 0, currency: currency || 'USD',
      pan,
      panMasked: pan.length >= 10 ? pan.slice(0, 6) + '****' + pan.slice(-4) : pan,
      bin: pan.slice(0, 6),
      brand: card.type || card.brand || null,
    };
  }

  // ============================================================
  // LIVE CHECK VIA CARD CHECKER (failover dahili — checkAndEnrich)
  // ⭐ v2: bulkMode destructure FIX + merchant bilgisi tüm return'lerde
  // ============================================================
  async function tryLiveCheckViaCardChecker(card, cardChecker, ctx = {}) {
    const startTime = Date.now();
    // ⭐ FIX: bulkMode eklendi
    const { userId, preferProvider = null, bulkMode = false } = ctx;
    const effectivePreferProvider = preferProvider || (bulkMode ? 'clover3' : null);

    try {
      const [rawMonth, rawYear] = String(card.exp || '').split('/');
      const expMonth = String(rawMonth || '12').padStart(2, '0').slice(0, 2);
      let expYear = String(rawYear || '2030').trim();
      if (expYear.length === 2) expYear = `20${expYear}`;
      if (expYear.length !== 4) expYear = '2030';

      const parsed = {
        pan: String(card.pan || '').replace(/\D/g, ''),
        expMonth, expYear,
        cvv: String(card.cvv || '').trim() || '000',
        brand: card.type || card.brand || '',
        firstName: (card.name || 'Test User').split(' ')[0],
        lastName: (card.name || 'Test User').split(' ').slice(1).join(' ') || 'User',
        address: card.address || '',
        city: card.city || '',
        state: card.state || '',
        zip: card.zip || '',
        country: card.country || 'US',
        phone: card.phone || '',
        email: card.email || '',
      };

      // ⭐ preferProvider'ı checkCard'a geçir (bulk mode'da clover3 sabit)
      const enriched = await cardChecker.checkAndEnrich(parsed, {
        preferProvider: effectivePreferProvider || undefined,
      });

      const duration = Date.now() - startTime;
      const providerKey = enriched.providerKey || enriched.provider || null;
      const { merchantId, merchantName } = extractMerchantInfo(cardChecker, providerKey);

      const isSuccess = enriched.success === true;
      const isFailover = enriched.failover === true;
      const isUnknown = enriched.unknown === true;

      let finalReason = enriched.reason || (isSuccess ? 'approved' : 'declined');
      if (!isSuccess && finalReason === 'approved') {
        finalReason = isFailover || enriched.status === 'ERROR'
          ? 'provider_error'
          : 'declined';
      }
      if (isSuccess) finalReason = 'approved';

      let finalStatus;
      if (isSuccess) finalStatus = 'LIVE';
      else if (isFailover) finalStatus = 'ERROR';
      else if (isUnknown) finalStatus = 'UNKNOWN';
      else if (
        finalReason === 'provider_error' ||
        finalReason === 'provider_timeout' ||
        finalReason === 'invalid_response' ||
        finalReason === 'provider_config_error' ||
        finalReason === 'network_error'
      ) finalStatus = 'ERROR';
      else finalStatus = 'DEAD';

      const mapped = mapReason(finalReason, enriched.message || null);

      // TXN LOG
      await dbService.logProviderTransaction({
        userId,
        cardId: card.id || null,
        provider: providerKey || 'clover3',
        action: 'live_check', mode: 'live',
        amount: 0, currency: 'USD',
        pan: parsed.pan,
        panMasked: parsed.pan.slice(0, 6) + '****' + parsed.pan.slice(-4),
        bin: parsed.pan.slice(0, 6),
        brand: parsed.brand || null,
        providerTxnId: enriched.transactionId || null,
        providerCode: enriched.providerCode || null,
        status: isSuccess ? 'approved' : (isFailover ? 'error' : 'declined'),
        reason: finalReason,
        message: enriched.message || null,
        rawResponse: enriched.raw || null,
        durationMs: duration,
      }).catch((e) => console.warn('[LIVE-CHECK] Txn log hatası:', e.message));

      // CARD UPDATE — sadece hüküm verilebilirse
      if (card.id) {
        if (isSuccess) {
          await db.pool.query(
            `UPDATE live_cards_full
                SET status='LIVE', last_provider=$2, last_checked_at=NOW(),
                    dead_reason=NULL, dead_message=NULL, dead_at=NULL
              WHERE id = $1`,
            [card.id, providerKey]
          ).catch(() => {});
        } else if (isFailover || isUnknown) {
          // ⚠️ Provider hatası → kartı DEAD yapma
          await db.pool.query(
            `UPDATE live_cards_full
                SET last_provider=COALESCE($2, last_provider),
                    last_checked_at=NOW()
              WHERE id = $1`,
            [card.id, providerKey]
          ).catch(() => {});
        } else {
          // ❌ Gerçek kart reddi
          await db.pool.query(
            `UPDATE live_cards_full
                SET status='DEAD', last_provider=$2, last_checked_at=NOW(),
                    dead_reason=$3, dead_message=$4, dead_at=NOW(),
                    total_declined_count = COALESCE(total_declined_count,0) + 1
              WHERE id = $1`,
            [card.id, providerKey, finalReason, mapped.long]
          ).catch(() => {});
        }
      }

      // ⭐ RETURN — tüm branch'lerde merchantId + merchantName
      if (isSuccess) {
        return {
          ok: true, failover: false, success: true,
          status: 'LIVE', reason: 'approved',
          reasonShort: 'Onaylandı', reasonLong: 'Live Check başarıyla onaylandı.',
          severity: 'low', rawMessage: null,
          provider: merchantName || 'clover3',
          providerKey,
          merchantId,
          merchantName,
          providerCode: enriched.providerCode || null,
          message: enriched.message || null,
          amount: 0, currency: 'USD',
          authCode: enriched.authCode || null,
          chargeId: enriched.transactionId || null,
          txnId: null, refundedAmount: 0, netAmount: 0, voided: false,
          duration,
          raw: enriched.raw || null,
          providerRaw: enriched.raw || null,
        };
      }

      if (isFailover) {
        return {
          ok: false, failover: true, success: false,
          status: 'ERROR',
          reason: finalReason === 'approved' ? 'provider_error' : finalReason,
          reasonShort: mapped.short || 'Provider hatası',
          reasonLong: mapped.long || enriched.message || 'Provider altyapı hatası',
          severity: 'medium',
          rawMessage: mapped.raw || enriched.message || null,
          provider: merchantName || null,
          providerKey,
          merchantId,
          merchantName,
          providerCode: enriched.providerCode || null,
          message: enriched.message || null,
          amount: 0, txnId: null, duration,
          raw: enriched.raw || null,
          providerRaw: enriched.raw || null,
        };
      }

      if (isUnknown) {
        return {
          ok: false, failover: false, success: false,
          status: 'UNKNOWN', reason: finalReason,
          reasonShort: mapped.short || 'Belirsiz',
          reasonLong: mapped.long || enriched.message || 'Belirsiz yanıt',
          severity: mapped.severity || 'medium',
          rawMessage: mapped.raw || enriched.message || null,
          provider: merchantName || null,
          providerKey,
          merchantId,
          merchantName,
          providerCode: enriched.providerCode || null,
          message: enriched.message || null,
          amount: 0, txnId: null, duration,
          raw: enriched.raw || null,
          providerRaw: enriched.raw || null,
        };
      }

      return {
        ok: true, failover: false, success: false,
        status: 'DEAD', reason: finalReason,
        reasonShort: mapped.short, reasonLong: mapped.long,
        severity: mapped.severity, rawMessage: mapped.raw,
        provider: merchantName || 'clover3',
        providerKey,
        merchantId,
        merchantName,
        providerCode: enriched.providerCode || null,
        message: enriched.message || null,
        amount: 0, txnId: null, duration,
        raw: enriched.raw || null,
        providerRaw: enriched.raw || null,
      };
    } catch (e) {
      const mapped = mapReason('provider_error', e.message);

      if (card.id) {
        await db.pool.query(
          `UPDATE live_cards_full SET last_checked_at=NOW() WHERE id = $1`,
          [card.id]
        ).catch(() => {});
      }

      return {
        ok: false, failover: true, success: false,
        status: 'ERROR', reason: 'provider_error',
        reasonShort: mapped.short, reasonLong: mapped.long,
        severity: mapped.severity, rawMessage: mapped.raw,
        provider: null, providerKey: null,
        merchantId: null, merchantName: null,
        providerCode: null,
        message: e.message, error: e.message,
        amount: 0, txnId: null, duration: Date.now() - startTime,
        raw: null, providerRaw: null,
      };
    }
  }

  // ============================================================
  // LIVE CHECK VIA SPECIFIC PROVIDER (ör. moneris verify)
  // ⭐ v2: yarım return FIX
  // ============================================================
  async function runLiveCheckViaProvider(card, providerKey, cardChecker, ctx = {}) {
    const { userId } = ctx;
    const startTime = Date.now();
    const key = normalizeProviderKey(providerKey);

    const provider = cardChecker?.providers?.[key];
    if (!provider) {
      return {
        ok: false, failover: true, success: false,
        status: 'ERROR', reason: 'provider_not_found',
        provider: key, providerKey: key,
        merchantId: null, merchantName: null,
        error: `Provider bulunamadı: ${key}`,
        duration: Date.now() - startTime,
      };
    }

    let proxyStr = null;
    try {
      const { proxy } = cardChecker._getProxy();
      proxyStr = proxy ? proxy.raw : null;
    } catch (_) {}

    try {
      if (typeof provider.verify !== 'function') {
        throw new Error(`${key} verify desteklemiyor`);
      }
      const probeCard = key.startsWith('clover')
        ? { ...card, _amount: 0.01, _capture: false }
        : card;
      const result = await provider.verify(probeCard, proxyStr);
      const duration = Date.now() - startTime;
      const mapped = mapReason(
        result.reason || (result.success ? 'approved' : 'declined'),
        result.message || null
      );

      const pan = String(card.pan || '').replace(/\D/g, '');
      try {
        await dbService.logProviderTransaction({
          userId,
          cardId: card.id || null,
          provider: key,
          action: 'live_check', mode: 'live',
          amount: 0, currency: 'USD',
          pan,
          panMasked: pan.slice(0, 6) + '****' + pan.slice(-4),
          bin: pan.slice(0, 6),
          brand: card.type || card.brand || null,
          providerTxnId: result.transactionId || result.raw?.id || null,
          providerCode: result.providerCode || null,
          status: result.success ? 'approved' : 'declined',
          reason: result.reason || (result.success ? 'approved' : 'declined'),
          message: result.message || null,
          rawResponse: result.raw || null,
          durationMs: duration,
        });
      } catch (_) {}

      if (card.id) {
        if (result.success) {
          await db.pool.query(
            `UPDATE live_cards_full SET status='LIVE', last_provider=$2, last_checked_at=NOW(),
                dead_reason=NULL, dead_message=NULL, dead_at=NULL WHERE id=$1`,
            [card.id, key]
          ).catch(() => {});
        } else {
          await db.pool.query(
            `UPDATE live_cards_full SET status='DEAD', last_provider=$2, last_checked_at=NOW(),
                dead_reason=$3, dead_message=$4, dead_at=NOW(),
                total_declined_count = COALESCE(total_declined_count,0) + 1 WHERE id=$1`,
            [card.id, key, result.reason, mapped.long]
          ).catch(() => {});
        }
      }

      const providerName = provider.name || key;
      const merchantId = provider.config?.merchantId || null;

      // ⭐ v2: tam return (yarım bırakılmıştı)
      return {
        ok: true,
        failover: false,
        success: !!result.success,
        status: result.success ? 'APPROVED' : 'DEAD',
        reason: result.reason || (result.success ? 'approved' : 'declined'),
        reasonShort: mapped.short,
        reasonLong: mapped.long,
        severity: mapped.severity,
        rawMessage: mapped.raw,
        provider: providerName,
        providerKey: key,
        merchantId,
        merchantName: providerName,
        providerCode: result.providerCode || null,
        message: result.message || null,
        amount: 0,
        currency: 'USD',
        authCode: result.authCode || null,
        chargeId: result.transactionId || result.raw?.id || null,
        transactionId: result.transactionId || result.raw?.id || null,
        txnId: null,
        refundedAmount: 0,
        netAmount: 0,
        voided: false,
        duration,
        raw: result.raw || null,
        providerRaw: result.raw || null,
      };
    } catch (e) {
      const duration = Date.now() - startTime;
      const isProviderError = e.message.startsWith('PROVIDER_ERROR:');
      const isNetwork = /network|fetch|timeout|ECONN|ETIMEDOUT|ENOTFOUND/i.test(e.message);

      return {
        ok: false, failover: isProviderError || isNetwork, success: false,
        status: 'ERROR',
        reason: isProviderError ? 'provider_error' : 'network_error',
        provider: key, providerKey: key,
        merchantId: provider.config?.merchantId || null,
        merchantName: provider.name || key,
        message: e.message, error: e.message,
        duration,
      };
    }
  }

  // ============================================================
  // PREAUTH VIA PROVIDER (unified — eski try*Balance'ların yerine)
  // + Partial Refund desteği (Auth + Kısmi Refund akışı)
  // ⭐ v2: duplicate provider key FIX + merchantId + providerName
  // ============================================================
  async function runPreauthViaProvider(card, amount, providerKey, cardChecker, ctx = {}) {
    const { userId, refundAmount = 0 } = ctx;
    const startTime = Date.now();
    const key = normalizeProviderKey(providerKey);

    const provider = cardChecker?.providers?.[key];
    if (!provider) {
      return {
        ok: false, failover: true, success: false,
        status: 'ERROR', reason: 'provider_not_found',
        provider: key, providerKey: key,
        merchantId: null, merchantName: null,
        error: `Provider bulunamadı: ${key}`,
        duration: Date.now() - startTime,
      };
    }

    let proxyStr = null;
    try {
      const { proxy } = cardChecker._getProxy();
      proxyStr = proxy ? proxy.raw : null;
    } catch (_) {}

    const pan = String(card.pan || '').replace(/\D/g, '');
    const currency = key === 'moneris'
      ? (require('../config').MONERIS_CURRENCY || 'CAD')
      : 'USD';

    const txnBase = {
      userId,
      cardId: card.id || null,
      provider: key,
      action: 'auth',
      mode: 'live',
      amount: Number(amount) || 0,
      currency,
      pan,
      panMasked: pan.length >= 10 ? pan.slice(0, 6) + '****' + pan.slice(-4) : pan,
      bin: pan.slice(0, 6),
      brand: card.type || card.brand || null,
    };

    // ---- ANA İŞLEM (preauth) ----
    let result;
    try {
      if (key === 'moneris') {
        const fn = provider.preAuth || provider.preauth;
        if (typeof fn !== 'function') throw new Error(`${key} preauth desteklemiyor`);
        result = await fn.call(provider, card, amount, proxyStr);
      } else if (key.startsWith('clover')) {
        if (typeof provider.preauth === 'function') {
          result = await provider.preauth(card, amount, proxyStr);
        } else {
          const modifiedCard = { ...card, _amount: amount, _capture: false };
          result = await provider.verify(modifiedCard, proxyStr);
        }
      } else {
        const fn = provider.preauth || provider.preAuth;
        if (typeof fn !== 'function') throw new Error(`${key} preauth desteklemiyor`);
        result = await fn.call(provider, card, amount, proxyStr);
      }
    } catch (e) {
      const isNetwork = /network|fetch|timeout|ECONN|ETIMEDOUT|ENOTFOUND/i.test(e.message);
      const isProviderError = e.message.startsWith('PROVIDER_ERROR:');

      await dbService.logProviderTransaction({
        ...txnBase,
        status: 'error',
        reason: isProviderError ? 'provider_error' : (isNetwork ? 'network_error' : 'unknown'),
        message: e.message,
        durationMs: Date.now() - startTime,
      }).catch(() => {});

      const providerName = provider.name || key;
      const merchantId = provider.config?.merchantId || null;

      // ⭐ v2 FIX: duplicate provider key kaldırıldı, merchantId eklendi
      return {
        ok: false,
        failover: isProviderError || isNetwork,
        success: false,
        status: 'ERROR',
        reason: isProviderError ? 'provider_error' : (isNetwork ? 'network_error' : 'provider_error'),
        provider: providerName,
        providerKey: key,
        merchantId,
        merchantName: providerName,
        error: e.message, message: e.message,
        duration: Date.now() - startTime,
      };
    }

    const duration = Date.now() - startTime;
    const mapped = mapReason(
      result.reason || (result.success ? 'approved' : 'declined'),
      result.message || null
    );

    // ---- PARENT TXN LOG ----
    let saved = null;
    try {
      saved = await dbService.logProviderTransaction({
        ...txnBase,
        providerTxnId: result.transactionId || result.chargeId || result.raw?.id || null,
        providerCode: result.providerCode || null,
        status: result.success ? 'approved' : 'declined',
        reason: result.reason || (result.success ? 'approved' : 'declined'),
        message: result.message || null,
        rawResponse: result.raw || null,
        durationMs: duration,
      });
    } catch (e) {
      console.warn('[PREAUTH] DB log hatası:', e.message);
    }

    // ============================================================
    // ⭐ PARTIAL REFUND — başarılı preauth sonrası isteğe bağlı iade
    // ============================================================
    const targetRefund = Math.max(0, Math.min(Number(refundAmount) || 0, amount));
    let refundedAmount = 0;
    let refundTxnId = null;

    if (result.success && targetRefund > 0 && (result.transactionId || result.chargeId)) {
      try {
        const providerTxnId = result.transactionId || result.chargeId;
        if (typeof provider.refund === 'function') {
          const refundResult = await provider.refund(providerTxnId, targetRefund, proxyStr);

          if (refundResult.success) {
            refundedAmount = targetRefund;

            const refundTxn = await dbService.logProviderTransaction({
              userId,
              cardId: card.id || null,
              provider: key,
              action: 'refund',
              mode: 'live',
              amount: targetRefund,
              currency,
              pan,
              panMasked: pan.length >= 10 ? pan.slice(0, 6) + '****' + pan.slice(-4) : pan,
              bin: pan.slice(0, 6),
              brand: card.type || card.brand || null,
              providerTxnId: refundResult.transactionId || providerTxnId,
              status: 'refunded',
              reason: 'approved',
              message: `Kısmi refund $${targetRefund}`,
              parentTxnId: saved?.id || null,
              durationMs: Date.now() - startTime - duration,
            }).catch(() => null);

            refundTxnId = refundTxn?.id || null;
          } else {
            // Refund başarısız olsa da preauth başarılı → log düş
            await dbService.logProviderTransaction({
              userId,
              cardId: card.id || null,
              provider: key,
              action: 'refund',
              mode: 'live',
              amount: targetRefund,
              currency,
              pan,
              panMasked: pan.length >= 10 ? pan.slice(0, 6) + '****' + pan.slice(-4) : pan,
              bin: pan.slice(0, 6),
              brand: card.type || card.brand || null,
              providerTxnId: providerTxnId,
              status: 'error',
              reason: refundResult.reason || 'refund_failed',
              message: refundResult.message || null,
              parentTxnId: saved?.id || null,
              durationMs: Date.now() - startTime - duration,
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn(`[PREAUTH-REFUND] ${key}:`, e.message);
      }
    }

    // ---- CARD UPDATE ----
    if (card.id) {
      if (result.success) {
        await db.pool.query(
          `UPDATE live_cards_full
              SET status='LIVE', last_provider=$2, last_checked_at=NOW(),
                  last_txn_at=NOW(), last_auth_at=NOW(),
                  total_auth     = COALESCE(total_auth,0) + $3,
                  total_refunded = COALESCE(total_refunded,0) + $4,
                  dead_reason=NULL, dead_message=NULL, dead_at=NULL
            WHERE id = $1`,
          [card.id, key, Number(amount) || 0, refundedAmount]
        ).catch(() => {});
      } else {
        await db.pool.query(
          `UPDATE live_cards_full
              SET status='DEAD', last_provider=$2, last_checked_at=NOW(),
                  dead_reason=$3, dead_message=$4, dead_at=NOW(),
                  total_declined_count = COALESCE(total_declined_count,0) + 1
            WHERE id = $1`,
          [card.id, key, result.reason, mapped.long]
        ).catch(() => {});
      }
    }

    // ---- RETURN ----
    const providerName = provider.name || key;
    const merchantId = provider.config?.merchantId || null;

    return {
      ok: true,
      failover: false,
      success: !!result.success,
      status: result.success ? 'APPROVED' : 'DEAD',
      reason: result.reason || (result.success ? 'approved' : 'declined'),
      reasonShort: mapped.short,
      reasonLong: mapped.long,
      severity: mapped.severity,
      rawMessage: mapped.raw,
      provider: providerName,              // ⭐ providerName (key değil)
      providerKey: key,
      merchantId,                          // ⭐ EKLENDİ
      merchantName: providerName,          // ⭐ EKLENDİ
      providerCode: result.providerCode || null,
      message: result.message || null,
      amount,
      currency,
      authCode: result.authCode || null,
      chargeId: result.transactionId || result.chargeId || result.raw?.id || null,
      transactionId: result.transactionId || result.chargeId || result.raw?.id || null,
      txnId: saved?.id || null,
      refundedAmount,
      refundTxnId,
      netAmount: amount - refundedAmount,
      voided: false,
      duration,
      raw: result.raw || null,
      providerRaw: result.raw || null,
    };
  }

  // ============================================================
  // BALANCE WITH FAILOVER
  // ============================================================
  async function executeBalanceWithFailover(card, amount, refundAmount, cardChecker, ctx = {}) {
    const CONFIG = require('../config');
    const balanceCfg = CONFIG.BALANCE_CHECK || {};
    const priority = Array.isArray(balanceCfg.providerPriority) && balanceCfg.providerPriority.length
      ? balanceCfg.providerPriority
      : ['clover3', 'authorize3', 'moneris'];
    const enableFailover = balanceCfg.enableFailover !== false;

    const attempts = [];
    let lastOutcome = null;

    for (let i = 0; i < priority.length; i++) {
      const key = normalizeProviderKey(priority[i]);
      const outcome = await runPreauthViaProvider(card, amount, key, cardChecker, {
        ...ctx,
        refundAmount,
      });

      attempts.push({
        provider: key,
        ok: !!outcome.ok,
        success: !!outcome.success,
        reason: outcome.reason || null,
        status: outcome.status || null,
        duration: outcome.duration || null,
      });

      if (outcome.success) {
        return { ...outcome, attempts, finalProvider: key, failoverUsed: i > 0 };
      }

      if (!outcome.failover) {
        // Gerçek kart reddi → devam etme
        return { ...outcome, attempts, finalProvider: key, failoverUsed: i > 0 };
      }

      lastOutcome = outcome;
      if (!enableFailover) break;
      console.warn(`[BALANCE-FAILOVER] ${key} altyapı hatası → sıradaki: ${priority[i + 1] || 'yok'}`);
    }

    return {
      ...(lastOutcome || {
        ok: false, success: false, status: 'ERROR', reason: 'provider_error',
        error: 'Tüm providerlar başarısız',
      }),
      attempts,
      finalProvider: null,
      failoverUsed: attempts.length > 1,
    };
  }

  // ============================================================
  // GET /live-cards/filter-options
  // ============================================================
  router.get('/live-cards/filter-options', authMiddleware, async (req, res) => {
    try {
      const scope = 'FROM live_cards_full WHERE (user_id = $1 OR checked_by_user_id = $1)';
      const [countryResult, bankResult, statusResult, typeResult] = await Promise.all([
        db.pool.query(`SELECT DISTINCT country ${scope} AND country IS NOT NULL AND country <> '' ORDER BY country`, [req.user.id]),
        db.pool.query(`SELECT DISTINCT banka ${scope} AND banka IS NOT NULL AND banka <> '' ORDER BY banka`, [req.user.id]),
        db.pool.query(`SELECT DISTINCT COALESCE(status, 'LIVE') AS status ${scope} ORDER BY status`, [req.user.id]),
        db.pool.query(`SELECT DISTINCT type, level ${scope}`, [req.user.id]),
      ]);

      const cardTypes = new Set();
      for (const row of typeResult.rows) {
        const level = String(row.level || '').toUpperCase();
        const type = String(row.type || '').toUpperCase();
        if (level.includes('PREPAID')) cardTypes.add('PREPAID');
        else if (type === 'DEBIT' || type === 'CREDIT') cardTypes.add(type);
      }

      res.json({
        countries: countryResult.rows.map((row) => String(row.country).trim()).filter(Boolean),
        banks: bankResult.rows.map((row) => String(row.banka).trim()).filter(Boolean),
        statuses: statusResult.rows.map((row) => String(row.status).trim().toUpperCase()).filter(Boolean),
        cardTypes: [...cardTypes].sort(),
      });
    } catch (e) {
      console.error('[LIVE-CARDS-FILTER-OPTIONS]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // GET /live-cards
  // ============================================================
  router.get('/live-cards', authMiddleware, async (req, res) => {
    try {
      const { country, banka, level, bin, cardNumber, cardType, status, favoriteId, limit = 100, offset = 0, all } = req.query;
      const user = req.user;
      const cardNumberSearch = String(cardNumber || '').trim();
      if (cardNumberSearch && !/^(?:\d{4}|\d{13,19})$/.test(cardNumberSearch)) {
        return res.status(400).json({ error: 'Kart araması için son 4 hane veya tam kart numarası gerekli.' });
      }

      const favs = await db.pool.query(
        'SELECT id, name, bins, color FROM bin_favorites WHERE user_id = $1',
        [user.id]
      );

      let query = `
        SELECT 
          lcf.*,
          u.username AS checked_by_username,
          COALESCE(cc.check_count, 0) AS check_count_from_checks,
          cc.last_checked_at AS last_checked_at_from_checks,
          COALESCE(agg.total_auth, 0)      AS total_auth,
          COALESCE(agg.total_captured, 0)  AS total_captured,
          COALESCE(agg.total_sold, 0)      AS total_sold,
          COALESCE(agg.total_refunded, 0)  AS total_refunded,
          agg.last_txn_at                  AS last_txn_at,
          agg.last_provider                AS last_provider,
          COALESCE(agg.total_txn_count, 0)     AS total_txn_count,
          COALESCE(agg.success_txn_count, 0)   AS success_txn_count,
          COALESCE(agg.failed_txn_count, 0)    AS failed_txn_count,
          agg.last_decline_reason,
          agg.last_decline_message,
          agg.last_decline_at
        FROM live_cards_full lcf
        LEFT JOIN users u ON u.id = lcf.checked_by_user_id
        LEFT JOIN (
          SELECT pan_hash, COUNT(*) AS check_count, MAX(created_at) AS last_checked_at
          FROM card_checks GROUP BY pan_hash
        ) cc ON cc.pan_hash = encode(digest(lcf.pan, 'sha256'), 'hex')
        LEFT JOIN (
          SELECT
            live_card_id,
            SUM(CASE WHEN action IN ('preauth','auth','live_check') AND status='approved' THEN amount ELSE 0 END) AS total_auth,
            SUM(CASE WHEN action='capture' AND status='approved' THEN amount ELSE 0 END) AS total_captured,
            SUM(CASE WHEN action='sale' AND status='approved' THEN amount ELSE 0 END) AS total_sold,
            SUM(CASE WHEN action='refund' AND status='approved' THEN amount ELSE 0 END) AS total_refunded,
            COUNT(*) AS total_txn_count,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS success_txn_count,
            SUM(CASE WHEN status IN ('declined','error') THEN 1 ELSE 0 END) AS failed_txn_count,
            (ARRAY_AGG(reason ORDER BY created_at DESC) FILTER (WHERE status = 'declined'))[1] AS last_decline_reason,
            (ARRAY_AGG(display_message ORDER BY created_at DESC) FILTER (WHERE status = 'declined'))[1] AS last_decline_message,
            (ARRAY_AGG(created_at ORDER BY created_at DESC) FILTER (WHERE status = 'declined'))[1] AS last_decline_at,
            MAX(created_at) AS last_txn_at,
            (ARRAY_AGG(provider ORDER BY created_at DESC))[1] AS last_provider
          FROM charge_audit
          WHERE live_card_id IS NOT NULL
          GROUP BY live_card_id
        ) agg ON agg.live_card_id = lcf.id
        WHERE 1=1
      `;
      const params = [];

      if (user.role === 'admin' && all === 'true') {
        // tümü
      } else if (user.role === 'admin') {
        params.push(user.id);
        query += ` AND lcf.user_id = $${params.length}`;
      } else {
        params.push(user.id);
        query += ` AND (lcf.checked_by_user_id = $${params.length} OR lcf.user_id = $${params.length})`;
      }

      if (country) { params.push(country); query += ` AND lcf.country = $${params.length}`; }
      if (banka) { params.push(`%${banka}%`); query += ` AND lcf.banka ILIKE $${params.length}`; }
      if (level) { params.push(level); query += ` AND lcf.level = $${params.length}`; }
      if (bin) { params.push(`${bin}%`); query += ` AND lcf.pan LIKE $${params.length}`; }
      if (cardNumberSearch) {
        params.push(cardNumberSearch);
        query += cardNumberSearch.length === 4
          ? ` AND RIGHT(lcf.pan, 4) = $${params.length}`
          : ` AND lcf.pan = $${params.length}`;
      }
      if (status && ['LIVE', 'DEAD', 'UNKNOWN', 'ERROR'].includes(String(status).toUpperCase())) {
        params.push(String(status).toUpperCase());
        query += ` AND COALESCE(lcf.status, 'LIVE') = $${params.length}`;
      }
      if (favoriteId && /^\d+$/.test(String(favoriteId))) {
        params.push(Number(favoriteId));
        const favoriteParam = params.length;
        params.push(user.id);
        const ownerParam = params.length;
        query += ` AND EXISTS (
          SELECT 1 FROM bin_favorites bf
          CROSS JOIN LATERAL unnest(bf.bins) AS fav_bin(bin)
          WHERE bf.id = $${favoriteParam} AND bf.user_id = $${ownerParam}
            AND lcf.pan LIKE fav_bin.bin || '%'
        )`;
      }

      if (cardType) {
        const t = String(cardType).toUpperCase();
        if (t === 'PREPAID') {
          query += ` AND COALESCE(lcf.level, '') ILIKE '%PREPAID%'`;
        } else if (t === 'DEBIT') {
          query += ` AND UPPER(COALESCE(lcf.type, '')) = 'DEBIT'
                     AND COALESCE(lcf.level, '') NOT ILIKE '%PREPAID%'`;
        } else if (t === 'CREDIT') {
          query += ` AND UPPER(COALESCE(lcf.type, '')) = 'CREDIT'
                     AND COALESCE(lcf.level, '') NOT ILIKE '%PREPAID%'`;
        }
      }

      params.push(parseInt(limit));
      query += `
        ORDER BY 
          CASE WHEN lcf.status = 'LIVE' THEN 0 ELSE 1 END,
          COALESCE(lcf.last_checked_at, lcf.updated_at) DESC NULLS LAST,
          lcf.id DESC
        LIMIT $${params.length}
      `;

      params.push(parseInt(offset));
      query += ` OFFSET $${params.length}`;

      const result = await db.pool.query(query, params);

      const cards = result.rows.map((card) => {
        const matchedFavs = favs.rows.filter((fav) =>
          (fav.bins || []).some((b) => card.pan.startsWith(b))
        );

        const checkCount = parseInt(card.check_count_from_checks) || 0;
        const lastCheckedAt = card.last_checked_at_from_checks || card.last_checked_at || null;

        const deadMapped = card.dead_reason
          ? mapReason(card.dead_reason, card.dead_message)
          : null;
        const lastDeclineMapped = card.last_decline_reason
          ? mapReason(card.last_decline_reason, card.last_decline_message)
          : null;

        return {
          ...card,
          check_count: checkCount,
          last_checked_at: lastCheckedAt,
          checked_by_username: card.checked_by_username || null,
          status: card.status || 'LIVE',
          last_provider: card.last_provider || null,
          total_auth: parseFloat(card.total_auth) || 0,
          total_captured: parseFloat(card.total_captured) || 0,
          total_sold: parseFloat(card.total_sold) || 0,
          total_refunded: parseFloat(card.total_refunded) || 0,
          last_txn_at: card.last_txn_at || null,
          total_txn_count: parseInt(card.total_txn_count) || 0,
          success_txn_count: parseInt(card.success_txn_count) || 0,
          failed_txn_count: parseInt(card.failed_txn_count) || 0,
          last_decline_reason: card.last_decline_reason || null,
          last_decline_message: card.last_decline_message || null,
          last_decline_at: card.last_decline_at || null,
          last_decline_reason_short: lastDeclineMapped?.short || null,
          last_decline_reason_long: lastDeclineMapped?.long || null,
          dead_reason: card.dead_reason || null,
          dead_message: card.dead_message || null,
          dead_at: card.dead_at || null,
          dead_reason_short: deadMapped?.short || null,
          dead_reason_long: deadMapped?.long || null,
          total_declined_count: parseInt(card.total_declined_count) || 0,
          favLists: matchedFavs.map((f) => ({ id: f.id, name: f.name, color: f.color })),
        };
      });

      let countQuery = 'SELECT COUNT(*) FROM live_cards_full lcf WHERE 1=1';
      const countParams = [];

      if (user.role === 'admin' && all === 'true') {
        // tümü
      } else if (user.role === 'admin') {
        countParams.push(user.id);
        countQuery += ` AND lcf.user_id = $${countParams.length}`;
      } else {
        countParams.push(user.id);
        countQuery += ` AND (lcf.checked_by_user_id = $${countParams.length} OR lcf.user_id = $${countParams.length})`;
      }

      if (country) { countParams.push(country); countQuery += ` AND lcf.country = $${countParams.length}`; }
      if (banka) { countParams.push(`%${banka}%`); countQuery += ` AND lcf.banka ILIKE $${countParams.length}`; }
      if (level) { countParams.push(level); countQuery += ` AND lcf.level = $${countParams.length}`; }
      if (bin) { countParams.push(`${bin}%`); countQuery += ` AND lcf.pan LIKE $${countParams.length}`; }
      if (cardNumberSearch) {
        countParams.push(cardNumberSearch);
        countQuery += cardNumberSearch.length === 4
          ? ` AND RIGHT(lcf.pan, 4) = $${countParams.length}`
          : ` AND lcf.pan = $${countParams.length}`;
      }
      if (status && ['LIVE', 'DEAD', 'UNKNOWN', 'ERROR'].includes(String(status).toUpperCase())) {
        countParams.push(String(status).toUpperCase());
        countQuery += ` AND COALESCE(lcf.status, 'LIVE') = $${countParams.length}`;
      }
      if (favoriteId && /^\d+$/.test(String(favoriteId))) {
        countParams.push(Number(favoriteId));
        const favoriteParam = countParams.length;
        countParams.push(user.id);
        const ownerParam = countParams.length;
        countQuery += ` AND EXISTS (
          SELECT 1 FROM bin_favorites bf
          CROSS JOIN LATERAL unnest(bf.bins) AS fav_bin(bin)
          WHERE bf.id = $${favoriteParam} AND bf.user_id = $${ownerParam}
            AND lcf.pan LIKE fav_bin.bin || '%'
        )`;
      }
      if (cardType) {
        const t = String(cardType).toUpperCase();
        if (t === 'PREPAID') {
          countQuery += ` AND COALESCE(lcf.level, '') ILIKE '%PREPAID%'`;
        } else if (t === 'DEBIT') {
          countQuery += ` AND UPPER(COALESCE(lcf.type, '')) = 'DEBIT'
                          AND COALESCE(lcf.level, '') NOT ILIKE '%PREPAID%'`;
        } else if (t === 'CREDIT') {
          countQuery += ` AND UPPER(COALESCE(lcf.type, '')) = 'CREDIT'
                          AND COALESCE(lcf.level, '') NOT ILIKE '%PREPAID%'`;
        }
      }

      const countResult = await db.pool.query(countQuery, countParams);

      res.json({
        total: parseInt(countResult.rows[0].count),
        count: cards.length,
        cards,
        isAdmin: user.role === 'admin',
      });
    } catch (e) {
      console.error('[LIVE-CARDS]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // GET /live-cards/:id
  // ============================================================
  router.get('/live-cards/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
      const cardResult = await db.pool.query(
        `SELECT 
           lcf.*,
           u.username AS checked_by_username,
           COALESCE(cc.check_count, 0) AS check_count_from_checks,
           cc.last_checked_at AS last_checked_at_from_checks,
           COALESCE(agg.total_auth, 0)      AS total_auth,
           COALESCE(agg.total_captured, 0)  AS total_captured,
           COALESCE(agg.total_sold, 0)      AS total_sold,
           COALESCE(agg.total_refunded, 0)  AS total_refunded,
           agg.last_txn_at,
           agg.last_provider,
           COALESCE(agg.total_txn_count, 0)   AS total_txn_count,
           COALESCE(agg.success_txn_count, 0) AS success_txn_count,
           COALESCE(agg.failed_txn_count, 0)  AS failed_txn_count,
           agg.last_decline_reason,
           agg.last_decline_message,
           agg.last_decline_at
         FROM live_cards_full lcf
         LEFT JOIN users u ON u.id = lcf.checked_by_user_id
         LEFT JOIN (
           SELECT pan_hash, COUNT(*) AS check_count, MAX(created_at) AS last_checked_at
           FROM card_checks GROUP BY pan_hash
         ) cc ON cc.pan_hash = encode(digest(lcf.pan, 'sha256'), 'hex')
         LEFT JOIN (
           SELECT
             live_card_id,
             SUM(CASE WHEN action IN ('preauth','auth','live_check') AND status='approved' THEN amount ELSE 0 END) AS total_auth,
             SUM(CASE WHEN action='capture' AND status='approved' THEN amount ELSE 0 END) AS total_captured,
             SUM(CASE WHEN action='sale' AND status='approved' THEN amount ELSE 0 END) AS total_sold,
             SUM(CASE WHEN action='refund' AND status='approved' THEN amount ELSE 0 END) AS total_refunded,
             MAX(created_at) AS last_txn_at,
             (ARRAY_AGG(provider ORDER BY created_at DESC))[1] AS last_provider,
             COUNT(*) AS total_txn_count,
             SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS success_txn_count,
             SUM(CASE WHEN status IN ('declined','error') THEN 1 ELSE 0 END) AS failed_txn_count,
             (ARRAY_AGG(reason ORDER BY created_at DESC) FILTER (WHERE status = 'declined'))[1] AS last_decline_reason,
             (ARRAY_AGG(display_message ORDER BY created_at DESC) FILTER (WHERE status = 'declined'))[1] AS last_decline_message,
             (ARRAY_AGG(created_at ORDER BY created_at DESC) FILTER (WHERE status = 'declined'))[1] AS last_decline_at
           FROM charge_audit
           WHERE live_card_id IS NOT NULL
           GROUP BY live_card_id
         ) agg ON agg.live_card_id = lcf.id
         WHERE lcf.id = $1 AND (lcf.user_id = $2 OR lcf.checked_by_user_id = $2)`,
        [id, req.user.id]
      );

      if (cardResult.rows.length === 0) {
        return res.status(404).json({ error: 'Kart bulunamadı' });
      }

      const favs = await db.pool.query(
        'SELECT id, name, bins, color FROM bin_favorites WHERE user_id = $1',
        [req.user.id]
      );

      const card = cardResult.rows[0];
      const checkCount = parseInt(card.check_count_from_checks) || 0;
      const lastCheckedAt = card.last_checked_at_from_checks || card.last_checked_at || null;

      const deadMapped = card.dead_reason
        ? mapReason(card.dead_reason, card.dead_message)
        : null;
      const lastDeclineMapped = card.last_decline_reason
        ? mapReason(card.last_decline_reason, card.last_decline_message)
        : null;

      const matchedFavs = favs.rows.filter((fav) =>
        (fav.bins || []).some((b) => String(card.pan || '').startsWith(b))
      );

      res.json({
        ...card,
        check_count: checkCount,
        last_checked_at: lastCheckedAt,
        checked_by_username: card.checked_by_username || null,
        status: card.status || 'LIVE',
        last_provider: card.last_provider || null,
        total_auth: parseFloat(card.total_auth) || 0,
        total_captured: parseFloat(card.total_captured) || 0,
        total_sold: parseFloat(card.total_sold) || 0,
        total_refunded: parseFloat(card.total_refunded) || 0,
        last_txn_at: card.last_txn_at || null,
        total_txn_count: parseInt(card.total_txn_count) || 0,
        success_txn_count: parseInt(card.success_txn_count) || 0,
        failed_txn_count: parseInt(card.failed_txn_count) || 0,
        last_decline_reason: card.last_decline_reason || null,
        last_decline_message: card.last_decline_message || null,
        last_decline_at: card.last_decline_at || null,
        last_decline_reason_short: lastDeclineMapped?.short || null,
        last_decline_reason_long: lastDeclineMapped?.long || null,
        dead_reason: card.dead_reason || null,
        dead_message: card.dead_message || null,
        dead_at: card.dead_at || null,
        dead_reason_short: deadMapped?.short || null,
        dead_reason_long: deadMapped?.long || null,
        total_declined_count: parseInt(card.total_declined_count) || 0,
        favLists: matchedFavs.map((f) => ({ id: f.id, name: f.name, color: f.color })),
      });
    } catch (e) {
      console.error('[LIVE-CARD-BY-ID]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // POST /verify
  // ============================================================
  router.post('/verify', authMiddleware, async (req, res) => {
    const { card } = req.body;
    if (!card) return res.status(400).json({ error: 'card gerekli' });

    const parsed = CardParser.parseSimple(card);
    if (!parsed) return res.status(400).json({ error: 'geçersiz format' });

    try {
      const enriched = await cardChecker.checkAndEnrich(parsed);
      const normalized = normalizeEnriched(enriched);

      try {
        await dbService.saveCardCheck(req.user.id, parsed, enriched);
        if (normalized.status === 'LIVE') {
          await dbService.saveLiveCardFull(req.user.id, parsed, enriched, enriched.bin);
        }
      } catch (dbErr) {
        console.error('[DB]', dbErr.message);
      }

      const providerKey = normalized.providerKey;
      if (normalized.status === 'LIVE') {
        await db.pool.query(
          `UPDATE live_cards_full
              SET status='LIVE', last_provider=$2, last_checked_at=NOW(),
                  check_count=COALESCE(check_count,0)+1,
                  checked_by_user_id=$3,
                  dead_reason=NULL, dead_message=NULL, dead_at=NULL
            WHERE pan=$1 AND (user_id=$3 OR checked_by_user_id=$3)`,
          [parsed.pan, providerKey, req.user.id]
        ).catch(() => {});
      } else if (normalized.status === 'DEAD') {
        const mapped = mapReason(normalized.reason, normalized.message);
        await db.pool.query(
          `UPDATE live_cards_full
              SET status='DEAD', last_provider=$2, last_checked_at=NOW(),
                  dead_reason=$4, dead_message=$5, dead_at=NOW(),
                  total_declined_count = COALESCE(total_declined_count,0) + 1
            WHERE pan=$1 AND (user_id=$3 OR checked_by_user_id=$3)`,
          [parsed.pan, providerKey, req.user.id, normalized.reason, mapped.long]
        ).catch(() => {});
      }
      // ERROR / UNKNOWN → status'a dokunma

      res.json(normalized);
    } catch (e) {
      console.error('[VERIFY]', e.message);
      const mapped = mapReason('provider_error', e.message);
      res.status(500).json({
        success: false, status: 'ERROR', reason: 'provider_error',
        reasonShort: mapped.short, reasonLong: mapped.long,
        error: e.message,
      });
    }
  });

  // ============================================================
  // POST /live-cards/:id/recheck
  // ============================================================
  router.post('/live-cards/:id/recheck', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { bulkMode = false } = req.body || {};

    try {
      const cardResult = await db.pool.query(
        'SELECT * FROM live_cards_full WHERE id = $1 AND (user_id = $2 OR checked_by_user_id = $2)',
        [id, req.user.id]
      );

      if (cardResult.rows.length === 0) {
        return res.status(404).json({ error: 'Kart bulunamadı' });
      }

      const card = cardResult.rows[0];

      // ⭐ COOLDOWN: bulk = 24 saat, tekli = 1 saat
      const cooldownHours = bulkMode ? 24 : 1;
      const recent = await db.pool.query(
        `SELECT COUNT(*)::int AS cnt FROM charge_audit
         WHERE live_card_id = $1
           AND action = 'live_check'
           AND created_at > NOW() - ($2 || ' hours')::interval`,
        [id, String(cooldownHours)]
      );

      if (recent.rows[0].cnt > 0) {
        return res.status(429).json({
          success: false,
          status: 'ERROR',
          reason: 'recheck_cooldown',
          reasonShort: 'Cooldown',
          reasonLong: `Bu kart için son ${cooldownHours} saat içinde check yapılmış. Tekrar denemek için bekleyin.`,
        });
      }

      // ⭐ bulkMode'u tryLiveCheckViaCardChecker'a geç
      const outcome = await tryLiveCheckViaCardChecker(
        { ...card, id: card.id },
        cardChecker,
        { userId: req.user.id, bulkMode }
      );

      const response = normalizeBalanceResponse(outcome, 'live_check');
      res.json(response);
    } catch (e) {
      console.error('[RECHECK]', e.message);
      const mapped = mapReason('provider_error', e.message);
      res.status(500).json({
        success: false,
        status: 'ERROR',
        reason: 'provider_error',
        reasonShort: mapped.short,
        reasonLong: mapped.long,
        error: e.message,
      });
    }
  });

  // ============================================================
  // POST /live-cards/:id/balance-check
  // ============================================================
  router.post('/live-cards/:id/balance-check', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const {
      amount = 1,
      refundAmount = null,
      provider: forcedProvider,
      operation = 'preauth',
    } = req.body;

    const isLiveCheck = operation === 'live_check';
    const authAmount = isLiveCheck ? 0 : Number(amount);

    if (!isLiveCheck && (!authAmount || authAmount < 1)) {
      return res.status(400).json({ error: 'amount gerekli (min 1) — live_check için 0' });
    }

    try {
      const cardResult = await db.pool.query(
        'SELECT * FROM live_cards_full WHERE id = $1 AND (user_id = $2 OR checked_by_user_id = $2)',
        [id, req.user.id]
      );

      if (cardResult.rows.length === 0) {
        return res.status(404).json({ error: 'Kart bulunamadı' });
      }

      const card = cardResult.rows[0];
      const CONFIG = require('../config');
      const balanceCfg = CONFIG.BALANCE_CHECK || {};

      let selectedProvider = forcedProvider ? normalizeProviderKey(forcedProvider) : null;
      if (!selectedProvider) {
        try {
          selectedProvider = await processorRoutingService.resolveProvider(
            req.user.id, card.pan, balanceCfg.provider || 'clover3'
          );
          selectedProvider = normalizeProviderKey(selectedProvider);
        } catch (_) {
          selectedProvider = balanceCfg.provider || 'clover3';
        }
      }

      const effectiveRefund = isLiveCheck
        ? 0
        : refundAmount != null
        ? Number(refundAmount)
        : (balanceCfg.refundAmount ?? 0);

      let outcome;

      if (isLiveCheck) {
        outcome = selectedProvider === 'moneris'
          ? await runLiveCheckViaProvider(card, 'moneris', cardChecker, { userId: req.user.id })
          : await tryLiveCheckViaCardChecker(card, cardChecker, { userId: req.user.id });
      } else {
        if (forcedProvider) {
          outcome = await runPreauthViaProvider(
            card, authAmount, normalizeProviderKey(forcedProvider),
            cardChecker, { userId: req.user.id, refundAmount: effectiveRefund }
          );
        } else {
          outcome = await executeBalanceWithFailover(
            card, authAmount, effectiveRefund, cardChecker,
            { userId: req.user.id }
          );
        }
      }

      selectedProvider = outcome.finalProvider || selectedProvider;

      if (outcome.txnId) {
        await db.pool.query(
          `UPDATE charge_audit SET live_card_id = $1, operation = $2 WHERE id = $3`,
          [id, operation, outcome.txnId]
        ).catch(() => {});
      }

      let binData = null;
      try {
        binData = await cardChecker.binDb.lookupWithFallback(
          String(card.pan || '').replace(/\D/g, '').slice(0, 6),
          cardChecker.externalApi
        );
      } catch (_) {}

      return res.json(normalizeBalanceResponse({
        ...outcome,
        provider: outcome.provider || selectedProvider,
        providerKey: outcome.providerKey || selectedProvider,
        merchantId: outcome.merchantId ?? null,
        merchantName: outcome.merchantName ?? null,
        operation,
        bin: binData,
      }, operation));
    } catch (e) {
      console.error('[BALANCE-CHECK]', e.message);
      res.status(500).json(normalizeBalanceResponse({
        success: false, status: 'ERROR', reason: 'provider_error',
        error: { message: e.message },
      }, operation));
    }
  });

  // ============================================================
  // POST /balance-check (raw card)
  // ============================================================
  router.post('/balance-check', authMiddleware, async (req, res) => {
    const {
      card, amount,
      refundAmount = null,
      provider: forcedProvider,
      operation = 'preauth',
    } = req.body;
    if (!card) return res.status(400).json({ error: 'card gerekli' });

    const isLiveCheck = operation === 'live_check';
    const authAmount = isLiveCheck ? 0 : Number(amount);
    if (!isLiveCheck && (!authAmount || authAmount < 1)) {
      return res.status(400).json({ error: 'amount gerekli (min 1) — live_check için 0' });
    }

    const parsed = CardParser.parseSimple(card);
    if (!parsed) return res.status(400).json({ error: 'geçersiz format' });

    const CONFIG = require('../config');
    const balanceCfg = CONFIG.BALANCE_CHECK || {};

    const normalizedCard = {
      pan: parsed.pan,
      exp: `${String(parsed.expMonth).padStart(2, '0')}/${parsed.expYear}`,
      cvv: parsed.cvv,
      type: parsed.brand || '',
      name: `${parsed.firstName || 'Test'} ${parsed.lastName || 'User'}`,
      address: parsed.address || '',
      city: parsed.city || '',
      state: parsed.state || '',
      zip: parsed.zip || '',
      country: parsed.country || 'US',
      phone: parsed.phone || '',
      email: parsed.email || '',
    };

    let selectedProvider = forcedProvider ? normalizeProviderKey(forcedProvider) : null;
    if (!selectedProvider) {
      try {
        selectedProvider = await processorRoutingService.resolveProvider(
          req.user.id, parsed.pan, balanceCfg.provider || 'clover3'
        );
        selectedProvider = normalizeProviderKey(selectedProvider);
      } catch (_) {
        selectedProvider = balanceCfg.provider || 'clover3';
      }
    }

    const effectiveRefund = isLiveCheck
      ? 0
      : refundAmount != null
      ? Number(refundAmount)
      : (balanceCfg.refundAmount ?? 0);

    try {
      let outcome;

      if (isLiveCheck) {
        outcome = selectedProvider === 'moneris'
          ? await runLiveCheckViaProvider(normalizedCard, 'moneris', cardChecker, { userId: req.user.id })
          : await tryLiveCheckViaCardChecker(normalizedCard, cardChecker, { userId: req.user.id });
      } else if (forcedProvider) {
        outcome = await runPreauthViaProvider(
          normalizedCard, authAmount, normalizeProviderKey(forcedProvider),
          cardChecker, { userId: req.user.id, refundAmount: effectiveRefund }
        );
      } else {
        outcome = await executeBalanceWithFailover(
          normalizedCard, authAmount, effectiveRefund, cardChecker,
          { userId: req.user.id }
        );
      }

      selectedProvider = outcome.finalProvider || selectedProvider;

      let binData = null;
      try {
        binData = await cardChecker.binDb.lookupWithFallback(
          parsed.pan.slice(0, 6), cardChecker.externalApi
        );
      } catch (_) {}

      return res.json(normalizeBalanceResponse({
        ...outcome,
        provider: outcome.provider || selectedProvider,
        providerKey: outcome.providerKey || selectedProvider,
        merchantId: outcome.merchantId ?? null,
        merchantName: outcome.merchantName ?? null,
        operation,
        bin: binData,
      }, operation));
    } catch (e) {
      console.error('[BALANCE-CHECK]', e.message);
      res.status(500).json(normalizeBalanceResponse({
        success: false, status: 'ERROR', reason: 'provider_error',
        error: { message: e.message },
      }, operation));
    }
  });

  // ============================================================
  // GET /provider-transactions/summary
  // ============================================================
  router.get('/provider-transactions/summary', authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      const { dateFrom, dateTo, provider, scope = 'mine' } = req.query;
      const userId = scope === 'all' && user.role === 'admin' ? null : user.id;

      const rows = await dbService.getProviderSummary({
        userId,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        provider: provider || null,
      });

      let totalApproved = 0, totalDeclined = 0, totalError = 0;
      let totalAmount = 0, totalCaptured = 0, totalRefunded = 0, totalVoided = 0;
      const byProvider = {};

      for (const r of rows) {
        const c = parseInt(r.count, 10);
        const amt = parseFloat(r.total_amount) || 0;
        const cap = parseFloat(r.total_captured) || 0;
        const ref = parseFloat(r.total_refunded) || 0;

        if (!byProvider[r.provider]) {
          byProvider[r.provider] = {
            approved: 0, declined: 0, error: 0, voided: 0,
            amount: 0, captured: 0, refunded: 0,
          };
        }

        if (r.status === 'approved') {
          totalApproved += c;
          byProvider[r.provider].approved += c;
          totalAmount += amt;
          byProvider[r.provider].amount += amt;
        } else if (r.status === 'declined') {
          totalDeclined += c;
          byProvider[r.provider].declined += c;
        } else if (r.status === 'voided') {
          totalVoided += c;
          byProvider[r.provider].voided += c;
        } else if (r.status === 'error') {
          totalError += c;
          byProvider[r.provider].error += c;
        }

        totalCaptured += cap;
        totalRefunded += ref;
        byProvider[r.provider].captured += cap;
        byProvider[r.provider].refunded += ref;
      }

      res.json({
        success: true,
        totals: {
          approved: totalApproved, declined: totalDeclined,
          error: totalError, voided: totalVoided,
          amount: totalAmount, captured: totalCaptured, refunded: totalRefunded,
        },
        byProvider,
        breakdown: rows,
      });
    } catch (e) {
      console.error('[TXN-SUMMARY]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // GET /provider-transactions
  // ============================================================
  router.get('/provider-transactions', authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      const {
        provider, action, status, cardId, pan,
        dateFrom, dateTo,
        onlyVoidable, onlyCapturable, onlyRefundable,
        limit = 100, offset = 0, scope = 'mine',
      } = req.query;

      const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
      const pageOffset = Math.max(0, parseInt(offset, 10) || 0);

      const userId = scope === 'all' && user.role === 'admin' ? null : user.id;

      const rows = await dbService.listProviderTransactions({
        userId,
        provider: provider || null,
        action: action || null,
        status: status || null,
        cardId: cardId ? parseInt(cardId) : null,
        pan: pan || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        onlyVoidable: onlyVoidable === 'true',
        onlyCapturable: onlyCapturable === 'true',
        onlyRefundable: onlyRefundable === 'true',
        limit: pageLimit,
        offset: pageOffset,
      });

      const total = Number(rows[0]?.total_count || 0);
      const transactions = rows.map(({ total_count, ...row }) => row);
      res.json({ success: true, count: transactions.length, total, transactions });
    } catch (e) {
      console.error('[TXN-LIST]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // POST /provider-transactions/:id/void
  // ============================================================
  router.post('/provider-transactions/:id/void', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    try {
      const txn = await dbService.getProviderTransactionById(parseInt(id));
      if (!txn) return res.status(404).json({ error: 'İşlem bulunamadı' });
      if (user.role !== 'admin' && txn.user_id !== user.id) {
        return res.status(403).json({ error: 'Yetki yok' });
      }
      if (txn.is_voided) return res.status(400).json({ error: 'Zaten void edilmiş' });
      if (!txn.provider_txn_id) return res.status(400).json({ error: 'Provider txn id yok' });

      const providerKey = normalizeProviderKey(txn.provider);

      let result;
      try {
        result = await cardChecker.voidWithProvider(
          txn.provider_txn_id,
          providerKey,
          null,
          txn.amount
        );
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }

      const success = !!result.success;
      const errorMsg = success ? null : (result.message || result.reason || 'void başarısız');

      await dbService.logProviderTransaction({
        userId: user.id, cardId: txn.card_id, provider: txn.provider,
        action: 'void', mode: txn.mode, providerTxnId: txn.provider_txn_id,
        amount: txn.amount, currency: txn.currency,
        status: success ? 'voided' : 'error',
        reason: success ? 'approved' : 'provider_error',
        message: errorMsg || 'Void başarılı',
        parentTxnId: txn.id,
        pan: txn.pan_masked, panMasked: txn.pan_masked,
        bin: txn.bin, brand: txn.brand,
      }).catch(() => {});

      if (success) {
        await dbService.updateProviderTransaction(txn.id, {
          isVoided: true, status: 'voided',
        });
      }

      res.json({
        success,
        status: success ? 'voided' : 'error',
        method: result.method || null,
        error: errorMsg,
        txnId: txn.id,
      });
    } catch (e) {
      console.error('[TXN-VOID]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // POST /provider-transactions/:id/capture
  // ============================================================
  router.post('/provider-transactions/:id/capture', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    const user = req.user;

    try {
      const txn = await dbService.getProviderTransactionById(parseInt(id));
      if (!txn) return res.status(404).json({ error: 'İşlem bulunamadı' });
      if (user.role !== 'admin' && txn.user_id !== user.id) {
        return res.status(403).json({ error: 'Yetki yok' });
      }
      if (txn.is_captured) return res.status(400).json({ error: 'Zaten capture edilmiş' });
      if (txn.is_voided) return res.status(400).json({ error: 'Void edilmiş, capture edilemez' });
      if (!txn.provider_txn_id) return res.status(400).json({ error: 'Provider txn id yok' });

      const captureAmount = amount || txn.amount;
      const providerKey = normalizeProviderKey(txn.provider);

      let result;
      try {
        result = await cardChecker.captureWithProvider(
          txn.provider_txn_id,
          captureAmount,
          providerKey
        );
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }

      const success = !!result.success;
      const captureId = result.transactionId || result.raw?.id || null;
      const errorMsg = success ? null : (result.message || result.reason || 'capture başarısız');

      await dbService.logProviderTransaction({
        userId: user.id, cardId: txn.card_id, provider: txn.provider,
        action: 'capture', mode: txn.mode,
        providerTxnId: captureId || txn.provider_txn_id,
        amount: captureAmount, currency: txn.currency,
        capturedAmount: success ? captureAmount : 0,
        status: success ? 'captured' : 'error',
        reason: success ? 'approved' : 'provider_error',
        message: errorMsg || 'Capture başarılı',
        parentTxnId: txn.id,
        pan: txn.pan_masked, panMasked: txn.pan_masked,
        bin: txn.bin, brand: txn.brand,
      }).catch(() => {});

      if (success) {
        await dbService.updateProviderTransaction(txn.id, {
          isCaptured: true, status: 'captured', capturedAmount: captureAmount,
        });

        if (txn.card_id) {
          await db.pool.query(
            `UPDATE live_cards_full
                SET total_captured = COALESCE(total_captured,0) + $2,
                    last_txn_at = NOW()
              WHERE id = $1`,
            [txn.card_id, captureAmount]
          ).catch(() => {});
        }
      }

      res.json({
        success,
        status: success ? 'captured' : 'error',
        capturedAmount: success ? captureAmount : 0,
        error: errorMsg,
        txnId: txn.id,
      });
    } catch (e) {
      console.error('[TXN-CAPTURE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // POST /provider-transactions/:id/refund
  // ============================================================
  router.post('/provider-transactions/:id/refund', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { amount, fullRefund } = req.body;
    const user = req.user;

    try {
      const txn = await dbService.getProviderTransactionById(parseInt(id));
      if (!txn) return res.status(404).json({ error: 'İşlem bulunamadı' });
      if (user.role !== 'admin' && txn.user_id !== user.id) {
        return res.status(403).json({ error: 'Yetki yok' });
      }
      if (txn.is_refunded) return res.status(400).json({ error: 'Zaten refund edilmiş' });
      if (!txn.provider_txn_id) return res.status(400).json({ error: 'Provider txn id yok' });

      const refundAmount = fullRefund ? (txn.captured_amount || txn.amount) : amount;
      if (!refundAmount || refundAmount <= 0) {
        return res.status(400).json({ error: 'Geçersiz refund amount' });
      }

      const providerKey = normalizeProviderKey(txn.provider);

      let result;
      try {
        result = await cardChecker.refundWithProvider(
          txn.provider_txn_id,
          refundAmount,
          providerKey
        );
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }

      const success = !!result.success;
      const refundId = result.transactionId || result.raw?.id || null;
      const errorMsg = success ? null : (result.message || result.reason || 'refund başarısız');

      await dbService.logProviderTransaction({
        userId: user.id, cardId: txn.card_id, provider: txn.provider,
        action: 'refund', mode: txn.mode,
        providerTxnId: refundId || txn.provider_txn_id,
        amount: refundAmount, currency: txn.currency,
        refundedAmount: success ? refundAmount : 0,
        status: success ? 'refunded' : 'error',
        reason: success ? 'approved' : 'provider_error',
        message: errorMsg || 'Refund başarılı',
        parentTxnId: txn.id,
        pan: txn.pan_masked, panMasked: txn.pan_masked,
        bin: txn.bin, brand: txn.brand,
      }).catch(() => {});

      if (success) {
        const newRefunded = (parseFloat(txn.refunded_amount) || 0) + refundAmount;
        const totalAmount = parseFloat(txn.captured_amount || txn.amount) || 0;
        const fullyRefunded = newRefunded >= totalAmount;

        await dbService.updateProviderTransaction(txn.id, {
          isRefunded: fullyRefunded,
          status: fullyRefunded ? 'refunded' : 'partially_refunded',
          refundedAmount: newRefunded,
        });

        if (txn.card_id) {
          await db.pool.query(
            `UPDATE live_cards_full
                SET total_refunded = COALESCE(total_refunded,0) + $2,
                    last_txn_at = NOW()
              WHERE id = $1`,
            [txn.card_id, refundAmount]
          ).catch(() => {});
        }
      }

      res.json({
        success,
        status: success ? 'refunded' : 'error',
        refundedAmount: success ? refundAmount : 0,
        error: errorMsg,
        txnId: txn.id,
      });
    } catch (e) {
      console.error('[TXN-REFUND]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // GET /analytics/bin-provider-matrix
  // ============================================================
  router.get('/analytics/bin-provider-matrix', authMiddleware, async (req, res) => {
    try {
      const { minTotal = 5, dateFrom = null, dateTo = null, scope = 'all' } = req.query;
      const userFilter = scope === 'all' && req.user.role === 'admin' ? null : req.user.id;

      const where = [`bin IS NOT NULL`];
      const params = [];

      if (userFilter != null) { params.push(userFilter); where.push(`user_id = $${params.length}`); }
      if (dateFrom) { params.push(dateFrom); where.push(`created_at >= $${params.length}`); }
      if (dateTo) { params.push(dateTo); where.push(`created_at <= $${params.length}`); }
      where.push(`action IN ('sale','preauth','auth','live_check')`);

      const whereClause = where.join(' AND ');

      const matrixSql = `
        SELECT 
          bin, provider,
          COUNT(*)::int AS total,
          SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END)::int AS approved,
          SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END)::int AS declined,
          SUM(CASE WHEN status='error' THEN 1 ELSE 0 END)::int AS errors,
          ROUND(
            100.0 * SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) 
            / NULLIF(COUNT(*), 0), 1
          )::float AS approval_rate
        FROM charge_audit
        WHERE ${whereClause}
        GROUP BY bin, provider
        ORDER BY bin, approval_rate DESC NULLS LAST
      `;
      const matrix = await db.pool.query(matrixSql, params);

      const recommendSql = `
        WITH stats AS (
          SELECT 
            bin, provider,
            COUNT(*)::int AS total,
            SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END)::int AS approved,
            ROUND(
              100.0 * SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) 
              / NULLIF(COUNT(*), 0), 1
            )::float AS approval_rate
          FROM charge_audit WHERE ${whereClause}
          GROUP BY bin, provider
          HAVING COUNT(*) >= $${params.length + 1}
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY bin ORDER BY approval_rate DESC, total DESC) AS rn
          FROM stats
        )
        SELECT bin, provider, total, approved, approval_rate FROM ranked WHERE rn = 1
        ORDER BY bin
      `;
      const recommendations = await db.pool.query(recommendSql, [...params, parseInt(minTotal)]);

      const worstPerBin = await db.pool.query(
        `
        SELECT bin, provider, total, approval_rate
        FROM (
          SELECT 
            bin, provider,
            COUNT(*)::int AS total,
            ROUND(100.0 * SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)::float AS approval_rate,
            ROW_NUMBER() OVER (PARTITION BY bin ORDER BY ROUND(100.0 * SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) ASC NULLS LAST) AS rn
          FROM charge_audit WHERE ${whereClause}
          GROUP BY bin, provider
          HAVING COUNT(*) >= $${params.length + 1}
        ) t WHERE rn = 1
        `,
        [...params, parseInt(minTotal)]
      );

      const worstMap = Object.fromEntries(worstPerBin.rows.map((r) => [r.bin, r]));

      const finalRecommendations = recommendations.rows.map((best) => {
        const worst = worstMap[best.bin] || null;
        const gain = worst && worst.provider !== best.provider
          ? Math.round((best.approval_rate - worst.approval_rate) * 10) / 10
          : 0;

        return {
          bin: best.bin,
          recommended_provider: best.provider,
          recommended_rate: best.approval_rate,
          recommended_total: best.total,
          recommended_approved: best.approved,
          worst_provider: worst?.provider || null,
          worst_rate: worst?.approval_rate || null,
          worst_total: worst?.total || null,
          gain_pct: gain,
          has_alternative: !!worst && worst.provider !== best.provider,
        };
      });

      finalRecommendations.sort((a, b) => b.gain_pct - a.gain_pct);

      res.json({
        matrix: matrix.rows,
        recommendations: finalRecommendations,
        total_bins: new Set(matrix.rows.map((r) => r.bin)).size,
        total_providers: new Set(matrix.rows.map((r) => r.provider)).size,
      });
    } catch (e) {
      console.error('[ANALYTICS-BIN-MATRIX]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
