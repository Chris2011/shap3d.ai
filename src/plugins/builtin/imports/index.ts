import type { S3dPlugin } from '../../types';

/** The formats and what they are – the loaders themselves come in only when such a file is imported. */
const FORMATS: { extensions: string[]; label: string }[] = [
  { extensions: ['fbx'], label: 'FBX (3ds Max, Maya, Blender)' },
  { extensions: ['dae'], label: 'Collada' },
  { extensions: ['kmz'], label: 'KMZ (Google Earth / SketchUp)' },
  { extensions: ['3ds'], label: '3DS (3ds Max)' },
  { extensions: ['ply'], label: 'PLY (3D-Scan)' },
  { extensions: ['3mf'], label: '3MF (3D-Druck)' },
  { extensions: ['amf'], label: 'AMF (3D-Druck)' },
  { extensions: ['wrl', 'vrml'], label: 'VRML' },
  { extensions: ['usdz', 'usda', 'usdc', 'usd'], label: 'USD / USDZ' },
  { extensions: ['blend'], label: 'Blender' },
];

/** loaded on first use – keeps about half a megabyte of loaders out of the start-up bundle */
const loaders = () => import('./loaders');

/**
 * Built-in plugin: import formats beyond OBJ, STL, glTF and SketchUp. Registers only the file
 * types; the readers are loaded the first time such a file is opened. The app turns the read
 * scene into faces (units, axes, placement, one undo step).
 */
const importsPlugin: S3dPlugin = {
  id: 'imports',
  name: 'Importformate',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'Öffnet FBX, Collada (.dae), KMZ, 3DS, PLY, 3MF, AMF, VRML, USD/USDZ und Blender-Dateien (.blend) – ohne die Originalprogramme. Die Leseroutinen werden erst beim ersten Import geladen.',

  activate(context) {
    for (const format of FORMATS) {
      context.files.registerImporter({
        extensions: format.extensions,
        label: format.label,
        loadScene: async file => (await loaders()).loadScene(file.name.split('.').pop()!.toLowerCase(), file),
      });
    }
  },
};

export default importsPlugin;
