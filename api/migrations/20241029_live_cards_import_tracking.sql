ALTER TABLE live_cards_full
  ADD COLUMN IF NOT EXISTS last_imported_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_lcf_last_imported
  ON live_cards_full (last_imported_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_lcf_pan_user
  ON live_cards_full (pan, user_id);

CREATE INDEX IF NOT EXISTS idx_charge_audit_live_card
  ON charge_audit (live_card_id, created_at DESC)
  WHERE live_card_id IS NOT NULL;