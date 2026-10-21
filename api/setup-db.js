require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./db');
const { migrate } = require('./services/MigrationService');

async function setup() {
  await migrate(pool);

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('ADMIN_EMAIL ve en az 12 karakterli ADMIN_PASSWORD env değişkenlerini ayarlayın.');
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(`
    INSERT INTO users(email, password_hash, role, is_active)
    VALUES($1,$2,'admin',true)
    ON CONFLICT(email) DO UPDATE SET is_active=true
  `, [email.toLowerCase(), hash]);

  console.log(`✅ Veritabanı ve RBAC hazır: ${email.toLowerCase()}`);
  await pool.end();
}

setup().catch(async err => {
  console.error('❌ DB setup başarısız:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
