import './migrate'; // must run before anything reads localStorage
import './theme'; // sets data-theme before the first render (no white flash in dark mode)
import './styles.css';
import { createApp } from 'vue';
import S3dSplash from './components/S3dSplash.vue';
import { hideSplash, failSplash } from './components/splashState';
import { webglAvailable } from './webglCheck';

// Boot bundle: only Vue and the splash screen, so it is on screen right away.
// The editor (≈ 2 MB with three.js) is a separate bundle loaded below.
createApp(S3dSplash).mount('#splash');

const shot = import.meta.env.DEV && new URLSearchParams(location.search).has('shot');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!webglAvailable()) {
  // without WebGL the viewport cannot exist – explain instead of hanging on the splash
  failSplash('webgl');
} else {
  import('./startApp')
    .then(module => {
      module.startApp();
      hideSplash(shot ? 0 : reduced ? 300 : 2100, shot ? 0 : 600);
    })
    .catch((error: unknown) => {
      console.error(error);
      const err = error as Error;
      failSplash(err?.name === 'WebGLUnavailableError' ? 'webgl' : 'other', String(err?.message ?? error));
    });
}
