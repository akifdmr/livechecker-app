// ============================================================
// LOADS ROUTES — Dolum İşlemleri
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');

module.exports = (deps) => {
  // ------------------------------------------------------------
  // LİSTELE (filtreli)
  // ------------------------------------------------------------
  router.get('/loads', authMiddleware, async (req, res) => {
    try {
      const { card_id, from, to, limit = 100, offset = 0 } = req.query;

      let query = `
        SELECT 
          l.*,
          lc.card_number,
          lc.card_holder_name,
          lc.agent_first_name,
          lc.agent_last_name,
          ba.account_name,
          ba.account_number,
          ba.bank_name
        FROM loads l
        LEFT JOIN load_cards lc ON lc.id = l.load_card_id
        LEFT JOIN bank_accounts ba ON ba.id = l.bank_account_id
        WHERE l.user_id = $1
      `;
      const params = [req.user.id];

      if (card_id) {
        params.push(card_id);
        query += ` AND l.load_card_id = $${params.length}`;
      }
      if (from) {
        params.push(from);
        query += ` AND l.load_date >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        query += ` AND l.load_date <= $${params.length}`;
      }

      params.push(parseInt(limit));
      query += ` ORDER BY l.load_date DESC, l.id DESC LIMIT $${params.length}`;

      params.push(parseInt(offset));
      query += ` OFFSET $${params.length}`;

      const result = await db.pool.query(query, params);

      // Toplam
      let countQuery = 'SELECT COUNT(*), COALESCE(SUM(amount), 0) AS total FROM loads WHERE user_id = $1';
      const countParams = [req.user.id];
      if (card_id) {
        countParams.push(card_id);
        countQuery += ` AND load_card_id = $${countParams.length}`;
      }
      const countResult = await db.pool.query(countQuery, countParams);

      res.json({
        loads: result.rows,
        total: parseInt(countResult.rows[0].count),
        totalAmount: parseFloat(countResult.rows[0].total),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // TEK KAYIT
  // ------------------------------------------------------------
  router.get('/loads/:id', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        `SELECT l.*, lc.card_number, lc.card_holder_name, ba.account_name, ba.bank_name
         FROM loads l
         LEFT JOIN load_cards lc ON lc.id = l.load_card_id
         LEFT JOIN bank_accounts ba ON ba.id = l.bank_account_id
         WHERE l.id = $1 AND l.user_id = $2`,
        [req.params.id, req.user.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Dolum bulunamadı' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // EKLE
  // ------------------------------------------------------------
  router.post('/loads', authMiddleware, async (req, res) => {
    const {
      load_card_id, bank_account_id,
      amount, currency, load_date, method, reference, notes,
    } = req.body;

    if (!load_card_id || !amount || !load_date) {
      return res.status(400).json({ error: 'load_card_id, amount, load_date gerekli' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'amount > 0 olmalı' });
    }

    try {
      const result = await db.pool.query(
        `INSERT INTO loads (
          user_id, load_card_id, bank_account_id,
          amount, currency, load_date, method, reference, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          req.user.id, load_card_id, bank_account_id || null,
          amount, currency || 'USD', load_date, method || null, reference || null, notes || null,
        ]
      );

      res.json({ ok: true, load: result.rows[0] });
    } catch (e) {
      console.error('[LOAD-CREATE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // TOPLU DOLUM (birden fazla kart)
  // ------------------------------------------------------------
  router.post('/loads/bulk', authMiddleware, async (req, res) => {
    const { load_card_ids, bank_account_id, amount, load_date, method, reference, notes } = req.body;

    if (!Array.isArray(load_card_ids) || load_card_ids.length === 0) {
      return res.status(400).json({ error: 'load_card_ids array gerekli' });
    }
    if (!amount || !load_date) {
      return res.status(400).json({ error: 'amount ve load_date gerekli' });
    }

    try {
      const results = [];
      for (const cardId of load_card_ids) {
        const r = await db.pool.query(
          `INSERT INTO loads (
            user_id, load_card_id, bank_account_id,
            amount, currency, load_date, method, reference, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            req.user.id, cardId, bank_account_id || null,
            amount, 'USD', load_date, method || null, reference || null, notes || null,
          ]
        );
        results.push(r.rows[0]);
      }

      res.json({ ok: true, count: results.length, loads: results });
    } catch (e) {
      console.error('[LOAD-BULK-CREATE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // GÜNCELLE
  // ------------------------------------------------------------
  router.put('/loads/:id', authMiddleware, async (req, res) => {
    try {
      const check = await db.pool.query(
        'SELECT * FROM loads WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Dolum bulunamadı' });
      }

      const fields = ['load_card_id', 'bank_account_id', 'amount', 'currency', 'load_date', 'method', 'reference', 'notes'];
      const updates = [];
      const values = [];
      let i = 1;

      for (const f of fields) {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${i}`);
          values.push(req.body[f]);
          i++;
        }
      }

      if (updates.length === 0) {
        return res.json({ ok: true, load: check.rows[0] });
      }

      updates.push(`updated_at = NOW()`);
      values.push(req.params.id);
      values.push(req.user.id);

      const result = await db.pool.query(
        `UPDATE loads SET ${updates.join(', ')} 
         WHERE id = $${i} AND user_id = $${i + 1} 
         RETURNING *`,
        values
      );

      res.json({ ok: true, load: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // SİL
  // ------------------------------------------------------------
  router.delete('/loads/:id', authMiddleware, async (req, res) => {
    try {
      await db.pool.query(
        'DELETE FROM loads WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
