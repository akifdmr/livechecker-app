-- ============================================================
-- DEAD sebebi + charge fail explanation
-- ============================================================

-- Kart bazlı son DEAD sebebi
ALTER TABLE live_cards_full
  ADD COLUMN IF NOT EXISTS dead_reason VARCHAR(80);
ALTER TABLE live_cards_full
  ADD COLUMN IF NOT EXISTS dead_message TEXT;
ALTER TABLE live_cards_full
  ADD COLUMN IF NOT EXISTS dead_at TIMESTAMPTZ;

-- Sayaç
ALTER TABLE live_cards_full
  ADD COLUMN IF NOT EXISTS total_declined_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_live_cards_dead_reason ON live_cards_full(dead_reason);

-- charge_audit: kullanıcı dostu açıklama
ALTER TABLE charge_audit
  ADD COLUMN IF NOT EXISTS display_reason VARCHAR(120);
ALTER TABLE charge_audit
  ADD COLUMN IF NOT EXISTS display_message TEXT;