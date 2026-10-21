import { getApiBaseUrl, useAuthStore } from '../stores/authStore';
import { readNdjson } from './stream';
import type { CheckStreamOpts } from './types';

export const checkApi = {
  /**
   * NDJSON streaming toplu kart işlemi
   * @param cards      "PAN|exp|cvv" formatında kart listesi
   * @param onEvent    Her satır için çağrılır
   * @param signal     AbortSignal (opsiyonel)
   * @param opts       { provider?, operation?, amount? } (opsiyonel)
   */
  stream: async (
    cards: string[],
    onEvent: (data: any) => void,
    signal?: AbortSignal,
    opts?: CheckStreamOpts
  ) => {
    const { token, backendUrl } = useAuthStore.getState();

    const body: Record<string, any> = { cards };
    if (opts?.provider) body.provider = opts.provider;
    if (opts?.operation) body.operation = opts.operation;
    if (typeof opts?.amount === 'number') body.amount = opts.amount;

    const res = await fetch(`${getApiBaseUrl(backendUrl)}/check-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await readNdjson(res, onEvent);
  },
};
