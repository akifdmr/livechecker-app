// src/api/client.ts
import axios from 'axios';
import { toast } from '../components/Toast';
import { getApiBaseUrl, useAuthStore } from '../stores/authStore';
import { parseApiError } from './errors';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const { token, backendUrl } = useAuthStore.getState();
  const baseURL = getApiBaseUrl(backendUrl);
  if (baseURL) config.baseURL = baseURL;

  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const parsed = parseApiError(error);
    const silent = error?.config?.headers?.['X-Silent'] === '1';

    // 401 → logout + login'e yönlendir
    if (parsed.status === 401) {
      try { useAuthStore.getState().logout(); } catch {}
      if (!silent) toast.error('Oturum sona erdi. Yeniden giriş yapın.');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
      return Promise.reject(error);
    }

    // Tek noktadan toast (isteyen sayfa `error.parsed` ile kendi gösterebilir)
    if (!silent) toast.error(parsed.message);

    (error as any).parsed = parsed;
    return Promise.reject(error);
  }
);

export { api };
