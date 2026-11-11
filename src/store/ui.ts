import { create } from 'zustand';
import type { UserSettings } from '../types';
import { randomId } from '../lib/format';

export type Theme = 'light' | 'dark' | 'system';

interface Toast {
  id: string;
  message: string;
  kind: 'info' | 'error' | 'success';
  title?: string;
  onClick?: () => void;
}

interface UiState {
  theme: Theme;
  toasts: Toast[];
  settings: UserSettings | null;
  setTheme: (t: Theme) => void;
  setSettings: (s: UserSettings | null) => void;
  toast: (message: string, kind?: Toast['kind'], opts?: { title?: string; onClick?: () => void }) => void;
  dismiss: (id: string) => void;
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('pc-theme');
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

export function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export const useUi = create<UiState>((set, get) => ({
  theme: readTheme(),
  toasts: [],
  settings: null,
  setTheme: (theme) => {
    try {
      localStorage.setItem('pc-theme', theme);
    } catch {
      /* ignore */
    }
    applyTheme(theme);
    set({ theme });
  },
  setSettings: (settings) => {
    set({ settings });
    if (settings && settings.theme !== get().theme) get().setTheme(settings.theme);
  },
  toast: (message, kind = 'info', opts) => {
    const id = randomId();
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind, ...opts }] }));
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useUi.getState().theme === 'system') applyTheme('system');
});
