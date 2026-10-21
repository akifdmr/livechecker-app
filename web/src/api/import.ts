import { getApiBaseUrl, useAuthStore } from '../stores/authStore';
import { readNdjson } from './stream';

export const importApi = {
  smart: async (
    cards: string[],
    routeCvvless: boolean,
    onEvent: (data: any) => void,
    signal?: AbortSignal
  ) => {
    const { token, backendUrl } = useAuthStore.getState();
    const res = await fetch(`${getApiBaseUrl(backendUrl)}/smart-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cards, routeCvvless }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await readNdjson(res, onEvent);
  },
};
