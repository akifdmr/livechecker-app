// utils/hash.js
const crypto = require('crypto');
const config = require('../config');

const HASH_SECRET = config.HASH_SECRET || 'change-this-in-production';

function hashPan(pan) {
  if (!pan) return null;
  const clean = String(pan).replace(/\D/g, '');
  return crypto
    .createHmac('sha256', HASH_SECRET)
    .update(clean)
    .digest('hex');
}

function hashCvv(cvv) {
  if (!cvv) return null;
  return crypto
    .createHmac('sha256', HASH_SECRET)
    .update(String(cvv))
    .digest('hex');
}

function maskPan(pan) {
  if (!pan) return null;
  const clean = String(pan).replace(/\D/g, '');
  return clean.slice(0, 6) + '****' + clean.slice(-4);
}

module.exports = { hashPan, hashCvv, maskPan };