import './migrate'; // must run before anything reads localStorage
import './theme'; // sets data-theme before the first render (no white flash in dark mode)
import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';

createApp(App).mount('#app');

const shot = import.meta.env.DEV ? new URLSearchParams(location.search).get('shot') : null;

/** Fade the splash screen out once the editor has drawn – but let the logo animation finish first. */
const splash = document.getElementById('splash');
if (splash) {
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
