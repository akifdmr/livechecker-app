// ============================================================
// apps/api/routes/subscriptions.js
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const db = require('../db');

// ------------------------------------------------------------
// Şema hazırlığı (tek seferlik, tembel)
// ------------------------------------------------------------
let schemaReadyPromise = null;

async function ensureSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    try {
      await db.pool.query(`
        CREATE TABLE IF NOT EXISTS subscription_prechecks (
          id BIGSERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          live_card_id INTEGER NOT NULL REFERENCES live_cards_full(id) ON DELETE CASCADE,
          outcome VARCHAR(20) NOT NULL,
          findings JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_subscription_prechecks_user_date
          ON subscription_prechecks(user_id, created_at DESC)
      `);
      await db.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_subscription_prechecks_card_date
          ON subscription_prechecks(live_card_id, created_at DESC)
      `);
      return true;
    } catch (error) {
      console.error('[SUBSCRIPTION-PREFLIGHT-SCHEMA]', error.message);
      // Bir sonraki istekte tekrar denemek için cache'i temizle
      schemaReadyPromise = null;
      return false;
    }
  })();

  return schemaReadyPromise;
}

// Modül yüklenirken bir kez tetikle (opsiyonel)
ensureSchema().catch(() => {});

// ------------------------------------------------------------
// Yardımcılar
// ------------------------------------------------------------
function expiryFinding(exp) {
  const match = String(exp || '').trim().match(/^(0?[1-9]|1[0-2])\/(\d{2}|\d{4})$/);
  if (!match) return 'Son kullanma tarihi eksik veya okunamıyor.';
  const month = Number(match[1]);
  let year = Number(match[2]);
  if (year < 100) year += 2000;
  const now = new Date();
  if (
    year < now.getFullYear() ||
    (year === now.getFullYear() && month < now.getMonth() + 1)
  ) {
    return 'Kartın son kullanma tarihi geçmiş.';
  }
  return null;
}

function isCheckRole(req) {
  return req.user && (req.user.role === 'checker' || req.user.role === 'admin');
}

// ------------------------------------------------------------
// Router
// ------------------------------------------------------------
module.exports = () => {
  // GET /subscription-cards
  router.get('/subscription-cards', authMiddleware, async (req, res) => {
    if (!isCheckRole(req)) {
      return res.status(403).json({ error: 'Check-only veya admin rolü gerekli.' });
    }
    try {
      const result = await db.pool.query(`
        SELECT lcf.id,
               COALESCE(lcf.name, '') AS holder_name,
               lcf.exp,
               LEFT(regexp_replace(COALESCE(lcf.pan, ''), '[^0-9]', '', 'g'), 6) AS bin,
               lcf.type, lcf.banka, lcf.country,
               COALESCE(lcf.status, 'UNKNOWN') AS status,
               RIGHT(regexp_replace(COALESCE(lcf.pan, ''), '[^0-9]', '', 'g'), 4) AS last4,
               GREATEST(
                 COALESCE(SUM(CASE WHEN ca.action IN ('sale','capture') AND ca.status='approved' THEN ca.amount ELSE 0 END), 0)
                 - COALESCE(SUM(CASE WHEN ca.action='refund' AND ca.status='approved' THEN ca.amount ELSE 0 END), 0),
                 0
               ) AS net_collected,
               MAX(ca.created_at) AS last_payment_at,
               (ARRAY_AGG(ca.display_message ORDER BY ca.created_at DESC)
                 FILTER (WHERE ca.status='declined'))[1] AS last_decline
        FROM live_cards_full lcf
        LEFT JOIN charge_audit ca ON ca.live_card_id = lcf.id
        GROUP BY lcf.id
        ORDER BY lcf.id DESC
        LIMIT 1000
      `);
      res.json({ cards: result.rows });
    } catch (e) {
      console.error('[SUBSCRIPTION-CARDS]', e.message);
      res.status(500).json({ error: 'Abonelik kartları yüklenemedi.' });
    }
  });

  // POST /subscription-cards/:id/preflight
  router.post('/subscription-cards/:id/preflight', authMiddleware, async (req, res) => {
    if (!isCheckRole(req)) {
      return res.status(403).json({ error: 'Check-only veya admin rolü gerekli.' });
    }
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Kart kaydı geçersiz.' });
    }
    try {
      const ready = await ensureSchema();
      if (!ready) {
        return res.status(503).json({ error: 'Ön kontrol kayıt tablosu kullanıma hazır değil.' });
      }

      const found = await db.pool.query(
        'SELECT id, name, exp, status FROM live_cards_full WHERE id = $1',
        [req.params.id]
      );
      const card = found.rows[0];
      if (!card) {
        return res.status(404).json({ error: 'Abonelik kartı bulunamadı.' });
      }

      const findings = [];
      if (!String(card.name || '').trim()) findings.push('Kart sahibi adı eksik.');
      const expiration = expiryFinding(card.exp);
      if (expiration) findings.push(expiration);
      if (String(card.status || '').toUpperCase() === 'DEAD') {
        findings.push('Son kayıtlı kart durumu kontrol gerektiriyor.');
      }

      const decline = await db.pool.query(
        `SELECT display_message, reason
           FROM charge_audit
          WHERE live_card_id = $1 AND status = 'declined'
          ORDER BY created_at DESC
          LIMIT 1`,
        [card.id]
      );
      if (decline.rows[0]) {
        findings.push(
          `Önceki ödeme reddedilmiş: ${
            decline.rows[0].display_message || decline.rows[0].reason || 'neden belirtilmemiş'
          }`
        );
      }

      const outcome = findings.some(
        (item) =>
          item.includes('geçmiş') ||
          item.includes('eksik') ||
          item.includes('okunamıyor')
      )
        ? 'needs_review'
        : findings.length
        ? 'review'
        : 'ready';

      const saved = await db.pool.query(
        `INSERT INTO subscription_prechecks (user_id, live_card_id, outcome, findings)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id, created_at`,
        [req.user.id, card.id, outcome, JSON.stringify(findings)]
      );

      res.json({
        check: {
          ...saved.rows[0],
          live_card_id: card.id,
          holder_name: card.name || '',
          exp: card.exp || '',
          outcome,
          findings,
        },
        paymentAttempted: false,
        providerChecked: false,
      });
    } catch (e) {
      console.error('[SUBSCRIPTION-PREFLIGHT]', e.message);
      res.status(500).json({ error: 'Ön kontrol tamamlanamadı.' });
    }
  });

  // GET /subscription-prechecks
  router.get('/subscription-prechecks', authMiddleware, async (req, res) => {
    if (!isCheckRole(req)) {
      return res.status(403).json({ error: 'Check-only veya admin rolü gerekli.' });
    }
    try {
      const ready = await ensureSchema();
      if (!ready) {
        return res.status(503).json({ error: 'Ön kontrol kayıt tablosu kullanıma hazır değil.' });
      }

      const result = await db.pool.query(
        `SELECT sp.id, sp.live_card_id, sp.outcome, sp.findings, sp.created_at,
                COALESCE(lcf.name, '') AS holder_name,
                RIGHT(regexp_replace(COALESCE(lcf.pan, ''), '[^0-9]', '', 'g'), 4) AS last4
           FROM subscription_prechecks sp
           JOIN live_cards_full lcf ON lcf.id = sp.live_card_id
          WHERE sp.user_id = $1
          ORDER BY sp.created_at DESC
          LIMIT 500`,
        [req.user.id]
      );
      res.json({ checks: result.rows });
    } catch (e) {
      console.error('[SUBSCRIPTION-PREFLIGHT-HISTORY]', e.message);
      res.status(500).json({ error: 'Ön kontrol geçmişi yüklenemedi.' });
    }
  });

  return router;
};