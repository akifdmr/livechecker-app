CREATE TABLE IF NOT EXISTS processor_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  processor_name VARCHAR(160) NOT NULL,
  account_name VARCHAR(160) NOT NULL,
  domain TEXT,
  credentials_encrypted JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processor_accounts_user
  ON processor_accounts(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_processor_accounts_name
  ON processor_accounts(user_id, processor_name);
