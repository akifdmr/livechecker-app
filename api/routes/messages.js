const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');

const DEV_INTERNAL_SECRET = 'local-dev-signalr-internal-secret-change-me';

function internalSecretMatches(value) {
  const expected = process.env.SIGNALR_INTERNAL_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : DEV_INTERNAL_SECRET);
  if (!expected || !value) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(String(value));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

router.get('/messages/conversations', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin gerekli' });
  try {
    const result = await db.pool.query(`
      SELECT u.id AS user_id, u.username,
             latest.body AS last_message,
             latest.sender_role AS last_sender_role,
             latest.created_at AS last_message_at,
             COALESCE(unread.count, 0)::int AS unread_count
      FROM users u
      JOIN LATERAL (
        SELECT body, sender_role, created_at
        FROM support_messages sm
        WHERE sm.user_id=u.id
        ORDER BY sm.created_at DESC, sm.id DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM support_messages sm
        WHERE sm.user_id=u.id AND sm.sender_role='user' AND sm.read_at IS NULL
      ) unread ON TRUE
      WHERE u.role <> 'admin'
      ORDER BY latest.created_at DESC
      LIMIT 500
    `);
    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('[MESSAGES] Konuşmalar alınamadı:', error.message);
    res.status(500).json({ error: 'Konuşmalar alınamadı' });
  }
});

router.get('/messages', authMiddleware, async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const threadUserId = isAdmin ? Number(req.query.userId) : Number(req.user.id);
  if (!Number.isSafeInteger(threadUserId) || threadUserId < 1) return res.status(400).json({ error: 'Geçerli kullanıcı gerekli' });
  if (isAdmin) {
    const owner = await db.pool.query('SELECT id FROM users WHERE id=$1 AND role<>\'admin\'', [threadUserId]);
    if (!owner.rowCount) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 200, 1), 500);
  try {
    await db.pool.query(
      `UPDATE support_messages SET read_at=NOW()
       WHERE user_id=$1 AND sender_role<>$2 AND read_at IS NULL`,
      [threadUserId, isAdmin ? 'admin' : 'user']
    );
    const result = await db.pool.query(
      `SELECT sm.id, sm.user_id, sm.sender_id, sm.sender_role, sm.body, sm.created_at, sm.read_at,
              sender.username AS sender_username
       FROM (
         SELECT * FROM support_messages WHERE user_id=$1
         ORDER BY created_at DESC, id DESC LIMIT $2
       ) sm
       JOIN users sender ON sender.id=sm.sender_id
       ORDER BY sm.created_at, sm.id`,
      [threadUserId, limit]
    );
    res.json({ messages: result.rows, threadUserId });
  } catch (error) {
    console.error('[MESSAGES] Mesajlar alınamadı:', error.message);
    res.status(500).json({ error: 'Mesajlar alınamadı' });
  }
});

// SignalR is the only writer; the shared internal secret prevents clients
// from forging sender IDs or bypassing hub authentication.
router.post('/messages/internal', async (req, res) => {
  if (!internalSecretMatches(req.get('X-SignalR-Internal-Secret'))) {
    return res.status(401).json({ error: 'Internal authentication failed' });
  }
  const senderId = Number(req.body?.senderId);
  const threadUserId = Number(req.body?.threadUserId);
  const senderRole = String(req.body?.senderRole || '');
  const body = String(req.body?.body || '').trim();
  if (!Number.isSafeInteger(senderId) || senderId < 1 || !Number.isSafeInteger(threadUserId) || threadUserId < 1) {
    return res.status(400).json({ error: 'Gönderen ve konuşma kullanıcıları gerekli' });
  }
  if (!['user', 'admin'].includes(senderRole) || !body || body.length > 2000) {
    return res.status(400).json({ error: 'Mesaj geçersiz veya 2000 karakterden uzun' });
  }
  if (senderRole === 'user' && senderId !== threadUserId) return res.status(403).json({ error: 'Kullanıcı yalnızca kendi konuşmasına yazabilir' });

  try {
    const sender = await db.pool.query('SELECT id, username, role FROM users WHERE id=$1 AND is_active=TRUE', [senderId]);
    if (!sender.rowCount) return res.status(401).json({ error: 'Gönderen hesabı bulunamadı' });
    if ((senderRole === 'admin') !== (sender.rows[0].role === 'admin')) return res.status(403).json({ error: 'Gönderen rolü uyuşmuyor' });
    const target = await db.pool.query('SELECT id FROM users WHERE id=$1 AND role<>\'admin\' AND is_active=TRUE', [threadUserId]);
    if (!target.rowCount) return res.status(404).json({ error: 'Konuşma kullanıcısı bulunamadı' });

    const inserted = await db.pool.query(
      `INSERT INTO support_messages(user_id, sender_id, sender_role, body)
       VALUES($1,$2,$3,$4) RETURNING id, user_id, sender_id, sender_role, body, created_at, read_at`,
      [threadUserId, senderId, senderRole, body]
    );
    res.status(201).json({ message: { ...inserted.rows[0], sender_username: sender.rows[0].username } });
  } catch (error) {
    console.error('[MESSAGES] Mesaj kaydedilemedi:', error.message);
    res.status(500).json({ error: 'Mesaj kaydedilemedi' });
  }
});

router.get('/credit-requests/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.pool.query(
      `SELECT id, requested_amount, message, status, approved_amount, admin_note, created_at, resolved_at
       FROM credit_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ requests: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Kredi talepleri alınamadı' });
  }
});

router.post('/credit-requests', authMiddleware, async (req, res) => {
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Admin hesabı kredi talebi oluşturamaz' });
  const amount = Number(req.body?.amount);
  const message = String(req.body?.message || '').trim().slice(0, 500) || null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    return res.status(400).json({ error: 'Talep tutarı 0 ile 1,000,000 arasında olmalı' });
  }
  try {
    const account = await db.pool.query('SELECT id FROM users WHERE id=$1 AND is_active=TRUE', [req.user.id]);
    if (!account.rowCount) return res.status(401).json({ error: 'Hesap bulunamadı' });
    const result = await db.pool.query(
      `INSERT INTO credit_requests(user_id, requested_amount, message)
       VALUES($1,$2,$3)
       RETURNING id, user_id, requested_amount, message, status, created_at`,
      [req.user.id, Math.round(amount * 100) / 100, message]
    );
    res.status(201).json({ request: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Bekleyen bir kredi talebiniz zaten var' });
    console.error('[CREDIT-REQUEST]', error.message);
    res.status(500).json({ error: 'Kredi talebi gönderilemedi' });
  }
});

module.exports = router;
