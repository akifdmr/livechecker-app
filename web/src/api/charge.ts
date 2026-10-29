// ============================================================
// src/api/charge.ts — birleşik sürüm
// Kart çekimi: charge / chargeById / execute
// Post-charge:  capture / void / refund
// History:      history
// ============================================================
import { api } from './client';
import { normalizeBalance } from './normalize';
import type { ChargePayload } from './types';

// ============================================================
// TYPES
// ============================================================
export type ChargeOperation = 'sale' | 'preauth' | 'live_check';

export type ChargeInput = {
  amount: number;
  currency?: string;
  provider?: string;
  operation?: ChargeOperation;   // default 'sale'
  autoFailover?: boolean;
  orderId?: string;
};

export type ChargeResult = {
  success: boolean;
  status: 'APPROVED' | 'LIVE' | 'DEAD' | 'ERROR' | 'UNKNOWN';
  reason: string;
  reasonShort?: string | null;
  reasonLong?: string | null;
  provider?: string | null;
  providerKey?: string | null;
  merchantId?: string | null;
  merchantName?: string | null;
  providerCode?: string | null;
  message?: string | null;
  authCode?: string | null;
  transactionId?: string | null;
  chargeId?: string | null;
  txnId?: number | null;         // ⭐ charge_audit.id — capture/void/refund için
  amount?: number;
  currency?: string;
  duration?: number;
  attempts?: Array<{
    provider: string;
    ok?: boolean;
    success: boolean;
    reason: string | null;
    status?: string | null;
    duration?: number | null;
  }>;
  finalProvider?: string | null;
  actedByAdmin?: boolean;
  cardOwnerUserId?: number | null;
  orderId?: string | null;
  operation?: ChargeOperation;
  raw?: any;
  [key: string]: any;
};

// ============================================================
// CHARGE API
// ============================================================
export const chargeApi = {
  // ----------------------------------------------------------
  // 1) MANUEL KART — PAN|exp|cvv|...
  // ----------------------------------------------------------
charge: async (card: string, input: ChargeInput): Promise<ChargeResult> => {
  const { data } = await api.post('/charge', { card, ...input, operation: input.operation || 'sale' });
  return normalizeBalance(data) as ChargeResult;
},

chargeById: async (cardId: number, input: ChargeInput): Promise<ChargeResult> => {
  const { data } = await api.post('/charge', { cardId, ...input, operation: input.operation || 'sale' });
  return normalizeBalance(data) as ChargeResult;
},

execute: async (payload: ChargePayload): Promise<ChargeResult> => {
  const { data } = await api.post('/charge', { ...payload, operation: (payload as any).operation || 'sale' });
  return normalizeBalance(data) as ChargeResult;
},

  // ----------------------------------------------------------
  // 4) PREAUTH SONRASI CAPTURE
  //    txnId = charge_audit.id (response.txnId)
  // ----------------------------------------------------------
  capture: async (txnId: number, amount: number) => {
    const { data } = await api.post(
      `/provider-transactions/${txnId}/capture`,
      { amount }
    );
    return data;
  },

  // ----------------------------------------------------------
  // 5) PREAUTH VOID
  // ----------------------------------------------------------
  void: async (txnId: number) => {
    const { data } = await api.post(
      `/provider-transactions/${txnId}/void`
    );
    return data;
  },

  // ----------------------------------------------------------
  // 6) KISMİ / TAM REFUND
  // ----------------------------------------------------------
  refund: async (txnId: number, amount: number) => {
    const { data } = await api.post(
      `/provider-transactions/${txnId}/refund`,
      { amount }
    );
    return data;
  },

  // ----------------------------------------------------------
  // 7) HISTORY
  // ----------------------------------------------------------
  history: async (filters: Record<string, any> = {}) => {
    const { data } = await api.get('/charge/history', { params: filters });
    return data;
  },
};