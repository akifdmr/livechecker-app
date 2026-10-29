const express = require('express');
const router = express.Router();
const { authMiddleware, scopeByOwner } = require('../auth');
const db = require('../db');
const { CreditsSettingsService } = require('../services/CreditsSettingsService');
const financeService = new CreditsSettingsService(db.pool);

router.get('/credits/balance', authMiddleware, async (req, res) => {
  try {
    res.json({ balance: await financeService.getBalance(req.user.id) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Bakiye alınamadı' });
  }
});

router.get('/ledger', authMiddleware, async (req, res) => {
  try {
    const ownerId = scopeByOwner(req, req.query.userId);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const params = [ownerId];
    const where = ['user_id=$1'];
    if (req.query.entryType) {
      params.push(String(req.query.entryType).slice(0, 30));
      where.push(`entry_type=$${params.length}`);
    }
    const count = await db.pool.query(
      `SELECT COUNT(*)::int AS total FROM credit_ledger WHERE ${where.join(' AND ')}`,
      params
    );
    params.push(limit, offset);
    const result = await db.pool.query(
      `SELECT id, user_id, amount, balance_after, entry_type, reference_type,
              reference_id, created_at
       FROM credit_ledger WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ entries: result.rows, total: count.rows[0].total, limit, offset });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Ledger alınamadı' });
  }
});

module.exports = router;
