// ============================================================
// routes/cardImage.js — v3
// - POST /card-image          (raw PAN)
// - POST /card-image/card/:id (live card ID → otomatik bilgi)
// - GET  /card-image/archive  (liste)
// - GET  /card-image/archive/:id
// - DELETE /card-image/archive/:id
// - BIN lokaldeki BinDatabase'den gelir
// ============================================================
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../auth');
const { downloadAndSave, deleteFile } = require('../utils/cardImageStorage');

module.exports = (deps) => {
  const { cardChecker, dbService } = deps;

  // ============================================================
  // HELPERS
  // ============================================================
  function rawLevel(meta) {
    const category = String(meta.category || '').trim();
    const type = String(meta.type || '').trim().toUpperCase();
    const parts = [];
    if (category) {
      parts.push(category.toLowerCase().split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
    }
    if (type && type !== 'CREDIT') parts.push(type.charAt(0) + type.slice(1).toLowerCase());
    else if (type === 'CREDIT' && !category.toLowerCase().includes('credit')) parts.push('Credit');
    return parts.filter(Boolean).join(' ') || 'Standard';
  }

  function designHint(brand, meta) {
    const b = String(brand || '').toLowerCase();
    const h = `${meta.category || ''} ${meta.type || ''}`.toLowerCase();

    if (b.includes('visa')) {
      if (h.includes('infinite')) return 'obsidian black with gold accents, premium metallic finish';
      if (h.includes('signature')) return 'deep navy blue gradient with silver foil embossing';
      if (h.includes('platinum')) return 'brushed silver metallic with white gradient';
      if (h.includes('gold')) return 'champagne gold gradient with metallic sheen';
      if (h.includes('business')) return 'dark navy with subtle business branding';
      if (h.includes('prepaid')) return 'matte white gradient with prepaid branding';
      if (h.includes('debit')) return 'matte blue gradient with VISA debit logo';
      return 'matte blue gradient with VISA logo';
    }
    if (b.includes('mastercard') || b.includes('master card') || b.includes('mc')) {
      if (h.includes('world elite')) return 'matte black card with platinum edges and dual-circle MC logo';
      if (h.includes('world')) return 'deep charcoal with red/orange gradient and metallic edges';
      if (h.includes('platinum')) return 'silver-white gradient with red/orange dual-circle MC logo';
      if (h.includes('gold')) return 'metallic gold finish with dark MC dual-circle logo';
      if (h.includes('business')) return 'charcoal business card with MC dual-circle logo';
      if (h.includes('prepaid')) return 'matte orange-red with prepaid branding';
      if (h.includes('debit')) return 'orange-red gradient with MC debit logo';
      return 'orange-red gradient with Mastercard dual-circle logo';
    }
    if (b.includes('american express') || b.includes('amex')) {
      if (h.includes('centurion') || h.includes('black')) return 'matte black titanium with AMEX centurion logo';
      if (h.includes('platinum')) return 'titanium silver metallic with AMERICAN EXPRESS embossing';
      if (h.includes('gold')) return 'gold metallic with AMERICAN EXPRESS branding';
      if (h.includes('green')) return 'green corporate card with AMERICAN EXPRESS centurion logo';
      return 'classic green AMERICAN EXPRESS with centurion logo';
    }
    if (b.includes('discover')) {
      if (h.includes('platinum')) return 'silver gradient with orange accent and DISCOVER text';
      if (h.includes('miles') || h.includes('it')) return 'blue/silver gradient with DISCOVER it branding';
      return 'silver gradient with orange accent and DISCOVER logo';
    }
    const category = meta.category || 'Standard';
    return `matte PVC card with ${category.toLowerCase()} finish and brand logo bottom-right`;
  }

  function formatPan(pan) {
    const clean = String(pan).replace(/\D/g, '');
    if (clean.length === 15) return `${clean.slice(0, 4)} ${clean.slice(4, 10)} ${clean.slice(10)}`;
    return clean.replace(/(.{4})/g, '$1 ').trim();
  }

  function buildFrontPrompt({ cardholderName, pan, expiry, meta }) {
    return [
      'Photorealistic credit card, front side view, top-down flat lay on a clean neutral background.',
      `Issuer: ${meta.issuer || 'Generic Bank'}. Card level: ${rawLevel(meta)}. Network: ${meta.brand || 'Visa'}.`,
      `Design: ${designHint(meta.brand, meta)}.`,
      `Embossed cardholder name: "${cardholderName}".`,
      `Embossed PAN digits: "${formatPan(pan)}". Expiry: "${expiry}".`,
      'Realistic PVC plastic texture, subtle specular highlights, soft studio lighting, sharp focus, 4K resolution, isolated object, no shadows on text.',
    ].join(' ');
  }

  function buildBackPrompt({ cardholderName, cvv, meta }) {
    return [
      'Photorealistic credit card, back side view, top-down flat lay on a clean neutral background.',
      `Issuer: ${meta.issuer || 'Generic Bank'}. Card level: ${rawLevel(meta)}.`,
      'Black magnetic stripe across the top third.',
      `White signature panel with handwritten-style signature "${cardholderName}".`,
      `Three-digit CVV "${cvv}" printed on the right of the signature panel in small italic font.`,
      `Small fine-print customer service text mentioning ${meta.issuer || 'the issuing bank'}, hologram sticker bottom-center.`,
      'Realistic PVC plastic texture, soft studio lighting, sharp focus, 4K resolution, isolated object.',
    ].join(' ');
  }

  async function generateImage(prompt) {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error('REPLICATE_API_TOKEN eksik');

    const createRes = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ input: { prompt, aspect_ratio: '16:9', output_format: 'png', output_quality: 95 } }),
      }
    );
    if (!createRes.ok) throw new Error(`Replicate create: ${createRes.status}`);

    let result = await createRes.json();
    const start = Date.now();
    while (result.status !== 'succeeded' && result.status !== 'failed') {
      if (Date.now() - start > 90_000) throw new Error('Replicate timeout');
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(result.urls.get, { headers: { Authorization: `Bearer ${token}` } });
      result = await pollRes.json();
    }
    if (result.status === 'failed') throw new Error(`Replicate failed: ${result.error}`);
    return Array.isArray(result.output) ? result.output[0] : result.output;
  }

  // ============================================================
  // ÇEKİRDEK: görsel üret + arşive yaz
  // ============================================================
  async function generateAndArchive({ userId, liveCardId, pan, expiry, cvv, cardholderName }) {
    const bin = String(pan).replace(/\D/g, '').slice(0, 6);

    // 1) BIN lookup (LOKAL)
    let meta;
    try {
      meta = await cardChecker.binDb.lookupWithFallback(bin, cardChecker.externalApi);
    } catch (e) {
      console.warn('[CARD-IMAGE] BIN lookup:', e.message);
      meta = { bin, brand: '', type: '', category: '', issuer: '', country: '', isoCode2: '', isoCode3: '' };
    }

    // 2) Prompt'lar
    const frontPrompt = buildFrontPrompt({ cardholderName, pan, expiry, meta });
    const backPrompt  = buildBackPrompt({ cardholderName, cvv, meta });

    // 3) Replicate → paralel
    const [frontUrl, backUrl] = await Promise.all([
      generateImage(frontPrompt),
      generateImage(backPrompt),
    ]);

    // 4) Sunucuya indir
    const [front, back] = await Promise.all([
      downloadAndSave(frontUrl, userId, 'front'),
      downloadAndSave(backUrl,  userId, 'back'),
    ]);

    // 5) Arşive yaz
    const insert = await dbService.pool.query(
      `INSERT INTO card_images
        (user_id, live_card_id, bin, cardholder_name, pan_masked,
         brand, category, issuer, front_path, back_path, meta, prompts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
       RETURNING id, created_at`,
      [
        userId,
        liveCardId || null,
        bin,
        cardholderName,
        `${String(pan).slice(0, 6)}****${String(pan).slice(-4)}`,
        meta.brand || null,
        meta.category || null,
        meta.issuer || null,
        front.diskPath,
        back.diskPath,
        JSON.stringify(meta),
        JSON.stringify({ front: frontPrompt, back: backPrompt }),
      ]
    );

    const row = insert.rows[0];

    return {
      id: row.id,
      created_at: row.created_at,
      bin,
      cardholder_name: cardholderName,
      meta: {
        bin: meta.bin || bin,
        brand: meta.brand || '',
        type: meta.type || '',
        category: meta.category || '',
        level: rawLevel(meta),
        issuer: meta.issuer || '',
        country: meta.country || '',
        isoCode2: meta.isoCode2 || '',
        isoCode3: meta.isoCode3 || '',
      },
      images: { front: front.publicUrl, back: back.publicUrl },
      prompts: { front: frontPrompt, back: backPrompt },
    };
  }

  // ============================================================
  // POST /card-image — raw PAN
  // ============================================================
  router.post('/card-image', authMiddleware, async (req, res) => {
    try {
      const { pan, expiry, cvv, cardholder_name } = req.body || {};
      const cleanPan = String(pan || '').replace(/\D/g, '');
      if (cleanPan.length < 13 || cleanPan.length > 19) return res.status(400).json({ error: 'Geçersiz PAN' });
      if (!/^\d{2}\/\d{2,4}$/.test(String(expiry || ''))) return res.status(400).json({ error: 'Expiry MM/YY' });
      const cleanCvv = String(cvv || '').replace(/\D/g, '');
      if (cleanCvv.length < 3 || cleanCvv.length > 4) return res.status(400).json({ error: 'CVV 3-4 hane' });
      if (!cardholder_name || String(cardholder_name).trim().length < 2) return res.status(400).json({ error: 'İsim gerekli' });

      const out = await generateAndArchive({
        userId: req.user.id,
        liveCardId: null,
        pan: cleanPan,
        expiry,
        cvv: cleanCvv,
        cardholderName: String(cardholder_name).trim().toUpperCase(),
      });

      await dbService.auditEvent(req.user.id, 'card_image.generate', 'card', out.bin, {
        bin: out.bin, live_card_id: null, image_id: out.id,
      }).catch(() => {});

      res.json({ success: true, ...out });
    } catch (e) {
      console.error('[CARD-IMAGE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // POST /card-image/card/:id — canlı karttan otomatik
  // ============================================================
  router.post('/card-image/card/:id', authMiddleware, async (req, res) => {
    const cardId = parseInt(req.params.id, 10);
    const isAdmin = req.user.role === 'admin';
    try {
      const r = isAdmin
        ? await dbService.pool.query('SELECT * FROM live_cards_full WHERE id = $1', [cardId])
        : await dbService.pool.query(
            'SELECT * FROM live_cards_full WHERE id = $1 AND (user_id = $2 OR checked_by_user_id = $2)',
            [cardId, req.user.id]
          );

      if (!r.rows.length) return res.status(404).json({ error: 'Kart bulunamadı' });
      const card = r.rows[0];

      const pan = String(card.pan || '').replace(/\D/g, '');
      if (!pan || pan.length < 13) return res.status(400).json({ error: 'Kartta geçerli PAN yok' });

      // exp = "MM/YYYY"
      const expiry = card.exp || '';
      const cvv = String(card.cvv || '').replace(/\D/g, '');
      if (!cvv || cvv.length < 3) return res.status(400).json({ error: 'Kartta CVV yok' });

      const cardholderName = String(card.name || req.body?.cardholder_name || 'CARDHOLDER NAME').toUpperCase().trim();

      const out = await generateAndArchive({
        userId: card.user_id || req.user.id,
        liveCardId: card.id,
        pan, expiry, cvv, cardholderName,
      });

      await dbService.auditEvent(req.user.id, 'card_image.generate_from_card', 'live_card', String(card.id), {
        bin: out.bin, image_id: out.id, card_owner: card.user_id,
      }).catch(() => {});

      res.json({ success: true, ...out });
    } catch (e) {
      console.error('[CARD-IMAGE-FROM-CARD]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // GET /card-image/archive
  // ============================================================
  router.get('/card-image/archive', authMiddleware, async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const isAdmin = req.user.role === 'admin';
      const scopedUserId = isAdmin && req.query.userId
        ? parseInt(req.query.userId, 10)
        : (isAdmin && req.query.all === 'true' ? null : req.user.id);

      const where = [];
      const params = [];
      if (scopedUserId) {
        params.push(scopedUserId);
        where.push(`ci.user_id = $${params.length}`);
      }
      if (req.query.bin) {
        params.push(String(req.query.bin).replace(/\D/g, '').slice(0, 6) + '%');
        where.push(`ci.bin LIKE $${params.length}`);
      }

      params.push(limit); const limIdx = params.length;
      params.push(offset); const offIdx = params.length;

      const r = await dbService.pool.query(
        `SELECT ci.id, ci.user_id, ci.live_card_id, ci.bin, ci.cardholder_name,
                ci.pan_masked, ci.brand, ci.category, ci.issuer, ci.meta,
                ci.front_path, ci.back_path, ci.created_at,
                u.username, u.email
           FROM card_images ci
           LEFT JOIN users u ON u.id = ci.user_id
           ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
           ORDER BY ci.created_at DESC
           LIMIT $${limIdx} OFFSET $${offIdx}`,
        params
      );

      const rows = r.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        username: row.username,
        email: row.email,
        live_card_id: row.live_card_id,
        bin: row.bin,
        cardholder_name: row.cardholder_name,
        pan_masked: row.pan_masked,
        brand: row.brand,
        category: row.category,
        level: rawLevel({ category: row.category, type: row.meta?.type }),
        issuer: row.issuer,
        images: {
          front: `/card-images/${row.user_id}/${require('path').basename(row.front_path)}`,
          back:  `/card-images/${row.user_id}/${require('path').basename(row.back_path)}`,
        },
        meta: row.meta,
        created_at: row.created_at,
      }));

      res.json({ success: true, count: rows.length, images: rows });
    } catch (e) {
      console.error('[CARD-IMAGE-ARCHIVE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // DELETE /card-image/archive/:id
  // ============================================================
  router.delete('/card-image/archive/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const isAdmin = req.user.role === 'admin';
    try {
      const r = await dbService.pool.query(
        `SELECT * FROM card_images WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'}`,
        isAdmin ? [id] : [id, req.user.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Bulunamadı' });

      const row = r.rows[0];
      deleteFile(row.front_path);
      deleteFile(row.back_path);
      await dbService.pool.query('DELETE FROM card_images WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (e) {
      console.error('[CARD-IMAGE-DELETE]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};