// ============================================================
// routes/admin.js — Admin kullanıcı yönetimi + istatistikler
// ============================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { authMiddleware } = require('../auth');
const db = require('../db');

// ============================================================
// HELPERS
// ============================================================
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin gerekli' });
  }
  next();
}

// Async route handler'ı otomatik sarmalar
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isPositiveInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0;
}

module.exports = () => {
  // Tüm /admin route'ları için auth + admin zorunlu
  router.use('/admin', authMiddleware, requireAdmin);

  // ============================================================
  // GET /admin/users — kullanıcı listesi + sayaçlar
  // ============================================================
  router.get(
    '/admin/users',
    asyncHandler(async (req, res) => {
      const { limit = 500, offset = 0, role, q } = req.query;

      const where = [];
      const params = [];

      if (role && ['user', 'checker', 'admin', 'operator', 'finance', 'viewer'].includes(role)) {
        params.push(role);
        where.push(`u.role = $${params.length}`);
      }

      if (q) {
        params.push(`%${String(q).toLowerCase()}%`);
        where.push(`LOWER(u.email) LIKE $${params.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      params.push(Math.min(parseInt(limit) || 500, 2000));
      const limitIdx = params.length;
      params.push(parseInt(offset) || 0);
      const offsetIdx = params.length;

      const result = await db.pool.query(
        `
        SELECT
          u.id, u.email, u.role, u.is_active, u.created_at, u.last_login,
          (SELECT COUNT(*) FROM live_cards_full  WHERE user_id = u.id) AS card_count,
          (SELECT COUNT(*) FROM card_checks      WHERE user_id = u.id) AS check_count,
          (SELECT COUNT(*) FROM bin_checks       WHERE user_id = u.id) AS bin_check_count,
          (SELECT COUNT(*) FROM subscription_prechecks WHERE user_id = u.id) AS subscription_precheck_count
        FROM users u
        ${whereSql}
        ORDER BY u.id
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        params
      );

      // Toplam sayı (pagination için)
      const countWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const countParams = params.slice(0, params.length - 2);
      const totalRow = await db.pool.query(
        `SELECT COUNT(*) FROM users u ${countWhere}`,
        countParams
      );

      res.json({
        users: result.rows,
        total: parseInt(totalRow.rows[0].count),
        limit: params[limitIdx - 1],
        offset: params[offsetIdx - 1],
      });
    })
  );

  // ============================================================
  // POST /admin/users — yeni kullanıcı
  // ============================================================
  router.post(
    '/admin/users',
    asyncHandler(async (req, res) => {
      const { email, password, role = 'user' } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: 'Email ve password gerekli' });
      }
      if (String(password).length < 6) {
        return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
      }
      if (!['user', 'checker', 'admin', 'operator', 'finance', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı rolü' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'Geçersiz email formatı' });
      }

      const hash = await bcrypt.hash(password, 10);

      try {
        const result = await db.pool.query(
          `INSERT INTO users (email, password_hash, role)
           VALUES ($1, $2, $3)
           RETURNING id, email, role, created_at`,
          [normalizedEmail, hash, role]
        );
        res.json({ ok: true, user: result.rows[0] });
      } catch (e) {
        if (e.code === '23505') {
          return res.status(400).json({ error: 'Email zaten kayıtlı' });
        }
        throw e;
      }
    })
  );

  // ============================================================
  // PATCH /admin/users/:id — rol / aktiflik güncelle
  // ============================================================
  router.patch(
    '/admin/users/:id',
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      if (!isPositiveInt(id)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı ID' });
      }

      const { role, is_active, password } = req.body || {};
      const patches = [];
      const params = [];

      if (role !== undefined) {
        if (!['user', 'checker', 'admin', 'operator', 'finance', 'viewer'].includes(role)) {
          return res.status(400).json({ error: 'Geçersiz rol' });
        }
        // Kendi rolünü admin'den düşüremesin
        if (id === req.user.id && role !== 'admin') {
          return res.status(400).json({ error: 'Kendi admin rolünü kaldıramazsın' });
        }
        params.push(role);
        patches.push(`role = $${params.length}`);
      }

      if (is_active !== undefined) {
        if (id === req.user.id && is_active === false) {
          return res.status(400).json({ error: 'Kendini pasife alamazsın' });
        }
        params.push(!!is_active);
        patches.push(`is_active = $${params.length}`);
      }

      if (password) {
        if (String(password).length < 6) {
          return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
        }
        const hash = await bcrypt.hash(password, 10);
        params.push(hash);
        patches.push(`password_hash = $${params.length}`);
      }

      if (patches.length === 0) {
        return res.status(400).json({ error: 'Güncellenecek alan yok' });
      }

      params.push(id);
      const result = await db.pool.query(
        `UPDATE users SET ${patches.join(', ')}
         WHERE id = $${params.length}
         RETURNING id, email, role, is_active, created_at`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      res.json({ ok: true, user: result.rows[0] });
    })
  );

  // ============================================================
  // GET /admin/users/:id/bin-checks — BIN geçmişi
  // ============================================================
  router.get(
    '/admin/users/:id/bin-checks',
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      if (!isPositiveInt(id)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı ID' });
      }

      const result = await db.pool.query(
        `SELECT id, bin, brand, type, category, issuer, country, created_at
         FROM bin_checks
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 500`,
        [id]
      );
      res.json({ checks: result.rows });
    })
  );

  // ============================================================
  // GET /admin/users/:id/subscription-prechecks
  // ============================================================
  router.get(
    '/admin/users/:id/subscription-prechecks',
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      if (!isPositiveInt(id)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı ID' });
      }

      const result = await db.pool.query(
        `SELECT
           sp.id, sp.live_card_id, sp.outcome, sp.findings, sp.created_at,
           COALESCE(lcf.name, '') AS holder_name,
           RIGHT(regexp_replace(COALESCE(lcf.pan, ''), '[^0-9]', '', 'g'), 4) AS last4
         FROM subscription_prechecks sp
         JOIN live_cards_full lcf ON lcf.id = sp.live_card_id
         WHERE sp.user_id = $1
         ORDER BY sp.created_at DESC
         LIMIT 500`,
        [id]
      );
      res.json({ checks: result.rows });
    })
  );

  // ============================================================
  // DELETE /admin/users/:id
  // ============================================================
  router.delete(
    '/admin/users/:id',
    asyncHandler(async (req, res) => {
      const id = parseInt(req.params.id);
      if (!isPositiveInt(id)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı ID' });
      }
      if (id === req.user.id) {
        return res.status(400).json({ error: 'Kendini silemezsin' });
      }

      const result = await db.pool.query(
        'DELETE FROM users WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      res.json({ ok: true });
    })
  );

  // ============================================================
  // GET /admin/stats — panel istatistikleri
  // ============================================================
  router.get(
    '/admin/stats',
    asyncHandler(async (req, res) => {
      const [users, cards, checks, charges] = await Promise.all([
        db.pool.query('SELECT COUNT(*) FROM users'),
        db.pool.query('SELECT COUNT(*) FROM live_cards_full'),
        db.pool.query('SELECT COUNT(*) FROM card_checks'),
        db.pool
          .query(`SELECT COUNT(*) FROM charge_audit`)
          .catch(() => ({ rows: [{ count: 0 }] })),
      ]);

      const byUser = await db.pool.query(`
        SELECT
          u.id, u.email, u.role,
          (SELECT COUNT(*) FROM live_cards_full WHERE user_id = u.id) AS card_count,
          (SELECT COUNT(*) FROM card_checks      WHERE user_id = u.id) AS check_count
        FROM users u
        ORDER BY card_count DESC, u.id
        LIMIT 100
      `);

      // ⭐ YENİ: provider bazında işlem dağılımı (charge_audit varsa)
      let providerBreakdown = [];
      try {
        const r = await db.pool.query(`
          SELECT
            provider,
            COUNT(*)::int AS total,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)::int AS approved,
            SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END)::int AS declined,
            SUM(CASE WHEN status = 'error'    THEN 1 ELSE 0 END)::int AS errors,
            ROUND(
              100.0 * SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)
              / NULLIF(COUNT(*), 0), 1
            )::float AS approval_rate
          FROM charge_audit
          GROUP BY provider
          ORDER BY total DESC
        `);
        providerBreakdown = r.rows;
      } catch (_) {
        providerBreakdown = [];
      }

      res.json({
        totalUsers: parseInt(users.rows[0].count),
        totalCards: parseInt(cards.rows[0].count),
        totalChecks: parseInt(checks.rows[0].count),
        totalCharges: parseInt(charges.rows[0].count),
        byUser: byUser.rows,
        providerBreakdown,
      });
    })
  );

  // ============================================================
  // GET /admin/audit — son işlemler (opsiyonel filtre)
  // ============================================================
  router.get(
    '/admin/audit',
    asyncHandler(async (req, res) => {
      const { limit = 100, offset = 0, provider, status, userId } = req.query;

      const where = [];
      const params = [];

      if (provider) {
        params.push(provider);
        where.push(`provider = $${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`status = $${params.length}`);
      }
      if (userId && isPositiveInt(userId)) {
        params.push(parseInt(userId));
        where.push(`user_id = $${params.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      params.push(Math.min(parseInt(limit) || 100, 1000));
      const limitIdx = params.length;
      params.push(parseInt(offset) || 0);
      const offsetIdx = params.length;

      const result = await db.pool
        .query(
          `
          SELECT
            id, user_id, live_card_id, provider, action, mode,
            amount, currency, status, reason,
            pan_masked, bin, brand,
            provider_txn_id, provider_code,
            duration_ms, created_at
          FROM charge_audit
          ${whereSql}
          ORDER BY created_at DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}
          `,
          params
        )
        .catch(() => ({ rows: [] }));

      res.json({ transactions: result.rows });
    })
  );

  // Hata yakalayıcı — asyncHandler tarafından next(err) ile çağrılır
  router.use((err, req, res, _next) => {
    console.error('[ADMIN]', err.message);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Çakışma: kayıt zaten mevcut' });
    }
    res.status(500).json({ error: err.message });
  });


  // ============================================================
  // RBAC — roller, aksiyonlar ve kullanıcı rol atamaları
  // ============================================================
  router.get('/admin/rbac/roles', asyncHandler(async (req, res) => {
    const roles = await db.pool.query(`
      SELECT r.id, r.name, r.description,
             COALESCE(json_agg(
               json_build_object('key', p.permission_key, 'label', p.label)
               ORDER BY p.permission_key
             ) FILTER (WHERE p.id IS NOT NULL), '[]') AS permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      GROUP BY r.id
      ORDER BY r.id
    `);
    const permissions = await db.pool.query(`
      SELECT id, permission_key AS key, label FROM permissions ORDER BY permission_key
    `);
    res.json({ roles: roles.rows, permissions: permissions.rows });
  }));

  router.put('/admin/rbac/roles/:id', asyncHandler(async (req, res) => {
    const roleId = Number(req.params.id);
    const keys = Array.isArray(req.body?.permissions) ? req.body.permissions.map(String) : [];
    const role = await db.pool.query('SELECT id, name FROM roles WHERE id=$1', [roleId]);
    if (!role.rowCount) return res.status(404).json({ error: 'Rol bulunamadı' });

    await db.pool.query('BEGIN');
    try {
      await db.pool.query('DELETE FROM role_permissions WHERE role_id=$1', [roleId]);
      if (keys.length) {
        await db.pool.query(`
          INSERT INTO role_permissions(role_id, permission_id)
          SELECT $1, id FROM permissions WHERE permission_key = ANY($2::text[])
          ON CONFLICT DO NOTHING
        `, [roleId, keys]);
      }
      await db.pool.query('COMMIT');
      await db.auditEvent(req.user.id, 'rbac.role_permissions.update', 'role', roleId, { permissions: keys });
      res.json({ ok: true });
    } catch (e) {
      await db.pool.query('ROLLBACK');
      throw e;
    }
  }));

  router.put('/admin/users/:id/roles', asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const names = Array.isArray(req.body?.roles) ? req.body.roles.map(String) : [];
    if (!names.length) return res.status(400).json({ error: 'En az bir rol gerekli' });
    if (userId === req.user.id && !names.includes('admin')) {
      return res.status(400).json({ error: 'Kendi admin yetkinizi kaldıramazsınız' });
    }

    await db.pool.query('BEGIN');
    try {
      await db.pool.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
      await db.pool.query(`
        INSERT INTO user_roles(user_id, role_id)
        SELECT $1, id FROM roles WHERE name = ANY($2::text[])
        ON CONFLICT DO NOTHING
      `, [userId, names]);
      await db.pool.query('UPDATE users SET role=$1 WHERE id=$2', [names[0], userId]);
      await db.pool.query('COMMIT');
      await db.auditEvent(req.user.id, 'rbac.user_roles.update', 'user', userId, { roles: names });
      res.json({ ok: true, roles: names });
    } catch (e) {
      await db.pool.query('ROLLBACK');
      throw e;
    }
  }));

  return router;
};