// Opening and importing files: own formats, converted SketchUp files and plugin importers.
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sceneToEntities } from '../importMesh';
import type { Editor } from '../editor';
import type { Definition } from '../../core/model';
import type { PlaceTool } from '../../tools/place';
import { pluginImporters, type LoadedScene } from '../../plugins/fileFormats';
import { t } from '../../i18n';

/** Import mesh files as a component made of faces (coplanar triangles merged). */
/** File extensions the app reads itself; further formats come from plugins (built-in "Importformate": FBX, DAE, 3DS, .blend …). */
export const IMPORT_EXTS = ['skp', 'obj', 'stl', 'glb', 'gltf'];

/** Sends a .skp file to the local converter and returns the resulting .glb. */
const convertLocally = async (ext: 'skp', file: File): Promise<ArrayBuffer> => {
  let response: Response;
  try {
    response = await fetch(`/__convert?from=${ext}`, { method: 'POST', body: file });
  } catch {
    throw new Error(t('import.converterUnreachable'));
  }
  if (response.status === 404) {
    throw new Error(t('import.needsLocalServer'));
  }
  if (response.status === 503) {
    // the local server has no SketchUp SDK – what it says about that is for developers
    throw new Error(t('import.skpNeedsSdk'));
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? t('import.conversionFailed', { status: response.status }));
  }
  return response.arrayBuffer();
};

/**
 * Loads a foreign 3D file into a three.js scene.
 * upY: the scene comes Y-up and must be turned to our Z-up; scale: known unit factor to metres (null = guess).
 */
const loadForeign = async (ext: string, file: File): Promise<LoadedScene> => {
  const buf = () => file.arrayBuffer(),
    txt = () => file.text();
  switch (ext) {
    case 'obj':
      return { object: new OBJLoader().parse(await txt()), upY: true, scale: null };
    case 'stl':
      return { object: new THREE.Mesh(new STLLoader().parse(await buf())), upY: false, scale: 1 };
    case 'glb':
      return { object: (await new GLTFLoader().parseAsync(await buf(), '')).scene, upY: true, scale: 1 };
    case 'gltf':
      return { object: (await new GLTFLoader().parseAsync(await txt(), '')).scene, upY: true, scale: 1 };
    // SketchUp files are converted to glTF by the local converter (tools/convertBridge.ts + SketchUp SDK)
    // (tools/skp/skp2glb.py writes Z-up in metres, like SketchUp itself)
    case 'skp':
      return { object: (await new GLTFLoader().parseAsync(await convertLocally('skp', file), '')).scene, upY: false, scale: 1 };
  }
  throw new Error(t('import.unsupported', { ext }) + (pluginImporters.has('fbx') ? '' : ` ${t('import.morePlugin')}`));
};

export interface ImportOptions {
  onCreated?: (definition: Definition) => void;
  place?: boolean;
}

/**
 * opens a file; what the parsers throw on a broken file ("Invalid typed array length") becomes a sentence.
 * `options.onCreated` runs inside the import's undo step with the new component, and `options.place` lets the user place it with the
 * mouse instead of putting it on the origin – neither for formats a plugin imports itself or for a model file.
 */
export const importFile = async (editor: Editor, file: File, options: ImportOptions = {}) => {
  try {
    await importFileUnchecked(editor, file, options);
  } catch (error) {
    if (
      error instanceof TypeError ||
      error instanceof RangeError ||
      error instanceof SyntaxError ||
      /THREE\./.test(String((error as Error)?.message))
    ) {
      console.error(error);
      throw new Error(t('import.unreadable', { name: file.name }));
    }
    throw error;
  }
};

const importFileUnchecked = async (editor: Editor, file: File, { onCreated, place }: ImportOptions) => {
  const ext = file.name.split('.').pop()!.toLowerCase();
  const pluginImporter = pluginImporters.get(ext);
  if (pluginImporter?.import) {
    await pluginImporter.import(file, editor);
    editor.invalidate();
    return;
  }
  if (ext === 'json') {
    const json = JSON.parse(await file.text());
    if (typeof json.format === 'string' && json.format.startsWith('shap3d/')) {
      editor.loadJSON(json);
      editor.model.name = file.name.replace(/\.(shap3d|formwerk|suv)\.json$|\.json$/i, '');
      return;
    }
    throw new Error(t('import.unknownJson'));
  }
  if (ext === 'max') {
    throw new Error(t('import.maxFile'));
  }
  // plugins may only read the file (loadScene) – the conversion below is the same for every format
  const {
    object: obj,
    upY,
    scale: fixedScale,
  } = pluginImporter?.loadScene ? await pluginImporter.loadScene(file) : await loadForeign(ext, file);
  // unit guess for formats without reliable units (cm/mm are common in FBX and 3DS)
  let scale = fixedScale ?? 1,
    unitNote = '';
  if (fixedScale == null) {
    // no unit in the file: objects bigger than 100 units are almost always modelled in cm (or mm)
    obj.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    const big = Math.max(size.x, size.y, size.z);
    if (big > 10000) {
      scale = 0.001;
      unitNote = ` (${t('import.detectedMillimetres')})`;
    } else if (big > 100) {
      scale = 0.01;
      unitNote = ` (${t('import.detectedCentimetres')})`;
    }
  } else if (ext === 'fbx' && Math.abs(fixedScale - 1) > 1e-6) {
    unitNote =
      fixedScale === 0.01
        ? ` (${t('units.centimetres')})`
        : fixedScale === 0.001
          ? ` (${t('units.millimetres')})`
          : Math.abs(fixedScale - 0.0254) < 1e-6
            ? ` (${t('units.inches')})`
            : '';
  }
  // our world is Z-up in metres
  const conv = new THREE.Matrix4().makeScale(scale, scale, scale);
  if (upY) {
    conv.premultiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  }
  const base = file.name.replace(/\.[^.]+$/, '');
  // the faces are made in a worker – the app stays usable meanwhile
  const statusBefore = editor.ui.status;
  editor.ui.status = t('statusbar.building');
  const info = await sceneToEntities(obj, editor.model, conv, base).finally(() => {
    editor.ui.status = statusBefore;
  });
  let toPlace: Definition | undefined;
  editor.commit('undo.import', () => {
    const root = info.build();
    if (!root.faces.size && !root.instances.size) {
      throw new Error(t('import.noFaces'));
    }
    // put it on the ground, centred on the origin
    const box = root.bounds();
    const shift = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z);
    for (const vertex of root.vertices.values()) {
      vertex.position.applyMatrix4(shift);
    }
    root.invalidateHash();
    for (const instance of root.instances.values()) {
      instance.matrix.premultiply(shift);
    }
    const def = editor.model.newDefinition(editor.model.uniqueDefName(base), true, root);
    onCreated?.(def);
    if (place) {
      toPlace = def;
      return;
    }
    const inst = editor.entities.addInstance(def, new THREE.Matrix4(), '');
    editor.select([{ kind: 'instance', id: inst.id }]);
  });
  const counts = [t('import.triangles', { count: info.triangles })];
  if (info.groups) {
    counts.push(t('import.groups', { count: info.groups }));
  }
  if (info.materials) {
    counts.push(t('import.materials', { count: info.materials }));
  }
  editor.toast(
    `${file.name}${unitNote}: ${counts.join(', ')}` + (info.skipped ? ` – ${t('import.skipped', { count: info.skipped })}` : ''),
  );
  if (toPlace) {
    (editor.tools.get('place') as PlaceTool).start(toPlace);
    return;
  }
  editor.zoomExtents();
};
