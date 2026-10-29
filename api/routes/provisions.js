const express = require('express');
const router = express.Router();
const { authMiddleware, scopeByOwner, requirePermission } = require('../auth');
const db = require('../db');
const { CreditsSettingsService } = require('../services/CreditsSettingsService');
const financeService = new CreditsSettingsService();

module.exports = (deps) => {
router.get('/provisions', authMiddleware, async (req, res) => {
  try {
    const ownerId = scopeByOwner(req, req.query.userId);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const params = [ownerId];
    const where = ['p.user_id=$1'];
    if (req.query.status) {
      params.push(String(req.query.status).slice(0, 30));
      where.push(`p.status=$${params.length}`);
    }
    const whereSql = where.join(' AND ');
    const count = await db.pool.query(
      `SELECT COUNT(*)::int AS total FROM provisions p WHERE ${whereSql}`,
      params
    );
    params.push(limit, offset);
    const result = await db.pool.query(
      `SELECT p.id, p.user_id, p.card_enrollment_id, p.provider, p.network_ref,
              p.amount, p.captured_total, p.currency, p.status, p.failure_code,
              p.created_at, p.updated_at, ce.brand, ce.last4
       FROM provisions p
       LEFT JOIN card_enrollments ce ON ce.id=p.card_enrollment_id
       WHERE ${whereSql}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ provisions: result.rows, total: count.rows[0].total, limit, offset });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Provizyonlar alınamadı' });
  }
});

router.post('/provisions/:id/charge', authMiddleware, requirePermission('payments.capture'), async (req, res) => {
  let captureFee = 0;
  let captureFeeDebited = false;
  try {
    const provisionId = Number(req.params.id);
    if (!Number.isSafeInteger(provisionId) || provisionId < 1) return res.status(400).json({ error: 'Provision ID geçersiz' });
    const provision = await db.pool.query(
      `SELECT id, user_id, provider, network_ref, status, amount
       FROM provisions WHERE id=$1 AND user_id=$2`,
      [provisionId, req.user.id]
    );
    if (!provision.rowCount) return res.status(404).json({ error: 'Provizyon bulunamadı' });
    if (provision.rows[0].status !== 'open') return res.status(409).json({ error: 'Yalnızca açık provizyon capture edilebilir' });
    const transaction = await db.pool.query(
      `SELECT id FROM merchant_transactions
       WHERE user_id=$1 AND provider=$2 AND provider_transaction_id=$3
         AND operation='preauth' AND status='approved'
       ORDER BY id DESC LIMIT 1`,
      [req.user.id, provision.rows[0].provider, provision.rows[0].network_ref]
    );
    if (!transaction.rowCount) return res.status(409).json({ error: 'İşlenebilir provider provizyonu bulunamadı' });
    if (req.user.role !== 'admin') {
      captureFee = await financeService.getFee('capture');
      if (captureFee > 0) {
        await financeService.spend({
          userId: req.user.id, amount: captureFee, entryType: 'capture_fee',
          referenceType: 'provision', referenceId: String(provisionId),
          idempotencyKey: `provision-capture-fee-${req.requestId}`,
        });
        captureFeeDebited = true;
      }
    }
    const result = await deps.paymentService.operateOnTransaction({
      userId: req.user.id,
      requestId: req.requestId,
      transactionId: transaction.rows[0].id,
      operation: 'capture',
      amount: req.body?.amount,
      captureMode: req.body?.mode || 'FULL_AUTH',
      reason: req.body?.reason,
      idempotencyKey: req.body?.idempotencyKey || req.get('Idempotency-Key'),
    });
    if (captureFeeDebited && !result.success && !result.actionRequired) {
      await financeService.grant({
        userId: req.user.id, amount: captureFee, entryType: 'adjustment',
        referenceType: 'provision', referenceId: String(provisionId),
        idempotencyKey: `provision-capture-refund-${req.requestId}`, createdBy: req.user.id,
      });
    }
    res.status(result.success ? 200 : 422).json(result);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Capture başarısız', code: error.code || null, requestId: req.requestId });
  }
});

return router;
};
