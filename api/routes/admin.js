// ============================================================
// routes/admin.js — Admin kullanıcı yönetimi + istatistikler
// ============================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { authMiddleware } = require('../auth');
const db = require('../db');
const { CreditsSettingsService } = require('../services/CreditsSettingsService');
const financeService = new CreditsSettingsService(db.pool);

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

module.exports = (deps = {}) => {
  // Tüm /admin route'ları için auth + admin zorunlu
  router.use('/admin', authMiddleware, requireAdmin);

  router.get('/admin/settings', asyncHandler(async (_req, res) => {
    res.json({ settings: await financeService.listSettings() });
  }));

  router.put('/admin/settings', asyncHandler(async (req, res) => {
    const settings = req.body?.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return res.status(400).json({ error: 'settings nesnesi gerekli' });
    }
    const updated = {};
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'default_provider') {
        const provider = deps.providers?.[String(value)];
        const capabilities = provider && (typeof provider.capabilities === 'function' ? provider.capabilities() : provider.capabilities || {});
        if (!provider || capabilities.tokenizedPayment !== true) {
          return res.status(400).json({ error: 'Varsayılan provider etkin ve token tabanlı olmalı' });
        }
      }
      const entry = await financeService.setSetting({ key, value, adminUserId: req.user.id });
      updated[entry.key] = entry.value;
    }
    res.json({ settings: updated });
  }));

  router.post('/admin/credits', asyncHandler(async (req, res) => {
    const userId = Number(req.body?.userId);
    if (!isPositiveInt(userId)) return res.status(400).json({ error: 'Geçerli userId gerekli' });
    const target = await db.pool.query('SELECT role FROM users WHERE id=$1 AND is_active=TRUE', [userId]);
    if (!target.rowCount) return res.status(404).json({ error: 'Aktif kullanıcı bulunamadı' });
    if (target.rows[0].role === 'admin') return res.status(400).json({ error: 'Admin hesabına bu ekrandan kredi yüklenemez' });
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ error: 'amount 0 ile 1,000,000 arasında olmalı' });
    }
    const result = await financeService.grant({
      userId,
      amount,
      createdBy: req.user.id,
      idempotencyKey: req.body?.idempotencyKey || req.get('Idempotency-Key') || null,
    });
    res.json(result);
  }));

  router.get('/admin/credit-requests', asyncHandler(async (_req, res) => {
    const result = await db.pool.query(
      `SELECT cr.id, cr.user_id, u.username, cr.requested_amount, cr.message,
              cr.status, cr.created_at
       FROM credit_requests cr JOIN users u ON u.id=cr.user_id
       WHERE cr.status='pending' ORDER BY cr.created_at ASC LIMIT 500`
    );
    res.json({ requests: result.rows });
  }));

  router.post('/admin/credit-requests/:id/resolve', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!isPositiveInt(id)) return res.status(400).json({ error: 'Talep ID geçersiz' });
    const decision = String(req.body?.decision || '');
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Karar approve veya reject olmalı' });
    const found = await db.pool.query(
      `SELECT id, user_id, requested_amount, status FROM credit_requests WHERE id=$1`, [id]
    );
    if (!found.rowCount) return res.status(404).json({ error: 'Kredi talebi bulunamadı' });
    const request = found.rows[0];
    if (request.status !== 'pending') return res.status(409).json({ error: 'Talep daha önce sonuçlandırılmış' });
    const note = String(req.body?.adminNote || '').trim().slice(0, 500) || null;
    let approvedAmount = null;
    if (decision === 'approve') {
      approvedAmount = Number(req.body?.amount ?? request.requested_amount);
      if (!Number.isFinite(approvedAmount) || approvedAmount <= 0 || approvedAmount > 1000000) {
        return res.status(400).json({ error: 'Onay tutarı 0 ile 1,000,000 arasında olmalı' });
      }
      await financeService.grant({
        userId: request.user_id,
        amount: approvedAmount,
        entryType: 'admin_grant',
        referenceType: 'credit_request',
        referenceId: String(id),
        idempotencyKey: `credit-request-${id}`,
        createdBy: req.user.id,
      });
    }
    const updated = await db.pool.query(
      `UPDATE credit_requests SET status=$2, approved_amount=$3, admin_note=$4,
         resolved_by=$5, resolved_at=NOW()
       WHERE id=$1 AND status='pending'
       RETURNING id, user_id, requested_amount, status, approved_amount, admin_note, resolved_at`,
      [id, decision === 'approve' ? 'approved' : 'rejected', approvedAmount, note, req.user.id]
    );
    if (!updated.rowCount) return res.status(409).json({ error: 'Talep başka bir işlemde sonuçlandırıldı' });
    res.json({ request: updated.rows[0] });
  }));

  router.get('/admin/credits/ledger', asyncHandler(async (req, res) => {
    const userId = req.query.userId == null ? null : Number(req.query.userId);
    if (userId != null && !isPositiveInt(userId)) return res.status(400).json({ error: 'userId geçersiz' });
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const params = [];
    const where = userId == null ? '' : `WHERE cl.user_id=$${params.push(userId)}`;
    params.push(limit);
    const result = await db.pool.query(
      `SELECT cl.id, cl.user_id, u.username, u.email, cl.amount, cl.balance_after,
              cl.entry_type, cl.reference_type, cl.reference_id, cl.note, cl.created_at
       FROM credit_ledger cl JOIN users u ON u.id=cl.user_id
       ${where} ORDER BY cl.created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ entries: result.rows });
  }));

  router.get('/admin/providers', asyncHandler(async (req, res) => {
    const providers = deps.providers || {};
    const configured = Object.entries(providers).map(([key, provider]) => ({
      key,
      name: provider.name,
      type: provider.type,
      enabled: true,
      capabilities: typeof provider.capabilities === 'function' ? provider.capabilities() : provider.capabilities || {},
    }));
    res.json({ providers: configured, defaultProvider: await financeService.getDefaultProvider() });
  }));

  router.put('/admin/providers/:id', asyncHandler(async (req, res) => {
    const key = String(req.params.id || '').toLowerCase();
    const provider = deps.providers?.[key];
    if (!provider) return res.status(404).json({ error: 'Provider bulunamadı' });
    const capabilities = typeof provider.capabilities === 'function' ? provider.capabilities() : provider.capabilities || {};
    if (capabilities.tokenizedPayment !== true) {
      return res.status(400).json({ error: 'Varsayılan POS provider token tabanlı ödeme desteklemeli' });
    }
    if (req.body?.isDefault !== true) return res.status(400).json({ error: 'Yalnızca token tabanlı varsayılan provider seçilebilir' });
    await financeService.setSetting({ key: 'default_provider', value: key, adminUserId: req.user.id });
    res.json({ key, isDefault: true });
  }));

  router.get('/admin/provisions', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const result = await db.pool.query(
      `SELECT p.id, p.user_id, u.username, u.email, p.card_enrollment_id, p.provider,
              p.network_ref, p.amount, p.currency, p.status, p.failure_code,
              p.created_at, p.updated_at
       FROM provisions p JOIN users u ON u.id=p.user_id
       ORDER BY p.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ provisions: result.rows });
  }));

  router.get('/admin/cards', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const result = await db.pool.query(
      `SELECT ce.id, ce.user_id, u.username, u.email, ce.provider, ce.brand, ce.last4,
              ce.exp_month, ce.exp_year, ce.status, ce.created_at, ce.updated_at
       FROM card_enrollments ce JOIN users u ON u.id=ce.user_id
       ORDER BY ce.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ cards: result.rows });
  }));

  router.get('/admin/charges', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const result = await db.pool.query(
      `SELECT mt.id, mt.user_id, u.username, u.email, mt.card_enrollment_id, mt.provider,
              mt.provider_transaction_id, mt.parent_transaction_id, mt.operation,
              mt.status, mt.amount, mt.currency, mt.order_id, mt.invoice_number,
              mt.error_code, mt.error_message, mt.created_at, mt.updated_at
       FROM merchant_transactions mt LEFT JOIN users u ON u.id=mt.user_id
       ORDER BY mt.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ charges: result.rows });
  }));

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
        where.push(`LOWER(COALESCE(u.username, '') || ' ' || COALESCE(u.email, '')) LIKE $${params.length}`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      params.push(Math.min(parseInt(limit) || 500, 2000));
      const limitIdx = params.length;
      params.push(parseInt(offset) || 0);
      const offsetIdx = params.length;

      const result = await db.pool.query(
        `
        SELECT
          u.id, u.username, u.email, u.role, u.credits, u.is_active, u.created_at, u.last_login,
          u.display_name, u.last_seen_at,
          (u.last_seen_at >= NOW() - INTERVAL '5 minutes') AS is_online,
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

  // GET /admin/users/:id/details — safe, user-scoped admin overview.
  // Secrets and raw card/bank identifiers are deliberately excluded.
  router.get('/admin/users/:id/details', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!isPositiveInt(id)) return res.status(400).json({ error: 'Geçersiz kullanıcı ID' });
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);

    const [account, ledger, enrollments, transactions, provisions, processorAccounts, auditEvents, paymentAudit] = await Promise.all([
      db.pool.query(
        `SELECT id, username, email, display_name, role, credits, is_active, created_at, last_login,
                last_seen_at, (last_seen_at >= NOW() - INTERVAL '5 minutes') AS is_online
         FROM users WHERE id=$1`, [id]
      ),
      db.pool.query(
        `SELECT id, amount, balance_after, entry_type, reference_type, reference_id, created_at
         FROM credit_ledger WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2`, [id, limit]
      ),
      db.pool.query(
        `SELECT id, provider, brand, last4, status, created_at, updated_at
         FROM card_enrollments WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [id, limit]
      ),
      db.pool.query(
        `SELECT id, provider, provider_transaction_id, operation, status, amount, currency,
                order_id, invoice_number, error_code, created_at, updated_at
         FROM merchant_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [id, limit]
      ),
      db.pool.query(
        `SELECT id, provider, amount, captured_total, currency, status, failure_code, created_at, updated_at
         FROM provisions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [id, limit]
      ),
      db.pool.query(
        `SELECT id, processor_name, account_name, domain, is_active,
                (credentials_encrypted IS NOT NULL) AS has_credentials, created_at, updated_at
         FROM processor_accounts WHERE user_id=$1 ORDER BY updated_at DESC LIMIT $2`, [id, limit]
      ),
      db.pool.query(
        `SELECT id, action, resource_type, resource_id, created_at
         FROM audit_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [id, limit]
      ),
      db.pool.query(
        `SELECT id, provider, action, operation, amount, currency, refunded_amount, status,
                pan_masked, bin, brand, provider_txn_id, duration_ms, created_at
         FROM charge_audit WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [id, limit]
      ),
    ]);

    if (!account.rowCount) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({
      user: account.rows[0],
      creditLedger: ledger.rows,
      enrollments: enrollments.rows,
      transactions: transactions.rows,
      provisions: provisions.rows,
      processorAccounts: processorAccounts.rows,
      auditEvents: auditEvents.rows,
      paymentAudit: paymentAudit.rows,
      limit,
    });
  }));

  // ============================================================
  // POST /admin/users — yeni kullanıcı
  // ============================================================
  router.post(
    '/admin/users',
    asyncHandler(async (req, res) => {
      const { username, email: rawEmail, password, role = 'user' } = req.body || {};
      const normalizedUsername = String(username || '').trim().toLowerCase();
      const email = String(rawEmail || '').trim().toLowerCase() || null;

      if (!normalizedUsername || !password) {
        return res.status(400).json({ error: 'Username ve password gerekli' });
      }
      if (!/^[a-z0-9_.-]{3,32}$/.test(normalizedUsername)) return res.status(400).json({ error: 'Username 3-32 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir' });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Geçersiz email formatı' });
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
      }
      if (!['user', 'checker', 'admin', 'operator', 'finance', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı rolü' });
      }

      const hash = await bcrypt.hash(password, 10);

      try {
        const result = await db.pool.query(
          `INSERT INTO users (username, email, password_hash, role)
           VALUES ($1, $2, $3, $4)
           RETURNING id, username, email, role, created_at`,
          [normalizedUsername, email, hash, role]
        );
        res.json({ ok: true, user: result.rows[0] });
      } catch (e) {
        if (e.code === '23505') {
          return res.status(409).json({ error: e.constraint === 'idx_users_username_ci' ? 'Bu username kullanımda' : 'Email zaten kayıtlı' });
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
      const username = req.body?.username === undefined ? undefined : String(req.body.username).trim().toLowerCase();
      const patches = [];
      const params = [];

      if (username !== undefined) {
        if (!/^[a-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username 3-32 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir' });
        const duplicate = await db.pool.query('SELECT 1 FROM users WHERE lower(username)=lower($1) AND id<>$2 LIMIT 1', [username, id]);
        if (duplicate.rowCount) return res.status(409).json({ error: 'Bu username kullanımda' });
        params.push(username);
        patches.push(`username = $${params.length}`);
      }

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
        if (String(password).length < 8) {
          return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
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
         RETURNING id, username, email, role, is_active, created_at`,
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
          u.id, u.username, u.role,
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
      return res.status(409).json({ error: err.constraint === 'idx_users_username_ci' ? 'Bu username kullanımda' : 'Çakışma: kayıt zaten mevcut' });
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
