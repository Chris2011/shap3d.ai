// LayOut for Shap3D.ai – sheets for plans next to the 3D model.
// - a workspace "Sheets" (switch in the top bar): pages in paper sizes with frame and title block
// - viewports from scenes, live linked to the model, with a drawing scale (1:50 …) and raster, vector or hybrid rendering
// - text, lines, rectangles and dimensions (in model units on a scaled viewport)
// - SVG export per sheet and printing all sheets (the print dialog saves them as PDF)
// The sheets are kept on the model (pluginData.layout) – one .shap3d.json holds model and plans.
// All texts are message keys (i18n/<language>.json).
import type { S3dPlugin } from '../../../src/plugins/types';
import S3dLayoutWorkspace from './S3dLayoutWorkspace.vue';
import { addSheetFromScenes, printSheets } from './actions';
import { loadDocument } from './document';
import { injectStyles } from './styles';
import { MESSAGES, useRuntime } from './runtime';

const WORKSPACE = 'sheets';

const plugin: S3dPlugin = {
  id: 'layout',
  name: 'layout.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'layout.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());

    context.icons.register(
      'layout',
      '<rect x="3.5" y="4.5" width="17" height="15" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 8h7v6.5h-7zM15.5 8h2M15.5 11h2M12 16.5h5.5" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    );

    context.workspaces.register({ id: WORKSPACE, label: 'layout.workspace', icon: 'layout', component: S3dLayoutWorkspace });

    context.commands.register({
      id: 'open',
      label: 'layout.commands.open',
      group: 'view',
      icon: 'layout',
      keywords: 'layout sheets plans paper print pdf pläne blätter drucken', // i18n-ignore – search words
      run: () => context.workspaces.open(WORKSPACE),
    });
    context.commands.register({
      id: 'fromScenes',
      label: 'layout.commands.fromScenes',
      icon: 'layout',
      keywords: 'layout sheet scenes viewport blatt szenen', // i18n-ignore – search words
      enabled: (editor) => editor.model.scenes.length > 0,
      run: () => {
        addSheetFromScenes();
        context.workspaces.open(WORKSPACE);
      },
    });
    context.commands.register({
      id: 'print',
      label: 'layout.commands.print',
      icon: 'layout',
      keywords: 'layout print pdf drucken', // i18n-ignore – search words
      enabled: () => loadDocument().pages.length > 0,
      run: () => printSheets(),
    });
  },
};

export default plugin;
