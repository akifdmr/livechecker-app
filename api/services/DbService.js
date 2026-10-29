// services/DbService.js
// ============================================================
// DbService — Tüm DB işlemleri buradan geçer
// ============================================================
const db = require('../db');

class DbService {
  // ============================================================
  // Pool & Low-level
  // ============================================================
  get pool() {
    return db.pool;
  }

  async run(sql, params = []) {
    return db.pool.query(sql, params);
  }

  // ============================================================
  // Kart kontrolleri
  // ============================================================
  async saveCardCheck(userId, card, result) {
    return db.saveCardCheck(userId, card, result);
  }

  async saveLiveCard(userId, card, result) {
    return db.saveLiveCard(userId, card, result);
  }

  async saveLiveCardFull(userId, card, result, binData) {
    const query = `
      INSERT INTO live_cards_full (
        pan, exp, cvv, type, level, banka, country,
        name, address, city, state, zip, phone, email,
        user_id, checked_by_user_id, check_count, last_checked_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16, 1, NOW(), NOW()
      )
      ON CONFLICT (pan) DO UPDATE SET
        exp = EXCLUDED.exp,
        cvv = EXCLUDED.cvv,
        type = EXCLUDED.type,
        level = EXCLUDED.level,
        banka = EXCLUDED.banka,
        country = EXCLUDED.country,
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip = EXCLUDED.zip,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        user_id = EXCLUDED.user_id,
        checked_by_user_id = EXCLUDED.checked_by_user_id,
        check_count = COALESCE(live_cards_full.check_count, 0) + 1,
        last_checked_at = NOW(),
        updated_at = NOW()
      RETURNING id, check_count, last_checked_at
    `;
    const values = [
      card.pan,
      `${card.expMonth}/${card.expYear}`,
      card.cvv,
      binData?.type || '',
      binData?.category || '',
      binData?.issuer || '',
      card.country || binData?.country || '',
      card.name || '',
      card.address || '',
      card.city || '',
      card.state || '',
      card.zip || '',
      card.phone || '',
      card.email || '',
      userId,
      userId,
    ];
    const res = await db.pool.query(query, values);
    return res.rows[0];
  }

  // ============================================================
  // Live Cards
  // ============================================================
  async listLiveCards(userId, { limit = 50, offset = 0 } = {}) {
    try {
      const res = await this.pool.query(
        `SELECT *
         FROM live_cards_full
         WHERE user_id = $1
         ORDER BY last_checked_at DESC NULLS LAST, id DESC
         LIMIT $2 OFFSET $3`,
        [userId, parseInt(limit) || 50, parseInt(offset) || 0]
      );
      return res.rows;
    } catch (e) {
      console.warn('[DbService] listLiveCards hatası:', e.message);
      return [];
    }
  }

  async countLiveCards(userId) {
    try {
      const res = await this.pool.query(
        `SELECT COUNT(*)::int AS total FROM live_cards_full WHERE user_id = $1`,
        [userId]
      );
      return res.rows[0]?.total || 0;
    } catch (e) {
      console.warn('[DbService] countLiveCards hatası:', e.message);
      return 0;
    }
  }

  // ============================================================
  // Bin Favorites
  // ============================================================
  async listFavorites(userId) {
    try {
      const res = await this.pool.query(
        `SELECT * FROM bin_favorites
         WHERE user_id = $1
         ORDER BY created_at DESC NULLS LAST`,
        [userId]
      );
      return res.rows;
    } catch (e) {
      console.warn('[DbService] listFavorites hatası:', e.message);
      return [];
    }
  }

  async addFavorite(userId, bin, label = null) {
    try {
      const res = await this.pool.query(
        `INSERT INTO bin_favorites (user_id, bin, label, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, bin) DO NOTHING
         RETURNING *`,
        [userId, bin, label]
      );
      return res.rows[0] || null;
    } catch (e) {
      console.warn('[DbService] addFavorite hatası:', e.message);
      return null;
    }
  }

  async removeFavorite(userId, bin) {
    try {
      await this.pool.query(
        `DELETE FROM bin_favorites WHERE user_id = $1 AND bin = $2`,
        [userId, bin]
      );
      return true;
    } catch (e) {
      console.warn('[DbService] removeFavorite hatası:', e.message);
      return false;
    }
  }

  // ============================================================
  // POS Enrollments (card_enrollments tablosu)
  // ============================================================
  async listEnrollments(userId) {
    const res = await this.pool.query(
      `SELECT id, user_id, live_card_id, provider, brand, last4,
              exp_month, exp_year, enrollment_url, login_reference,
              status, notes, created_at, updated_at, external_payment_method_id
       FROM card_enrollments
       WHERE user_id = $1
       ORDER BY created_at DESC NULLS LAST`,
      [userId]
    );
    return res.rows;
  }

  async getEnrollmentById(id, userId) {
    const res = await this.pool.query(
      `SELECT * FROM card_enrollments WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return res.rows[0] || null;
  }

  async createEnrollment(input) {
    try {
      let data;
      if (typeof input === 'object' && input.userId !== undefined) {
        data = input;
      } else {
        const [userId, rest] = arguments;
        data = { userId, ...(rest || {}) };
      }

      const res = await this.pool.query(
        `INSERT INTO card_enrollments
          (user_id, live_card_id, provider, external_payment_method_id,
           brand, last4, exp_month, exp_year, enrollment_url,
           login_reference, status, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
         RETURNING *`,
        [
          data.userId,
          data.liveCardId || null,
          data.provider,
          data.externalPaymentMethodId,
          data.brand || null,
          data.last4 || null,
          data.expMonth || null,
          data.expYear || null,
          data.enrollmentUrl || null,
          data.loginReference || null,
          data.status || 'active',
          data.notes || null,
        ]
      );
      return res.rows[0];
    } catch (e) {
      console.warn('[DbService] createEnrollment hatası:', e.message);
      throw e;
    }
  }

  async updateEnrollment(id, patch) {
    try {
      const res = await this.pool.query(
        `UPDATE card_enrollments
         SET status = COALESCE($2, status),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, patch.status || null]
      );
      return res.rows[0] || null;
    } catch (e) {
      console.warn('[DbService] updateEnrollment hatası:', e.message);
      return null;
    }
  }

  // ============================================================
  // Merchant Transactions (POS işlem geçmişi)
  // ============================================================
  async createMerchantTransaction(input) {
    try {
      const res = await this.pool.query(
        `INSERT INTO merchant_transactions
          (user_id, card_enrollment_id, provider, provider_transaction_id,
           parent_transaction_id, operation, status, amount, currency,
           order_id, invoice_number, idempotency_key, error_code, error_message,
           raw_response, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
         RETURNING *`,
        [
          input.userId,
          input.enrollmentId || input.cardEnrollmentId || null,
          input.provider,
          input.providerTransactionId || input.providerTxnId || null,
          input.parentTransactionId || input.parentTxnId || null,
          input.operation,
          input.status || 'pending',
          input.amount || 0,
          input.currency || 'USD',
          input.orderId || null,
          input.invoiceNumber || null,
          input.idempotencyKey || null,
          input.errorCode || null,
          input.errorMessage || null,
          input.rawResponse ? JSON.stringify(input.rawResponse) : null,
        ]
      );
      return res.rows[0];
    } catch (e) {
      console.warn('[DbService] createMerchantTransaction hatası:', e.message);
      return null;
    }
  }

  async getMerchantTransactions(userId, limit = 100) {
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const res = await this.pool.query(
      `SELECT mt.id, mt.user_id, mt.card_enrollment_id, mt.provider,
              mt.provider_transaction_id, mt.parent_transaction_id,
              mt.operation, mt.status, mt.amount, mt.currency, mt.order_id,
              mt.invoice_number, mt.error_code, mt.error_message,
              mt.created_at, mt.updated_at, ce.last4, ce.brand,
              ce.status AS enrollment_status
       FROM merchant_transactions mt
       LEFT JOIN card_enrollments ce ON ce.id = mt.card_enrollment_id
       WHERE mt.user_id = $1
       ORDER BY mt.created_at DESC NULLS LAST
       LIMIT $2`,
      [userId, parsedLimit]
    );
    return res.rows;
  }

  // ============================================================
  // Subscription Cards & Prechecks
  // ============================================================
  async listSubscriptionCards(userId) {
    try {
      const res = await this.pool.query(
        `SELECT * FROM subscription_cards
         WHERE user_id = $1
         ORDER BY created_at DESC NULLS LAST`,
        [userId]
      );
      return res.rows;
    } catch (e) {
      console.warn('[DbService] listSubscriptionCards hatası:', e.message);
      return [];
    }
  }

  async listSubscriptionPrechecks(userId) {
    try {
      const res = await this.pool.query(
        `SELECT * FROM subscription_prechecks
         WHERE user_id = $1
         ORDER BY created_at DESC NULLS LAST`,
        [userId]
      );
      return res.rows;
    } catch (e) {
      console.warn('[DbService] listSubscriptionPrechecks hatası:', e.message);
      return [];
    }
  }

  // ============================================================
  // Bin History
  // ============================================================
  async listBinHistory(userId, { limit = 100, offset = 0 } = {}) {
    try {
      const res = await this.pool.query(
        `SELECT * FROM bin_history
         WHERE user_id = $1
         ORDER BY created_at DESC NULLS LAST
         LIMIT $2 OFFSET $3`,
        [userId, parseInt(limit) || 100, parseInt(offset) || 0]
      );
      return res.rows;
    } catch (e) {
      console.warn('[DbService] listBinHistory hatası:', e.message);
      return [];
    }
  }

  // ============================================================
  // Provider Transactions
  // ============================================================
  async logProviderTransaction(txn) {
    const sql = `
      INSERT INTO provider_transactions
        (user_id, card_id, card_check_id,
         provider, action, mode,
         provider_txn_id, provider_ref_id, order_id,
         amount, currency, captured_amount, refunded_amount,
         status, reason, provider_code, message,
         pan_masked, pan_hash, bin, brand,
         duration_ms,
         is_voided, is_captured, is_refunded,
         parent_txn_id,
         raw_request, raw_response)
      VALUES
        ($1,$2,$3,
         $4,$5,$6,
         $7,$8,$9,
         $10,$11,$12,$13,
         $14,$15,$16,$17,
         $18, encode(digest($19,'sha256'),'hex'), $20,$21,
         $22,
         $23,$24,$25,
         $26,
         $27,$28)
      RETURNING *;
    `;

    const values = [
      txn.userId || null,
      txn.cardId || null,
      txn.cardCheckId || null,
      txn.provider,
      txn.action,
      txn.mode || 'live',
      txn.providerTxnId || null,
      txn.providerRefId || null,
      txn.orderId || null,
      txn.amount || 0,
      txn.currency || 'USD',
      txn.capturedAmount || 0,
      txn.refundedAmount || 0,
      txn.status,
      txn.reason || null,
      txn.providerCode || null,
      txn.message || null,
      txn.panMasked || null,
      txn.pan || '',
      txn.bin || null,
      txn.brand || null,
      txn.durationMs || null,
      txn.isVoided || false,
      txn.isCaptured || false,
      txn.isRefunded || false,
      txn.parentTxnId || null,
      txn.rawRequest ? JSON.stringify(txn.rawRequest) : null,
      txn.rawResponse ? JSON.stringify(txn.rawResponse) : null,
    ];

    const res = await this.pool.query(sql, values);
    return res.rows[0];
  }

  async getProviderSummary({
    userId = null,
    dateFrom = null,
    dateTo = null,
    provider = null,
  } = {}) {
    const where = [];
    const params = [];

    if (userId) {
      params.push(userId);
      where.push(`user_id = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`created_at >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`created_at <= $${params.length}`);
    }
    if (provider) {
      params.push(provider);
      where.push(`provider = $${params.length}`);
    }

    const sql = `
      SELECT
        provider, action, status,
        COUNT(*)               AS count,
        SUM(amount)            AS total_amount,
        SUM(captured_amount)   AS total_captured,
        SUM(refunded_amount)   AS total_refunded,
        AVG(duration_ms)::int  AS avg_duration_ms
      FROM provider_transactions
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      GROUP BY provider, action, status
      ORDER BY provider, action, status;
    `;

    const res = await this.pool.query(sql, params);
    return res.rows;
  }

  async listProviderTransactions({
    userId = null,
    provider = null,
    action = null,
    status = null,
    cardId = null,
    pan = null,
    dateFrom = null,
    dateTo = null,
    onlyVoidable = false,
    onlyCapturable = false,
    onlyRefundable = false,
    limit = 100,
    offset = 0,
  } = {}) {
    const where = [];
    const params = [];

    if (userId) {
      params.push(userId);
      where.push(`user_id = $${params.length}`);
    }
    if (provider) {
      params.push(provider);
      where.push(`provider = $${params.length}`);
    }
    if (action) {
      params.push(action);
      where.push(`action = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (cardId) {
      params.push(cardId);
      where.push(`card_id = $${params.length}`);
    }
    if (pan) {
      params.push(pan.replace(/\D/g, ''));
      where.push(`pan_hash = encode(digest($${params.length},'sha256'),'hex')`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`created_at >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`created_at <= $${params.length}`);
    }

    if (onlyVoidable) {
      where.push(`action = 'preauth'`);
      where.push(`status = 'approved'`);
      where.push(`is_voided = FALSE`);
    }
    if (onlyCapturable) {
      where.push(`action = 'preauth'`);
      where.push(`status = 'approved'`);
      where.push(`is_captured = FALSE`);
      where.push(`is_voided = FALSE`);
    }
    if (onlyRefundable) {
      where.push(`action IN ('sale','capture')`);
      where.push(`status IN ('approved','captured')`);
      where.push(`is_refunded = FALSE`);
    }

    params.push(parseInt(limit));
    const limitIdx = params.length;
    params.push(parseInt(offset));
    const offsetIdx = params.length;

    const sql = `
      SELECT *, COUNT(*) OVER() AS total_count
      FROM provider_transactions
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC, id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;

    const res = await this.pool.query(sql, params);
    return res.rows;
  }

  async getProviderTransactionById(id) {
    const res = await this.pool.query(
      'SELECT * FROM provider_transactions WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  }

  async updateProviderTransaction(id, patch) {
    const fields = [];
    const params = [id];

    const map = {
      status: 'status',
      reason: 'reason',
      capturedAmount: 'captured_amount',
      refundedAmount: 'refunded_amount',
      isVoided: 'is_voided',
      isCaptured: 'is_captured',
      isRefunded: 'is_refunded',
      providerTxnId: 'provider_txn_id',
      providerRefId: 'provider_ref_id',
    };

    for (const [key, col] of Object.entries(map)) {
      if (patch[key] !== undefined) {
        params.push(patch[key]);
        fields.push(`${col} = $${params.length}`);
      }
    }

    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);

    const sql = `
      UPDATE provider_transactions
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *;
    `;

    const res = await this.pool.query(sql, params);
    return res.rows[0];
  }

  // ============================================================
  // Users & Auth
  // ============================================================
  async getUserById(userId) {
    try {
      const res = await this.pool.query(
        `SELECT * FROM users WHERE id = $1`,
        [userId]
      );
      return res.rows[0] || null;
    } catch (e) {
      console.warn('[DbService] getUserById hatası:', e.message);
      return null;
    }
  }

  async getUserByEmail(email) {
    try {
      const res = await this.pool.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
      );
      return res.rows[0] || null;
    } catch (e) {
      console.warn('[DbService] getUserByEmail hatası:', e.message);
      return null;
    }
  }

  // ============================================================
  // ⭐ YENİ: Admin role check — requireAdmin middleware kullanır
  // ============================================================
  async isUserAdmin(userId) {
    if (!userId) return false;
    try {
      const res = await this.pool.query(
        `SELECT role FROM users WHERE id = $1 AND is_active = true`,
        [userId]
      );
      return res.rows[0]?.role === 'admin';
    } catch (e) {
      console.warn('[DbService] isUserAdmin hatası:', e.message);
      return false;
    }
  }

  async createUser({ username, email = null, passwordHash, role = 'user' }) {
    try {
      const normalizedUsername = String(username || email?.split('@')[0] || '').trim().toLowerCase();
      const res = await this.pool.query(
        `INSERT INTO users (username, email, password_hash, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, username, email, role`,
        [normalizedUsername, email, passwordHash, role]
      );
      return res.rows[0];
    } catch (e) {
      console.warn('[DbService] createUser hatası:', e.message);
      return null;
    }
  }

  // ============================================================
  // User Permissions
  // ============================================================
  async getUserPermissions(userId) {
    try {
      return await db.getUserPermissions(userId);
    } catch (e) {
      console.warn('[DbService] getUserPermissions hatası:', e.message);
      return [];
    }
  }

  // ============================================================
  // Audit Events
  // ============================================================
  async auditEvent(
    userId,
    action,
    resourceType = null,
    resourceId = null,
    metadata = {}
  ) {
    try {
      const res = await this.pool.query(
        `INSERT INTO audit_events
          (user_id, action, resource_type, resource_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [
          userId,
          action,
          resourceType,
          resourceId,
          JSON.stringify(metadata || {}),
        ]
      );
      return res.rows[0];
    } catch (e) {
      console.warn('[DbService] auditEvent hatası:', e.message);
      return null;
    }
  }
}

module.exports = new DbService();