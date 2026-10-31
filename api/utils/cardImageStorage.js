// ============================================================
// utils/cardImageStorage.js
// Üretilen görselleri diske kaydeder, public URL döner.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'public', 'card-images');

function ensureDir(userId) {
  const dir = path.join(ROOT, String(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function downloadAndSave(url, userId, side) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Görsel indirilemedi: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const uuid = crypto.randomBytes(8).toString('hex');
  const filename = `${uuid}-${side}.png`;
  const dir = ensureDir(userId);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buf);

  // Express static: app.use('/card-images', express.static('public/card-images'))
  return {
    diskPath: filePath,
    publicUrl: `/card-images/${userId}/${filename}`,
  };
}

function deleteFile(diskPath) {
  try {
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  } catch (e) {
    console.warn('[CARD-IMAGE-STORE] delete:', e.message);
  }
}

module.exports = { downloadAndSave, deleteFile };