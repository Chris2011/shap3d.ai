import type { S3dPlugin } from '../../types';
import S3dLineworkPanel from './S3dLineworkPanel.vue';
import { useLineworkContext } from './runtime';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';
import arabic from './i18n/ar.json';

/**
 * Built-in plugin: walls, straight stairs and spiral stairs from drawn lines. Draw a line (or a chain, or a face's
 * outline), select it, choose the part and its sizes – the part stays editable in the panel while it is selected.
 */
const lineworkPlugin: S3dPlugin = {
  id: 'linework',
  name: 'linework.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'linework.plugin.description',
  messages: { de: german.messages, en: english.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages },

  activate(context) {
    useLineworkContext(context);
    // without a tile: the app adds the command "Parts from lines…" (menu Plugins, command palette)
    context.panels.register({ id: 'panel', label: 'linework.plugin.name', component: S3dLineworkPanel, icon: 'component' });
  },
};

export default lineworkPlugin;
