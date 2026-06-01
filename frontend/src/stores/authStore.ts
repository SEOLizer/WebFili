import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  clearError: () => void;
  initFromStorage: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const STORAGE_KEY = 'webfili-auth';

export const useAuthStore = create<AuthStore>()(
  subscribeWithSelector((set, get) => ({
    user: null,
    accessToken: null,
    refreshToken: null,
    isLoading: false,
    error: null,

    initFromStorage: () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const { user, refreshToken } = JSON.parse(raw);
        if (user && refreshToken) {
          set({ user, refreshToken });
          // Silently try to refresh the access token
          get().refresh();
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    },

    login: async (username, password) => {
      set({ isLoading: true, error: null });
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Login fehlgeschlagen' }));
          throw new Error(err.error);
        }
        const data = await res.json();
        set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken, isLoading: false });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: data.user, refreshToken: data.refreshToken }));
      } catch (e) {
        set({ isLoading: false, error: (e as Error).message });
        throw e;
      }
    },

    register: async (username, email, password) => {
      set({ isLoading: true, error: null });
      try {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Registrierung fehlgeschlagen' }));
          throw new Error(err.error);
        }
        const data = await res.json();
        set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken, isLoading: false });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: data.user, refreshToken: data.refreshToken }));
      } catch (e) {
        set({ isLoading: false, error: (e as Error).message });
        throw e;
      }
    },

    logout: async () => {
      const { refreshToken, accessToken } = get();
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch { /* ignore network errors on logout */ }
      set({ user: null, accessToken: null, refreshToken: null });
      localStorage.removeItem(STORAGE_KEY);
    },

    refresh: async () => {
      const { refreshToken } = get();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          set({ user: null, accessToken: null, refreshToken: null });
          localStorage.removeItem(STORAGE_KEY);
          return false;
        }
        const data = await res.json();
        const user: AuthUser = { id: data.user.sub, username: data.user.username, email: '', role: data.user.role };
        set({ user, accessToken: data.accessToken, refreshToken: data.refreshToken });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, refreshToken: data.refreshToken }));
        return true;
      } catch {
        return false;
      }
    },

    clearError: () => set({ error: null }),
  }))
);
