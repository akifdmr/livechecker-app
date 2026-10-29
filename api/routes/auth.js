const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { authMiddleware, login } = require('../auth');
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
    res.json(result);
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
    const permissions = await getUserPermissions(req.user.id);
    res.json({ user: { ...result.rows[0], credits: req.user.credits, permissions } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: error.constraint === 'idx_users_username_ci' ? 'Bu username kullanımda' : 'Bu email zaten kayıtlı' });
    console.error('[AUTH] Profil güncellenemedi:', error.message);
    res.status(500).json({ error: 'Profil güncellenemedi' });
  }
});

module.exports = router;
