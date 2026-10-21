// routes/check.js
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const CardParser = require('../services/CardParser');

module.exports = (deps) => {
  const { importService, cardChecker, dbService } = deps;

  // ============================================================
  // POST /check — Tek kart kontrolü
  // ============================================================
  router.post('/check', authMiddleware, async (req, res) => {
    try {
      const { card, mode = 'verify' } = req.body || {};
      if (!card) return res.status(400).json({ error: 'card gerekli' });
      if (!['verify', 'preauth'].includes(mode)) {
        return res.status(400).json({ error: 'mode: verify | preauth' });
      }

      const parsed = CardParser.parseSimple(card);
      if (!parsed) return res.status(400).json({ error: 'geçersiz kart formatı' });

      const enriched = await cardChecker.checkAndEnrich(parsed);
      const success = enriched.status === 'LIVE';

      // DB kayıtları (best-effort; hata işlemi bozmaz)
      try {
        await dbService.saveCardCheck(req.user.id, parsed, enriched);
        if (success) {
          await dbService.saveLiveCardFull(req.user.id, parsed, enriched, enriched.bin);
        }
      } catch (dbErr) {
        console.warn('[/check] DB kayıt hatası:', dbErr.message);
      }

      res.json(enriched);
    } catch (e) {
      console.error('[/check]', e.message);
      res.status(500).json({
        success: false,
        status: 'ERROR',
        reason: 'provider_error',
        error: e.message,
      });
    }
  });

  // ============================================================
  // POST /preauth — auth-only (provider-aware)
  // ============================================================
  router.post('/preauth', authMiddleware, async (req, res) => {
    try {
      const { card, amount, providerKey } = req.body || {};
      if (!card) return res.status(400).json({ error: 'card gerekli' });
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'amount > 0 olmalı' });
      }

      const parsed = CardParser.parseSimple(card);
      if (!parsed) return res.status(400).json({ error: 'geçersiz kart formatı' });

      const result = await cardChecker.preAuth(parsed, amt, providerKey);
      res.json(result);
    } catch (e) {
      console.error('[/preauth]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // POST /capture
  // ============================================================
  router.post('/capture', authMiddleware, async (req, res) => {
    try {
      const { paymentId, amount, providerKey } = req.body || {};
      if (!paymentId || !amount || !providerKey) {
        return res.status(400).json({ error: 'paymentId, amount ve providerKey gerekli' });
      }
      const result = await cardChecker.capture(paymentId, amount, providerKey);
      res.json(result);
    } catch (e) {
      console.error('[/capture]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // POST /refund
  // ============================================================
  router.post('/refund', authMiddleware, async (req, res) => {
    try {
      const { paymentId, amount, providerKey } = req.body || {};
      if (!paymentId || !amount || !providerKey) {
        return res.status(400).json({ error: 'paymentId, amount ve providerKey gerekli' });
      }
      const result = await cardChecker.refund(paymentId, amount, providerKey);
      res.json(result);
    } catch (e) {
      console.error('[/refund]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // GET /providers
  // ============================================================
  router.get('/providers', authMiddleware, async (_req, res) => {
    try {
      res.json({ providers: cardChecker.getProviders() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // POST /check-stream — NDJSON streaming toplu kart işlemi
  // ============================================================
  router.post('/check-stream', authMiddleware, async (req, res) => {
    const { cards, provider = null, operation = 'live_check', amount = 0 } = req.body || {};

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'cards array gerekli' });
    }
    if (!['live_check', 'preauth'].includes(operation)) {
      return res.status(400).json({ error: `geçersiz operation: ${operation}` });
    }
    const authAmount = Number(amount) || 0;
    if (operation === 'preauth' && authAmount < 1) {
      return res.status(400).json({ error: 'preauth için amount >= 1 gerekli' });
    }
    if (provider != null && !['moneris', 'clover3', 'authorize3', ''].includes(provider)) {
      return res.status(400).json({ error: `geçersiz provider: ${provider}` });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const summary = await importService.checkStream({
        cards,
        userId: req.user.id,
        res,
        provider: provider || null,
        operation,
        amount: operation === 'preauth' ? authAmount : 0,
      });
      res.write(JSON.stringify({ type: 'end', summary, timestamp: new Date().toISOString() }) + '\n');
      res.end();
    } catch (e) {
      console.error('[CHECK-STREAM]', e.message);
      res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
      res.end();
    }
  });

  // ============================================================
  // POST /selenium-check (legacy — korundu)
  // ============================================================
  router.post('/selenium-check', authMiddleware, async (req, res) => {
    const { cards } = req.body || {};
    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'cards array gerekli' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(JSON.stringify({ type: 'start', total: cards.length }) + '\n');

    try {
      await importService.resinService.checkCards(cards, (event) => {
        res.write(JSON.stringify(event) + '\n');
      });
      res.write(JSON.stringify({ type: 'end', timestamp: new Date().toISOString() }) + '\n');
      res.end();
    } catch (e) {
      res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
      res.end();
    }
  });

  return router;
};