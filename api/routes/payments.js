// ============================================================
// PAYMENTS ROUTES — PreAuth / Capture / Refund (STUB)
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware, requirePermission } = require('../auth');

module.exports = (deps) => {
  const { paymentService, cardChecker, dbService } = deps;

  // Hosted recurring checkout: card details are entered only on Stripe Checkout.
  router.post('/payments/stripe/checkout-session', authMiddleware, requirePermission('payments.sale'), async (req, res) => {
    try {
      const stripeProvider = Object.values(deps.providers || {}).find((provider) =>
        String(provider.type || provider.config?.type || '').toLowerCase() === 'stripe'
      );
      if (!stripeProvider || typeof stripeProvider.createSubscriptionCheckoutSession !== 'function') {
        return res.status(503).json({ error: 'Stripe provider etkin değil' });
      }

      const session = await stripeProvider.createSubscriptionCheckoutSession({
        customerEmail: req.user.email,
        userId: req.user.id,
      });
      if (!session.url || !session.url.startsWith('https://checkout.stripe.com/')) {
        return res.status(502).json({ error: 'Stripe Checkout URL oluşturulamadı' });
      }
      if (String(req.headers.accept || '').includes('text/html')) {
        return res.redirect(303, session.url);
      }
      return res.status(201).json({ sessionId: session.id, checkoutUrl: session.url });
    } catch (error) {
      console.error('[STRIPE_CHECKOUT]', JSON.stringify({
        requestId: req.requestId || null,
        userId: req.user?.id || null,
        code: error.code || error.type || 'CHECKOUT_SESSION_FAILED',
      }));
      return res.status(error.statusCode || 400).json({ error: 'Stripe Checkout oturumu oluşturulamadı' });
    }
  });

  router.get('/payments/stripe/checkout-session/:sessionId/status', authMiddleware, requirePermission('payments.sale'), async (req, res) => {
    try {
      const stripeProvider = Object.values(deps.providers || {}).find((provider) =>
        String(provider.type || provider.config?.type || '').toLowerCase() === 'stripe'
      );
      if (!stripeProvider || typeof stripeProvider.getSubscriptionCheckoutStatus !== 'function') {
        return res.status(503).json({ error: 'Stripe provider etkin değil' });
      }
      const status = await stripeProvider.getSubscriptionCheckoutStatus(req.params.sessionId, req.user.id);
      return res.json(status);
    } catch (error) {
      return res.status(error.statusCode || 400).json({ error: 'Checkout durumu doğrulanamadı' });
    }
  });

  // POST /payments/preauth
  router.post('/payments/preauth', authMiddleware, async (req, res) => {
    const { card, amount } = req.body;
    if (!card || !amount) {
      return res.status(400).json({ error: 'card ve amount gerekli' });
    }

    try {
      const parsed = require('../services/CardParser').parseSimple(card);
      if (!parsed) return res.status(400).json({ error: 'geçersiz format' });

      const result = await (paymentService || cardChecker).preAuth(parsed, amount);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /payments/capture
  router.post('/payments/capture', authMiddleware, async (req, res) => {
    const { paymentId, amount, providerKey } = req.body;
    if (!paymentId || !amount || !providerKey) {
      return res.status(400).json({ error: 'paymentId, amount, providerKey gerekli' });
    }

    try {
      const result = await (paymentService || cardChecker).capture(
        paymentId, amount, providerKey
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /payments/refund
  router.post('/payments/refund', authMiddleware, async (req, res) => {
    const { paymentId, amount, providerKey } = req.body;
    if (!paymentId || !amount || !providerKey) {
      return res.status(400).json({ error: 'paymentId, amount, providerKey gerekli' });
    }

    try {
      const result = await (paymentService || cardChecker).refund(
        paymentId, amount, providerKey
      );
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });


  // ------------------------------------------------------------
  // Merchant-safe provider actions (tokenized payment methods)
  // These endpoints intentionally accept a provider Payment Method ID,
  // not raw PAN/CVV data.
  // ------------------------------------------------------------
  const merchantProvider = (providerKey) => {
    if (!providerKey) throw new Error('providerKey gerekli');
    const provider = deps.providers?.[providerKey];
    if (!provider) throw new Error(`Provider bulunamadı: ${providerKey}`);
    return provider;
  };

  const merchantInput = (body) => {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount pozitif bir sayı olmalı');
    if (!body.paymentMethodId) throw new Error('paymentMethodId gerekli');
    return {
      paymentMethodId: String(body.paymentMethodId),
      amount,
      currency: body.currency || 'CAD',
      orderId: body.orderId,
      invoiceNumber: body.invoiceNumber,
      idempotencyKey: body.idempotencyKey,
      finalCompletion: body.finalCompletion,
      reason: body.reason,
    };
  };

  router.post('/payments/merchant/preauth', authMiddleware, async (req, res) => {
    try {
      const input = merchantInput(req.body || {});
      const provider = merchantProvider(req.body.providerKey);
      if (typeof provider.preAuth !== 'function') throw new Error('Provider preauthorization desteklemiyor');
      const result = await provider.preAuth(input.paymentMethodId, input.amount, null, input);
      res.status(result.success ? 200 : 422).json(result);
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/payments/merchant/sale', authMiddleware, async (req, res) => {
    try {
      const input = merchantInput(req.body || {});
      const provider = merchantProvider(req.body.providerKey);
      if (typeof provider.sale !== 'function') throw new Error('Provider sale desteklemiyor');
      const result = await provider.sale(input.paymentMethodId, input.amount, null, input);
      res.status(result.success ? 200 : 422).json(result);
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/payments/merchant/capture', authMiddleware, async (req, res) => {
    try {
      const provider = merchantProvider(req.body.providerKey);
      if (!req.body.paymentId) throw new Error('paymentId gerekli');
      const result = await provider.capture(req.body.paymentId, Number(req.body.amount), null, req.body);
      res.status(result.success ? 200 : 422).json(result);
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/payments/merchant/refund', authMiddleware, async (req, res) => {
    try {
      const provider = merchantProvider(req.body.providerKey);
      if (!req.body.paymentId) throw new Error('paymentId gerekli');
      const result = await provider.refund(req.body.paymentId, Number(req.body.amount), null, req.body);
      res.status(result.success ? 200 : 422).json(result);
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/payments/merchant/void', authMiddleware, async (req, res) => {
    try {
      const provider = merchantProvider(req.body.providerKey);
      if (!req.body.paymentId) throw new Error('paymentId gerekli');
      const result = await provider.voidTransaction(req.body.paymentId, null, req.body);
      res.status(result.success ? 200 : 422).json(result);
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.get('/payments/merchant/capabilities', authMiddleware, async (req, res) => {
    try {
      const provider = merchantProvider(req.query.providerKey);
      res.json({ provider: req.query.providerKey, capabilities: provider.capabilities?.() || {} });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  return router;
};
