// ============================================================
// LOAD CARDS ROUTES — Dolum Kartları
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');
const crypto = require('crypto');

// ============================================================
// ŞİFRELEME (AES-256-GCM)
// ============================================================
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_char_key_change_me!';
const ALGO = 'aes-256-gcm';

function encrypt(text) {
  if (!text) return null;
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
  if (!text) return null;
  try {
    const [ivHex, tagHex, encryptedHex] = text.split(':');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return null;
  }
}

// ============================================================
// KART MASKESI
// ============================================================
function maskCard(cardNumber) {
  if (!cardNumber || cardNumber.length < 4) return cardNumber;
  return '****' + cardNumber.slice(-4);
}

module.exports = (deps) => {
  // ------------------------------------------------------------
  // LİSTELE
  // ------------------------------------------------------------
  router.get('/load-cards', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        `SELECT * FROM load_cards 
         WHERE user_id = $1 
         ORDER BY id DESC`,
        [req.user.id]
      );

      // Şifreleri decrypt et (maskeli)
      const cards = result.rows.map((c) => ({
        ...c,
        card_number_masked: maskCard(c.card_number),
        mobile_password: c.mobile_password ? '***' : null,   // asla gönderme
      }));

      res.json({ cards });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // TEK KAYIT
  // ------------------------------------------------------------
  router.get('/load-cards/:id', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        'SELECT * FROM load_cards WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Kart bulunamadı' });
      }

      const card = result.rows[0];
      res.json({
        ...card,
        mobile_password: decrypt(card.mobile_password),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // EKLE
  // ------------------------------------------------------------
  router.post('/load-cards', authMiddleware, async (req, res) => {
    const {
      card_number, card_holder_name, card_exp, card_cvv, card_brand, card_bank,
      address_line1, address_line2, city, state, zip, country,
      phone, email,
      agent_first_name, agent_last_name, agent_phone, agent_email, agent_notes,
      mobile_username, mobile_password, mobile_bank,
      notes,
    } = req.body;

    if (!card_number || !card_holder_name) {
      return res.status(400).json({ error: 'card_number ve card_holder_name gerekli' });
    }

    try {
      const encryptedPassword = mobile_password ? encrypt(mobile_password) : null;

      const result = await db.pool.query(
        `INSERT INTO load_cards (
          user_id, card_number, card_holder_name, card_exp, card_cvv, card_brand, card_bank,
          address_line1, address_line2, city, state, zip, country,
          phone, email,
          agent_first_name, agent_last_name, agent_phone, agent_email, agent_notes,
          mobile_username, mobile_password, mobile_bank,
          notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22, $23,
          $24
        ) RETURNING *`,
        [
          req.user.id, card_number, card_holder_name, card_exp || null, card_cvv || null,
          card_brand || null, card_bank || null,
          address_line1 || null, address_line2 || null, city || null, state || null, zip || null, country || 'US',
          phone || null, email || null,
          agent_first_name || null, agent_last_name || null, agent_phone || null, agent_email || null, agent_notes || null,
          mobile_username || null, encryptedPassword, mobile_bank || null,
          notes || null,
        ]
      );

      res.json({ ok: true, card: { ...result.rows[0], mobile_password: null } });
    } catch (e) {
      console.error('[LOAD-CARD-CREATE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // GÜNCELLE
  // ------------------------------------------------------------
  router.put('/load-cards/:id', authMiddleware, async (req, res) => {
    try {
      const check = await db.pool.query(
        'SELECT * FROM load_cards WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Kart bulunamadı' });
      }

      const current = check.rows[0];
      const body = { ...req.body };

      // Şifre geldiyse encrypt et
      if (body.mobile_password !== undefined) {
        body.mobile_password = body.mobile_password ? encrypt(body.mobile_password) : null;
      }

      const fields = ['card_number', 'card_holder_name', 'card_exp', 'card_cvv', 'card_brand', 'card_bank',
        'address_line1', 'address_line2', 'city', 'state', 'zip', 'country',
        'phone', 'email',
        'agent_first_name', 'agent_last_name', 'agent_phone', 'agent_email', 'agent_notes',
        'mobile_username', 'mobile_password', 'mobile_bank',
        'notes', 'is_active'];

      const updates = [];
      const values = [];
      let i = 1;

      for (const f of fields) {
        if (body[f] !== undefined) {
          updates.push(`${f} = $${i}`);
          values.push(body[f]);
          i++;
        }
      }

      if (updates.length === 0) {
        return res.json({ ok: true, card: current });
      }

      updates.push(`updated_at = NOW()`);
      values.push(req.params.id);
      values.push(req.user.id);

      const result = await db.pool.query(
        `UPDATE load_cards SET ${updates.join(', ')} 
         WHERE id = $${i} AND user_id = $${i + 1} 
         RETURNING *`,
        values
      );

      res.json({ ok: true, card: { ...result.rows[0], mobile_password: null } });
    } catch (e) {
      console.error('[LOAD-CARD-UPDATE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // SİL
  // ------------------------------------------------------------
  router.delete('/load-cards/:id', authMiddleware, async (req, res) => {
    try {
      await db.pool.query(
        'DELETE FROM load_cards WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // BAKİYE GÖRÜNÜMÜ (View)
  // ------------------------------------------------------------
  router.get('/load-cards-balances', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        `SELECT * FROM card_balances WHERE user_id = $1 ORDER BY remaining DESC`,
        [req.user.id]
      );
      res.json({ balances: result.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
