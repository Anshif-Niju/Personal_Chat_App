import type { CSSProperties } from 'react';
import { create } from 'zustand';

export type WallTarget = 'chat' | 'list';
export interface Wall {
  kind: 'default' | 'color' | 'image';
  value: string;
}

const KEY = 'pc-wallpaper';
const DEFAULT: Wall = { kind: 'default', value: '' };

export const PRESET_COLORS = ['#efeae2', '#d9fdd3', '#dbeafe', '#fce7f3', '#fef3c7', '#e0e7ff', '#cbd5e1', '#1e293b', '#0b141a'];

function read(): Record<WallTarget, Wall> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { chat: p.chat ?? DEFAULT, list: p.list ?? DEFAULT };
    }
  } catch {
    /* storage unavailable */
  }
  return { chat: DEFAULT, list: DEFAULT };
}

interface WallState extends Record<WallTarget, Wall> {
  /** Returns false when the browser could not store it (e.g. image too large). */
  set: (target: WallTarget, wall: Wall) => boolean;
}

export const useWallpaper = create<WallState>((set, get) => ({
  ...read(),
  set: (target, wall) => {
    const next = { chat: get().chat, list: get().list, [target]: wall };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      return false;
    }
    set({ [target]: wall } as Partial<WallState>);
    return true;
  },
}));

export function wallStyle(w: Wall): CSSProperties | undefined {
  if (w.kind === 'color') return { backgroundColor: w.value, backgroundImage: 'none' };
  if (w.kind === 'image') {
    return { backgroundImage: `url(${w.value})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
  }
  return undefined;
}

/** Downscales a picked image so it fits in localStorage. */
export function imageToDataUrl(file: File, maxSize = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}
