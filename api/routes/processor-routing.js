const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');

module.exports = (deps) => {
  const { processorRoutingService } = deps;

  router.get('/processor-routing', authMiddleware, async (req, res) => {
    try {
      res.json({ rules: await processorRoutingService.list(req.user.id) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/processor-routing', authMiddleware, async (req, res) => {
    try {
      const rule = await processorRoutingService.create(req.user.id, req.body);
      res.json({ ok: true, rule });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.put('/processor-routing/:id', authMiddleware, async (req, res) => {
    try {
      const rule = await processorRoutingService.update(
        req.user.id, parseInt(req.params.id), req.body
      );
      res.json({ ok: true, rule });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.delete('/processor-routing/:id', authMiddleware, async (req, res) => {
    try {
      await processorRoutingService.delete(req.user.id, parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/processor-routing/resolve', authMiddleware, async (req, res) => {
    try {
      const provider = await processorRoutingService.resolveProvider(
        req.user.id, req.body.pan, req.body.fallback || 'clover3'
      );
      res.json({ provider });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};