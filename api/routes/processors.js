const express = require('express');
const { authMiddleware } = require('../auth');
const db = require('../db');
const { encrypt, decrypt } = require('../utils/processorVault');

const router = express.Router();
const fields = ['username', 'password', 'api_key', 'secret', 'api_token', 'notes'];

function sendError(res, error) {
  if (error.code === 'VAULT_KEY_MISSING') {
    return res.status(503).json({ error: 'Processor vault için sunucu PROCESSOR_VAULT_KEY ayarı gerekli.' });
  }
  console.error('[PROCESSOR-VAULT]', error.message);
  return res.status(500).json({ error: 'Processor kaydı işlenemedi.' });
}

function normalizedPayload(body = {}) {
  return {
    processor_name: String(body.processor_name || '').trim(),
    account_name: String(body.account_name || '').trim(),
    domain: String(body.domain || '').trim(),
    is_active: body.is_active !== false,
    credentials: Object.fromEntries(fields.map((field) => [field, String(body[field] || '')])),
  };
}

router.get('/processors', authMiddleware, async (req, res) => {
  try {
    const { q = '', processor = '', domain = '', active = '' } = req.query;
    const values = [req.user.id];
    const conditions = ['user_id = $1'];
    if (q) {
      values.push(`%${String(q).trim()}%`);
      conditions.push(`(processor_name ILIKE $${values.length} OR account_name ILIKE $${values.length} OR COALESCE(domain, '') ILIKE $${values.length})`);
    }
    if (processor) {
      values.push(`%${String(processor).trim()}%`);
      conditions.push(`processor_name ILIKE $${values.length}`);
    }
    if (domain) {
      values.push(`%${String(domain).trim()}%`);
      conditions.push(`COALESCE(domain, '') ILIKE $${values.length}`);
    }
    if (active === 'true' || active === 'false') {
      values.push(active === 'true');
      conditions.push(`is_active = $${values.length}`);
    }
    const result = await db.pool.query(
      `SELECT id, processor_name, account_name, domain, is_active, created_at, updated_at,
              (credentials_encrypted IS NOT NULL) AS has_credentials
       FROM processor_accounts WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC, id DESC`,
      values,
    );
    res.json({ accounts: result.rows });
  } catch (error) { sendError(res, error); }
});

router.get('/processors/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.pool.query(
      'SELECT * FROM processor_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Processor kaydı bulunamadı.' });
    const row = result.rows[0];
    res.json({
      id: row.id,
      processor_name: row.processor_name,
      account_name: row.account_name,
      domain: row.domain || '',
      is_active: row.is_active,
      ...decrypt(row.credentials_encrypted),
    });
  } catch (error) { sendError(res, error); }
});

router.post('/processors', authMiddleware, async (req, res) => {
  const payload = normalizedPayload(req.body);
  if (!payload.processor_name || !payload.account_name) {
    return res.status(400).json({ error: 'Processor adı ve hesap etiketi gerekli.' });
  }
  try {
    const encrypted = encrypt(payload.credentials);
    const result = await db.pool.query(
      `INSERT INTO processor_accounts
       (user_id, processor_name, account_name, domain, credentials_encrypted, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, processor_name, account_name, domain, is_active, created_at, updated_at`,
      [req.user.id, payload.processor_name, payload.account_name, payload.domain || null, encrypted, payload.is_active],
    );
    res.status(201).json({ account: result.rows[0] });
  } catch (error) { sendError(res, error); }
});

router.put('/processors/:id', authMiddleware, async (req, res) => {
  const payload = normalizedPayload(req.body);
  if (!payload.processor_name || !payload.account_name) {
    return res.status(400).json({ error: 'Processor adı ve hesap etiketi gerekli.' });
  }
  try {
    const encrypted = encrypt(payload.credentials);
    const result = await db.pool.query(
      `UPDATE processor_accounts SET processor_name = $1, account_name = $2, domain = $3,
       credentials_encrypted = $4, is_active = $5, updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING id, processor_name, account_name, domain, is_active, created_at, updated_at`,
      [payload.processor_name, payload.account_name, payload.domain || null, encrypted, payload.is_active, req.params.id, req.user.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Processor kaydı bulunamadı.' });
    res.json({ account: result.rows[0] });
  } catch (error) { sendError(res, error); }
});

router.delete('/processors/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.pool.query(
      'DELETE FROM processor_accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Processor kaydı bulunamadı.' });
    res.json({ ok: true });
  } catch (error) { sendError(res, error); }
});

module.exports = (deps) => { void deps; return router; };
