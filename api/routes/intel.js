// ============================================================
// INTEL ROUTES — IP / Domain / Email / Phone Sorgu
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');

module.exports = (deps) => {
  const { intelService } = deps;

  // ============================================================
  // API KEYS YÖNETİMİ
  // ============================================================
  router.get('/api-keys', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        `SELECT 
          service, 
          CASE WHEN api_key IS NULL OR api_key = '' THEN NULL 
               ELSE LEFT(api_key, 8) || '...' || RIGHT(api_key, 4) 
          END AS key_preview,
          api_url,
          key_required,
          is_active,
          updated_at
         FROM api_keys
         ORDER BY service`
      );
      res.json({ keys: result.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/api-keys/:service', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin gerekli' });
    }

    const { service } = req.params;
    const { api_key, api_url, is_active } = req.body;

    try {
      const fields = [];
      const values = [];
      let i = 1;

      if (api_key !== undefined) {
        fields.push(`api_key = $${i++}`);
        values.push(api_key);
      }
      if (api_url !== undefined) {
        fields.push(`api_url = $${i++}`);
        values.push(api_url);
      }
      if (is_active !== undefined) {
        fields.push(`is_active = $${i++}`);
        values.push(is_active ? 1 : 0);
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: 'Değişiklik yok' });
      }

      fields.push(`updated_at = NOW()`);
      values.push(service);

      const result = await db.pool.query(
        `UPDATE api_keys SET ${fields.join(', ')} WHERE service = $${i} RETURNING service`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Servis bulunamadı' });
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // LOOKUP — IP
  // ============================================================
  router.post('/intel/ip', authMiddleware, async (req, res) => {
    const { ip, services } = req.body;
    if (!ip) return res.status(400).json({ error: 'ip gerekli' });

    // Basit IP doğrulama
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^[0-9a-f:]+$/i.test(ip)) {
      return res.status(400).json({ error: 'geçersiz IP' });
    }

    try {
      const result = await intelService.lookupIP(ip, services);

      // DB'ye kaydet
      try {
        await db.pool.query(
          `INSERT INTO intel_queries (user_id, query_type, query_value, services, results, risk_score, risk_level)
           VALUES ($1, 'ip', $2, $3, $4, $5, $6)`,
          [
            req.user.id,
            ip,
            JSON.stringify(services || Object.keys(result.services)),
            JSON.stringify(result.services),
            result.risk?.score || 0,
            result.risk?.level || 'low',
          ]
        );
      } catch (dbErr) {
        console.error('[INTEL-DB]', dbErr.message);
      }

      res.json(result);
    } catch (e) {
      console.error('[INTEL-IP]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // LOOKUP — Domain
  // ============================================================
  router.post('/intel/domain', authMiddleware, async (req, res) => {
    const { domain, services } = req.body;
    if (!domain) return res.status(400).json({ error: 'domain gerekli' });

    try {
      const result = await intelService.lookupDomain(domain, services);

      try {
        await db.pool.query(
          `INSERT INTO intel_queries (user_id, query_type, query_value, services, results)
           VALUES ($1, 'domain', $2, $3, $4)`,
          [
            req.user.id,
            domain,
            JSON.stringify(services || Object.keys(result.services)),
            JSON.stringify(result.services),
          ]
        );
      } catch (dbErr) {}

      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // LOOKUP — Email
  // ============================================================
  router.post('/intel/email', authMiddleware, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email gerekli' });

    try {
      const result = await intelService.lookupEmail(email);

      try {
        await db.pool.query(
          `INSERT INTO intel_queries (user_id, query_type, query_value, services, results)
           VALUES ($1, 'email', $2, $3, $4)`,
          [
            req.user.id,
            email,
            JSON.stringify(Object.keys(result.services)),
            JSON.stringify(result.services),
          ]
        );
      } catch (dbErr) {}

      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // LOOKUP — Phone
  // ============================================================
  router.post('/intel/phone', authMiddleware, async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone gerekli' });

    try {
      const [abs, nv] = await Promise.all([
        intelService.abstractPhone(phone).catch((e) => ({ ok: false, error: e.message })),
        intelService.numverify(phone).catch((e) => ({ ok: false, error: e.message })),
      ]);

      res.json({
        phone,
        services: {
          abstractPhone: abs,
          numverify: nv,
        },
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // BULK IP LOOKUP
  // ============================================================
  router.post('/intel/ip/bulk', authMiddleware, async (req, res) => {
    const { ips, services } = req.body;
    if (!Array.isArray(ips) || ips.length === 0) {
      return res.status(400).json({ error: 'ips array gerekli' });
    }

    // Max 20
    const list = ips.slice(0, 20);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(JSON.stringify({ type: 'start', total: list.length }) + '\n');

    for (let i = 0; i < list.length; i++) {
      const ip = list[i];
      try {
        const result = await intelService.lookupIP(ip, services);
        res.write(JSON.stringify({
          type: 'result',
          index: i + 1,
          total: list.length,
          ...result,
        }) + '\n');
      } catch (e) {
        res.write(JSON.stringify({
          type: 'result',
          index: i + 1,
          total: list.length,
          ip,
          error: e.message,
        }) + '\n');
      }
    }

    res.write(JSON.stringify({ type: 'end' }) + '\n');
    res.end();
  });

  // ============================================================
  // QUERY HISTORY
  // ============================================================
  router.get('/intel/history', authMiddleware, async (req, res) => {
    try {
      const { limit = 50, type } = req.query;

      let query = 'SELECT id, query_type, query_value, risk_score, risk_level, created_at FROM intel_queries WHERE user_id = $1';
      const params = [req.user.id];

      if (type) {
        params.push(type);
        query += ` AND query_type = $${params.length}`;
      }

      params.push(parseInt(limit));
      query += ` ORDER BY id DESC LIMIT $${params.length}`;

      const result = await db.pool.query(query, params);
      res.json({ history: result.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // SERVIS STATÜSÜ
  // ============================================================
  router.get('/intel/status', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        'SELECT service, is_active, key_required FROM api_keys ORDER BY service'
      );
      res.json({ services: result.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
