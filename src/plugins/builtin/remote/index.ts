import type { S3dPlugin } from '../../types';
import S3dRemotePanel from './S3dRemotePanel.vue';
import { startRemoteConnection } from './connection';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';
import arabic from './i18n/ar.json';

/** a plug with a signal arc – 24×24, stroke in the current colour */
const REMOTE_ICON =
  '<path d="M9 7v3M15 7v3M7 10h10v2a5 5 0 0 1-10 0zM12 17v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M17.5 3.5a6 6 0 0 1 3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>';

/**
 * Built-in plugin (dev server only): the remote API – REST at /api, Swagger UI at /api/docs and the MCP server
 * at /mcp. Two halves: ./server is a Vite plugin (registered in vite.config.ts) that takes the requests and sends
 * each over Vite's WebSocket to the tab that was active last; this side runs it against the editor (handlers.ts)
 * and sends the answer back. Its panel shows the connection, an activity log, the links to the documentation
 * and the MCP set-up to copy.
 */
const remotePlugin: S3dPlugin = {
  id: 'remote',
  name: 'remote.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'remote.plugin.description',
  messages: { de: german.messages, en: english.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages },

  activate(context) {
    if (!import.meta.hot) {
      return; // a production build has no dev server to talk to
    }
    context.icons.register('remote', REMOTE_ICON);
    context.panels.register({
      id: 'panel',
      label: 'remote.plugin.name',
      icon: 'remote',
      width: 380,
      tile: 'last',
      component: S3dRemotePanel,
    });
    context.onDispose(startRemoteConnection(context));
  },
};

export default remotePlugin;
