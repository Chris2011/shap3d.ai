import { reactive } from 'vue';
import { useStorage } from '@vueuse/core';

/** Command palette (Strg+Umschalt+P, F1, Strg+K or Umschalt twice). */
export const palette = reactive({ open: false, query: '' });
export function openPalette(query = '') { palette.query = query; palette.open = true; }
export function closePalette() { palette.open = false; }

/** the last 8 entries run from the palette, newest first */
const recent = useStorage<string[]>('s3d:palette-recent', []);
export const recentIds = (): string[] => (Array.isArray(recent.value) ? recent.value.filter(x => typeof x === 'string') : []);
export function pushRecent(id: string) { recent.value = [id, ...recentIds().filter(x => x !== id)].slice(0, 8); }
