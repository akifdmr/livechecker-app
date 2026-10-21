import { api } from './client';

export const adminApi = {
  stats: async () => {
    const { data } = await api.get('/admin/stats');
    return data;
  },
  users: async () => {
    const { data } = await api.get('/admin/users');
    return data.users;
  },
  addUser: async (email: string, password: string, role: string) => {
    const { data } = await api.post('/admin/users', { email, password, role });
    return data;
  },
  deleteUser: async (id: number) => {
    await api.delete(`/admin/users/${id}`);
  },
  binChecks: async (id: number) => {
    const { data } = await api.get(`/admin/users/${id}/bin-checks`);
    return data.checks || [];
  },
  rbac: async () => (await api.get('/admin/rbac/roles')).data,
  updateRolePermissions: async (id: number, permissions: string[]) => (await api.put(`/admin/rbac/roles/${id}`, { permissions })).data,
  updateUserRoles: async (id: number, roles: string[]) => (await api.put(`/admin/users/${id}/roles`, { roles })).data,
  subscriptionChecks: async (id: number) => {
    const { data } = await api.get(`/admin/users/${id}/subscription-prechecks`);
    return data.checks || [];
  },
};

export const binHistoryApi = {
  list: async () => {
    const { data } = await api.get('/bin-history');
    return data.checks || [];
  },
};

export const subscriptionApi = {
  cards: async () => {
    const { data } = await api.get('/subscription-cards');
    return data.cards || [];
  },
  preflight: async (id: number) => {
    const { data } = await api.post(`/subscription-cards/${id}/preflight`);
    return data;
  },
  history: async () => {
    const { data } = await api.get('/subscription-prechecks');
    return data.checks || [];
  },
};