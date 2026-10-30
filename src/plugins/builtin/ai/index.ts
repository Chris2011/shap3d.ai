import type { S3dPlugin } from '../../types';
import { openPanel, togglePanel } from '../../../components/panelState';
import S3dAiChat from './S3dAiChat.vue';
import { aiConfig, downloads, cancelDownload } from './providers';
import { stop } from './agent';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';
import arabic from './i18n/ar.json';

/** id of the chat panel (plugin id + panel id) – the welcome tour and the screenshot mode open it */
export const AI_PANEL = 'ai.chat';

/**
 * Built-in plugin: the AI assistant – a chat that turns descriptions into s3d scripts (or meshes
 * with LLaMA-Mesh) using a local model (Ollama, LM Studio …), with a setup wizard, model search
 * and chat history. Everything comes in through the plugin API, so switching it off removes
 * the tile, the button in the top bar and the palette switches.
 */
const aiPlugin: S3dPlugin = {
  id: 'ai',
  name: 'ai.plugin.name',
  version: '1.4.0',
  author: 'Shap3D.ai',
  description: 'ai.plugin.description',
  messages: { de: german.messages, en: english.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages },

  activate(context) {
    context.panels.register({
      id: 'chat',
      label: 'ai.plugin.name',
      icon: 'sparkle',
      width: 400,
      flush: true,
      tile: 'first',
      component: S3dAiChat,
    });

    context.ui.addTopBarButton({
      icon: 'sparkle',
      title: 'ai.plugin.name',
      active: () => openPanel.value === AI_PANEL,
      run: () => togglePanel(AI_PANEL),
    });

    // switches for the command palette (they used to live in the core palette)
    context.commands.register({
      id: 'fast',
      label: 'ai.plugin.fastMode',
      group: 'ai.plugin.name',
      icon: 'sparkle',
      keywords: 'fast schnell',
      checked: () => aiConfig.fast,
      run: () => {
        aiConfig.fast = !aiConfig.fast;
      },
    });
    context.commands.register({
      id: 'autorun',
      label: 'ai.plugin.autoRun',
      group: 'ai.plugin.name',
      icon: 'sparkle',
      keywords: 'autorun',
      checked: () => aiConfig.autoRun,
      run: () => {
        aiConfig.autoRun = !aiConfig.autoRun;
      },
    });

    // switched off while it is working: stop the answer and the model downloads
    context.onDispose(() => {
      stop();
      for (const name of Object.keys(downloads)) {
        cancelDownload(name);
      }
    });
  },
};

export default aiPlugin;
