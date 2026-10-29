const express = require('express');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../auth');
const { sleep } = require('../utils/sleep');
const db = require('../db');                    // ← YENİ
const { CreditsSettingsService } = require('../services/CreditsSettingsService');
const financeService = new CreditsSettingsService();

module.exports = (deps) => {
  const { binDb, loadBalancer, providers, proxyManager } = deps;   // ← deps'ten al

  // ------------------------------------------------------------
  // GET /bin/:bin — Tek BIN sorgu (kayıt yok)
  // ------------------------------------------------------------
  router.get('/bin/:bin', async (req, res) => {
    if (!/^\d{6}$/.test(String(req.params.bin || ''))) {
      return res.status(400).json({ error: 'Tam 6 haneli BIN gerekli' });
    }
    const CONFIG = require('../config');
    const data = await binDb.lookupWithFallback(
      req.params.bin,
      CONFIG.EXTERNAL_BIN_API
    );
    if (!data) return res.status(404).json({ error: 'BIN bulunamadı' });
    res.json({
      bin: req.params.bin,
      brand: data.brand || '',
      type: data.type || '',
      category: data.category || '',
      issuer: data.issuer || '',
      country: data.country || '',
      isoCode2: data.isoCode2 || '',
      isoCode3: data.isoCode3 || '',
    });
  });

  // ------------------------------------------------------------
  // POST /bin-check — Bulk BIN + DB kaydı
  // ------------------------------------------------------------
  router.post('/bin-check', authMiddleware, async (req, res) => {
  const CONFIG = require('../config');
  const { bins } = req.body;

  if (!Array.isArray(bins) || bins.length === 0 || bins.length > 200) {
    return res.status(400).json({ error: '1 ile 200 arasında BIN girdisi gerekli' });
  }

  if (bins.some((value) => !/^\d{6}$/.test(String(value).trim()))) {
    return res.status(400).json({ error: 'Yalnızca tam 6 haneli BIN metadata sorgulanabilir.' });
  }

  // ============================================================
  // Exact six-digit BIN metadata only. Never parse card-number rows here.
  // ============================================================
  const parsedBins = [];
  const seen = new Set();

  for (const raw of bins) {
    const line = String(raw).trim();
    if (!line) continue;

    const bin6 = line;
    if (!/^\d{6}$/.test(bin6)) continue;
    if (seen.has(bin6)) continue;
    seen.add(bin6);
    parsedBins.push(bin6);
  }

  if (parsedBins.length === 0) {
    return res.status(400).json({ error: 'Geçerli BIN bulunamadı' });
  }

  if (req.user.role !== 'admin') {
    try {
      const unitFee = await financeService.getFee('bin_check');
      const totalFee = Math.round(unitFee * parsedBins.length * 100) / 100;
      if (totalFee > 0) await financeService.spend({
        userId: req.user.id,
        amount: totalFee,
        entryType: 'bin_check',
        referenceType: 'bin_check',
        referenceId: String(req.requestId || Date.now()),
        idempotencyKey: `bin-check-${req.requestId || `${req.user.id}-${Date.now()}`}`,
      });
    } catch (error) {
      return res.status(error.code === 'INSUFFICIENT_CREDITS' ? 402 : (error.statusCode || 409)).json({
        error: error.code === 'INSUFFICIENT_CREDITS' ? 'Bu BIN sorgusu için yeterli krediniz yok' : error.message,
        code: error.code || null,
      });
    }
  }

  console.log(`[BIN-CHECK] ${parsedBins.length} unique BIN sorgulanacak`);

  // ============================================================
  // SORGU
  // ============================================================
  const results = [];
  for (const bin of parsedBins) {
    try {
      const data = await binDb.lookupWithFallback(bin, CONFIG.EXTERNAL_BIN_API);

      // ⭐ DB'ye kaydet
      try {
        await db.pool.query(
          `INSERT INTO bin_checks (
            user_id, bin, brand, type, category, issuer, country, raw_response
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            req.user.id,
            bin,
            data.brand || null,
            data.type || null,
            data.category || null,
            data.issuer || null,
            data.country || null,
            JSON.stringify({
              brand: data.brand || null,
              type: data.type || null,
              category: data.category || null,
              issuer: data.issuer || null,
              country: data.country || null,
              isoCode2: data.isoCode2 || null,
              isoCode3: data.isoCode3 || null,
            }),
          ]
        );
      } catch (dbErr) {
        console.error('[BIN-CHECK-SAVE]', dbErr.message);
      }

      results.push({
        bin,
        brand: data.brand || '',
        type: data.type || '',
        category: data.category || '',
        issuer: data.issuer || '',
        country: data.country || '',
        isoCode2: data.isoCode2 || '',
        isoCode3: data.isoCode3 || '',
      });
    } catch (e) {
      results.push({ bin, error: e.message });
    }

    await sleep(500);
  }

  res.json({ results });
});
  // ------------------------------------------------------------
  // GET /status — Provider durumu
  // ------------------------------------------------------------
  router.get('/status', (req, res) => {
    res.json(loadBalancer.getStats());
  });

  // ------------------------------------------------------------
  // POST /provider/:key/:action
  // ------------------------------------------------------------
  router.post('/provider/:key/:action', authMiddleware, requireAdmin, async (req, res) => {
    const CONFIG = require('../config');
    const { key, action } = req.params;

    if (!CONFIG.PROVIDERS[key]) {
      return res.status(404).json({ error: 'provider yok' });
    }

    if (action === 'enable') {
      CONFIG.PROVIDERS[key].enabled = true;
      providers[key].enabled = true;
      providers[key].disabledUntil = 0;
      providers[key].consecutiveErrors = 0;
      loadBalancer.recalculateWeights();
      return res.json({
        ok: true,
        enabled: true,
        weight: providers[key].weight,
      });
    }

    if (action === 'disable') {
      CONFIG.PROVIDERS[key].enabled = false;
      providers[key].enabled = false;
      providers[key].weight = 0;
      return res.json({ ok: true, enabled: false });
    }

    res.status(400).json({ error: 'action: enable veya disable' });
  });

  // ------------------------------------------------------------
  // GET /proxies
  // ------------------------------------------------------------
  router.get('/proxies', authMiddleware, (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const proxyFile = path.join(__dirname, '..', 'proxies.txt');

    if (fs.existsSync(proxyFile)) {
      const content = fs.readFileSync(proxyFile, 'utf-8');
      const list = content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));

      return res.json({ proxies: list });
    }

    res.json({ proxies: [] });
  });

  // ------------------------------------------------------------
  // GET /proxies/stats
  // ------------------------------------------------------------
  router.get('/proxies/stats', authMiddleware, (req, res) => {
    res.json(proxyManager.stats());
  });

  return router;
};
