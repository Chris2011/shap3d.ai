import { reactive } from 'vue';

/** Welcome tour: opens by itself on the very first start, later via Menü › Einführung. */
const KEY = 's3d:tour-seen';
export const tour = reactive({ open: false, step: 0 });

export function openTour(step = 0) { tour.step = step; tour.open = true; }
export function closeTour() {
  tour.open = false;
  try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
}
export function tourSeen(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}
