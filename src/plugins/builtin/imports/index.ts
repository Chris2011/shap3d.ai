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
  version: '1.1.0',
  author: 'Shap3D.ai',
  description: 'imports.plugin.description',
  messages: { de: german.messages, en: english.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages },

  activate(context) {
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
