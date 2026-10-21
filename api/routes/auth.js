const express = require('express');
const router = express.Router();
const { authMiddleware, login } = require('../auth');
const { findUserById, getUserPermissions } = require('../db');

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email ve şifre gerekli' });
    }
    const result = await login(email, password);
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
  res.json({ user: { id: user.id, email: user.email, role: user.role, permissions } });
});

module.exports = router;