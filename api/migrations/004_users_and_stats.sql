-- ============================================================
-- BIN CHECKS TABLOSU
-- ============================================================
CREATE TABLE IF NOT EXISTS bin_checks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bin VARCHAR(8) NOT NULL,
  brand VARCHAR(50),
  type VARCHAR(50),
  category VARCHAR(50),
  issuer VARCHAR(255),
  country VARCHAR(100),
  raw_response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bin_checks_user ON bin_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_bin_checks_date ON bin_checks(created_at);
CREATE INDEX IF NOT EXISTS idx_bin_checks_bin ON bin_checks(bin);

-- ============================================================
-- LIVE_CARDS_FULL — checked_by_user_id EKLE
-- ============================================================
ALTER TABLE live_cards_full 
  ADD COLUMN IF NOT EXISTS checked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_live_cards_checked_by ON live_cards_full(checked_by_user_id);
