import type { S3dPlugin } from '../../types';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';
import arabic from './i18n/ar.json';

/** The formats and what they are – the loaders themselves come in only when such a file is imported. */
// i18n-ignore-start – format names (with a key where they need a translation)
const FORMATS: { extensions: string[]; label: string }[] = [
  { extensions: ['fbx'], label: 'FBX (3ds Max, Maya, Blender)' },
  { extensions: ['dae'], label: 'Collada' },
  { extensions: ['kmz'], label: 'KMZ (Google Earth / SketchUp)' },
  { extensions: ['3ds'], label: '3DS (3ds Max)' },
  { extensions: ['ply'], label: 'imports.formats.ply' },
  { extensions: ['3mf'], label: 'imports.formats.3mf' },
  { extensions: ['amf'], label: 'imports.formats.amf' },
  { extensions: ['wrl', 'vrml'], label: 'VRML' },
  { extensions: ['usdz', 'usda', 'usdc', 'usd'], label: 'USD / USDZ' },
  { extensions: ['blend'], label: 'Blender' },
];
// i18n-ignore-end

/** loaded on first use – keeps about half a megabyte of loaders out of the start-up bundle */
const loaders = () => import('./loaders');

/**
 * Built-in plugin: import formats beyond OBJ, STL, glTF and SketchUp. Registers only the file
 * types; the readers are loaded the first time such a file is opened. The app turns the read
 * scene into faces (units, axes, placement, one undo step).
 */
const importsPlugin: S3dPlugin = {
  id: 'imports',
  name: 'imports.plugin.name',
  version: '1.2.0',
  author: 'Shap3D.ai',
  description: 'imports.plugin.description',
  messages: { de: german.messages, en: english.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages },

  activate(context) {
    context.files.registerExporter({
      id: 'usdz',
      label: 'imports.export.usdz',
      fileName: (editor) => `${editor.model.name || 'model'}.usdz`, // i18n-ignore – file name
      mimeType: 'model/vnd.usdz+zip',
      export: async (editor) => (await loaders()).exportUsdz(editor),
    });
    context.files.registerExporter({
      id: 'view-svg',
      label: 'imports.export.svg',
      fileName: (editor) => `${editor.model.name || 'model'}.svg`, // i18n-ignore – file name
      mimeType: 'image/svg+xml',
      options: [
        {
          id: 'width',
          label: 'imports.export.size',
          value: 'view',
          choices: [
            { value: 'view', label: 'imports.export.current' },
            { value: '1920', label: '1920 px' }, // i18n-ignore – size
            { value: '3840', label: '3840 px' }, // i18n-ignore – size
          ],
        },
        { id: 'thick', label: 'imports.export.thick', value: true },
      ],
      export: (editor, options) => {
        const viewer = editor.viewer;
        const width = options.width === 'view' ? viewer.width : Number(options.width);
        const height = Math.round((width * viewer.height) / viewer.width);
        const lines = context.render.lines({ camera: viewer.rig.getState(), width, height });
        const path = (list: number[][]) =>
          list.map(([x1, y1, x2, y2]) => `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`).join('');
        // i18n-ignore-next-line – markup
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/><g fill="none" stroke="#000" stroke-linecap="round"><path stroke-width="1" d="${path(lines.edges)}"/><path stroke-width="${options.thick ? 2.5 : 1}" d="${path(lines.profiles)}"/></g></svg>`;
      },
    });
    for (const format of FORMATS) {
      context.files.registerImporter({
        extensions: format.extensions,
        label: format.label,
        loadScene: async (file) => (await loaders()).loadScene(file.name.split('.').pop()!.toLowerCase(), file),
      });
    }
  },
};

export default importsPlugin;
