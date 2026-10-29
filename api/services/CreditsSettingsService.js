const db = require('../db');

const ALLOWED_SETTINGS = new Set(['fees', 'default_currency', 'default_provider']);
const ALLOWED_ENTRY_TYPES = new Set(['admin_grant', 'bin_check', 'capture_fee', 'adjustment']);
const ALLOWED_REFERENCE_TYPES = new Set(['bin_check', 'merchant_transaction', 'provision', 'credit_request']);

function money(value, { allowZero = false } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw Object.assign(new Error('Tutar geçersiz'), { statusCode: 400 });
  }
  return Math.round(amount * 100) / 100;
}

function validSettingKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return ALLOWED_SETTINGS.has(normalized);
}

class CreditsSettingsService {
  constructor(pool = db.pool) {
    this.pool = pool;
  }

  async getBalance(userId) {
    const result = await this.pool.query(
      'SELECT credits FROM users WHERE id=$1 AND is_active=true',
      [userId]
    );
    if (!result.rowCount) throw Object.assign(new Error('Kullanıcı bulunamadı'), { statusCode: 404 });
    return Number(result.rows[0].credits || 0);
  }

  async spend({ userId, amount, entryType, referenceType = null, referenceId = null, idempotencyKey = null }) {
    return this._changeBalance({
      userId,
      amount: -money(amount),
      entryType,
      referenceType,
      referenceId,
      idempotencyKey,
    });
  }

  async grant({ userId, amount, entryType = 'admin_grant', referenceType = null, referenceId = null, idempotencyKey = null, createdBy }) {
    return this._changeBalance({
      userId,
      amount: money(amount),
      entryType,
      referenceType,
      referenceId,
      idempotencyKey,
      createdBy,
    });
  }

  async _changeBalance(input) {
    if (!ALLOWED_ENTRY_TYPES.has(input.entryType)) {
      throw Object.assign(new Error('entryType gerekli'), { statusCode: 400 });
    }
    if (input.referenceType && !ALLOWED_REFERENCE_TYPES.has(input.referenceType)) {
      throw Object.assign(new Error('referenceType geçersiz'), { statusCode: 400 });
    }
    if (input.referenceId != null && !/^[A-Za-z0-9_-]{1,120}$/.test(String(input.referenceId))) {
      throw Object.assign(new Error('referenceId geçersiz'), { statusCode: 400 });
    }
    if (input.idempotencyKey && String(input.idempotencyKey).length > 120) {
      throw Object.assign(new Error('idempotencyKey en fazla 120 karakter olabilir'), { statusCode: 400 });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        'SELECT credits FROM users WHERE id=$1 AND is_active=true FOR UPDATE',
        [input.userId]
      );
      if (!userResult.rowCount) throw Object.assign(new Error('Kullanıcı bulunamadı'), { statusCode: 404 });

      if (input.idempotencyKey) {
        const existing = await client.query(
          `SELECT amount, balance_after FROM credit_ledger
           WHERE user_id=$1 AND idempotency_key=$2`,
          [input.userId, input.idempotencyKey]
        );
        if (existing.rowCount) {
          const row = existing.rows[0];
          if (Number(row.amount) !== input.amount) {
            throw Object.assign(new Error('idempotencyKey başka bir tutarla kullanılmış'), { statusCode: 409 });
          }
          await client.query('COMMIT');
          return { balance: Number(row.balance_after), duplicate: true };
        }
      }

      const current = Number(userResult.rows[0].credits || 0);
      const next = Math.round((current + input.amount) * 100) / 100;
      if (next < 0) throw Object.assign(new Error('Yetersiz kredi'), { statusCode: 409, code: 'INSUFFICIENT_CREDITS' });

      await client.query('UPDATE users SET credits=$1 WHERE id=$2', [next, input.userId]);
      await client.query(
        `INSERT INTO credit_ledger
          (user_id, amount, balance_after, entry_type, reference_type, reference_id,
           idempotency_key, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [input.userId, input.amount, next, input.entryType, input.referenceType,
          input.referenceId, input.idempotencyKey, input.createdBy || null]
      );
      await client.query(
        `INSERT INTO audit_events(user_id, action, resource_type, resource_id, metadata)
         VALUES ($1,$2,'credit_ledger',$3,$4::jsonb)`,
        [input.createdBy || input.userId, `credits.${input.entryType}`, String(input.userId),
          JSON.stringify({ amount: input.amount, balance: next, referenceType: input.referenceType, referenceId: input.referenceId })]
      );
      await client.query('COMMIT');
      return { balance: next, duplicate: false };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async listSettings() {
    const result = await this.pool.query(
      'SELECT setting_key, setting_value, updated_by, updated_at FROM settings ORDER BY setting_key'
    );
    return Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value]));
  }

  async setSetting({ key, value, adminUserId }) {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!validSettingKey(normalizedKey)) {
      throw Object.assign(new Error('Ayar anahtarı geçersiz veya gizli bilgi içeriyor'), { statusCode: 400 });
    }
    if (value === undefined) throw Object.assign(new Error('value gerekli'), { statusCode: 400 });
    if (normalizedKey === 'fees') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw Object.assign(new Error('fees bir nesne olmalı'), { statusCode: 400 });
      }
      const unknown = Object.keys(value).filter((feeKey) => !['bin_check', 'capture'].includes(feeKey));
      if (unknown.length) throw Object.assign(new Error('Desteklenmeyen ücret anahtarı'), { statusCode: 400 });
      for (const feeAmount of Object.values(value)) money(feeAmount, { allowZero: true });
    }
    if (normalizedKey === 'default_currency' && !/^[A-Z]{3}$/.test(String(value))) {
      throw Object.assign(new Error('default_currency üç büyük harfli para birimi kodu olmalı'), { statusCode: 400 });
    }
    if (normalizedKey === 'default_provider' && !/^[a-z][a-z0-9_-]{0,49}$/.test(String(value))) {
      throw Object.assign(new Error('default_provider anahtarı geçersiz'), { statusCode: 400 });
    }
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > 4000) {
      throw Object.assign(new Error('Ayar değeri geçersiz veya çok büyük'), { statusCode: 400 });
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO settings(setting_key, setting_value, updated_by, updated_at)
         VALUES ($1,$2::jsonb,$3,NOW())
         ON CONFLICT(setting_key) DO UPDATE
           SET setting_value=EXCLUDED.setting_value, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
        [normalizedKey, serialized, adminUserId]
      );
      await client.query(
        `INSERT INTO audit_events(user_id, action, resource_type, resource_id, metadata)
         VALUES ($1,'settings.update','setting',$2,$3::jsonb)`,
        [adminUserId, normalizedKey, JSON.stringify({ key: normalizedKey })]
      );
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
    return { key: normalizedKey, value };
  }

  async getFee(operation) {
    const allowed = new Set(['bin_check', 'capture']);
    if (!allowed.has(operation)) {
      throw Object.assign(new Error('Bu işlem için ücret tanımlaması desteklenmiyor'), { statusCode: 400 });
    }
    const result = await this.pool.query(
      'SELECT setting_value FROM settings WHERE setting_key=$1',
      ['fees']
    );
    const configured = result.rows[0]?.setting_value?.[operation];
    if (configured === undefined) {
      throw Object.assign(new Error(`Ücret ayarı yapılandırılmamış: ${operation}`), { statusCode: 409, code: 'FEE_NOT_CONFIGURED' });
    }
    return money(configured, { allowZero: true });
  }

  async getDefaultProvider() {
    const result = await this.pool.query(
      `SELECT setting_value FROM settings WHERE setting_key='default_provider'`
    );
    const value = result.rows[0]?.setting_value;
    return typeof value === 'string' ? value : null;
  }
}

module.exports = { CreditsSettingsService, validSettingKey };
