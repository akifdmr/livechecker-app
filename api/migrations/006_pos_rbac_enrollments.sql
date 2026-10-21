-- ============================================================
-- POS / RBAC / PAYMENT-METHOD ENROLLMENT
-- Safe storage: external payment tokens only. Never store PAN/CVV.
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  permission_key VARCHAR(120) UNIQUE NOT NULL,
  label VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS card_enrollments (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  live_card_id INTEGER NULL,
  provider VARCHAR(50) NOT NULL,
  external_payment_method_id VARCHAR(255) NOT NULL,
  brand VARCHAR(30),
  last4 VARCHAR(4),
  exp_month VARCHAR(2),
  exp_year VARCHAR(4),
  enrollment_url TEXT,
  login_reference VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, external_payment_method_id)
);

CREATE INDEX IF NOT EXISTS idx_card_enrollments_user ON card_enrollments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_enrollments_card ON card_enrollments(live_card_id);
CREATE INDEX IF NOT EXISTS idx_card_enrollments_status ON card_enrollments(status);

CREATE TABLE IF NOT EXISTS merchant_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  card_enrollment_id BIGINT REFERENCES card_enrollments(id) ON DELETE SET NULL,
  provider VARCHAR(50) NOT NULL,
  provider_transaction_id VARCHAR(255),
  parent_transaction_id BIGINT REFERENCES merchant_transactions(id),
  operation VARCHAR(30) NOT NULL,
  status VARCHAR(40) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  order_id VARCHAR(120),
  invoice_number VARCHAR(120),
  idempotency_key VARCHAR(120),
  error_code VARCHAR(120),
  error_message TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_tx_user_date ON merchant_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_tx_provider_id ON merchant_transactions(provider, provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_merchant_tx_status ON merchant_transactions(status);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  resource_type VARCHAR(80),
  resource_id VARCHAR(120),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed action permissions
INSERT INTO permissions(permission_key, label) VALUES
('dashboard.view','Dashboard görüntüleme'),
('users.view','Kullanıcıları görüntüleme'),
('users.manage','Kullanıcı/rol yönetimi'),
('enrollments.view','Enrollments görüntüleme'),
('enrollments.manage','Enrollment oluşturma/düzenleme'),
('payments.view','Ödeme geçmişini görüntüleme'),
('payments.sale','Sale/ödeme alma'),
('payments.preauth','Provizyon alma'),
('payments.capture','Capture'),
('payments.refund','Refund'),
('payments.void','Void'),
('providers.view','Provider durumlarını görüntüleme'),
('providers.manage','Provider ayarlarını yönetme'),
('routing.manage','Processor routing yönetimi'),
('reports.view','Raporları görüntüleme'),
('bin.view','BIN metadata görüntüleme'),
('subscriptions.precheck','Abonelik ön kontrolü')
ON CONFLICT(permission_key) DO NOTHING;

INSERT INTO roles(name, description) VALUES
('admin','Tam sistem yöneticisi'),
('operator','POS operasyon kullanıcısı'),
('finance','Capture/refund/void ve finans işlemleri'),
('viewer','Salt okunur kullanıcı'),
('checker','BIN ve ön kontrol kullanıcısı')
ON CONFLICT(name) DO NOTHING;

-- Legacy role -> RBAC role migration
INSERT INTO user_roles(user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = CASE
  WHEN u.role IN ('admin','operator','finance','viewer') THEN u.role
  ELSE 'operator'
END
ON CONFLICT DO NOTHING;

-- Admin: all permissions
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='admin'
ON CONFLICT DO NOTHING;

-- Operator: POS + view
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'dashboard.view','enrollments.view','enrollments.manage','payments.view',
  'payments.sale','payments.preauth','providers.view','reports.view'
) WHERE r.name='operator'
ON CONFLICT DO NOTHING;

-- Finance
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'dashboard.view','enrollments.view','payments.view','payments.capture',
  'payments.refund','payments.void','providers.view','reports.view'
) WHERE r.name='finance'
ON CONFLICT DO NOTHING;

-- Viewer
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'dashboard.view','enrollments.view','payments.view','providers.view','reports.view'
) WHERE r.name='viewer'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'dashboard.view','bin.view','subscriptions.precheck','reports.view'
) WHERE r.name='checker'
ON CONFLICT DO NOTHING;
