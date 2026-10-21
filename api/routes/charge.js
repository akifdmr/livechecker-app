// ============================================================
// CHARGE ROUTES — auth / capture / refund / sale
// + display_reason / display_message tracking
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const CardParser = require('../services/CardParser');
const db = require('../db');
const CONFIG = require('../config');
const { mapReason } = require('../utils/reasonMapper');

module.exports = (deps) => {
  const { providers, processorRoutingService } = deps;

  // ------------------------------------------------------------
  // POST /charge
  // ------------------------------------------------------------
  router.post('/charge', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin gerekli' });
    }

    const {
      card, amount, provider: forcedProvider,
      operation = 'preauth',
      refundAmount = null,
      capture = false,
      liveCardId = null,
    } = req.body;

    if (!card) return res.status(400).json({ error: 'card gerekli' });

    const isLiveCheck = operation === 'live_check';
    const numericAmount = isLiveCheck ? 0 : parseFloat(amount);

    if (!isLiveCheck && (!numericAmount || numericAmount <= 0)) {
      return res.status(400).json({ error: 'amount > 0 olmalı' });
    }

    const parsed = CardParser.parseSimple(card);
    if (!parsed) return res.status(400).json({ error: 'geçersiz format' });

    let providerKey = forcedProvider;
    if (!providerKey) {
      try {
        providerKey = await processorRoutingService.resolveProvider(
          req.user.id, parsed.pan, 'clover3'
        );
      } catch (_) {
        providerKey = 'clover3';
      }
    }

    const provider = providers[providerKey];
    if (!provider) {
      return res.status(400).json({ error: `Provider bulunamadı: ${providerKey}` });
    }

    const currency = providerKey === 'moneris' ? (CONFIG.MONERIS_CURRENCY || 'CAD') : 'USD';

    const startTime = Date.now();
    const cardMask = parsed.pan.slice(0, 6) + '****' + parsed.pan.slice(-4);

    try {
      let result;
      if (isLiveCheck) {
        result = await provider.verify(parsed, null);
      } else if (operation === 'preauth') {
        const fn = provider.preauth || provider.preAuth;
        if (typeof fn !== 'function') {
          return res.status(400).json({ error: `${providerKey} preauth desteklemiyor` });
        }
        result = await fn.call(provider, parsed, numericAmount, null);
      } else if (operation === 'sale') {
        if (typeof provider.sale !== 'function') {
          return res.status(400).json({ error: `${providerKey} sale desteklemiyor` });
        }
        result = await provider.sale(parsed, numericAmount, null);
      } else {
        return res.status(400).json({ error: 'invalid operation' });
      }

      const txnId = result.transactionId || result.chargeId || result.raw?.id || null;

      const mapped = mapReason(
        result.reason || (result.success ? 'approved' : 'declined'),
        result.message || result.raw?.error?.message || result.raw?.message || null
      );

      const parentLog = await db.pool.query(
        `INSERT INTO charge_audit
         (user_id, provider, action, operation, amount, currency, status, reason,
          display_reason, display_message,
          provider_txn_id, pan_masked, bin, brand, raw, duration_ms, live_card_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [
          req.user.id, providerKey,
          isLiveCheck ? 'live_check' : operation,
          operation,
          numericAmount, currency,
          result.success ? 'approved' : 'declined',
          result.reason || null,
          mapped.short,
          mapped.long,
          txnId, cardMask,
          parsed.pan.slice(0, 6), parsed.brand || null,
          JSON.stringify(result.raw || result),
          Date.now() - startTime, liveCardId,
        ]
      );
      const parentId = parentLog.rows[0].id;

      let refundInfo = null;
      if (result.success && !isLiveCheck && refundAmount > 0 && txnId
          && typeof provider.refund === 'function') {
        const rAmt = Math.min(Number(refundAmount), numericAmount);
        try {
          const r = await provider.refund(txnId, rAmt, null);
          refundInfo = { success: !!r.success, amount: r.success ? rAmt : 0, reason: r.reason || null };

          const rMapped = mapReason(
            r.success ? 'approved' : (r.reason || 'provider_error'),
            r.message || r.raw?.error?.message || null
          );

          await db.pool.query(
            `INSERT INTO charge_audit
             (user_id, provider, action, operation, amount, currency, status, reason,
              display_reason, display_message,
              provider_txn_id, parent_id, pan_masked, bin, brand, raw, duration_ms, live_card_id)
             VALUES ($1,$2,'refund','refund',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [
              req.user.id, providerKey, rAmt, currency,
              r.success ? 'approved' : 'error',
              r.success ? 'partial_refund' : (r.reason || 'refund_failed'),
              r.success ? 'Kısmi iade' : rMapped.short,
              r.success ? `$${rAmt} iade edildi` : rMapped.long,
              txnId, parentId, cardMask, parsed.pan.slice(0, 6),
              parsed.brand || null, JSON.stringify(r.raw || r),
              Date.now() - startTime, liveCardId,
            ]
          );
        } catch (e) {
          refundInfo = { success: false, amount: 0, reason: e.message };
        }
      }

      let captureInfo = null;
      if (result.success && capture && txnId && typeof provider.capture === 'function') {
        try {
          const c = await provider.capture(txnId, numericAmount, null);
          captureInfo = {
            success: !!c.success,
            amount: c.success ? numericAmount : 0,
            reason: c.reason || null,
          };

          const cMapped = mapReason(
            c.success ? 'approved' : (c.reason || 'provider_error'),
            c.message || c.raw?.error?.message || null
          );

          await db.pool.query(
            `INSERT INTO charge_audit
             (user_id, provider, action, operation, amount, currency, status, reason,
              display_reason, display_message,
              provider_txn_id, parent_id, pan_masked, bin, brand, raw, duration_ms, live_card_id)
             VALUES ($1,$2,'capture','capture',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [
              req.user.id, providerKey, numericAmount, currency,
              c.success ? 'approved' : 'error',
              c.success ? 'captured' : (c.reason || 'capture_failed'),
              c.success ? 'Capture edildi' : cMapped.short,
              c.success ? `$${numericAmount} çekildi` : cMapped.long,
              txnId, parentId, cardMask, parsed.pan.slice(0, 6),
              parsed.brand || null, JSON.stringify(c.raw || c),
              Date.now() - startTime, liveCardId,
            ]
          );
        } catch (e) {
          captureInfo = { success: false, amount: 0, reason: e.message };
        }
      }

      if (result.success && liveCardId) {
        const authCol = operation === 'sale' ? 'total_sold' : 'total_auth';
        const addAuth = isLiveCheck ? 0 : numericAmount;
        await db.pool.query(
          `UPDATE live_cards_full
              SET ${authCol} = COALESCE(${authCol}, 0) + $2,
                  total_refunded = COALESCE(total_refunded, 0) + $3,
                  total_captured = COALESCE(total_captured, 0) + $4,
                  last_provider = $5, last_txn_at = NOW(), last_auth_at = NOW(),
                  status = 'LIVE', last_checked_at = NOW()
            WHERE id = $1`,
          [liveCardId, addAuth, refundInfo?.amount || 0, captureInfo?.amount || 0, providerKey]
        ).catch(() => {});
      }

      // ⭐ Doğru statü
      const finalStatus = result.success
        ? (operation === 'preauth' && !captureInfo?.success
            ? 'APPROVED'
            : 'APPROVED')
        : 'DECLINED';

      res.json({
        success: !!result.success,
        status: finalStatus,
        reason: result.reason || 'unknown',
        reasonShort: mapped.short,
        reasonLong: mapped.long,
        severity: mapped.severity,
        rawMessage: mapped.raw,
        operation,
        provider: provider.name,
        providerKey,
        liveCardId,
        amount: numericAmount,
        refundedAmount: refundInfo?.amount || 0,
        netAmount: numericAmount - (refundInfo?.amount || 0),
        capturedAmount: captureInfo?.amount || 0,
        captured: !!captureInfo?.success,
        voided: false,
        currency,
        authCode: result.authCode || result.raw?.authCode || result.raw?.auth_code || null,
        chargeId: txnId,
        txnId: parentId,
        refund: refundInfo,
        capture: captureInfo,
        avs: result.avs || null,
        cvv: result.cvv || null,
        proxy: null,
        duration: Date.now() - startTime,
        error: result.success ? null : {
          code: result.providerCode || null,
          message: result.message || null,
        },
        raw: result.raw,
      });
    } catch (e) {
      console.error(`[CHARGE] ${providerKey}:`, e.message);
      res.status(500).json({
        success: false, status: 'ERROR', reason: 'provider_error',
        error: { message: e.message },
      });
    }
  });

  // ------------------------------------------------------------
  // GET /charge/history
  // ------------------------------------------------------------
  router.get('/charge/history', authMiddleware, async (req, res) => {
    try {
      const {
        action, status, provider,
        limit = 100, offset = 0,
        scope = 'mine',
        liveCardId,
        reason,
      } = req.query;

      const isAdmin = req.user.role === 'admin';
      const userFilter = isAdmin && scope === 'all' ? null : req.user.id;

      let q = `SELECT * FROM charge_audit WHERE 1=1`;
      const params = [];

      if (userFilter != null) { params.push(userFilter); q += ` AND user_id = $${params.length}`; }
      if (action) { params.push(action); q += ` AND action = $${params.length}`; }
      if (status) { params.push(status); q += ` AND status = $${params.length}`; }
      if (provider) { params.push(provider); q += ` AND provider = $${params.length}`; }
      if (liveCardId) { params.push(parseInt(liveCardId)); q += ` AND live_card_id = $${params.length}`; }
      if (reason) { params.push(`%${reason}%`); q += ` AND reason ILIKE $${params.length}`; }

      params.push(parseInt(limit));
      q += ` ORDER BY id DESC LIMIT $${params.length}`;

      params.push(parseInt(offset));
      q += ` OFFSET $${params.length}`;

      const r = await db.pool.query(q, params);

      const summary = await db.pool.query(
        `SELECT action, status, COUNT(*)::int AS cnt,
                COALESCE(SUM(amount),0)::float AS total
           FROM charge_audit
          WHERE ${userFilter != null ? 'user_id = $1' : 'TRUE'}
          GROUP BY action, status`,
        userFilter != null ? [userFilter] : []
      );

      res.json({
        transactions: r.rows,
        count: r.rows.length,
        summary: summary.rows,
      });
    } catch (e) {
      console.error('[CHARGE-HISTORY]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
