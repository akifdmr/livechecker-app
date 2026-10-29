require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./db');
const { migrate } = require('./services/MigrationService');

async function setup() {
  await migrate(pool);

  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null;
  const username = String(process.env.ADMIN_USERNAME || email?.split('@')[0] || '')
    .trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32);
  const password = process.env.ADMIN_PASSWORD;
  if (!/^[a-z0-9_.-]{3,32}$/.test(username) || !password || password.length < 12) {
    throw new Error('Geçerli ADMIN_USERNAME (veya ADMIN_EMAIL kullanıcı adı) ve en az 12 karakterli ADMIN_PASSWORD env değişkenlerini ayarlayın.');
  }

  const hash = await bcrypt.hash(password, 12);
  const existingAdmin = email
    ? await pool.query('SELECT id FROM users WHERE lower(email)=$1 LIMIT 1', [email])
    : await pool.query('SELECT id FROM users WHERE lower(username)=$1 LIMIT 1', [username]);
  if (existingAdmin.rowCount) {
    await pool.query("UPDATE users SET is_active=true, role='admin' WHERE id=$1", [existingAdmin.rows[0].id]);
  } else {
    await pool.query(`
      INSERT INTO users(username, email, password_hash, role, is_active)
      VALUES($1,$2,$3,'admin',true)
    `, [username, email, hash]);
  }

  console.log(`✅ Veritabanı ve RBAC hazır: ${username}`);
  await pool.end();
}

setup().catch(async err => {
  console.error('❌ DB setup başarısız:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
