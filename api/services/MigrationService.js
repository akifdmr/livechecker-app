const fs = require('fs');
const path = require('path');

async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const filename of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if (done.rowCount) continue;

    const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
      await pool.query('COMMIT');
      console.log(`[MIGRATION] OK ${filename}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw new Error(`${filename}: ${err.message}`);
    }
  }
}

module.exports = { migrate };
