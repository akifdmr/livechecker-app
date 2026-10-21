// ============================================================
// routes/graph.js — Entity Graph API
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');

module.exports = (deps) => {
  const { correlationService } = deps;

  // ── GET /graph/entities ──
  router.get('/graph/entities', authMiddleware, async (req, res) => {
    try {
      const { type, risk, limit = 200 } = req.query;

      let query = 'SELECT * FROM entities WHERE user_id = $1';
      const params = [req.user.id];

      if (type) {
        params.push(type);
        query += ` AND entity_type = $${params.length}`;
      }
      if (risk) {
        params.push(risk);
        query += ` AND risk_level = $${params.length}`;
      }

      params.push(parseInt(limit));
      query += ` ORDER BY risk_score DESC, last_seen DESC LIMIT $${params.length}`;

      const result = await db.pool.query(query, params);
      res.json({ entities: result.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /graph/build ──
  router.post('/graph/build', authMiddleware, async (req, res) => {
    try {
      const { entityId, depth = 2, filters = {} } = req.body;
      if (!entityId) return res.status(400).json({ error: 'entityId gerekli' });

      const graph = await correlationService.buildGraph(
        req.user.id, entityId, depth, filters
      );
      res.json(graph);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /graph/scan ──
  router.post('/graph/scan', authMiddleware, async (req, res) => {
    try {
      const findings = await correlationService.runCorrelationScan(req.user.id);
      res.json({ findings, count: findings.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /graph/findings ──
  router.get('/graph/findings', authMiddleware, async (req, res) => {
    try {
      const { severity, acknowledged = 'false', limit = 50 } = req.query;

      let query = 'SELECT * FROM correlation_findings WHERE user_id = $1';
      const params = [req.user.id];

      if (severity) {
        params.push(severity);
        query += ` AND severity = $${params.length}`;
      }
      params.push(acknowledged === 'true');
      query += ` AND is_acknowledged = $${params.length}`;

      params.push(parseInt(limit));
      query += ` ORDER BY severity DESC, created_at DESC LIMIT $${params.length}`;

      const result = await db.pool.query(query, params);
      res.json({ findings: result.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /graph/findings/:id/ack ──
  router.post('/graph/findings/:id/ack', authMiddleware, async (req, res) => {
    try {
      await db.pool.query(
        'UPDATE correlation_findings SET is_acknowledged = TRUE WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /graph/ingest/intel ──
  // Intel sorgusu sonrası entity oluştur
  router.post('/graph/ingest/intel', authMiddleware, async (req, res) => {
    try {
      const { queryType, queryValue, services, risk } = req.body;
      const entity = await correlationService.ingestIntelQuery(
        req.user.id, queryType, queryValue, services, risk
      );
      res.json({ ok: true, entity });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};