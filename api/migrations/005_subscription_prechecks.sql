CREATE TABLE IF NOT EXISTS subscription_prechecks (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  live_card_id INTEGER NOT NULL REFERENCES live_cards_full(id) ON DELETE CASCADE,
  outcome VARCHAR(20) NOT NULL,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_prechecks_user_date
  ON subscription_prechecks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_prechecks_card_date
  ON subscription_prechecks(live_card_id, created_at DESC);
