const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');

module.exports = () => {
  // GET /bin-favorites
  router.get('/bin-favorites', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        'SELECT * FROM bin_favorites WHERE user_id = $1 ORDER BY id DESC',
        [req.user.id]
      );
      const favorites = result.rows.map((r) => ({
        ...r,
        cardCount: (r.bins || []).length,
      }));
      res.json({ favorites });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /bin-favorites
  router.post('/bin-favorites', authMiddleware, async (req, res) => {
    const { name, bins, color } = req.body;
    if (!name || !Array.isArray(bins) || bins.length === 0) {
      return res.status(400).json({ error: 'name ve bins gerekli' });
    }
    try {
      const result = await db.pool.query(
        'INSERT INTO bin_favorites (user_id, name, bins, color) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.user.id, name, bins, color || '#4CAF50']
      );
      res.json({ ok: true, favorite: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /bin-favorites/:id
  router.put('/bin-favorites/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { name, bins, color } = req.body;

    try {
      const check = await db.pool.query(
        'SELECT * FROM bin_favorites WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Liste bulunamadı' });
      }

      const current = check.rows[0];

      const result = await db.pool.query(
        `UPDATE bin_favorites 
         SET name = $1, bins = $2, color = $3 
         WHERE id = $4 AND user_id = $5 
         RETURNING *`,
        [
          name !== undefined ? name : current.name,
          bins !== undefined ? bins : current.bins,
          color !== undefined ? color : current.color,
          id,
          req.user.id,
        ]
      );

      res.json({ ok: true, favorite: result.rows[0] });
    } catch (e) {
      console.error('[FAV-UPDATE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /bin-favorites/:id
  router.delete('/bin-favorites/:id', authMiddleware, async (req, res) => {
    try {
      await db.pool.query(
        'DELETE FROM bin_favorites WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /bin-favorites/:id/cards
  router.get('/bin-favorites/:id/cards', authMiddleware, async (req, res) => {
    try {
      const fav = await db.pool.query(
        'SELECT * FROM bin_favorites WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );

      if (fav.rows.length === 0) {
        return res.status(404).json({ error: 'Liste bulunamadı' });
      }

      const bins = fav.rows[0].bins || [];
      const stats = [];

      for (const bin of bins) {
        const count = await db.pool.query(
          'SELECT COUNT(*) FROM live_cards_full WHERE pan LIKE $1 AND user_id = $2',
          [bin + '%', req.user.id]
        );
        stats.push({
          bin,
          count: parseInt(count.rows[0].count),
        });
      }

      res.json({ favorite: fav.rows[0], stats });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /bin-favorites/:id/cards
  router.post('/bin-favorites/:id/cards', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { cardId } = req.body;

    if (!cardId) {
      return res.status(400).json({ error: 'cardId gerekli' });
    }

    try {
      const fav = await db.pool.query(
        'SELECT * FROM bin_favorites WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (fav.rows.length === 0) {
        return res.status(404).json({ error: 'Liste bulunamadı' });
      }

      const card = await db.pool.query(
        'SELECT pan FROM live_cards_full WHERE id = $1 AND user_id = $2',
        [cardId, req.user.id]
      );
      if (card.rows.length === 0) {
        return res.status(404).json({ error: 'Kart bulunamadı' });
      }

      const bin = card.rows[0].pan.substring(0, 6);
      const currentBins = fav.rows[0].bins || [];

      if (!currentBins.includes(bin)) {
        currentBins.push(bin);
        await db.pool.query('UPDATE bin_favorites SET bins = $1 WHERE id = $2', [
          currentBins,
          id,
        ]);
      }

      res.json({ ok: true, bin, bins: currentBins });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /bin-favorites/:id/cards/:cardId
  router.delete(
    '/bin-favorites/:id/cards/:cardId',
    authMiddleware,
    async (req, res) => {
      const { id, cardId } = req.params;

      try {
        const fav = await db.pool.query(
          'SELECT * FROM bin_favorites WHERE id = $1 AND user_id = $2',
          [id, req.user.id]
        );
        if (fav.rows.length === 0) {
          return res.status(404).json({ error: 'Liste bulunamadı' });
        }

        const card = await db.pool.query(
          'SELECT pan FROM live_cards_full WHERE id = $1 AND user_id = $2',
          [cardId, req.user.id]
        );
        if (card.rows.length === 0) {
          return res.status(404).json({ error: 'Kart bulunamadı' });
        }

        const bin = card.rows[0].pan.substring(0, 6);
        const currentBins = (fav.rows[0].bins || []).filter((b) => b !== bin);

        await db.pool.query('UPDATE bin_favorites SET bins = $1 WHERE id = $2', [
          currentBins,
          id,
        ]);

        res.json({ ok: true, bin, bins: currentBins });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    }
  );

  return router;
};
