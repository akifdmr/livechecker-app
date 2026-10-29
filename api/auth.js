// ============================================================
// AUTH — JWT + action-based RBAC
// ============================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const db = require('./db');
const { findUserByUsername, updateLastLogin, getUserPermissions } = db;

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'local-dev-jwt-secret-change-this-please-32chars' : '');
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const SESSION_COOKIE = 'lc_session';
const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const hash = (value) => createHash('sha256').update(value).digest('hex');

function cookieValue(req, name) {
  const entry = String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function setSessionCookies(res, sessionToken, _csrfToken, maxAge) {
  const secure = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAge / 1000)}${secure}`);
}

function clearSessionCookies(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

async function createSession(userId) {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_MAX_MS);
  await db.pool.query(
    `INSERT INTO user_sessions(id,user_id,token_hash,idle_expires_at,expires_at)
     VALUES($1,$2,$3,$4,$5)`,
    [id, userId, hash(token), new Date(now + SESSION_IDLE_MS), expiresAt]
  );
  return { id, token, expiresAt };
}

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

async function getSessionIdentity(token) {
  if (!token) return null;
  const result = await db.pool.query(
    `SELECT u.id,u.username,u.email,u.role FROM user_sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.idle_expires_at>NOW() AND s.expires_at>NOW() AND u.is_active=TRUE`,
    [hash(token)]
  );
  return result.rows[0] || null;
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  let decoded = authHeader.startsWith('Bearer ') ? verifyToken(authHeader.slice(7)) : null;
  let session = null;
  const sessionToken = cookieValue(req, SESSION_COOKIE);
  if (!decoded && sessionToken) {
    try {
      const result = await db.pool.query(
        `UPDATE user_sessions s SET last_seen_at=NOW(), idle_expires_at=LEAST(NOW() + INTERVAL '12 hours', s.expires_at)
         FROM users u WHERE s.user_id=u.id AND s.token_hash=$1 AND s.revoked_at IS NULL
           AND s.idle_expires_at > NOW() AND s.expires_at > NOW() AND u.is_active=TRUE
         RETURNING s.id AS session_id,s.user_id AS id,u.username,u.email,u.role,u.credits`,
        [hash(sessionToken)]
      );
      session = result.rows[0] || null;
      if (session) {
        const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        if (unsafe) {
          const origin = req.headers.origin;
          const host = req.headers.host;
          let originMatches = false;
          if (origin) {
            try { originMatches = new URL(origin).host === host; } catch { originMatches = false; }
          }
          if (!originMatches || req.headers['sec-fetch-site'] === 'cross-site') {
            return res.status(403).json({ error: 'Same-origin doğrulaması başarısız' });
          }
        }
        decoded = { id: session.id, sessionId: session.session_id };
      }
    } catch (err) {
      console.error('[AUTH] Oturum doğrulanamadı:', err.message);
      return res.status(500).json({ error: 'Oturum doğrulanamadı' });
    }
  }
  if (!decoded) return res.status(401).json({ error: 'Oturum gerekli veya süresi dolmuş' });

  try {
    if (!session && decoded.sessionId) {
      const active = await db.pool.query(
        `SELECT id FROM user_sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL
         AND idle_expires_at>NOW() AND expires_at>NOW()`, [decoded.sessionId, decoded.id]
      );
      if (!active.rowCount) return res.status(401).json({ error: 'Oturum iptal edildi veya süresi doldu' });
    }
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
    req.user = { ...decoded, id: user.id, username: user.username, email: user.email, role: user.role, credits: Number(user.credits || 0), sessionId: session?.session_id || decoded.sessionId || null };

    // Sıfır kredili hesaplar profilini düzenleyebilir; diğer değişiklik/işlem
    // endpointleri kredi yüklenene kadar kapalıdır. Admin işlemleri bundan etkilenmez.
    const requestPath = String(req.originalUrl || req.path).split('?')[0];
    const isProfileUpdate = requestPath.endsWith('/auth/profile');
    const isSessionManagement = /\/auth\/(logout|logout-all|signalr-token|sessions(?:\/[^/]+)?)$/.test(requestPath);
    const isCreditRequest = requestPath === '/credit-requests';
    const isMessageOperation = requestPath === '/messages' || requestPath === '/messages/internal';
    const mutation = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
    if (req.user.role !== 'admin' && mutation && !isProfileUpdate && !isSessionManagement && !isCreditRequest && !isMessageOperation && req.user.credits <= 0) {
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
  createSession,
  setSessionCookies,
  clearSessionCookies,
  cookieValue,
  SESSION_COOKIE,
  verifyToken,
  getSessionIdentity,
  authMiddleware,
  requireAuth: authMiddleware,
  requireAdmin,
  assertCanView,
  scopeByOwner,
  requirePermission,
};
