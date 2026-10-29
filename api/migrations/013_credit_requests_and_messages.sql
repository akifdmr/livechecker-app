CREATE TABLE IF NOT EXISTS credit_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_amount NUMERIC(12,2) NOT NULL CHECK (requested_amount > 0),
  message VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_amount NUMERIC(12,2),
  admin_note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_requests_one_pending_per_user
  ON credit_requests(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_credit_requests_status_date
  ON credit_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role VARCHAR(10) NOT NULL CHECK (sender_role IN ('user', 'admin')),
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_messages_thread_date
  ON support_messages(user_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_support_messages_unread
  ON support_messages(user_id, sender_role, read_at);
