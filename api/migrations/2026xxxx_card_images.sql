-- ============================================================
-- card_images — üretilen kart görselleri arşivi
-- ============================================================
CREATE TABLE IF NOT EXISTS card_images (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  live_card_id    INT REFERENCES live_cards_full(id) ON DELETE SET NULL,
  bin             VARCHAR(8)  NOT NULL,
  cardholder_name VARCHAR(120) NOT NULL,
  pan_masked      VARCHAR(32),
  brand           VARCHAR(40),
  category        VARCHAR(80),
  issuer          VARCHAR(120),
  front_path      TEXT NOT NULL,
  back_path       TEXT NOT NULL,
  meta            JSONB DEFAULT '{}'::jsonb,
  prompts         JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_images_user
  ON card_images(user_id, created_at DESC);