CREATE TABLE IF NOT EXISTS processor_dump_metadata (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  source_line INTEGER NOT NULL,
  status_code VARCHAR(16),
  ash_status_code VARCHAR(16),
  status_description VARCHAR(80),
  amount_minor BIGINT,
  currency_code VARCHAR(3),
  transaction_type VARCHAR(16),
  mti VARCHAR(8),
  credit_terms SMALLINT,
  brand_code VARCHAR(16),
  card_type_code VARCHAR(16),
  response_code VARCHAR(8),
  pan_entry_mode VARCHAR(8),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processor_dump_metadata_user_imported
  ON processor_dump_metadata (user_id, imported_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_processor_dump_metadata_batch
  ON processor_dump_metadata (batch_id);
