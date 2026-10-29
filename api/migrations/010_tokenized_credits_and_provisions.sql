-- Additive payment metadata for the existing tokenized enrollment flow.
-- Payment credentials remain in the existing encrypted processor vault;
-- payment methods are referenced through card_enrollments only.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credits NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  balance_after NUMERIC(12,2) NOT NULL CHECK (balance_after >= 0),
  entry_type VARCHAR(30) NOT NULL,
  reference_type VARCHAR(60),
  reference_id VARCHAR(120),
  idempotency_key VARCHAR(120),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_ledger_user_idempotency_unique
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_date
  ON credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_reference
  ON credit_ledger(reference_type, reference_id);

-- Non-secret settings only. Provider credentials stay in processor_accounts
-- (encrypted) or the provider's documented environment configuration.
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A provision is a provider-side authorization reached through an existing
-- tokenized enrollment. This table intentionally has no PAN/CVV/token columns.
CREATE TABLE IF NOT EXISTS provisions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_enrollment_id BIGINT NOT NULL REFERENCES card_enrollments(id) ON DELETE RESTRICT,
  provider VARCHAR(50) NOT NULL,
  network_ref VARCHAR(255),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  captured_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (captured_total >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  failure_code VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, network_ref)
);

CREATE INDEX IF NOT EXISTS idx_provisions_owner_date
  ON provisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provisions_status
  ON provisions(status);

