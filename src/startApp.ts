/** The editor itself (three.js, tools, panels …) – loaded as its own bundle after the splash screen is up. */
import { createApp } from 'vue';
import App from './App.vue';

export const startApp = () => {
  const app = createApp(App);
  let mountError: unknown = null; // production builds only log hook errors – catch them to show the error screen
  app.config.errorHandler = error => { mountError ??= error; };
  app.mount('#app');
  app.config.errorHandler = undefined;
  if (mountError) throw mountError;

  // README screenshots: demo scenes, dev server only
  const shot = import.meta.env.DEV ? new URLSearchParams(location.search).get('shot') : null;
  if (shot) import('./devShots').then(module => setTimeout(() => module.runShot((window as any).editor, shot), 300));
};
