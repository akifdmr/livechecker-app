// backend/middleware/requireAdmin.js  (yoksa oluştur)
const dbService = require('../services/DbService');

async function requireAdmin(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Auth gerekli' });
    if (req.user.role === 'admin') return next();
    const isAdmin = await dbService.isUserAdmin(req.user.id);
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
    req.user.role = 'admin';
    next();
  } catch (e) {
    console.error('[requireAdmin]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = requireAdmin;