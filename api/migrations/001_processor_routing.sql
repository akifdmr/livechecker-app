-- Processor routing: hangi BIN hangi provider ile işlenir
CREATE TABLE IF NOT EXISTS processor_routing (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  bin_prefix      VARCHAR(8)  NOT NULL,     -- '4', '51', '411111'
  provider        VARCHAR(50) NOT NULL,     -- 'moneris' | 'clover3' | 'authorize3'
  priority        INTEGER DEFAULT 10,       -- küçük = önce
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processor_routing_user ON processor_routing(user_id);
CREATE INDEX IF NOT EXISTS idx_processor_routing_bin  ON processor_routing(bin_prefix);

-- Charge/Auth transaction audit tablosu (yoksa)
CREATE TABLE IF NOT EXISTS charge_audit (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  card_id         INTEGER,
  provider        VARCHAR(50) NOT NULL,
  action          VARCHAR(30) NOT NULL,     -- 'auth' | 'capture' | 'refund' | 'void' | 'sale'
  amount          NUMERIC(12,2),
  currency        VARCHAR(3) DEFAULT 'USD',
  refunded_amount NUMERIC(12,2) DEFAULT 0,
  status          VARCHAR(20),              -- 'approved' | 'declined' | 'error'
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

CREATE INDEX IF NOT EXISTS idx_charge_audit_user    ON charge_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charge_audit_parent  ON charge_audit(parent_id);
CREATE INDEX IF NOT EXISTS idx_charge_audit_status  ON charge_audit(status);