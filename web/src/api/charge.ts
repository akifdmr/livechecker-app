// ============================================================
// CHARGE API — kart işlemi + capture + void + refund
// ============================================================
import { api } from './client';
import { normalizeBalance } from './normalize';
import type { ChargePayload } from './types';

export const chargeApi = {
  /**
   * Tek kart için charge / preauth / sale / live_check
   */
  execute: async (payload: ChargePayload) => {
    const { data } = await api.post('/charge', payload);
    return normalizeBalance(data);
  },

  /**
   * Preauth sonrası capture (txnId = charge_audit.id)
   */
  capture: async (txnId: number, amount: number) => {
    const { data } = await api.post(
      `/provider-transactions/${txnId}/capture`,
      { amount }
    );
    return data;
  },

  /**
   * Preauth void
   */
  void: async (txnId: number) => {
    const { data } = await api.post(
      `/provider-transactions/${txnId}/void`
    );
    return data;
  },

  /**
   * Kısmi / tam refund
   */
  refund: async (txnId: number, amount: number) => {
    const { data } = await api.post(
      `/provider-transactions/${txnId}/refund`,
      { amount }
    );
    return data;
  },

  history: async (filters: Record<string, any> = {}) => {
    const { data } = await api.get('/charge/history', { params: filters });
    return data;
  },
};