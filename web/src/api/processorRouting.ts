import { api } from './client';
import type { ProcessorRule } from './types';

export const processorRoutingApi = {
  list: async (): Promise<ProcessorRule[]> => {
    const { data } = await api.get('/processor-routing');
    return data.rules || [];
  },
  create: async (payload: Partial<ProcessorRule>) => {
    const { data } = await api.post('/processor-routing', payload);
    return data.rule;
  },
  update: async (id: number, patch: Partial<ProcessorRule>) => {
    const { data } = await api.put(`/processor-routing/${id}`, patch);
    return data.rule;
  },
  delete: async (id: number) => {
    await api.delete(`/processor-routing/${id}`);
  },
  resolve: async (pan: string, fallback = 'clover3') => {
    const { data } = await api.post('/processor-routing/resolve', {
      pan,
      fallback,
    });
    return data.provider as string;
  },
};