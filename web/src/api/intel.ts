import { getApiBaseUrl, useAuthStore } from '../stores/authStore';
import { api } from './client';
import { readNdjson } from './stream';
import type { ApiKeyInfo, IntelQueryResult } from './types';

export const intelApi = {
  keys: async (): Promise<ApiKeyInfo[]> => {
    const { data } = await api.get('/api-keys');
    return data.keys || [];
  },

  updateKey: async (
    service: string,
    payload: Partial<ApiKeyInfo> & { api_key?: string }
  ) => {
    const { data } = await api.put(`/api-keys/${service}`, payload);
    return data;
  },

  lookupIP: async (ip: string, services?: string[]): Promise<IntelQueryResult> => {
    const { data } = await api.post('/intel/ip', { ip, services });
    return data;
  },

  lookupDomain: async (
    domain: string,
    services?: string[]
  ): Promise<IntelQueryResult> => {
    const { data } = await api.post('/intel/domain', { domain, services });
    return data;
  },

  lookupEmail: async (email: string): Promise<IntelQueryResult> => {
    const { data } = await api.post('/intel/email', { email });
    return data;
  },

  lookupPhone: async (phone: string): Promise<IntelQueryResult> => {
    const { data } = await api.post('/intel/phone', { phone });
    return data;
  },

  bulkIP: async (
    ips: string[],
    services?: string[],
    onEvent?: (data: any) => void,
    signal?: AbortSignal
  ) => {
    const { token, backendUrl } = useAuthStore.getState();
    const res = await fetch(`${getApiBaseUrl(backendUrl)}/intel/ip/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ips, services }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (onEvent) await readNdjson(res, onEvent);
  },

  history: async (limit = 50, type?: string) => {
    const { data } = await api.get('/intel/history', {
      params: { limit, type },
    });
    return data.history || [];
  },

  status: async () => {
    const { data } = await api.get('/intel/status');
    return data.services || [];
  },
};
