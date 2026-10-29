const express = require('express');
const router = express.Router();
const { authMiddleware, requirePermission } = require('../auth');
const { CreditsSettingsService } = require('../services/CreditsSettingsService');
const financeService = new CreditsSettingsService();

module.exports = (deps) => {
  const { paymentService, dbService, providers } = deps;

  router.get('/pos/providers', authMiddleware, requirePermission('providers.view'), async (req, res) => {
    const defaultProvider = req.user.role === 'admin' ? null : await financeService.getDefaultProvider();
    if (req.user.role !== 'admin' && !defaultProvider) return res.json({ providers: [] });
    const data = Object.entries(providers || {}).flatMap(([key, p]) => {
      if (defaultProvider && key !== defaultProvider) return [];
      const rawCapabilities = typeof p.capabilities === 'function'
        ? p.capabilities()
        : p.capabilities || {};
      const capabilities = {
        ...rawCapabilities,
        sale: rawCapabilities.sale === true && typeof p.sale === 'function',
        preAuthorization: rawCapabilities.preAuthorization === true &&
          (typeof p.preAuth === 'function' || typeof p.preauth === 'function'),
      };
      const tokenized = rawCapabilities.tokenizedPayment === true &&
        (capabilities.sale || capabilities.preAuthorization);
      const terminal = rawCapabilities.terminalPayment === true &&
        Boolean(p.defaultTerminalId) && capabilities.sale;

      // Keep unsupported and raw-card-only providers out of the tokenized POS selector.
      if (!tokenized && !terminal) return [];
      return [{
        key,
        name: p.name,
        type: p.type,
        capabilities,
        defaultTerminalId: p.defaultTerminalId || null,
        defaultCurrency: p.defaultCurrency || null,
      }];
    });
    res.json({ providers: data });
  });

  router.get('/pos/enrollments', authMiddleware, requirePermission('enrollments.view'), async (req, res) => {
    try {
      const enrollments = await dbService.listEnrollments(req.user.id);
      res.json({ enrollments: enrollments.map(({ external_payment_method_id: token, ...row }) => ({
        ...row,
        payment_method_hint: token ? '••••••••' : null,
      })) });
    } catch (e) {
      console.error('[POS] listEnrollments hatası:', e.message);
      const unavailable = ['ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNREFUSED'].includes(e.code);
      res.status(unavailable ? 503 : 500).json({
        code: unavailable ? 'DB_UNAVAILABLE' : null,
        error: unavailable ? 'Veritabanına erişilemiyor.' : 'Enrollment listesi alınamadı',
        requestId: req.requestId,
      });
    }
  });

  router.post('/pos/enrollments', authMiddleware, requirePermission('enrollments.manage'), async (req, res) => {
    try {
      const {
        liveCardId, provider, externalPaymentMethodId, brand, last4,
        expMonth, expYear, enrollmentUrl, loginReference, status, notes
      } = req.body || {};

      if (!provider || !externalPaymentMethodId) {
        return res.status(400).json({ error: 'provider ve externalPaymentMethodId gerekli' });
      }
      const providerKey = String(provider).toLowerCase();
      const providerClient = providers[providerKey];
      const capabilities = providerClient && (typeof providerClient.capabilities === 'function'
        ? providerClient.capabilities()
        : providerClient.capabilities || {});
      if (!providerClient || capabilities?.tokenizedPayment !== true) {
        return res.status(400).json({ error: 'Seçilen provider token tabanlı enrollment desteklemiyor' });
      }

      const paymentMethodToken = String(externalPaymentMethodId).trim();
      if (paymentMethodToken.length > 2048 || paymentMethodToken.includes('|') ||
          /(?:\d[ -]?){12,19}/.test(paymentMethodToken)) {
        return res.status(400).json({ error: 'Kart numarası değil, provider tarafından üretilmiş token girin' });
      }
      if (last4 != null && !/^\d{4}$/.test(String(last4))) return res.status(400).json({ error: 'last4 dört rakam olmalı' });

      let linkedLiveCardId = null;
      if (liveCardId != null && liveCardId !== '') {
        linkedLiveCardId = Number(liveCardId);
        if (!Number.isSafeInteger(linkedLiveCardId) || linkedLiveCardId < 1) {
          return res.status(400).json({ error: 'Seçili kart kaydı geçersiz' });
        }
        const card = await dbService.pool.query(
          `SELECT id FROM live_cards_full
           WHERE id = $1 AND (user_id = $2 OR checked_by_user_id = $2)
           LIMIT 1`,
          [linkedLiveCardId, req.user.id]
        );
        if (!card.rowCount) return res.status(404).json({ error: 'Seçili kart kaydı bulunamadı' });
      }

      const enrollment = await dbService.createEnrollment({
        userId: req.user.id,
        liveCardId: linkedLiveCardId,
        provider: providerKey,
        externalPaymentMethodId: paymentMethodToken,
        brand, last4, expMonth, expYear, enrollmentUrl,
        loginReference, status: status === 'inactive' ? 'inactive' : 'active', notes
      });
      await dbService.auditEvent(req.user.id, 'enrollment.create', 'card_enrollment', enrollment.id, {
        provider: enrollment.provider,
        last4: enrollment.last4
      });
      res.status(201).json({ enrollment: { ...enrollment, external_payment_method_id: undefined, payment_method_hint: '••••••••' } });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.patch('/pos/enrollments/:id', authMiddleware, requirePermission('enrollments.manage'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const allowed = ['enrollment_url','login_reference','status','notes','brand','last4','exp_month','exp_year'];
      const entries = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
      if (!entries.length) return res.status(400).json({ error: 'Güncellenecek alan yok' });

      const sets = entries.map(([k], i) => `${k}=$${i+1}`).join(', ');
      const values = entries.map(([,v]) => v);
      values.push(id, req.user.id);
      const q = await dbService.pool.query(
        `UPDATE card_enrollments SET ${sets}, updated_at=NOW()
         WHERE id=$${values.length-1} AND user_id=$${values.length} RETURNING *`,
        values
      );
      if (!q.rowCount) return res.status(404).json({ error: 'Enrollment bulunamadı' });
      const { external_payment_method_id: token, ...enrollment } = q.rows[0];
      res.json({ enrollment: {
        ...enrollment,
        payment_method_hint: token ? '••••••••' : null,
      } });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/pos/transactions', authMiddleware, requirePermission('payments.view'), async (req, res) => {
    res.json({ transactions: await dbService.getMerchantTransactions(req.user.id, req.query.limit) });
  });

  router.post('/pos/transactions/:id/refresh', authMiddleware, requirePermission('payments.view'), async (req, res) => {
    try {
      const result = await paymentService.refreshTransaction({
        userId: req.user.id,
        requestId: req.requestId,
        transactionId: Number(req.params.id),
      });
      // A status lookup itself succeeded even when the underlying payment was declined.
      res.json(result);
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/pos/payments', authMiddleware, async (req, res) => {
    try {
      const { operation } = req.body || {};
      const permission = `payments.${operation}`;
      // New payment actions start a sale or authorization. Capture/refund/void
      // must reference an existing, user-owned merchant transaction below.
      const allowed = ['sale','preauth'];
      if (!allowed.includes(operation)) return res.status(400).json({ error: 'Yeni işlem için sale/preauth seçin; capture/refund/void mevcut işlem kaydından yapılır.' });

      const defaultProvider = req.user.role === 'admin'
        ? null
        : await financeService.getDefaultProvider();
      if (req.user.role !== 'admin' && !defaultProvider) {
        return res.status(409).json({ code: 'PROVIDER_NOT_CONFIGURED', error: 'Yönetici varsayılan token tabanlı provider seçmelidir.' });
      }
      const providerKey = req.user.role === 'admin'
        ? String(req.body.providerKey || '').toLowerCase()
        : defaultProvider;
      const provider = providers[providerKey];
      if (!provider) return res.status(400).json({ error: 'Provider bulunamadı' });
      const capabilities = typeof provider.capabilities === 'function' ? provider.capabilities() : {};
      if (operation === 'preauth' && capabilities.preAuthorization === false) {
        return res.status(400).json({ error: `${provider.name} provizyon işlemini desteklemiyor.` });
      }
      if (capabilities.tokenizedPayment !== true && capabilities.terminalPayment !== true) {
        return res.status(400).json({ error: 'POS işlemleri yalnızca sağlayıcı tokenı veya tanımlı terminal ile yapılabilir.' });
      }

      const permissions = req.user.role === 'admin'
        ? ['*']
        : await dbService.getUserPermissions(req.user.id);
      if (req.user.role !== 'admin' && !permissions.includes(permission)) {
        return res.status(403).json({ error: `Yetki yok: ${permission}` });
      }

      let paymentMethodId = req.body.paymentMethodId;
      let enrollment = null;
      if (req.user.role !== 'admin' && !req.body.enrollmentId) {
        return res.status(400).json({ error: 'Ödeme için kendi kayıtlı token enrollment seçilmeli' });
      }
      if (req.body.enrollmentId) {
        enrollment = await dbService.getEnrollmentById(Number(req.body.enrollmentId), req.user.id);
        if (!enrollment) return res.status(404).json({ error: 'Enrollment bulunamadı' });
        if (enrollment.provider !== providerKey) {
          return res.status(400).json({ error: 'Enrollment provider ile seçilen provider uyuşmuyor' });
        }
        paymentMethodId = enrollment.external_payment_method_id;
      } else if (capabilities.terminalPayment === true) {
        if (!provider.defaultTerminalId || String(paymentMethodId || '') !== String(provider.defaultTerminalId)) {
          return res.status(400).json({ error: 'Tanımlı terminal seçimi geçersiz.' });
        }
      } else {
        const token = String(paymentMethodId || '').trim();
        if (!token || token.length > 2048 || token.includes('|') ||
            /(?:\d[ -]?){12,19}/.test(token)) {
          return res.status(400).json({ error: 'Kart numarası değil, sağlayıcı tarafından üretilmiş ödeme tokenı kullanın.' });
        }
      }
      if (!paymentMethodId) return res.status(400).json({ error: 'enrollmentId veya paymentMethodId gerekli' });

      const result = await paymentService.execute({
        ...req.body,
        requestId: req.requestId,
        providerKey,
        paymentMethodId,
        userId: req.user.id,
      });
      res.status(result.actionRequired ? 202 : result.success ? 200 : 422).json(result);
    } catch (e) {
      const unavailable = ['ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNREFUSED'].includes(e.code);
      res.status(unavailable ? 503 : (e.statusCode || 400)).json({
        success: false,
        code: unavailable ? 'DB_UNAVAILABLE' : (e.code || null),
        error: unavailable ? 'Veritabanına erişilemiyor; sağlayıcıya istek gönderilmedi.' : e.message,
        requestId: req.requestId,
      });
    }
  });

  router.post('/pos/transactions/:id/action', authMiddleware, async (req, res) => {
    let captureFee = 0;
    let captureFeeDebited = false;
    try {
      const operation = String(req.body?.operation || '');
      if (!['capture','refund','void'].includes(operation)) {
        return res.status(400).json({ error: 'operation capture/refund/void olmalı' });
      }
      const permission = `payments.${operation}`;
      const permissions = req.user.role === 'admin'
        ? ['*']
        : await dbService.getUserPermissions(req.user.id);
      if (req.user.role !== 'admin' && !permissions.includes(permission)) {
        return res.status(403).json({ error: `Yetki yok: ${permission}` });
      }

      if (operation === 'capture' && req.user.role !== 'admin') {
        captureFee = await financeService.getFee('capture');
        if (captureFee > 0) {
          await financeService.spend({
            userId: req.user.id,
            amount: captureFee,
            entryType: 'capture_fee',
            referenceType: 'merchant_transaction',
            referenceId: String(Number(req.params.id)),
            idempotencyKey: `capture-fee-${req.requestId}`,
          });
          captureFeeDebited = true;
        }
      }

      console.info('[PAYMENT]', JSON.stringify({
        requestId: req.requestId,
        event: 'transaction_action_requested',
        userId: req.user.id,
        transactionId: Number(req.params.id),
        operation,
      }));
      const result = await paymentService.operateOnTransaction({
        userId: req.user.id,
        requestId: req.requestId,
        transactionId: Number(req.params.id),
        operation,
        amount: req.body.amount,
        captureMode: req.body.captureMode,
        reason: req.body.reason,
        idempotencyKey: req.body.idempotencyKey,
      });
      if (captureFeeDebited && !result.success && !result.actionRequired) {
        await financeService.grant({
          userId: req.user.id, amount: captureFee, entryType: 'adjustment',
          referenceType: 'merchant_transaction', referenceId: String(Number(req.params.id)),
          idempotencyKey: `capture-fee-refund-${req.requestId}`, createdBy: req.user.id,
        });
      }
      res.status(result.actionRequired ? 202 : result.success ? 200 : 422).json(result);
    } catch (e) {
      console.warn('[PAYMENT]', JSON.stringify({
        requestId: req.requestId,
        event: 'transaction_action_failed',
        userId: req.user.id,
        transactionId: Number(req.params.id),
        operation: req.body?.operation || null,
        code: e.code || null,
      }));
      res.status(e.statusCode || 400).json({ success: false, code: e.code || null, error: e.message, requestId: req.requestId });
    }
  });

  return router;
};
