// ============================================================
// COLLECTIONS ROUTES — Tahsilatlar
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');

module.exports = (deps) => {
  // ------------------------------------------------------------
  // LİSTELE
  // ------------------------------------------------------------
  router.get('/collections', authMiddleware, async (req, res) => {
    try {
      const { card_id, from, to, limit = 100, offset = 0 } = req.query;

      let query = `
        SELECT 
          c.*,
          lc.card_number,
          lc.card_holder_name,
          lc.agent_first_name,
          lc.agent_last_name
        FROM collections c
        LEFT JOIN load_cards lc ON lc.id = c.load_card_id
        WHERE c.user_id = $1
      `;
      const params = [req.user.id];

      if (card_id) {
        params.push(card_id);
        query += ` AND c.load_card_id = $${params.length}`;
      }
      if (from) {
        params.push(from);
        query += ` AND c.collection_date >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        query += ` AND c.collection_date <= $${params.length}`;
      }

      params.push(parseInt(limit));
      query += ` ORDER BY c.collection_date DESC, c.id DESC LIMIT $${params.length}`;

      params.push(parseInt(offset));
      query += ` OFFSET $${params.length}`;

      const result = await db.pool.query(query, params);

      // Toplam
      let countQuery = 'SELECT COUNT(*), COALESCE(SUM(amount), 0) AS total FROM collections WHERE user_id = $1';
      const countParams = [req.user.id];
      if (card_id) {
        countParams.push(card_id);
        countQuery += ` AND load_card_id = $${countParams.length}`;
      }
      const countResult = await db.pool.query(countQuery, countParams);

      res.json({
        collections: result.rows,
        total: parseInt(countResult.rows[0].count),
        totalAmount: parseFloat(countResult.rows[0].total),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // EKLE
  // ------------------------------------------------------------
  router.post('/collections', authMiddleware, async (req, res) => {
    const {
      load_card_id, amount, currency, collection_date, method, reference, notes,
    } = req.body;

    if (!load_card_id || !amount || !collection_date) {
      return res.status(400).json({ error: 'load_card_id, amount, collection_date gerekli' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'amount > 0 olmalı' });
    }

    try {
      const result = await db.pool.query(
        `INSERT INTO collections (
          user_id, load_card_id, amount, currency, collection_date, method, reference, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          req.user.id, load_card_id, amount, currency || 'USD',
          collection_date, method || null, reference || null, notes || null,
        ]
      );

      // Kalan tutarı hesapla
      const balance = await db.pool.query(
        `SELECT * FROM card_balances WHERE load_card_id = $1`,
        [load_card_id]
      );

      res.json({
        ok: true,
        collection: result.rows[0],
        remaining: parseFloat(balance.rows[0]?.remaining || 0),
      });
    } catch (e) {
      console.error('[COLLECTION-CREATE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // SİL
  // ------------------------------------------------------------
  router.delete('/collections/:id', authMiddleware, async (req, res) => {
    try {
      await db.pool.query(
        'DELETE FROM collections WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // ÖZET — Kart bazlı tahsilat durumu
  // ------------------------------------------------------------
  router.get('/collections/summary', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        `SELECT * FROM card_balances 
         WHERE user_id = $1 
         ORDER BY remaining DESC`,
        [req.user.id]
      );

      const totalRemaining = result.rows.reduce(
        (sum, r) => sum + parseFloat(r.remaining || 0),
        0
      );

      const cardsWithRemaining = result.rows.filter(
        (r) => parseFloat(r.remaining || 0) > 0
      );

      res.json({
        balances: result.rows,
        totalRemaining,
        cardsWithRemaining: cardsWithRemaining.length,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
