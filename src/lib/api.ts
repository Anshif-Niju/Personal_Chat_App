import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { Me } from '../types';

export const API_URL: string = import.meta.env.VITE_API_URL || '/api';

let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

/** Hooks set by the auth store (avoids a circular import). */
export const authEvents = {
  onRefreshed: (_data: { user: Me; accessToken: string }) => {},
  onLost: () => {},
};

const COMMON_HEADERS = { 'X-Client-Platform': 'web' };

export const api = axios.create({ baseURL: API_URL, withCredentials: true, headers: COMMON_HEADERS });

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshing: Promise<string | null> | null = null;

/** Single-flight refresh using the httpOnly refresh cookie. */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= axios
    .post(`${API_URL}/auth/refresh`, {}, { withCredentials: true, headers: COMMON_HEADERS })
    .then((r) => {
      setAccessToken(r.data.accessToken);
      authEvents.onRefreshed(r.data);
      return r.data.accessToken as string;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const NO_REFRESH = /\/auth\/(login|register|refresh|forgot-password|reset-password|logout)/;

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !NO_REFRESH.test(original.url ?? '')) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      authEvents.onLost();
    }
    return Promise.reject(error);
  },
);

export function errorMessage(err: unknown): string {
  const e = err as AxiosError<{ error?: { message?: string } }>;
  return e?.response?.data?.error?.message ?? (e?.message === 'Network Error' ? 'Network error — check your connection' : e?.message) ?? 'Something went wrong';
}
