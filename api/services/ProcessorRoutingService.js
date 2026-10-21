// ============================================================
// PROCESSOR ROUTING SERVICE
//   - DB tabanlı BIN → provider yönlendirmesi
//   - config.PROVIDERS[x].enabled doğrulaması
//   - BALANCE_CHECK.providerPriority failover zinciri
// ============================================================
const db = require('../db');
const CONFIG = require('../config');
const { providerConfigEntries } = require('../utils/providerConfigEntries');

function providerConfigMap() {
  return new Map(providerConfigEntries(CONFIG.PROVIDERS || {}));
}

// Geçerli & aktif provider anahtarları (config'ten türetilir)
function enabledProviders() {
  const out = [];
  for (const [key, cfg] of providerConfigEntries(CONFIG.PROVIDERS || {})) {
    if (cfg && cfg.enabled !== false) out.push(key);
  }
  return out;
}

// Alias normalizasyonu: 'clover' → 'clover3', 'authorize' → 'authorize3'
function normalizeProviderKey(key) {
  if (!key) return null;
  const k = String(key).toLowerCase().trim();
  const aliases = {
    clover: 'clover3',
    authorize: 'authorize3',
    authorize_net: 'authorize3',
    moneris: 'moneris',
    stripe: 'stripe',
  };
  return aliases[k] || k;
}

// Provider gerçekten config'te tanımlı ve enabled mı?
function isProviderEnabled(key) {
  const norm = normalizeProviderKey(key);
  if (!norm) return false;
  const cfg = providerConfigMap().get(norm);
  return !!(cfg && cfg.enabled !== false);
}

class ProcessorRoutingService {
  // ============================================================
  // resolveProvider — tek provider (geriye dönük uyumlu API)
  //   1) DB'de BIN eşleşmesi + is_active → o
  //   2) DB sonucu pasifse veya yoksa → BALANCE_CHECK.provider
  //   3) O da pasifse → zincirdeki ilk aktif provider
  //   4) Hiçbiri yoksa → fallbackProvider
  // ============================================================
  async resolveProvider(userId, pan, fallbackProvider = null) {
    const chain = await this.resolveProviderChain(userId, pan, fallbackProvider);
    return chain[0] || fallbackProvider || 'clover3';
  }

  // ============================================================
  // resolveProviderChain — sıralı provider listesi (failover)
  //   Örnek dönüş: ['clover3', 'moneris']
  // ============================================================
  async resolveProviderChain(userId, pan, fallbackProvider = null) {
    const cleanPan = String(pan || '').replace(/\D/g, '');
    const defaultProvider =
      normalizeProviderKey(CONFIG.BALANCE_CHECK?.provider) ||
      normalizeProviderKey(fallbackProvider) ||
      'clover3';

    const configuredChain = Array.isArray(CONFIG.BALANCE_CHECK?.providerPriority)
      ? CONFIG.BALANCE_CHECK.providerPriority.map(normalizeProviderKey).filter(Boolean)
      : [];

    const chain = [];
    const pushUnique = (key) => {
      const norm = normalizeProviderKey(key);
      if (!norm) return;
      if (chain.includes(norm)) return;
      if (!isProviderEnabled(norm)) return;
      chain.push(norm);
    };

    // 1) DB routing (BIN prefix) — en spesifik eşleşme
    if (cleanPan.length >= 6) {
      try {
        const r = await db.pool.query(
          `SELECT provider FROM processor_routing
            WHERE user_id = $1
              AND is_active = TRUE
              AND $2 LIKE bin_prefix || '%'
            ORDER BY LENGTH(bin_prefix) DESC, priority ASC
            LIMIT 1`,
          [userId, cleanPan]
        );
        const dbProvider = r.rows[0]?.provider;
        if (dbProvider && isProviderEnabled(dbProvider)) {
          pushUnique(dbProvider);
        }
      } catch (e) {
        console.warn('[PROCESSOR-ROUTING] resolve hatası:', e.message);
      }
    }

    // 2) Config default (BALANCE_CHECK.provider)
    pushUnique(defaultProvider);

    // 3) Config zinciri (failover)
    for (const key of configuredChain) pushUnique(key);

    // 4) Fallback — kullanıcı verdiği provider (aktifse)
    if (fallbackProvider) pushUnique(fallbackProvider);

    // 5) Hiçbir şey çıkmadıysa tüm enabled providerları sırayla ekle
    if (chain.length === 0) {
      for (const key of enabledProviders()) pushUnique(key);
    }

    return chain;
  }

  // ============================================================
  // list / create / update / delete — mevcut davranış korundu
  // (+ provider validasyonu eklendi)
  // ============================================================
  async list(userId) {
    const r = await db.pool.query(
      `SELECT * FROM processor_routing WHERE user_id = $1 ORDER BY priority, id`,
      [userId]
    );
    return r.rows;
  }

  async create(userId, { name, bin_prefix, provider, priority, notes }) {
    if (!name || !bin_prefix || !provider) {
      throw new Error('name, bin_prefix, provider gerekli');
    }

    const cleanBin = String(bin_prefix).replace(/\D/g, '');
    if (!cleanBin) throw new Error('bin_prefix geçersiz');

    const normProvider = normalizeProviderKey(provider);
    if (!isProviderEnabled(normProvider)) {
      throw new Error(
        `provider geçersiz veya pasif: ${provider} ` +
        `(aktif olanlar: ${enabledProviders().join(', ')})`
      );
    }

    const r = await db.pool.query(
      `INSERT INTO processor_routing
         (user_id, name, bin_prefix, provider, priority, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, name, cleanBin, normProvider, priority || 10, notes || null]
    );
    return r.rows[0];
  }

  async update(userId, id, patch) {
    const fields = [];
    const values = [];
    let i = 1;

    const allowed = ['name', 'bin_prefix', 'provider', 'priority', 'is_active', 'notes'];
    for (const k of allowed) {
      if (patch[k] === undefined) continue;

      let value = patch[k];

      if (k === 'bin_prefix') {
        value = String(value).replace(/\D/g, '');
        if (!value) throw new Error('bin_prefix geçersiz');
      }

      if (k === 'provider') {
        const norm = normalizeProviderKey(value);
        if (!isProviderEnabled(norm)) {
          throw new Error(
            `provider geçersiz veya pasif: ${value} ` +
            `(aktif olanlar: ${enabledProviders().join(', ')})`
          );
        }
        value = norm;
      }

      fields.push(`${k} = $${i++}`);
      values.push(value);
    }

    if (!fields.length) throw new Error('Değişiklik yok');

    fields.push(`updated_at = NOW()`);
    values.push(id, userId);

    const r = await db.pool.query(
      `UPDATE processor_routing SET ${fields.join(', ')}
        WHERE id = $${i} AND user_id = $${i + 1}
        RETURNING *`,
      values
    );
    return r.rows[0];
  }

  async delete(userId, id) {
    await db.pool.query(
      'DELETE FROM processor_routing WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
  }
}

module.exports = ProcessorRoutingService;
