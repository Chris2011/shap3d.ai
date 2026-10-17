import { reactive } from 'vue';

/** Command palette (Strg+Umschalt+P, F1, Strg+K or Umschalt twice). */
export const palette = reactive({ open: false, query: '' });
export function openPalette(query = '') { palette.query = query; palette.open = true; }
export function closePalette() { palette.open = false; }

const RECENT_KEY = 's3d:palette-recent';
export function recentIds(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
}
export function pushRecent(id: string) {
  const list = [id, ...recentIds().filter(x => x !== id)].slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
