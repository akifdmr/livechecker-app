// ============================================================
// BANKA HESAPLARI ROUTES
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');

module.exports = (deps) => {
  const { routingService } = deps;

  // ------------------------------------------------------------
  // ROUTING LOOKUP
  // ------------------------------------------------------------
  router.get('/routing/:routing', authMiddleware, async (req, res) => {
    try {
      const result = await routingService.lookup(req.params.routing);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // LISTELE
  // ------------------------------------------------------------
  router.get('/bank-accounts', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        `SELECT id, user_id, account_name, RIGHT(account_number, 4) AS account_last4,
                routing_number, account_type, bank_name, bank_city, bank_state,
                city, state, phone, balance, is_active, created_at, updated_at
         FROM bank_accounts 
         WHERE user_id = $1 
         ORDER BY id DESC`,
        [req.user.id]
      );
      res.json({ accounts: result.rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // TEK KAYIT
  // ------------------------------------------------------------
  router.get('/bank-accounts/:id', authMiddleware, async (req, res) => {
    try {
      const result = await db.pool.query(
        'SELECT * FROM bank_accounts WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Hesap bulunamadı' });
      }
      res.json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // EKLE
  // ------------------------------------------------------------
  router.post('/bank-accounts', authMiddleware, async (req, res) => {
    const {
      account_name, account_number, routing_number, account_type,
      address_line1, address_line2, city, state, zip, country,
      phone, email, ein_number, balance, notes,
    } = req.body;

    if (!account_name || !account_number || !routing_number) {
      return res.status(400).json({ error: 'account_name, account_number, routing_number gerekli' });
    }

    try {
      // Routing'den banka adı bul
      let bank_name = null;
      let bank_city = null;
      let bank_state = null;

      const routingInfo = await routingService.lookup(routing_number);
      if (routingInfo && !routingInfo.error) {
        bank_name = routingInfo.bank_name;
        bank_city = routingInfo.city;
        bank_state = routingInfo.state;
      }

      const result = await db.pool.query(
        `INSERT INTO bank_accounts (
          user_id, account_name, account_number, routing_number, account_type,
          bank_name, bank_city, bank_state,
          address_line1, address_line2, city, state, zip, country,
          phone, email, ein_number, balance, notes
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19
        ) RETURNING *`,
        [
          req.user.id, account_name, account_number, routing_number, account_type || 'checking',
          bank_name, bank_city, bank_state,
          address_line1 || null, address_line2 || null, city || null, state || null, zip || null, country || 'US',
          phone || null, email || null, ein_number || null, balance || 0, notes || null,
        ]
      );

      res.json({ ok: true, account: result.rows[0] });
    } catch (e) {
      console.error('[BANK-ACCOUNT-CREATE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // GÜNCELLE
  // ------------------------------------------------------------
  router.put('/bank-accounts/:id', authMiddleware, async (req, res) => {
    try {
      const check = await db.pool.query(
        'SELECT * FROM bank_accounts WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Hesap bulunamadı' });
      }

      const current = check.rows[0];
      const fields = ['account_name', 'account_number', 'routing_number', 'account_type',
        'address_line1', 'address_line2', 'city', 'state', 'zip', 'country',
        'phone', 'email', 'ein_number', 'balance', 'notes', 'is_active'];

      // Routing değiştiyse banka adını yenile
      let bankUpdate = {};
      if (req.body.routing_number && req.body.routing_number !== current.routing_number) {
        const info = await routingService.lookup(req.body.routing_number);
        if (info && !info.error) {
          bankUpdate.bank_name = info.bank_name;
          bankUpdate.bank_city = info.city;
          bankUpdate.bank_state = info.state;
        }
      }

      const updates = [];
      const values = [];
      let i = 1;

      for (const f of fields) {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${i}`);
          values.push(req.body[f]);
          i++;
        }
      }

      for (const [k, v] of Object.entries(bankUpdate)) {
        updates.push(`${k} = $${i}`);
        values.push(v);
        i++;
      }

      if (updates.length === 0) {
        return res.json({ ok: true, account: current });
      }

      updates.push(`updated_at = NOW()`);
      values.push(req.params.id);
      values.push(req.user.id);

      const result = await db.pool.query(
        `UPDATE bank_accounts SET ${updates.join(', ')} 
         WHERE id = $${i} AND user_id = $${i + 1} 
         RETURNING *`,
        values
      );

      res.json({ ok: true, account: result.rows[0] });
    } catch (e) {
      console.error('[BANK-ACCOUNT-UPDATE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ------------------------------------------------------------
  // SİL
  // ------------------------------------------------------------
  router.delete('/bank-accounts/:id', authMiddleware, async (req, res) => {
    try {
      await db.pool.query(
        'DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
