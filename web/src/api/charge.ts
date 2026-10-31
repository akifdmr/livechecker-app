// ============================================================
// src/api/charge.ts — birleşik sürüm
// ⭐ 403/401 → provider_config_error olarak normalize edilir.
// ============================================================
import { api } from './client';
import { normalizeBalance } from './normalize';
import type { ChargePayload } from './types';

export type ChargeOperation = 'sale' | 'preauth' | 'live_check';

export type ChargeInput = {
  amount: number;
  currency?: string;
  provider?: string;
  operation?: ChargeOperation;
  autoFailover?: boolean;
  orderId?: string;
};

export type ChargeResult = {
  success: boolean;
  status: 'APPROVED' | 'LIVE' | 'DEAD' | 'ERROR' | 'UNKNOWN' | (string & {});
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
  txnId?: number | null;
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
// ⭐ ORTAK WRAPPER — 403/401 → provider_config_error
// ============================================================
async function wrapCharge(p: Promise<{ data: any }>): Promise<ChargeResult> {
  try {
    const { data } = await p;
    return normalizeBalance(data) as unknown as ChargeResult;
  } catch (e: any) {
    const httpStatus = e?.response?.status;
    const body = e?.response?.data;
    const msg = body?.message || body?.error || e?.message || 'İşlem başarısız';

    // 403/401 → credential / IP whitelist sorunu
    if (httpStatus === 403 || httpStatus === 401) {
      console.error('[CHARGE] 🔒 403/401', { body, msg });
      return {
        success: false,
        status: 'ERROR',
        reason: 'provider_config_error',
        reasonShort: 'Provider kimlik hatası',
        reasonLong:
          'Provider API 403/401 döndü. Credential (API key / transaction key / merchant ID) ' +
          'veya IP whitelist kontrolü gerekli.',
        message: msg,
        raw: body,
      } as ChargeResult;
    }

    throw e;
  }
}

// ============================================================
// CHARGE API
// ============================================================
export const chargeApi = {
  charge: (card: string, input: ChargeInput) =>
    wrapCharge(api.post('/charge', {
      card, ...input, operation: input.operation || 'sale',
    })),

  chargeById: (cardId: number, input: ChargeInput) =>
    wrapCharge(api.post('/charge', {
      cardId, ...input, operation: input.operation || 'sale',
    })),

  execute: (payload: ChargePayload) =>
    wrapCharge(api.post('/charge', {
      ...payload, operation: (payload as any).operation || 'sale',
    })),

  capture: async (txnId: number, amount: number) => {
    const { data } = await api.post(
      `/provider-transactions/${txnId}/capture`, { amount }
    );
    return data;
  },

  void: async (txnId: number) => {
    const { data } = await api.post(`/provider-transactions/${txnId}/void`);
    return data;
  },

  refund: async (txnId: number, amount: number) => {
    const { data } = await api.post(
      `/provider-transactions/${txnId}/refund`, { amount }
    );
    return data;
  },

  history: async (filters: Record<string, any> = {}) => {
    const { data } = await api.get('/charge/history', { params: filters });
    return data;
  },
};