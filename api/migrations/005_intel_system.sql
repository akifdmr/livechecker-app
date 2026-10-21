-- ============================================================
-- API KEYS TABLOSU (PostgreSQL uyumlu)
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  service VARCHAR(50) UNIQUE NOT NULL,
  api_key VARCHAR(500),
  api_url VARCHAR(500),
  key_required INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service);

-- ============================================================
-- INTEL QUERIES — Sorgu geçmişi
-- ============================================================
CREATE TABLE IF NOT EXISTS intel_queries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_type VARCHAR(20) NOT NULL,     -- 'ip' | 'domain' | 'email' | 'phone' | 'iban'
  query_value VARCHAR(500) NOT NULL,
  services JSONB,                       -- ['shodan', 'virustotal']
  results JSONB,                        -- { shodan: {...}, virustotal: {...} }
  risk_score INTEGER DEFAULT 0,         -- 0-100
  risk_level VARCHAR(20),               -- 'low' | 'medium' | 'high' | 'critical'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intel_user ON intel_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_intel_type ON intel_queries(query_type);
CREATE INDEX IF NOT EXISTS idx_intel_date ON intel_queries(created_at);
