// Model marketplace for Shap3D.ai – search public 3D sources and load a model into the current model.
// - each source is a small adapter (src/sources/), with the same interface (src/source.ts)
// - nothing is fetched before the user searches or clicks; keys are entered by the user and stay in this browser
// - a glTF with its parts or a zip becomes one .glb in a worker (src/archive.ts), then goes through the app's import
// - author, licence and source stay on the imported group (context.data), since most licences ask for that
import type { S3dPlugin } from '../../../src/plugins/types';
import S3dMarketplace from './S3dMarketplace.vue';
import { MESSAGES, useRuntime } from './runtime';
import { injectStyles } from './styles';

const PANEL = 'browser';

const plugin: S3dPlugin = {
  id: 'marketplace',
  name: 'marketplace.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'marketplace.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());
    context.icons.register(
      'marketplace',
      '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    );
    context.panels.register({
      id: PANEL,
      label: 'marketplace.panel.title',
      icon: 'marketplace',
      width: 360,
      component: S3dMarketplace,
      tile: 'last',
    });
    context.commands.register({
      id: 'open',
      label: 'marketplace.commands.open',
      icon: 'marketplace',
      keywords: 'marketplace model download 3d search poly haven sketchfab thingiverse wikimedia openstreetmap gebäude möbel modell suchen', // i18n-ignore – search words
      run: () => context.panels.open(PANEL),
    });
  },
};

export default plugin;
