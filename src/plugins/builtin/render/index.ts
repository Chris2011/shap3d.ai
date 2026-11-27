import type { S3dPlugin } from '../../types';
import S3dRenderWindow from './S3dRenderWindow.vue';
import { renderUi } from './state';
import { disposeTraceSession } from './session';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';
import arabic from './i18n/ar.json';

/**
 * Built-in plugin: a quick look at how the current view would look rendered – path traced with three-gpu-pathtracer
 * (MIT) from the faces, materials, environment and sun, in a floating window that gets sharper pass by pass.
 */
const renderPlugin: S3dPlugin = {
  id: 'render',
  name: 'render.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'render.plugin.description',
  messages: { de: german.messages, en: english.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages },

  activate(context) {
    context.ui.addWindow(S3dRenderWindow);
    context.commands.register({
      id: 'preview',
      label: 'render.command.preview',
      group: 'view',
      keywords: 'render path tracing raytracing',
      // open: a first picture; already open: a new one of the view as it is now
      run: () => {
        if (renderUi.open) {
          renderUi.request++;
        } else {
          renderUi.open = true;
        }
      },
    });
    context.onDispose(() => {
      renderUi.open = false;
      disposeTraceSession();
    });
  },
};

export default renderPlugin;
