// ============================================================
// AUTH — JWT + action-based RBAC
// ============================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { findUserByUsername, updateLastLogin, getUserPermissions } = db;

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'local-dev-jwt-secret-change-this-please-32chars' : '');
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production' || JWT_SECRET.length < 32) {
  console.warn('[AUTH] JWT_SECRET missing/too short. Set a random secret >= 32 chars.');
}

async function login(username, password) {
  const user = await findUserByUsername(String(username || '').trim());
  if (!user || !user.is_active) throw new Error('Kullanıcı bulunamadı veya pasif');

  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) throw new Error('Şifre yanlış');

  await updateLastLogin(user.id);
  let permissions = [];
  try { permissions = await getUserPermissions(user.id); } catch (_) {}

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  return {
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role, display_name: user.display_name, credits: Number(user.credits || 0), permissions }
  };
}

function verifyToken(token) {
  if (!token || !JWT_SECRET) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch (_) { return null; }
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Token gerekli' });

  const decoded = verifyToken(authHeader.slice(7));
  if (!decoded) return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });

  try {
    // JWT kimliği tek başına yeterli değildir: bloklanan hesapların tokenları
    // ve güncel rol/kredi durumu her istekte sunucudan doğrulanır.
    const result = await db.pool.query(
      `UPDATE users SET last_seen_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING id, username, email, role, credits`,
      [decoded.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Hesap engellendi veya bulunamadı' });
    req.user = { ...decoded, id: user.id, username: user.username, email: user.email, role: user.role, credits: Number(user.credits || 0) };

    // Sıfır kredili hesaplar profilini düzenleyebilir; diğer değişiklik/işlem
    // endpointleri kredi yüklenene kadar kapalıdır. Admin işlemleri bundan etkilenmez.
    const requestPath = String(req.originalUrl || req.path).split('?')[0];
    const isProfileUpdate = requestPath.endsWith('/auth/profile');
    const isCreditRequest = requestPath === '/credit-requests';
    const isMessageOperation = requestPath === '/messages' || requestPath === '/messages/internal';
    const mutation = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (req.user.role !== 'admin' && mutation && !isProfileUpdate && !isCreditRequest && !isMessageOperation && req.user.credits <= 0) {
      return res.status(403).json({ error: 'İşlem yapabilmek için hesabınıza kredi yüklenmeli' });
    }
    next();
  } catch (err) {
    console.error('[AUTH] Kullanıcı oturumu doğrulanamadı:', err.message);
    res.status(500).json({ error: 'Oturum doğrulanamadı' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin gerekli' });
  next();
}

function assertCanView(req, ownerId) {
  if (req.user?.role === 'admin') return true;
  return Number(req.user?.id) === Number(ownerId);
}

function scopeByOwner(req, requestedOwnerId = null) {
  if (!req.user) throw Object.assign(new Error('Kimlik doğrulama gerekli'), { statusCode: 401 });
  if (req.user.role === 'admin' && requestedOwnerId != null && requestedOwnerId !== '') {
    const id = Number(requestedOwnerId);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw Object.assign(new Error('userId geçersiz'), { statusCode: 400 });
    }
    return id;
  }
  return Number(req.user.id);
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

module.exports = {
  login,
  verifyToken,
  authMiddleware,
  requireAuth: authMiddleware,
  requireAdmin,
  assertCanView,
  scopeByOwner,
  requirePermission,
};
