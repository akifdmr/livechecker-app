const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');

module.exports = (deps) => {
  const { importService } = deps;

  // POST /smart-import
  router.post('/smart-import', authMiddleware, async (req, res) => {
    const { cards, routeCvvless } = req.body;

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'cards array gerekli' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const summary = await importService.smartImport({
        cards,
        routeCvvless,
        userId: req.user.id,
        res,
      });

      res.write(
        JSON.stringify({
          type: 'end',
          summary,
          timestamp: new Date().toISOString(),
        }) + '\n'
      );
      res.end();
    } catch (e) {
      console.error('[SMART-IMPORT]', e.message);
      res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
      res.end();
    }
  });

  // POST /import-and-check (legacy)
  router.post('/import-and-check', authMiddleware, async (req, res) => {
    const { cards } = req.body;
    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'cards array gerekli' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const summary = await importService.importAndCheck({
        cards,
        userId: req.user.id,
        res,
      });

      res.write(
        JSON.stringify({
          type: 'end',
          summary,
          timestamp: new Date().toISOString(),
        }) + '\n'
      );
      res.end();
    } catch (e) {
      console.error('[IMPORT-AND-CHECK]', e.message);
      res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
      res.end();
    }
  });

  return router;
};