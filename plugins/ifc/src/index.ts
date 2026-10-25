// IFC (BIM) for Shap3D.ai – reads IFC files with web-ifc (WebAssembly) and writes IFC4.
// - opens .ifc files (Import… / drag & drop): IFC 2x3, IFC 4, IFC 4.3
// - the spatial structure and one group per element, the IFC class as tag, GlobalId and property sets on the group
// - exports the model as IFC4
// - the "IFC properties" panel to see and set the IFC class of a group
// web-ifc is not part of this module: it ships next to it in the package (web-ifc-api.js, web-ifc.wasm)
// and is loaded on the first import. All texts are message keys (i18n/<language>.json).
import type { Editor } from '../../../src/engine/editor';
import type { S3dPlugin } from '../../../src/plugins/types';
import { exportIfc } from './exportIfc';
import { IFC_PLUGIN } from './ifcData';
import { importIfc } from './importIfc';
import { createPanel } from './panel';
import { MESSAGES, useRuntime } from './runtime';

const VERSION = '1.0.0';

const oneGroupSelected = (editor: Editor) => {
  const selection = editor.selected();
  return selection.length === 1 && selection[0].kind === 'instance';
};

const plugin: S3dPlugin = {
  id: IFC_PLUGIN,
  name: 'ifc.plugin.name',
  version: VERSION,
  author: 'Shap3D.ai (web-ifc: That Open Company)',
  description: 'ifc.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);

    context.files.registerImporter({
      extensions: ['ifc'],
      label: 'IFC (BIM)', // i18n-ignore – format name
      import: importIfc,
    });

    context.files.registerExporter({
      id: 'ifc4',
      label: 'IFC4',
      fileName: (editor) => `${editor.model.name || 'model'}.ifc`, // i18n-ignore – file name
      mimeType: 'application/x-step',
      export: (editor) => exportIfc(editor, `Shap3D.ai IFC plugin ${VERSION}`), // i18n-ignore – application name in the file
    });

    context.panels.register({ id: 'properties', label: 'ifc.panel.title', icon: 'tags', component: createPanel(context) });

    context.ui.addContextMenuEntry({
      label: 'ifc.panel.contextEntry',
      when: oneGroupSelected,
      run: () => context.panels.open('properties'),
    });
  },
};

export default plugin;
