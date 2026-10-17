import './migrate'; // must run before anything reads localStorage
import './theme'; // sets data-theme before the first render (no white flash in dark mode)
import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { showStartupError, webglAvailable } from './startupError';

const shot = import.meta.env.DEV ? new URLSearchParams(location.search).get('shot') : null;
const splash = document.getElementById('splash');

if (!webglAvailable()) {
  // without WebGL the viewport cannot exist – explain instead of hanging on the splash
  showStartupError('webgl');
} else {
  try {
    const app = createApp(App);
    let mountError: unknown = null; // production builds only log hook errors – catch them to show the error screen
    app.config.errorHandler = e => { mountError ??= e; };
    app.mount('#app');
    app.config.errorHandler = undefined;
    if (mountError) throw mountError;
    fadeSplash();
  } catch (e) {
    console.error(e);
    showStartupError((e as Error)?.name === 'WebGLUnavailableError' ? 'webgl' : 'other', String((e as Error)?.message ?? e));
  }
}

/** Fade the splash screen out once the editor has drawn – but let the logo animation finish first. */
function fadeSplash() {
  if (!splash) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minShown = shot ? 0 : reduced ? 300 : 2100;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setTimeout(() => {
      splash.classList.add('done');
      setTimeout(() => splash.remove(), shot ? 0 : 600);
    }, Math.max(0, minShown - performance.now()));
  }));
}

// README screenshots: demo scenes, dev server only
if (shot) import('./devShots').then(m => setTimeout(() => m.runShot((window as any).editor, shot), 300));
