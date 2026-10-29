// ============================================================
// AUTH STORE — Web + Chrome Extension uyumlu
// ============================================================
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ⭐ chrome global'ini tanı (TS + runtime)
declare const chrome: any;

// ============================================================
// TİPLER
// ============================================================
export interface User {
  id: number;
  username: string;
  email?: string | null;
  display_name?: string | null;
  credits?: number;
  role: 'user' | 'checker' | 'admin' | 'operator' | 'finance' | 'viewer';
  permissions?: string[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  backendUrl: string;
  login: (token: string, user: User, backendUrl?: string) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
  isAdmin: () => boolean;
  hasPermission: (permission: string) => boolean;
}

// ============================================================
// CONTEXT DETECTION
// ============================================================
export const isChromeExtension =
  typeof chrome !== 'undefined' && !!chrome?.storage?.local;
if (!isChromeExtension && typeof localStorage !== 'undefined') {
  try { localStorage.removeItem('token'); } catch {}
}
const DEFAULT_BACKEND_URL = import.meta.env.VITE_API_URL ||
  (isChromeExtension ? 'http://localhost:3000' : '/api');

export function getApiBaseUrl(backendUrl = DEFAULT_BACKEND_URL): string {
  if (isChromeExtension) {
    return backendUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }
  return import.meta.env.VITE_API_URL || '/api';
}

// ============================================================
// CHROME STORAGE ADAPTER — Zustand persist uyumlu
// ============================================================
const chromeStorageAdapter = {
  getItem: (name: string): Promise<string | null> =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get([name], (res: any) => {
          resolve(res?.[name] ?? null);
        });
      } catch {
        resolve(null);
      }
    }),

  setItem: (name: string, value: string): Promise<void> =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [name]: value }, () => resolve());
      } catch {
        resolve();
      }
    }),

  removeItem: (name: string): Promise<void> =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.remove([name], () => resolve());
      } catch {
        resolve();
      }
    }),
};

// ============================================================
// AUTH STORE
// ============================================================
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      backendUrl: DEFAULT_BACKEND_URL,

      // --------------------------------------------------------
      // LOGIN
      // --------------------------------------------------------
      login: (token, user, backendUrl = DEFAULT_BACKEND_URL) => {
        // Web clients keep only a non-secret auth-state marker. The HttpOnly
        // session cookie is the credential and is never exposed to JavaScript.
        if (!isChromeExtension) {
          try { localStorage.removeItem('token'); } catch {}
        }
        set({ token: isChromeExtension ? token : 'cookie-session', user, backendUrl });
      },

      updateUser: (user) => set((state) => ({ user: state.user ? { ...state.user, ...user } : null })),

      // --------------------------------------------------------
      // LOGOUT
      // --------------------------------------------------------
      logout: () => {
        if (!isChromeExtension) {
          try {
            localStorage.removeItem('token');
          } catch (e) {
            console.warn('[authStore] localStorage.removeItem hatası:', e);
          }
        }

        set({ token: null, user: null });
      },

      // --------------------------------------------------------
      // IS ADMIN
      // --------------------------------------------------------
      isAdmin: () => get().user?.role === 'admin',
      hasPermission: (permission) => get().user?.role === 'admin' || !!get().user?.permissions?.includes(permission),
    }),

    // ============================================================
    // PERSIST CONFIG
    // ============================================================
    {
      name: 'auth-storage',
      version: 2,
      migrate: (persistedState: any) => ({
        ...persistedState,
        token: isChromeExtension ? (persistedState?.token ?? null) : (persistedState?.token ? 'cookie-session' : null),
      }),

      // Context'e göre storage seç
      storage: isChromeExtension
        ? createJSONStorage(() => chromeStorageAdapter)
        : createJSONStorage(() => localStorage),

      // Sadece bu alanlar persist edilsin
      partialize: (state) => ({
        token: isChromeExtension ? state.token : (state.token ? 'cookie-session' : null),
        user: state.user,
        backendUrl: state.backendUrl,
      }),
      merge: (persistedState, currentState) => {
        const state = { ...currentState, ...(persistedState as Partial<AuthState>) };
        if (!isChromeExtension && state.token) state.token = 'cookie-session';
        if (!isChromeExtension && !import.meta.env.VITE_API_URL) {
          state.backendUrl = '/api';
        }
        return state;
      },
    }
  )
);
