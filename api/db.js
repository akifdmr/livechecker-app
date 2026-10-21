// ============================================================
// DB.JS — Aiven PostgreSQL Wrapper
// ============================================================
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

// Prefer API-local settings over the repository-root fallback. dotenv does
// not replace existing values unless override is enabled.
dotenv.config({
  path: path.resolve(__dirname, '.env'),
});

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
});

// ============================================================
// BAĞLANTI — DATABASE_URL varsa onu, yoksa PG* env'lerini kullan
// ============================================================
function buildPoolConfig() {
  // 1) DATABASE_URL öncelikli (varsa)
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    const needsSsl =
      url.includes('sslmode=require') ||
      url.includes('aivencloud.com') ||
      process.env.PGSSLMODE === 'require';

    // pg-connection-string maps sslmode=require to certificate verification,
    // which rejects Aiven's chain in this app's configured TLS mode. Let the
    // explicit SSL object below control verification for these hosted URLs.
    let connectionString = url;
    if (needsSsl) {
      const parsedUrl = new URL(url);
      parsedUrl.searchParams.delete('sslmode');
      connectionString = parsedUrl.toString();
    }

    return {
      connectionString,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  // 2) PG* env değişkenleri (Aiven veya lokal)
  const host = process.env.PGHOST || process.env.PGHOST_LOCAL || 'localhost';
  const isAiven = host.includes('aivencloud.com');

  return {
    host,
    port: parseInt(process.env.PGPORT || process.env.PGPORT_LOCAL || '5432', 10),
    user: process.env.PGUSER || process.env.PGUSER_LOCAL || 'posapp',
    password: process.env.PGPASSWORD || process.env.PGPASSWORD_LOCAL || '',
    database: process.env.PGDATABASE || process.env.PGDATABASE_LOCAL || 'posdb',
    // ⭐ Aiven SSL zorunlu kılar; lokal için kapalı
    ssl: isAiven ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

const pool = new Pool(buildPoolConfig());

pool.on('connect', () => {
  const config = buildPoolConfig();
  let host = config.host;
  if (!host && config.connectionString) {
    try { host = new URL(config.connectionString).hostname; } catch {}
  }
  console.log(`[DB] PostgreSQL bağlantısı kuruldu${host ? ` → ${host}` : ''}`);
});

pool.on('error', (err) => {
  const hints = {
    ENOTFOUND: 'DB host adı çözülemedi; DATABASE_URL/PGHOST ve DNS erişimini kontrol edin.',
    ECONNREFUSED: 'DB sunucusu bağlantıyı reddetti; sunucunun çalıştığını ve portun açık olduğunu kontrol edin.',
    ETIMEDOUT: 'DB bağlantısı zaman aşımına uğradı; ağ erişimi, firewall ve allowlist ayarlarını kontrol edin.',
    '28P01': 'DB kimlik doğrulaması başarısız; kullanıcı/parola değerlerini kontrol edin.',
    '3D000': 'Belirtilen PostgreSQL veritabanı mevcut değil; veritabanı adını kontrol edin.',
  };
  console.error('[DB] Bağlantı hatası:', err.code || 'UNKNOWN', err.message);
  if (hints[err.code]) console.error('[DB] Öneri:', hints[err.code]);
  if (/role .* does not exist/i.test(err.message)) {
    console.error('[DB] PostgreSQL kullanıcı bulunamadı. Lokal kurulum için: docker compose up -d postgres ve DATABASE_URL=postgresql://posapp:posapp_dev_change_me@localhost:5432/posdb');
  }
});

// ============================================================
// HASH / MASK HELPERS
// ============================================================
function hashPan(pan) {
  return crypto.createHash('sha256').update(String(pan)).digest('hex');
}

function hashCvv(cvv) {
  const salt = process.env.CVV_SALT || 'default_salt';
  return crypto.createHash('sha256').update(String(cvv) + salt).digest('hex');
}

function maskPan(pan) {
  if (!pan || pan.length < 10) return pan;
  return pan.substring(0, 6) + '****' + pan.substring(pan.length - 4);
}

// ============================================================
// DB API
// ============================================================
const db = {
  pool,
  hashPan,
  hashCvv,
  maskPan,

  // ----------------------------------------------------------
  // CARD CHECK
  // ----------------------------------------------------------
  async saveCardCheck(userId, card, result) {
    const query = `
      INSERT INTO card_checks (
        user_id, pan_hash, pan_masked, exp_month, exp_year, cvv_hash,
        brand, status, reason, provider, bin_data, checks, transaction,
        duration_ms, raw_response
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `;

    const values = [
      userId,
      hashPan(card.pan),
      maskPan(card.pan),
      card.expMonth,
      card.expYear,
      hashCvv(card.cvv),
      card.brand || '',
      result.status || 'UNKNOWN',
      result.reason || '',
      result.providerKey || result.provider || 'unknown',
      JSON.stringify(result.bin || {}),
      JSON.stringify(result.checks || {}),
      JSON.stringify(result.transaction || {}),
      result.duration || 0,
      JSON.stringify(result.raw || {}),
    ];

    const res = await pool.query(query, values);
    return res.rows[0].id;
  },

  // ----------------------------------------------------------
  // LIVE CARD FULL
  // ----------------------------------------------------------
  async saveLiveCardFull(userId, card, result, binData) {
    const query = `
      INSERT INTO live_cards_full (
        pan, exp, cvv, type, level, banka, country,
        name, address, city, state, zip, phone, email,
        user_id, check_count, last_checked_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, 1, NOW(), NOW()
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
    ];

    const res = await pool.query(query, values);
    return res.rows[0];
  },

  async saveLiveCard(userId, card, result) {
    const binData = result.bin || {};
    return this.saveLiveCardFull(userId, card, result, binData);
  },

  // ----------------------------------------------------------
  // LIVE CARDS LIST
  // ----------------------------------------------------------
  async getLiveCards(userId, filters = {}) {
    const { bin, banka, country, level, limit = 100, offset = 0 } = filters;

    let query = `
      SELECT 
        id, pan, exp, cvv, type, level, banka, country,
        name, address, city, state, zip, phone, email,
        user_id,
        COALESCE(check_count, 0) AS check_count,
        last_checked_at,
        updated_at,
        balance_status
      FROM live_cards_full
      WHERE user_id = $1
    `;
    const params = [userId];

    if (bin) {
      params.push(`${bin}%`);
      query += ` AND pan LIKE $${params.length}`;
    }
    if (banka) {
      params.push(`%${banka}%`);
      query += ` AND banka ILIKE $${params.length}`;
    }
    if (country) {
      params.push(country);
      query += ` AND country = $${params.length}`;
    }
    if (level) {
      params.push(level);
      query += ` AND level = $${params.length}`;
    }

    params.push(parseInt(limit));
    query += ` ORDER BY id DESC LIMIT $${params.length}`;

    params.push(parseInt(offset));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    return result.rows;
  },

  // ----------------------------------------------------------
  // LIVE CARDS COUNT
  // ----------------------------------------------------------
  async countLiveCards(userId, filters = {}) {
    const { bin, banka, country, level } = filters;

    let query = 'SELECT COUNT(*) FROM live_cards_full WHERE user_id = $1';
    const params = [userId];

    if (bin) {
      params.push(`${bin}%`);
      query += ` AND pan LIKE $${params.length}`;
    }
    if (banka) {
      params.push(`%${banka}%`);
      query += ` AND banka ILIKE $${params.length}`;
    }
    if (country) {
      params.push(country);
      query += ` AND country = $${params.length}`;
    }
    if (level) {
      params.push(level);
      query += ` AND level = $${params.length}`;
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count);
  },

  // ----------------------------------------------------------
  // UPDATE CHECK STATS
  // ----------------------------------------------------------
  async updateCheckStats(userId, pan) {
    const query = `
      UPDATE live_cards_full
      SET 
        check_count = COALESCE(check_count, 0) + 1,
        last_checked_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1 AND pan = $2
      RETURNING id, check_count, last_checked_at
    `;
    const res = await pool.query(query, [userId, pan]);
    return res.rows[0] || null;
  },

  // ----------------------------------------------------------
  // PROVIDER TRANSACTION LOG (charge_audit)
  // ----------------------------------------------------------
  async logProviderTransaction(payload) {
    const query = `
      INSERT INTO charge_audit (
        user_id, live_card_id, provider, action, mode,
        amount, currency, pan, pan_masked, bin, brand,
        provider_txn_id, provider_code,
        status, reason, message,
        raw_response, duration_ms,
        operation
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13,
        $14, $15, $16,
        $17, $18,
        $19
      )
      RETURNING id
    `;

    const values = [
      payload.userId,
      payload.cardId || payload.liveCardId || null,
      payload.provider,
      payload.action,
      payload.mode || 'live',
      payload.amount || 0,
      payload.currency || 'USD',
      payload.pan || null,
      payload.panMasked || null,
      payload.bin || null,
      payload.brand || null,
      payload.providerTxnId || null,
      payload.providerCode || null,
      payload.status || 'unknown',
      payload.reason || null,
      payload.message || null,
      JSON.stringify(payload.rawResponse || {}),
      payload.durationMs || 0,
      payload.operation || payload.action || null,
    ];

    const res = await pool.query(query, values);
    return res.rows[0];
  },

  // ----------------------------------------------------------
  // USER HELPERS
  // ----------------------------------------------------------
  async findUserByEmail(email) {
    const res = await pool.query(
      'SELECT id, email, role, password_hash, is_active FROM users WHERE email = $1',
      [email]
    );
    return res.rows[0] || null;
  },

  async findUserById(id) {
    const res = await pool.query(
      'SELECT id, email, role, is_active FROM users WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  },

  async updateLastLogin(userId) {
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [userId]
    );
  },

  async getUserPermissions(userId) {
    const res = await pool.query(`
      SELECT DISTINCT p.permission_key
      FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      JOIN roles r ON r.id = rp.role_id
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1
      UNION
      SELECT p.permission_key
      FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      JOIN roles r ON r.id = rp.role_id
      JOIN users u ON lower(u.role) = lower(r.name)
      WHERE u.id = $1
      ORDER BY permission_key
    `, [userId]);
    return res.rows.map(r => r.permission_key);
  },

  async auditEvent(userId, action, resourceType = null, resourceId = null, metadata = {}) {
    await pool.query(
      `INSERT INTO audit_events(user_id, action, resource_type, resource_id, metadata)
       VALUES($1,$2,$3,$4,$5)`,
      [userId, action, resourceType, resourceId == null ? null : String(resourceId), JSON.stringify(metadata || {})]
    );
  },

  async listEnrollments(userId) {
    const res = await pool.query(`
      SELECT e.id, e.user_id, e.live_card_id, e.provider, e.brand, e.last4,
             e.exp_month, e.exp_year, e.enrollment_url, e.login_reference,
             e.status, e.notes, e.created_at, e.updated_at,
             CASE WHEN e.status='active' THEN true ELSE false END AS enrolled,
             CASE
               WHEN length(e.external_payment_method_id) > 8
               THEN repeat('*', GREATEST(length(e.external_payment_method_id)-8, 4))
                    || right(e.external_payment_method_id, 8)
               ELSE '********'
             END AS payment_method_hint
      FROM card_enrollments e
      WHERE e.user_id = $1
      ORDER BY e.created_at DESC
    `, [userId]);
    return res.rows;
  },

  async getEnrollmentById(id, userId) {
    const res = await pool.query(
      `SELECT * FROM card_enrollments WHERE id=$1 AND user_id=$2 LIMIT 1`,
      [id, userId]
    );
    return res.rows[0] || null;
  },

  async createEnrollment(input) {
    const res = await pool.query(`
      INSERT INTO card_enrollments(
        user_id, live_card_id, provider, external_payment_method_id,
        brand, last4, exp_month, exp_year, enrollment_url,
        login_reference, status, notes
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(provider, external_payment_method_id)
      DO UPDATE SET
        live_card_id=EXCLUDED.live_card_id,
        brand=EXCLUDED.brand,
        last4=EXCLUDED.last4,
        exp_month=EXCLUDED.exp_month,
        exp_year=EXCLUDED.exp_year,
        enrollment_url=EXCLUDED.enrollment_url,
        login_reference=EXCLUDED.login_reference,
        status=EXCLUDED.status,
        notes=EXCLUDED.notes,
        updated_at=NOW()
      RETURNING *`,
      [
        input.userId, input.liveCardId || null, input.provider,
        input.externalPaymentMethodId, input.brand || null, input.last4 || null,
        input.expMonth || null, input.expYear || null, input.enrollmentUrl || null,
        input.loginReference || null, input.status || 'active', input.notes || null
      ]
    );
    return res.rows[0];
  },

  async createMerchantTransaction(input) {
    const res = await pool.query(`
      INSERT INTO merchant_transactions(
        user_id, card_enrollment_id, provider, provider_transaction_id,
        parent_transaction_id, operation, status, amount, currency,
        order_id, invoice_number, idempotency_key, error_code, error_message, raw_response
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        input.userId, input.enrollmentId || null, input.provider,
        input.providerTransactionId || null, input.parentTransactionId || null,
        input.operation, input.status, input.amount, input.currency || 'USD',
        input.orderId || null, input.invoiceNumber || null, input.idempotencyKey || null,
        input.errorCode || null, input.errorMessage || null,
        JSON.stringify(input.rawResponse || {})
      ]
    );
    return res.rows[0];
  },

  async getMerchantTransactions(userId, limit = 100) {
    const res = await pool.query(`
      SELECT mt.*, ce.last4, ce.brand, ce.status AS enrollment_status
      FROM merchant_transactions mt
      LEFT JOIN card_enrollments ce ON ce.id = mt.card_enrollment_id
      WHERE mt.user_id = $1
      ORDER BY mt.created_at DESC
      LIMIT $2
    `, [userId, Math.min(Math.max(Number(limit) || 100, 1), 500)]);
    return res.rows;
  },
};

module.exports = db;
