import { api } from './client';

export const adminApi = {
  stats: async () => {
    const { data } = await api.get('/admin/stats');
    return data;
  },
  users: async () => {
    const pageSize = 2000;
    const { data: firstPage } = await api.get('/admin/users', { params: { limit: pageSize, offset: 0 } });
    const users = [...firstPage.users];
    for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
      const { data } = await api.get('/admin/users', { params: { limit: pageSize, offset } });
      users.push(...data.users);
    }
    return users;
  },
  userDetails: async (id: number) => (await api.get(`/admin/users/${id}/details`, { params: { limit: 500 } })).data,
  addUser: async (username: string, password: string, role: string) => {
    const { data } = await api.post('/admin/users', { username, password, role });
    return data;
  },
  updateUser: async (id: number, payload: { username?: string; role?: string; is_active?: boolean; password?: string }) =>
    (await api.patch(`/admin/users/${id}`, payload)).data.user,
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
  settings: async () => (await api.get('/admin/settings')).data.settings,
  saveSettings: async (settings: Record<string, unknown>) =>
    (await api.put('/admin/settings', { settings })).data.settings,
  providers: async () => (await api.get('/admin/providers')).data,
  setDefaultProvider: async (key: string) =>
    (await api.put(`/admin/providers/${encodeURIComponent(key)}`, { isDefault: true })).data,
  grantCredits: async (input: { userId: number; amount: number; note?: string; idempotencyKey: string }) =>
    (await api.post('/admin/credits', input)).data,
  creditLedger: async (params: Record<string, unknown> = {}) =>
    (await api.get('/admin/credits/ledger', { params })).data,
  creditRequests: async () => (await api.get('/admin/credit-requests')).data.requests || [],
  resolveCreditRequest: async (id: number, decision: 'approve' | 'reject', amount?: number) =>
    (await api.post(`/admin/credit-requests/${id}/resolve`, { decision, amount })).data,
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
