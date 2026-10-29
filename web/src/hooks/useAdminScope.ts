// ============================================================
// src/hooks/useAdminScope.ts
// Sayfa-level admin scope state (userId | all).
// Query string'e yazar, refresh'te korunur.
// ============================================================
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export type AdminScopeValue = {
  isAdmin: boolean;
  selectedUserId: number | null;
  scopeMode: 'mine' | 'user' | 'all';
  setSelectedUserId: (id: number | null) => void;
  setScopeMode: (mode: 'mine' | 'user' | 'all') => void;
  /** API çağrılarına yayılacak ek parametreler */
  scopeParams: { userId?: number; all?: boolean };
};

export function useAdminScope(): AdminScopeValue {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [params, setParams] = useSearchParams();

  const rawUserId = params.get('userId');
  const selectedUserId = rawUserId && /^\d+$/.test(rawUserId)
    ? parseInt(rawUserId, 10)
    : null;

  const scopeMode: 'mine' | 'user' | 'all' = useMemo(() => {
    if (!isAdmin) return 'mine';
    if (selectedUserId) return 'user';
    return 'all'; // admin default = tüm kullanıcılar
  }, [isAdmin, selectedUserId]);

  const setSelectedUserId = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(params);
      if (id && id > 0) next.set('userId', String(id));
      else next.delete('userId');
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const setScopeMode = useCallback(
    (mode: 'mine' | 'user' | 'all') => {
      if (mode === 'all') setSelectedUserId(null);
      // 'mine' → mevcut kullanıcı (userId boş)
      // 'user' → kullanıcı seçimi bekleniyor; çağıran setSelectedUserId çağırmalı
    },
    [setSelectedUserId]
  );

  const scopeParams = useMemo(() => {
    if (!isAdmin) return {};
    if (selectedUserId) return { userId: selectedUserId };
    return { all: true };
  }, [isAdmin, selectedUserId]);

  return {
    isAdmin,
    selectedUserId,
    scopeMode,
    setSelectedUserId,
    setScopeMode,
    scopeParams,
  };
}