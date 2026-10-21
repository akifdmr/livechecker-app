import { api } from './client';

export interface ProviderTxnSummaryParams {
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
  scope?: 'mine' | 'all';
}

export interface ProviderTxnFilters {
  provider?: string;
  action?: string;
  status?: string;
  cardId?: number;
  pan?: string;
  dateFrom?: string;
  dateTo?: string;
  onlyVoidable?: boolean;
  onlyCapturable?: boolean;
  onlyRefundable?: boolean;
  limit?: number;
  offset?: number;
  scope?: 'mine' | 'all';
}

export const providerTransactionsApi = {
  summary: async (params: ProviderTxnSummaryParams = {}) => {
    const { data } = await api.get(
      '/provider-transactions/summary',
      { params }
    );

    return data;
  },

  list: async (filters: ProviderTxnFilters = {}) => {
    const { data } = await api.get(
      '/provider-transactions',
      { params: filters }
    );

    return data;
  },

  void: async (id: number) => {
    const { data } = await api.post(
      `/provider-transactions/${id}/void`
    );

    return data;
  },

  capture: async (id: number, amount: number) => {
    const { data } = await api.post(
      `/provider-transactions/${id}/capture`,
      { amount }
    );

    return data;
  },

  refund: async (
    id: number,
    payload: {
      amount?: number;
      fullRefund?: boolean;
    } = {}
  ) => {
    const { data } = await api.post(
      `/provider-transactions/${id}/refund`,
      payload
    );

    return data;
  },
};