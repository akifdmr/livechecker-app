// ============================================================
// AUTH — JWT + action-based RBAC
// ============================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { findUserByEmail, updateLastLogin, getUserPermissions } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'local-dev-jwt-secret-change-this-please-32chars' : '');
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production' || JWT_SECRET.length < 32) {
  console.warn('[AUTH] JWT_SECRET missing/too short. Set a random secret >= 32 chars.');
}

async function login(email, password) {
  const user = await findUserByEmail(String(email || '').trim().toLowerCase());
  if (!user || !user.is_active) throw new Error('Kullanıcı bulunamadı veya pasif');

  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) throw new Error('Şifre yanlış');

  await updateLastLogin(user.id);
  let permissions = [];
  try { permissions = await getUserPermissions(user.id); } catch (_) {}

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  return {
    token,
    user: { id: user.id, email: user.email, role: user.role, permissions }
  };
}

function verifyToken(token) {
  if (!token || !JWT_SECRET) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch (_) { return null; }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' });

  const decoded = verifyToken(authHeader.slice(7));
  if (!decoded) return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });

  req.user = decoded;
  next();
}

function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });

      // Admin remains a full-access compatibility role.
      if (req.user.role === 'admin') return next();

      const permissions = await getUserPermissions(req.user.id);
      if (!permissions.includes(permission)) {
        return res.status(403).json({ error: `Bu aksiyon için yetkiniz yok: ${permission}` });
      }

      req.permissions = permissions;
      next();
    } catch (err) {
      console.error('[RBAC]', err.message);
      res.status(500).json({ error: 'Yetki kontrolü yapılamadı' });
    }
  };
}

module.exports = { login, verifyToken, authMiddleware, requirePermission };
