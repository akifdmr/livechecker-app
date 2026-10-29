// ============================================================
// services/AdminService.js
// Tüm kullanıcıların verisini çekmek için admin-scoped sorgular.
// Her metot opsiyonel `userId` alır → verilirse o kullanıcıya daraltır.
// ============================================================
const db = require('../db');

function page({ limit = 100, offset = 0 } = {}) {
  return {
    limit:  Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500),
    offset: Math.max(parseInt(offset, 10) || 0, 0),
  };
}

class AdminService {
  constructor(pool = db.pool) {
    this.pool = pool;
  }

  // ============================================================
  // USERS
  // ============================================================
  async listUsers({ limit, offset, search = null, role = null } = {}) {
    const { limit: l, offset: o } = page({ limit, offset });
    const params = [];
    const where = [];

    if (search) {
      params.push(`%${String(search).trim()}%`);
      where.push(`(u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      where.push(`u.role = $${params.length}`);
    }

    params.push(l); const li = params.length;
    params.push(o); const oi = params.length;

    const res = await this.pool.query(
      `SELECT u.id, u.username, u.email, u.role, u.credits, u.is_active,
              u.created_at, u.updated_at,
              (SELECT COUNT(*)::int FROM live_cards_full      lcf WHERE lcf.user_id = u.id) AS live_cards_count,
              (SELECT COUNT(*)::int FROM card_enrollments     ce  WHERE ce.user_id  = u.id) AS enrollments_count,
              (SELECT COUNT(*)::int FROM merchant_transactions mt WHERE mt.user_id  = u.id) AS transactions_count
         FROM users u
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY u.created_at DESC NULLS LAST
         LIMIT $${li} OFFSET $${oi}`,
      params
    );
    return res.rows;
  }

  async countUsers({ search = null, role = null } = {}) {
    const params = [];
    const where = [];
    if (search) {
      params.push(`%${String(search).trim()}%`);
      where.push(`(username ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      where.push(`role = $${params.length}`);
    }
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS total FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
      params
    );
    return res.rows[0]?.total || 0;
  }

  async getUser(userId) {
    const res = await this.pool.query(
      `SELECT id, username, email, role, credits, is_active, created_at, updated_at
         FROM users WHERE id = $1`,
      [userId]
    );
    return res.rows[0] || null;
  }

  // ============================================================
  // LIVE CARDS — tüm kullanıcılar veya filtreli
  // ============================================================
  async listLiveCards({ userId = null, limit, offset } = {}) {
    const { limit: l, offset: o } = page({ limit, offset });
    const params = [];
    const where = [];
    if (userId) { params.push(userId); where.push(`lcf.user_id = $${params.length}`); }
    params.push(l); const li = params.length;
    params.push(o); const oi = params.length;

    const res = await this.pool.query(
      `SELECT lcf.*, u.username, u.email
         FROM live_cards_full lcf
         LEFT JOIN users u ON u.id = lcf.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY lcf.last_checked_at DESC NULLS LAST, lcf.id DESC
         LIMIT $${li} OFFSET $${oi}`,
      params
    );
    return res.rows;
  }

  async countLiveCards({ userId = null } = {}) {
    const params = [];
    let where = '';
    if (userId) { params.push(userId); where = `WHERE user_id = $1`; }
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS total FROM live_cards_full ${where}`,
      params
    );
    return res.rows[0]?.total || 0;
  }

  // ============================================================
  // ENROLLMENTS
  // ============================================================
  async listEnrollments({ userId = null, limit, offset } = {}) {
    const { limit: l, offset: o } = page({ limit, offset });
    const params = [];
    const where = [];
    if (userId) { params.push(userId); where.push(`ce.user_id = $${params.length}`); }
    params.push(l); const li = params.length;
    params.push(o); const oi = params.length;

    const res = await this.pool.query(
      `SELECT ce.*, u.username, u.email
         FROM card_enrollments ce
         LEFT JOIN users u ON u.id = ce.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY ce.created_at DESC NULLS LAST
         LIMIT $${li} OFFSET $${oi}`,
      params
    );
    return res.rows;
  }

  // ============================================================
  // MERCHANT TRANSACTIONS
  // ============================================================
  async listMerchantTransactions({ userId = null, limit, offset } = {}) {
    const { limit: l, offset: o } = page({ limit, offset });
    const params = [];
    const where = [];
    if (userId) { params.push(userId); where.push(`mt.user_id = $${params.length}`); }
    params.push(l); const li = params.length;
    params.push(o); const oi = params.length;

    const res = await this.pool.query(
      `SELECT mt.id, mt.user_id, mt.card_enrollment_id, mt.provider,
              mt.provider_transaction_id, mt.parent_transaction_id,
              mt.operation, mt.status, mt.amount, mt.currency,
              mt.order_id, mt.invoice_number, mt.error_code, mt.error_message,
              mt.created_at, mt.updated_at,
              ce.last4, ce.brand, ce.status AS enrollment_status,
              u.username, u.email
         FROM merchant_transactions mt
         LEFT JOIN card_enrollments ce ON ce.id = mt.card_enrollment_id
         LEFT JOIN users u ON u.id = mt.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY mt.created_at DESC NULLS LAST
         LIMIT $${li} OFFSET $${oi}`,
      params
    );
    return res.rows;
  }

  // ============================================================
  // BIN HISTORY / FAVORITES / SUBSCRIPTIONS
  // ============================================================
  async listBinHistory({ userId = null, limit, offset } = {}) {
    const { limit: l, offset: o } = page({ limit, offset });
    const params = [];
    const where = [];
    if (userId) { params.push(userId); where.push(`bh.user_id = $${params.length}`); }
    params.push(l); const li = params.length;
    params.push(o); const oi = params.length;

    const res = await this.pool.query(
      `SELECT bh.*, u.username, u.email
         FROM bin_history bh
         LEFT JOIN users u ON u.id = bh.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY bh.created_at DESC NULLS LAST
         LIMIT $${li} OFFSET $${oi}`,
      params
    );
    return res.rows;
  }

  async listFavorites({ userId = null, limit, offset } = {}) {
    const { limit: l, offset: o } = page({ limit, offset });
    const params = [];
    const where = [];
    if (userId) { params.push(userId); where.push(`bf.user_id = $${params.length}`); }
    params.push(l); const li = params.length;
    params.push(o); const oi = params.length;

    const res = await this.pool.query(
      `SELECT bf.*, u.username, u.email
         FROM bin_favorites bf
         LEFT JOIN users u ON u.id = bf.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY bf.created_at DESC NULLS LAST
         LIMIT $${li} OFFSET $${oi}`,
      params
    );
    return res.rows;
  }

  async listSubscriptionCards({ userId = null, limit, offset } = {}) {
    const { limit: l, offset: o } = page({ limit, offset });
    const params = [];
    const where = [];
    if (userId) { params.push(userId); where.push(`sc.user_id = $${params.length}`); }
    params.push(l); const li = params.length;
    params.push(o); const oi = params.length;

    const res = await this.pool.query(
      `SELECT sc.*, u.username, u.email
         FROM subscription_cards sc
         LEFT JOIN users u ON u.id = sc.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY sc.created_at DESC NULLS LAST
         LIMIT $${li} OFFSET $${oi}`,
      params
    );
    return res.rows;
  }

  async listSubscriptionPrechecks({ userId = null, limit, offset } = {}) {
    const { limit: l, offset: o } = page({ limit, offset });
    const params = [];
    const where = [];
    if (userId) { params.push(userId); where.push(`sp.user_id = $${params.length}`); }
    params.push(l); const li = params.length;
    params.push(o); const oi = params.length;

    const res = await this.pool.query(
      `SELECT sp.*, u.username, u.email
         FROM subscription_prechecks sp
         LEFT JOIN users u ON u.id = sp.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY sp.created_at DESC NULLS LAST
         LIMIT $${li} OFFSET $${oi}`,
      params
    );
    return res.rows;
  }

  // ============================================================
  // DASHBOARD özet
  // ============================================================
  async getDashboardStats() {
    const [users, liveCards, enrollments, txns] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE is_active)::int AS active
           FROM users`
      ),
      this.pool.query(`SELECT COUNT(*)::int AS total FROM live_cards_full`),
      this.pool.query(`SELECT COUNT(*)::int AS total FROM card_enrollments`),
      this.pool.query(
        `SELECT COUNT(*)::int AS total, COALESCE(SUM(amount),0) AS volume
           FROM merchant_transactions`
      ),
    ]);

    return {
      users:        { total: users.rows[0].total, active: users.rows[0].active },
      liveCards:    liveCards.rows[0].total,
      enrollments:  enrollments.rows[0].total,
      transactions: {
        total:  txns.rows[0].total,
        volume: Number(txns.rows[0].volume),
      },
    };
  }
}

module.exports = new AdminService();