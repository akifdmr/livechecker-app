require('dotenv').config();
const { pool } = require('./db');
const { migrate } = require('./services/MigrationService');

migrate(pool)
  .then(() => pool.end())
  .catch(async err => {
    console.error('[MIGRATION] FAILED:', err.message);
    try { await pool.end(); } catch {}
    process.exit(1);
  });
