// ============================================================
// API TYPES — tüm arayüz tipleri
// ============================================================

export interface FavList {
  id: number;
  name: string;
  bins: string[];
  color: string;
  cardCount?: number;
  binStats?: { bin: string; count: number }[];
}

export interface Card {
  id: number;
  pan: string;
  exp: string;
  cvv: string;
  banka?: string;
  name?: string;
  country?: string;
  type?: string;
  level?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  favLists?: { id: number; name: string; color: string }[];
  check_count?: number;
  last_checked_at?: string;
  checked_by_email?: string;
  proxy?: string | null;
  checks?: any;

  // Status + dead
  status?: 'LIVE' | 'DEAD' | 'UNKNOWN' | 'ERROR';
  last_provider?: string | null;
  last_txn_at?: string | null;
  total_auth?: number;
  total_captured?: number;
  total_sold?: number;
  total_refunded?: number;
  dead_reason?: string | null;
  dead_message?: string | null;
  dead_at?: string | null;
  dead_reason_short?: string | null;
  dead_reason_long?: string | null;
  total_declined_count?: number;

  // Charge istatistikleri
  total_txn_count?: number;
  success_txn_count?: number;
  failed_txn_count?: number;
  last_decline_reason?: string | null;
  last_decline_message?: string | null;
  last_decline_at?: string | null;
  last_decline_reason_short?: string | null;
  last_decline_reason_long?: string | null;
}

export interface ProcessorRule {
  id: number;
  user_id: number;
  name: string;
  bin_prefix: string;
  provider: string;
  priority: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: number;
  user_id: number;
  account_name: string;
  account_number?: string;
  account_last4?: string;
  routing_number: string;
  account_type: 'checking' | 'savings';
  bank_name?: string;
  bank_city?: string;
  bank_state?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  email?: string;
  ein_number?: string;
  balance?: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoadCard {
  id: number;
  user_id: number;
  card_number: string;
  card_number_masked?: string;
  card_holder_name: string;
  card_exp?: string;
  card_cvv?: string;
  card_brand?: string;
  card_bank?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  email?: string;
  agent_first_name?: string;
  agent_last_name?: string;
  agent_phone?: string;
  agent_email?: string;
  agent_notes?: string;
  mobile_username?: string;
  mobile_bank?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Load {
  id: number;
  user_id: number;
  load_card_id: number;
  bank_account_id?: number;
  amount: number;
  currency: string;
  load_date: string;
  method?: string;
  reference?: string;
  notes?: string;
  card_number?: string;
  card_holder_name?: string;
  account_name?: string;
  bank_name?: string;
  created_at: string;
}

export interface Collection {
  id: number;
  user_id: number;
  load_card_id: number;
  amount: number;
  currency: string;
  collection_date: string;
  method?: string;
  reference?: string;
  notes?: string;
  card_number?: string;
  card_holder_name?: string;
  created_at: string;
}

export interface CardBalance {
  load_card_id: number;
  user_id: number;
  card_number: string;
  card_holder_name: string;
  agent_first_name?: string;
  agent_last_name?: string;
  total_loaded: number;
  total_collected: number;
  remaining: number;
  load_count: number;
  last_load_date?: string;
  last_collection_date?: string;
}

// ---------------- Charge / Balance ----------------
export interface BalanceResult {
  success: boolean;
  status: string;
  reason: string;
  reasonShort: string | null;
  reasonLong: string | null;
  severity: string | null;
  rawMessage: string | null;
  provider: string | null;
  providerKey: string | null;        // ⭐ EKLENDİ
  providerCode: string | null;       // ⭐ EKLENDİ (hata sebebi)
  message: string | null;
  providerMessage: string | null;
  operation: string | null;
  amount: number;
  currency: string;
  authCode: string | null;
  transactionId: string | null;
  txnId: number | null;
  refundedAmount: number;
  netAmount: number | null;
  capturedAmount?: number;           // ⭐ opsiyonel
  voided: boolean;
  error: any;
  bin: any;
  attempts: any[];
  duration: number | null;
  raw: any;
}

export type ChargeOperation = 'live_check' | 'preauth' | 'sale';

export interface ChargePayload {
  card: string;
  amount: number;
  provider?: string;
  operation?: ChargeOperation;
  refundAmount?: number;
  capture?: boolean;
  liveCardId?: number;
}

// ---------------- Check stream ----------------
export interface CheckStreamOpts {
  provider?: string;
  operation?: 'live_check' | 'preauth';
  amount?: number;
}

// ---------------- Intel ----------------
export interface ApiKeyInfo {
  service: string;
  key_preview: string | null;
  api_url: string;
  key_required: number;
  is_active: number;
  updated_at: string;
}

export interface IntelQueryResult {
  ip?: string;
  domain?: string;
  email?: string;
  phone?: string;
  services: Record<string, any>;
  risk?: { score: number; level: string; reasons: string[] };
}
