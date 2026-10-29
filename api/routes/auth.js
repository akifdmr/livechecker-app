const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authMiddleware, login, createSession, setSessionCookies, clearSessionCookies } = require('../auth');
const { findUserById, getUserPermissions } = require('../db');
const db = require('../db');

// POST /auth/register — self-service account; viewer role and zero credits.
router.post('/register', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const email = String(req.body?.email || '').trim().toLowerCase() || null;
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || '').trim().slice(0, 120) || null;
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username 3-32 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email formatı geçersiz' });
  if (password.length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.pool.query(
      `INSERT INTO users (username, email, password_hash, role, is_active, credits, display_name)
       VALUES ($1, $2, $3, 'viewer', TRUE, 0, $4)
       RETURNING id, username, email, role, display_name, credits, created_at`,
      [username, email, passwordHash, displayName]
    );
    res.status(201).json({ ok: true, user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: error.constraint === 'idx_users_username_ci' ? 'Bu username kullanımda' : 'Bu email zaten kayıtlı' });
    console.error('[AUTH] Kayıt oluşturulamadı:', error.message);
    res.status(500).json({ error: 'Hesap oluşturulamadı' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username ve şifre gerekli' });
    }
    const result = await login(username, password);
    if (req.get('X-Session-Mode') === 'cookie') {
      const session = await createSession(result.user.id);
      setSessionCookies(res, session.token, null, session.expiresAt.getTime() - Date.now());
      return res.json({ user: result.user });
    }
    res.json(result); // Bearer mode remains for non-browser clients such as the extension.
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

// GET /auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const user = await findUserById(req.user.id);
  if (!user || !user.is_active) return res.status(401).json({ error: 'Kullanıcı pasif veya bulunamadı' });
  const permissions = await getUserPermissions(user.id);
  res.json({ user: { ...user, credits: req.user.credits, permissions } });
});

router.get('/sessions', authMiddleware, async (req, res) => {
  const sessions = await db.pool.query(
    `SELECT id,created_at,last_seen_at,idle_expires_at,expires_at
     FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL AND idle_expires_at>NOW() AND expires_at>NOW()
     ORDER BY last_seen_at DESC`, [req.user.id]
  );
  res.json({ sessions: sessions.rows.map((item) => ({ ...item, current: item.id === req.user.sessionId })) });
});

router.delete('/sessions/:id', authMiddleware, async (req, res) => {
  const result = await db.pool.query(
    `UPDATE user_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id`,
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Oturum bulunamadı' });
  if (req.params.id === req.user.sessionId) clearSessionCookies(res);
  res.json({ ok: true });
});

router.post('/logout', authMiddleware, async (req, res) => {
  if (req.user.sessionId) await db.pool.query('UPDATE user_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL', [req.user.sessionId, req.user.id]);
  clearSessionCookies(res);
  res.json({ ok: true });
});

router.post('/logout-all', authMiddleware, async (req, res) => {
  await db.pool.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [req.user.id]);
  clearSessionCookies(res);
  res.json({ ok: true });
});

router.post('/signalr-token', authMiddleware, (req, res) => {
  if (!req.user.sessionId || !process.env.JWT_SECRET) return res.status(400).json({ error: 'Tarayıcı oturumu gerekli' });
  const token = jwt.sign({ id: req.user.id, username: req.user.username, email: req.user.email, role: req.user.role, sessionId: req.user.sessionId }, process.env.JWT_SECRET, { expiresIn: '2m' });
  res.json({ token });
});

// PATCH /auth/profile — users may edit only their own profile and password.
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const username = req.body?.username === undefined ? undefined : String(req.body.username).trim().toLowerCase();
    const email = req.body?.email === undefined ? undefined : String(req.body.email).trim().toLowerCase();
    const displayName = req.body?.displayName === undefined ? undefined : (String(req.body.displayName).trim().slice(0, 120) || null);
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (username !== undefined && !/^[a-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username 3-32 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir' });
    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Geçerli email gerekli' });
    if (newPassword && newPassword.length < 8) return res.status(400).json({ error: 'Yeni şifre en az 8 karakter olmalı' });
    if (newPassword && !currentPassword) return res.status(400).json({ error: 'Şifre değiştirmek için mevcut şifre gerekli' });

    const current = await db.pool.query('SELECT password_hash FROM users WHERE id=$1 AND is_active=TRUE', [req.user.id]);
    if (!current.rowCount) return res.status(401).json({ error: 'Hesap bulunamadı' });
    if (newPassword && !(await bcrypt.compare(currentPassword, current.rows[0].password_hash))) {
      return res.status(400).json({ error: 'Mevcut şifre yanlış' });
    }

    const sets = [];
    const values = [];
    if (username !== undefined) { values.push(username); sets.push(`username=$${values.length}`); }
    if (email !== undefined) { values.push(email); sets.push(`email=$${values.length}`); }
    if (displayName !== undefined) { values.push(displayName); sets.push(`display_name=$${values.length}`); }
    if (newPassword) { values.push(await bcrypt.hash(newPassword, 12)); sets.push(`password_hash=$${values.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Güncellenecek alan yok' });
    values.push(req.user.id);
    const result = await db.pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id=$${values.length}
       RETURNING id, username, email, role, display_name, is_active, created_at, last_login`, values
    );
    if (newPassword) {
      await db.pool.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [req.user.id]);
      clearSessionCookies(res);
    }
    const permissions = await getUserPermissions(req.user.id);
    res.json({ user: { ...result.rows[0], credits: req.user.credits, permissions } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: error.constraint === 'idx_users_username_ci' ? 'Bu username kullanımda' : 'Bu email zaten kayıtlı' });
    console.error('[AUTH] Profil güncellenemedi:', error.message);
    res.status(500).json({ error: 'Profil güncellenemedi' });
  }
});

module.exports = router;
