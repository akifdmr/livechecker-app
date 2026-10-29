import { api } from './client';
import { isChromeExtension } from '../stores/authStore';

export const authApi = {
  login: async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password }, { headers: isChromeExtension ? {} : { 'X-Session-Mode': 'cookie' } });
    return data;
  },
  me: async () => {
    const { data } = await api.get('/auth/me');
    return data.user;
  },
  register: async (username: string, password: string, displayName: string) => {
    const { data } = await api.post('/auth/register', { username, password, displayName });
    return data;
  },
  updateProfile: async (payload: { username?: string; email?: string; displayName?: string; currentPassword?: string; newPassword?: string }) => {
    const { data } = await api.patch('/auth/profile', payload);
    return data.user;
  },
  sessions: async () => (await api.get('/auth/sessions')).data.sessions,
  revokeSession: async (id: string) => api.delete(`/auth/sessions/${id}`),
  logout: async () => api.post('/auth/logout'),
  logoutAll: async () => api.post('/auth/logout-all'),
};
