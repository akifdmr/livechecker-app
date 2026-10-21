import { api } from './client';
import { normalizeBalance } from './normalize';
import type { Card, ChargeOperation } from './types';

export const cardsApi = {
  filterOptions: async () => {
    const { data } = await api.get('/live-cards/filter-options');
    return data as {
      countries: string[];
      banks: string[];
      statuses: string[];
      cardTypes: string[];
    };
  },

  list: async (params: Record<string, string> = {}) => {
    const { data } = await api.get('/live-cards', { params });
    return data;
  },

  get: async (id: number): Promise<Card> => {
    const { data } = await api.get(`/live-cards/${id}`);
    return data;
  },

  verify: async (card: string) => {
    const { data } = await api.post('/verify', { card });
    return data;
  },

  balanceCheck: async (
    card: string,
    amount: number,
    opts?: {
      provider?: string;
      refundAmount?: number;
      operation?: ChargeOperation;
    }
  ) => {
    const { data } = await api.post('/balance-check', {
      card,
      amount,
      provider: opts?.provider,
      refundAmount: opts?.refundAmount,
      operation: opts?.operation || 'preauth',
    });
    return normalizeBalance(data);
  },

  balanceCheckById: async (
    id: number,
    amount: number,
    opts?: {
      provider?: string;
      refundAmount?: number;
      operation?: ChargeOperation;
    }
  ) => {
    const { data } = await api.post(`/live-cards/${id}/balance-check`, {
      amount,
      provider: opts?.provider,
      refundAmount: opts?.refundAmount,
      operation: opts?.operation || 'preauth',
    });
    return normalizeBalance(data);
  },

  recheck: async (id: number) => {
    const { data } = await api.post(`/live-cards/${id}/recheck`);
    return data;
  },
};
