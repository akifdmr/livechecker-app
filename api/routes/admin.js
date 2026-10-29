// ============================================================
// routes/admin.js — sadece admin role'lü kullanıcılar
// ============================================================
const express      = require('express');
const router       = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const adminService = require('../services/AdminService');
const dbService    = require('../services/DbService');

// ⭐ Tüm /admin/* rotaları için tek satırda kapı bekçisi
router.use(requireAdmin);

// ============================================================
// Helper: userId query parametresini parse et
// ============================================================
function parseUserId(q) {
  if (q === undefined || q === null || q === '') return null;
  const n = parseInt(q, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ============================================================
// DASHBOARD
// ============================================================
router.get('/dashboard', async (req, res, next) => {
  try {
    const stats = await adminService.getDashboardStats();
    res.json(stats);
  } catch (e) { next(e); }
});

// ============================================================
// USERS
// ============================================================
router.get('/users', async (req, res, next) => {
  try {
    const users = await adminService.listUsers(req.query);
    const total = await adminService.countUsers(req.query);
    res.json({ users, total });
  } catch (e) { next(e); }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Geçersiz id' });

    const [user, liveCards, txns] = await Promise.all([
      adminService.getUser(id),
      adminService.listLiveCards({ userId: id, limit: 50 }),
      adminService.listMerchantTransactions({ userId: id, limit: 50 }),
    ]);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user, liveCards, transactions: txns });
  } catch (e) { next(e); }
});

// ============================================================
// LIVE CARDS
// ============================================================
router.get('/live-cards', async (req, res, next) => {
  try {
    const userId = parseUserId(req.query.userId);
    const cards = await adminService.listLiveCards({ ...req.query, userId });
    const total = await adminService.countLiveCards({ userId });
    res.json({ cards, total });
  } catch (e) { next(e); }
});

// ============================================================
// ENROLLMENTS
// ============================================================
router.get('/enrollments', async (req, res, next) => {
  try {
    const userId = parseUserId(req.query.userId);
    const rows = await adminService.listEnrollments({ ...req.query, userId });
    res.json({ enrollments: rows });
  } catch (e) { next(e); }
});

// ============================================================
// MERCHANT TRANSACTIONS
// ============================================================
router.get('/merchant-transactions', async (req, res, next) => {
  try {
    const userId = parseUserId(req.query.userId);
    const rows = await adminService.listMerchantTransactions({ ...req.query, userId });
    res.json({ transactions: rows });
  } catch (e) { next(e); }
});

// ============================================================
// PROVIDER TRANSACTIONS — DbService zaten userId=null destekliyor
// ============================================================
router.get('/provider-transactions', async (req, res, next) => {
  try {
    const rows = await dbService.listProviderTransactions({
      userId:      parseUserId(req.query.userId),
      provider:    req.query.provider || null,
      action:      req.query.action   || null,
      status:      req.query.status   || null,
      dateFrom:    req.query.dateFrom || null,
      dateTo:      req.query.dateTo   || null,
      limit:       req.query.limit,
      offset:      req.query.offset,
    });
    res.json({ transactions: rows });
  } catch (e) { next(e); }
});

router.get('/provider-summary', async (req, res, next) => {
  try {
    const rows = await dbService.getProviderSummary({
      userId:   parseUserId(req.query.userId),
      provider: req.query.provider || null,
      dateFrom: req.query.dateFrom || null,
      dateTo:   req.query.dateTo   || null,
    });
    res.json({ summary: rows });
  } catch (e) { next(e); }
});

// ============================================================
// BIN HISTORY / FAVORITES / SUBSCRIPTIONS
// ============================================================
router.get('/bin-history', async (req, res, next) => {
  try {
    const rows = await adminService.listBinHistory({
      userId: parseUserId(req.query.userId),
      limit:  req.query.limit,
      offset: req.query.offset,
    });
    res.json({ history: rows });
  } catch (e) { next(e); }
});

router.get('/favorites', async (req, res, next) => {
  try {
    const rows = await adminService.listFavorites({
      userId: parseUserId(req.query.userId),
      limit:  req.query.limit,
      offset: req.query.offset,
    });
    res.json({ favorites: rows });
  } catch (e) { next(e); }
});

router.get('/subscription-cards', async (req, res, next) => {
  try {
    const rows = await adminService.listSubscriptionCards({
      userId: parseUserId(req.query.userId),
      limit:  req.query.limit,
      offset: req.query.offset,
    });
    res.json({ cards: rows });
  } catch (e) { next(e); }
});

router.get('/subscription-prechecks', async (req, res, next) => {
  try {
    const rows = await adminService.listSubscriptionPrechecks({
      userId: parseUserId(req.query.userId),
      limit:  req.query.limit,
      offset: req.query.offset,
    });
    res.json({ prechecks: rows });
  } catch (e) { next(e); }
});

// ============================================================
// AUDIT LOG — admin erişimlerini kaydetmek istersen
// ============================================================
router.post('/audit-view', async (req, res, next) => {
  try {
    const { targetUserId, resource, resourceId } = req.body || {};
    await dbService.auditEvent(
      req.user.id,
      'admin.view',
      resource || null,
      resourceId || null,
      { targetUserId: targetUserId || null, ip: req.ip }
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;