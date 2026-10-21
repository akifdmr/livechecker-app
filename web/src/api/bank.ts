import { api } from './client';

export const bankApi = {
  list: async () => {
    const { data } = await api.get('/bank-accounts');
    return data.accounts || [];
  },
  get: async (id: number) => {
    const { data } = await api.get(`/bank-accounts/${id}`);
    return data;
  },
  create: async (payload: any) => {
    const { data } = await api.post('/bank-accounts', payload);
    return data;
  },
  update: async (id: number, payload: any) => {
    const { data } = await api.put(`/bank-accounts/${id}`, payload);
    return data;
  },
  delete: async (id: number) => {
    await api.delete(`/bank-accounts/${id}`);
  },
};

export const routingApi = {
  lookup: async (routing: string) => {
    const { data } = await api.get(`/routing/${routing}`);
    return data;
  },
};

export const processorAccountsApi = {
  list: async (params: Record<string, string> = {}) => {
    const { data } = await api.get('/processors', { params });
    return data.accounts || [];
  },
  get: async (id: number) => {
    const { data } = await api.get(`/processors/${id}`);
    return data;
  },
  create: async (payload: Record<string, unknown>) => {
    const { data } = await api.post('/processors', payload);
    return data.account;
  },
  update: async (id: number, payload: Record<string, unknown>) => {
    const { data } = await api.put(`/processors/${id}`, payload);
    return data.account;
  },
  delete: async (id: number) => { await api.delete(`/processors/${id}`); },
};

export const loadCardApi = {
  list: async () => {
    const { data } = await api.get('/load-cards');
    return data.cards || [];
  },
  get: async (id: number) => {
    const { data } = await api.get(`/load-cards/${id}`);
    return data;
  },
  create: async (payload: any) => {
    const { data } = await api.post('/load-cards', payload);
    return data;
  },
  update: async (id: number, payload: any) => {
    const { data } = await api.put(`/load-cards/${id}`, payload);
    return data;
  },
  delete: async (id: number) => {
    await api.delete(`/load-cards/${id}`);
  },
};

export const loadApi = {
  list: async (params: Record<string, string> = {}) => {
    const { data } = await api.get('/loads', { params });
    return data;
  },
  create: async (payload: any) => {
    const { data } = await api.post('/loads', payload);
    return data;
  },
  update: async (id: number, payload: any) => {
    const { data } = await api.put(`/loads/${id}`, payload);
    return data;
  },
  delete: async (id: number) => {
    await api.delete(`/loads/${id}`);
  },
};

export const collectionApi = {
  list: async (params: Record<string, string> = {}) => {
    const { data } = await api.get('/collections', { params });
    return data;
  },
  create: async (payload: any) => {
    const { data } = await api.post('/collections', payload);
    return data;
  },
  delete: async (id: number) => {
    await api.delete(`/collections/${id}`);
  },
  summary: async () => {
    const { data } = await api.get('/collections/summary');
    return data;
  },
};
