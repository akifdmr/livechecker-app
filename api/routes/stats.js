// ============================================================
// STATS ROUTES — Kullanıcı ve Sistem İstatistikleri
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');

module.exports = (deps) => {
  // ------------------------------------------------------------
  // KENDİ İSTATİSTİKLERİM (her user)
  // ------------------------------------------------------------
  router.get('/my-stats', authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;

      const [cardChecks, binChecks, liveCards, todayCard, todayBin, weekCard, weekBin] =
        await Promise.all([
          db.pool.query('SELECT COUNT(*) FROM card_checks WHERE user_id = $1', [userId]),
          db.pool.query('SELECT COUNT(*) FROM bin_checks WHERE user_id = $1', [userId]),
          db.pool.query('SELECT COUNT(*) FROM live_cards_full WHERE user_id = $1', [userId]),
          db.pool.query("SELECT COUNT(*) FROM card_checks WHERE user_id = $1 AND created_at >= CURRENT_DATE", [userId]),
          db.pool.query("SELECT COUNT(*) FROM bin_checks WHERE user_id = $1 AND created_at >= CURRENT_DATE", [userId]),
          db.pool.query("SELECT COUNT(*) FROM card_checks WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'", [userId]),
          db.pool.query("SELECT COUNT(*) FROM bin_checks WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'", [userId]),
        ]);

      const daily = await db.pool.query(
        `SELECT DATE(created_at) AS date, COUNT(*) AS card_count
         FROM card_checks
         WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY DATE(created_at) ORDER BY date`,
        [userId]
      );

      res.json({
        totalCards: parseInt(cardChecks.rows[0].count),
        totalBins: parseInt(binChecks.rows[0].count),
        totalLiveCards: parseInt(liveCards.rows[0].count),
        todayCards: parseInt(todayCard.rows[0].count),
        todayBins: parseInt(todayBin.rows[0].count),
        weekCards: parseInt(weekCard.rows[0].count),
        weekBins: parseInt(weekBin.rows[0].count),
        daily: daily.rows.map((r) => ({ date: r.date, cardCount: parseInt(r.card_count) })),
      });
    } catch (e) {
      console.error('[MY-STATS]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // A checker can see only its own safe BIN metadata history.
  router.get('/bin-history', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        `SELECT id, bin, brand, type, category, issuer, country, created_at
         FROM bin_checks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`,
        [req.user.id]
      );
      res.json({ checks: result.rows });
    } catch (e) {
      console.error('[BIN-HISTORY]', e.message);
      res.status(500).json({ error: 'BIN geçmişi yüklenemedi' });
    }
  });

  // ------------------------------------------------------------
  // ADMİN — TÜM KULLANICILARIN İSTATİSTİKLERİ
  // ------------------------------------------------------------
  router.get('/admin/user-stats', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin gerekli' });

    try {
      const totals = await db.pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM card_checks) AS total_card_checks,
          (SELECT COUNT(*) FROM bin_checks) AS total_bin_checks,
          (SELECT COUNT(*) FROM live_cards_full) AS total_live_cards,
          (SELECT COUNT(*) FROM card_checks WHERE created_at >= CURRENT_DATE) AS today_card_checks,
          (SELECT COUNT(*) FROM bin_checks WHERE created_at >= CURRENT_DATE) AS today_bin_checks
      `);

      const byUser = await db.pool.query(`
        SELECT 
          u.id, u.email, u.role, u.last_login,
          (SELECT COUNT(*) FROM card_checks WHERE user_id = u.id) AS total_cards,
          (SELECT COUNT(*) FROM bin_checks WHERE user_id = u.id) AS total_bins,
          (SELECT COUNT(*) FROM live_cards_full WHERE user_id = u.id) AS live_cards,
          (SELECT COUNT(*) FROM card_checks WHERE user_id = u.id AND created_at >= CURRENT_DATE) AS today_cards,
          (SELECT COUNT(*) FROM bin_checks WHERE user_id = u.id AND created_at >= CURRENT_DATE) AS today_bins
        FROM users u ORDER BY total_cards DESC
      `);

      res.json({
        totals: {
          users: parseInt(totals.rows[0].total_users),
          cardChecks: parseInt(totals.rows[0].total_card_checks),
          binChecks: parseInt(totals.rows[0].total_bin_checks),
          liveCards: parseInt(totals.rows[0].total_live_cards),
          todayCardChecks: parseInt(totals.rows[0].today_card_checks),
          todayBinChecks: parseInt(totals.rows[0].today_bin_checks),
        },
        users: byUser.rows.map((u) => ({
          id: u.id, email: u.email, role: u.role, lastLogin: u.last_login,
          totalCards: parseInt(u.total_cards), totalBins: parseInt(u.total_bins),
          liveCards: parseInt(u.live_cards),
          todayCards: parseInt(u.today_cards), todayBins: parseInt(u.today_bins),
        })),
      });
    } catch (e) {
      console.error('[ADMIN-USER-STATS]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // ADMİN — GÜNLÜK İSTATİSTİKLER (30 gün)
  // ------------------------------------------------------------
  router.get('/admin/daily-stats', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin gerekli' });

    try {
      const daily = await db.pool.query(`
        SELECT DATE(cc.created_at) AS date, COUNT(*) AS card_count, COUNT(DISTINCT cc.user_id) AS user_count
        FROM card_checks cc
        WHERE cc.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(cc.created_at) ORDER BY date
      `);
      res.json({
        daily: daily.rows.map((r) => ({
          date: r.date,
          cardCount: parseInt(r.card_count),
          userCount: parseInt(r.user_count),
        })),
      });
    } catch (e) {
      console.error('[ADMIN-DAILY-STATS]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
