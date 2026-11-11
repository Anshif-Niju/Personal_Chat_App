import { create } from 'zustand';
import type { Me } from '../types';
import { api, authEvents, refreshAccessToken, setAccessToken } from '../lib/api';
import { disconnectSocket } from '../lib/socket';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  user: Me | null;
  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { username: string; email?: string; password: string; confirmPassword: string; displayName: string }) => Promise<{ pending: boolean; message: string }>;
  logout: () => Promise<void>;
  setUser: (u: Me) => void;
  /** Local sign-out without calling the server (session already revoked). */
  clear: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,

  bootstrap: async () => {
    const token = await refreshAccessToken();
    if (!token) return set({ status: 'anonymous', user: null });
    // onRefreshed already stored the user
    if (!get().user) {
      const { data } = await api.get('/auth/me');
      set({ user: data.user });
    }
    set({ status: 'authenticated' });
  },

  login: async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    setAccessToken(data.accessToken);
    set({ user: data.user, status: 'authenticated' });
  },

  register: async (body) => {
    const { data } = await api.post('/auth/register', body);
    // New accounts wait for an admin to approve them, so there is no session yet.
    if (data.pending) return { pending: true, message: String(data.message ?? '') };
    setAccessToken(data.accessToken);
    set({ user: data.user, status: 'authenticated' });
    return { pending: false, message: '' };
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore network errors on logout */
    }
    get().clear();
  },

  setUser: (user) => set({ user }),

  clear: () => {
    setAccessToken(null);
    disconnectSocket();
    set({ user: null, status: 'anonymous' });
  },
}));

authEvents.onRefreshed = ({ user }) => useAuth.setState({ user });
authEvents.onLost = () => {
  if (useAuth.getState().status === 'authenticated') useAuth.getState().clear();
};
