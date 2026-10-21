const express = require('express');
const { randomUUID } = require('node:crypto');
const { authMiddleware } = require('../auth');
const db = require('../db');

const router = express.Router();
const ALLOWED_FIELDS = new Set([
  'status', 'ashStatus', 'ashStatusDes', 'amountMinor', 'currency',
  'tranType', 'mti', 'creditTerms', 'brand', 'cardType',
  'f39Response', 'panEntryMode',
]);
const CODE_FIELDS = new Set([
  'status', 'ashStatus', 'tranType', 'mti', 'creditTerms', 'brand',
  'cardType', 'f39Response', 'panEntryMode',
]);

function normalizeRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.some((key) => !ALLOWED_FIELDS.has(key))) return null;

  const result = {};
  for (const key of CODE_FIELDS) {
    const value = input[key];
    if (value == null || value === '') {
      result[key] = null;
      continue;
    }
    const normalized = String(value).trim();
    if (normalized.length > 16 || !/^[A-Za-z0-9_-]+$/.test(normalized)) return null;
    result[key] = normalized;
  }

  const description = input.ashStatusDes == null ? null : String(input.ashStatusDes).trim();
  if (description && (description.length > 80 || /[\u0000-\u001f]/.test(description))) return null;
  result.ashStatusDes = description || null;

  if (input.currency == null || input.currency === '') {
    result.currency = null;
  } else {
    result.currency = String(input.currency).trim();
    if (!/^\d{3}$/.test(result.currency)) return null;
  }

  if (input.amountMinor == null || input.amountMinor === '') {
    result.amountMinor = null;
  } else {
    const amount = Number(input.amountMinor);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000) return null;
    result.amountMinor = amount;
  }

  if (input.creditTerms != null && input.creditTerms !== '') {
    const terms = Number(input.creditTerms);
    if (!Number.isInteger(terms) || terms < 0 || terms > 32767) return null;
    result.creditTerms = String(terms);
  }
  return result;
}

module.exports = () => {
  router.post('/processor-dump-imports', authMiddleware, async (req, res) => {
    const bodyKeys = Object.keys(req.body || {});
    if (bodyKeys.length !== 1 || bodyKeys[0] !== 'records') {
      return res.status(400).json({ error: 'Yalnızca ayıklanmış işlem metadatası gönderilebilir.' });
    }

    const records = req.body.records;
    if (!Array.isArray(records) || records.length < 1 || records.length > 500) {
      return res.status(400).json({ error: '1–500 arası ayıklanmış kayıt gerekli.' });
    }

    const normalized = records.map(normalizeRecord);
    if (normalized.some((record) => !record)) {
      return res.status(400).json({ error: 'Kayıt biçimi geçersiz veya izin verilmeyen alan içeriyor.' });
    }

    const client = await db.pool.connect();
    const batchId = randomUUID();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < normalized.length; index += 1) {
        const r = normalized[index];
        await client.query(
          `INSERT INTO processor_dump_metadata (
            user_id, batch_id, source_line, status_code, ash_status_code,
            status_description, amount_minor, currency_code, transaction_type,
            mti, credit_terms, brand_code, card_type_code, response_code,
            pan_entry_mode
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            req.user.id, batchId, index + 1, r.status, r.ashStatus,
            r.ashStatusDes, r.amountMinor, r.currency, r.tranType, r.mti,
            r.creditTerms, r.brand, r.cardType, r.f39Response, r.panEntryMode,
          ],
        );
      }
      await client.query('COMMIT');
      return res.status(201).json({ imported: normalized.length, batchId });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[PROCESSOR-DUMP-IMPORT]', error.code || 'DB_ERROR');
      return res.status(500).json({ error: 'İşlem metadatası kaydedilemedi.' });
    } finally {
      client.release();
    }
  });

  router.get('/processor-dump-imports', authMiddleware, async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    try {
      const [rows, count] = await Promise.all([
        db.pool.query(
          `SELECT id, batch_id AS "batchId", source_line AS "sourceLine",
                  status_code AS status, ash_status_code AS "ashStatus",
                  status_description AS "statusDescription", amount_minor AS "amountMinor",
                  currency_code AS currency, transaction_type AS "transactionType",
                  mti, credit_terms AS "creditTerms", brand_code AS brand,
                  card_type_code AS "cardType", response_code AS "f39Response",
                  pan_entry_mode AS "panEntryMode", imported_at AS "importedAt"
           FROM processor_dump_metadata WHERE user_id=$1
           ORDER BY imported_at DESC, id DESC LIMIT $2 OFFSET $3`,
          [req.user.id, limit, offset],
        ),
        db.pool.query('SELECT COUNT(*)::int AS total FROM processor_dump_metadata WHERE user_id=$1', [req.user.id]),
      ]);
      return res.json({ records: rows.rows, total: count.rows[0].total, limit, offset });
    } catch (error) {
      console.error('[PROCESSOR-DUMP-LIST]', error.code || 'DB_ERROR');
      return res.status(500).json({ error: 'İçe aktarılan kayıtlar alınamadı.' });
    }
  });

  return router;
};
