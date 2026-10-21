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
  email: string;
  role: 'user' | 'checker' | 'admin' | 'operator' | 'finance' | 'viewer';
  permissions?: string[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  backendUrl: string;
  login: (token: string, user: User, backendUrl?: string) => void;
  logout: () => void;
  isAdmin: () => boolean;
  hasPermission: (permission: string) => boolean;
}

// ============================================================
// CONTEXT DETECTION
// ============================================================
const isChromeExtension =
  typeof chrome !== 'undefined' && !!chrome?.storage?.local;
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
        // Web app'te localStorage'a da yaz (axios interceptor için)
        if (!isChromeExtension) {
          try {
            localStorage.setItem('token', token);
          } catch (e) {
            console.warn('[authStore] localStorage.setItem hatası:', e);
          }
        }

        set({ token, user, backendUrl });
      },

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

      // Context'e göre storage seç
      storage: isChromeExtension
        ? createJSONStorage(() => chromeStorageAdapter)
        : createJSONStorage(() => localStorage),

      // Sadece bu alanlar persist edilsin
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        backendUrl: state.backendUrl,
      }),
      merge: (persistedState, currentState) => {
        const state = { ...currentState, ...(persistedState as Partial<AuthState>) };
        if (!isChromeExtension && !import.meta.env.VITE_API_URL) {
          state.backendUrl = '/api';
        }
        return state;
      },
    }
  )
);
