const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const { sleep } = require('../utils/sleep');
const db = require('../db');                    // ← YENİ

module.exports = (deps) => {
  const { binDb, loadBalancer, providers, proxyManager } = deps;   // ← deps'ten al

  // ------------------------------------------------------------
  // GET /bin/:bin — Tek BIN sorgu (kayıt yok)
  // ------------------------------------------------------------
  router.get('/bin/:bin', async (req, res) => {
    const CONFIG = require('../config');
    const result = await binDb.lookupWithFallback(
      req.params.bin,
      CONFIG.EXTERNAL_BIN_API
    );
    if (!result) return res.status(404).json({ error: 'BIN bulunamadı' });
    res.json(result);
  });

  // ------------------------------------------------------------
  // POST /bin-check — Bulk BIN + DB kaydı
  // ------------------------------------------------------------
  router.post('/bin-check', authMiddleware, async (req, res) => {
  const CONFIG = require('../config');
  const { bins } = req.body;

  if (!Array.isArray(bins) || bins.length === 0) {
    return res.status(400).json({ error: 'bins array gerekli' });
  }

  if (req.user.role === 'checker' && (bins.length > 200 || bins.some((value) => !/^\d{6}$/.test(String(value).trim())))) {
    return res.status(400).json({ error: 'Check kullanıcısı yalnızca en fazla 200 adet, tam 6 haneli BIN gönderebilir.' });
  }

  // ============================================================
  // FLEXIBLE INPUT — Full kart satırı veya sadece BIN
  // ============================================================
  const parsedBins = [];
  const seen = new Set();

  for (const raw of bins) {
    const line = String(raw).trim();
    if (!line) continue;

    let binCandidate = '';
    if (line.includes('|')) binCandidate = line.split('|')[0];
    else if (line.includes(' ')) binCandidate = line.split(/\s+/)[0];
    else binCandidate = line;

    const clean = binCandidate.replace(/\D/g, '').substring(0, 8);
    if (clean.length < 6) continue;

    const bin6 = clean.substring(0, 6);
    if (seen.has(bin6)) continue;
    seen.add(bin6);
    parsedBins.push(bin6);
  }

  if (parsedBins.length === 0) {
    return res.status(400).json({ error: 'Geçerli BIN bulunamadı' });
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
            JSON.stringify(data),
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
  router.post('/provider/:key/:action', authMiddleware, async (req, res) => {
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
