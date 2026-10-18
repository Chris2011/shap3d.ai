import { reactive } from 'vue';

/** Loading screen: shown by the small boot bundle while the editor bundle loads (see main.ts). */
export type StartupError = { kind: 'webgl' | 'other'; detail: string };
export const splash = reactive<{ phase: 'loading' | 'hiding' | 'gone' | 'error'; error: StartupError | null }>({ phase: 'loading', error: null });

/** Fade out once the editor has drawn – but let the logo animation finish first (minShown ms after page start). */
export function hideSplash(minShown: number, fadeMs = 600) {
  if (splash.phase !== 'loading') return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setTimeout(() => {
      splash.phase = 'hiding';
      setTimeout(() => { if (splash.phase === 'hiding') splash.phase = 'gone'; }, fadeMs);
    }, Math.max(0, minShown - performance.now()));
  }));
}

/** The app cannot start – the splash turns into a help page. */
export function failSplash(kind: StartupError['kind'], detail = '') {
  splash.error = { kind, detail };
  splash.phase = 'error';
}
