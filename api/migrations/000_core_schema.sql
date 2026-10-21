
-- ============================================================
-- CORE SCHEMA — deterministic fresh install
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'operator',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS card_checks (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  pan_hash VARCHAR(64),
  pan_masked VARCHAR(25),
  exp_month VARCHAR(2),
  exp_year VARCHAR(4),
  cvv_hash VARCHAR(64),
  brand VARCHAR(20),
  status VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  reason VARCHAR(120),
  provider VARCHAR(50),
  bin_data JSONB DEFAULT '{}'::jsonb,
  checks JSONB DEFAULT '{}'::jsonb,
  transaction JSONB DEFAULT '{}'::jsonb,
  duration_ms INTEGER DEFAULT 0,
  raw_response JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_cards_full (
  id BIGSERIAL PRIMARY KEY,
  pan TEXT UNIQUE,
  exp VARCHAR(10),
  cvv TEXT,
  type VARCHAR(30),
  level VARCHAR(50),
  banka VARCHAR(255),
  country VARCHAR(100),
  name VARCHAR(255),
  address TEXT,
  city VARCHAR(120),
  state VARCHAR(120),
  zip VARCHAR(30),
  phone VARCHAR(50),
  email VARCHAR(255),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  check_count INTEGER DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  balance_status VARCHAR(30),
  status VARCHAR(20) DEFAULT 'LIVE',
  last_provider VARCHAR(50),
  last_txn_at TIMESTAMPTZ,
  total_auth NUMERIC(12,2) DEFAULT 0,
  total_captured NUMERIC(12,2) DEFAULT 0,
  total_sold NUMERIC(12,2) DEFAULT 0,
  total_refunded NUMERIC(12,2) DEFAULT 0,
  last_auth_at TIMESTAMPTZ
);


CREATE TABLE IF NOT EXISTS check_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  total_cards INTEGER,
  live_count INTEGER DEFAULT 0,
  dead_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  provider_stats JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS charges (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  pan_hash VARCHAR(64),
  pan_masked VARCHAR(25),
  amount NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'USD',
  provider VARCHAR(50),
  charge_id VARCHAR(255),
  auth_code VARCHAR(50),
  status VARCHAR(30),
  voided_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_checks_created ON card_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_checks_user ON card_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_live_cards_user ON live_cards_full(user_id);
CREATE INDEX IF NOT EXISTS idx_charges_status ON charges(status);
