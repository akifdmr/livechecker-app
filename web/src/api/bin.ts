// api/bin.ts
import { api } from './client';

export const binApi = {
  check: async (bins: string[]) => {
    const { data } = await api.post('/bin-check', { bins });
    return data.results;
  },
};