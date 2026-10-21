-- ============================================================
-- LiveCheck $0 + Provider tracking + Kart toplamları + charge_audit
-- ============================================================

ALTER TABLE live_cards_full ADD COLUMN IF NOT EXISTS status          VARCHAR(10) DEFAULT 'LIVE';
ALTER TABLE live_cards_full ADD COLUMN IF NOT EXISTS last_provider   VARCHAR(50);
ALTER TABLE live_cards_full ADD COLUMN IF NOT EXISTS last_txn_at     TIMESTAMPTZ;
ALTER TABLE live_cards_full ADD COLUMN IF NOT EXISTS total_auth      NUMERIC(12,2) DEFAULT 0;
ALTER TABLE live_cards_full ADD COLUMN IF NOT EXISTS total_captured  NUMERIC(12,2) DEFAULT 0;
ALTER TABLE live_cards_full ADD COLUMN IF NOT EXISTS total_sold      NUMERIC(12,2) DEFAULT 0;
ALTER TABLE live_cards_full ADD COLUMN IF NOT EXISTS total_refunded  NUMERIC(12,2) DEFAULT 0;
ALTER TABLE live_cards_full ADD COLUMN IF NOT EXISTS last_auth_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_live_cards_status  ON live_cards_full(status);
CREATE INDEX IF NOT EXISTS idx_live_cards_updated ON live_cards_full(last_checked_at DESC NULLS LAST);

ALTER TABLE card_checks ADD COLUMN IF NOT EXISTS provider VARCHAR(50);

CREATE TABLE IF NOT EXISTS charge_audit (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  live_card_id    INTEGER,
  provider        VARCHAR(50) NOT NULL,
  action          VARCHAR(30) NOT NULL,
  operation       VARCHAR(20),
  amount          NUMERIC(12,2),
  currency        VARCHAR(3) DEFAULT 'USD',
  refunded_amount NUMERIC(12,2) DEFAULT 0,
  status          VARCHAR(20),
  reason          TEXT,
  provider_txn_id VARCHAR(120),
  parent_id       INTEGER REFERENCES charge_audit(id),
  pan_masked      VARCHAR(25),
  bin             VARCHAR(8),
  brand           VARCHAR(20),
  raw             JSONB,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 001 may have created the legacy audit-table shape without this
-- column. Add it before creating its index so clean installs are repeatable.
ALTER TABLE charge_audit ADD COLUMN IF NOT EXISTS live_card_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_charge_audit_user   ON charge_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charge_audit_live   ON charge_audit(live_card_id);
CREATE INDEX IF NOT EXISTS idx_charge_audit_status ON charge_audit(status);

CREATE TABLE IF NOT EXISTS processor_routing (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  bin_prefix  VARCHAR(8)   NOT NULL,
  provider    VARCHAR(50)  NOT NULL,
  priority    INTEGER DEFAULT 10,
  is_active   BOOLEAN DEFAULT TRUE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processor_routing_user ON processor_routing(user_id);
CREATE INDEX IF NOT EXISTS idx_processor_routing_bin  ON processor_routing(bin_prefix);
