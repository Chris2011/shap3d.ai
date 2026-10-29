import * as THREE from 'three';
import { useLocalStorage } from '@vueuse/core';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sceneToEntities } from './importMesh';
import type { Editor } from './editor';
import { theme, setTheme, setScene } from '../theme';
import { openTour } from '../components/tour';
import { openPalette } from '../components/paletteState';
import { measureView } from './measureView';
import type { Entities, EntityRef } from '../core/model';
import { Entities as EntitiesClass, copyInstanceDetails } from '../core/model';
import type { FaceStyle } from '../core/document';
import { solidOp, isSolid, type SolidOp } from '../core/solids';
import { pluginImporters, type LoadedScene } from '../plugins/fileFormats';
import { showPanel } from '../components/panelState';
import { textureTile, tileUv, imageTexturesReady } from '../core/textures';
import { planeBasis } from '../core/geometry';
import { materialShader, bakeSurface, type BakeFace } from './surfaceShaders';
import { t, localized, shortcutLabel, hasMessage, localize } from '../i18n';

/** group: 'file', 'edit', 'view', 'camera', 'solids', 'plugins' (main menu) or any other name (palette only) */
export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  group: string;
  icon?: string;
  keywords?: string;
  run: (editor: Editor) => void;
  enabled?: (editor: Editor) => boolean;
  checked?: (editor: Editor) => boolean;
  /** starts a new block in the main menu (a line above it) */
  separator?: boolean;
}
/** a command as written below – its label is the message `commands.<id>` */
type CommandDefinition = Omit<Command, 'label'>;

// ------------------------------------------------------------ file helpers
export const download = (name: string, data: Blob | string, type = 'application/octet-stream') => {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
};
export const pickFile = (accept: string): Promise<File | null> => {
  return new Promise((res) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => res(input.files?.[0] ?? null);
    input.click();
  });
};
const safeName = (editor: Editor) => (editor.model.name || t('names.model')).replace(/[^\w\-äöüÄÖÜß ]+/g, '_');

/** Build a plain three.js scene of the model (for exporters). Textures come along with texture coordinates, shader materials baked into pictures. */
export const modelToThree = (editor: Editor): THREE.Group => {
  const root = new THREE.Group();
  root.name = editor.model.name;
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const makeMat = (name: string | undefined, fallback: string, map?: THREE.Texture) => {
    const material = editor.model.material(name);
    const made = new THREE.MeshStandardMaterial({
      // a texture already carries the colour
      color: map ? '#ffffff' : (material?.color ?? fallback),
      map: map ?? null,
      transparent: (material?.opacity ?? 1) < 1,
      opacity: material?.opacity ?? 1,
      side: THREE.DoubleSide,
      roughness: 0.8,
    });
    made.name = name ?? 'Standard';
    return made;
  };
  const getMat = (name: string | undefined, fallback: string, map?: THREE.Texture) => {
    const key = name ?? '__default';
    let cached = mats.get(key);
    if (!cached) {
      cached = makeMat(name, fallback, map);
      mats.set(key, cached);
    }
    return cached;
  };
  // a definition placed many times is baked once
  const baked = new Map<Entities, Map<string, { material: THREE.MeshStandardMaterial; uvs: number[] } | null>>();
  const hidden = editor.model.hiddenTags();
  const frontColor = editor.model.settings.style.frontColor;
  const build = (ents: Entities, parent: THREE.Object3D, inherit?: string) => {
    const byMat = new Map<string, BakeFace[]>();
    for (const face of ents.faces.values()) {
      if (face.hidden || (face.tag && hidden.has(face.tag))) {
        continue;
      }
      const key = face.material ?? inherit ?? '__default';
      const tri = ents.faceTriangles(face);
      const pts = [...face.outer, ...face.holes.flat()].map((vertex) => ents.positionOf(vertex));
      const faces = byMat.get(key) ?? [];
      faces.push({ points: tri.map((i) => pts[i]), normal: ents.faceNormal(face) });
      byMat.set(key, faces);
    }
    for (const [materialKey, faces] of byMat) {
      const name = materialKey === '__default' ? undefined : materialKey;
      const definition = editor.model.material(name);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          faces.flatMap((face) => face.points.flatMap((point) => [point.x, point.y, point.z])),
          3,
        ),
      );
      geometry.computeVertexNormals();
      let material: THREE.MeshStandardMaterial | undefined;
      const shader = materialShader(definition);
      const tile = shader ? undefined : textureTile(definition);
      if (shader && definition) {
        let perLevel = baked.get(ents);
        if (!perLevel) {
          perLevel = new Map();
          baked.set(ents, perLevel);
        }
        if (!perLevel.has(materialKey)) {
          const surface = bakeSurface(shader, definition, faces);
          perLevel.set(materialKey, surface && { material: makeMat(name, frontColor, surface.texture), uvs: surface.uvs });
        }
        const surface = perLevel.get(materialKey);
        if (surface) {
          material = surface.material;
          geometry.setAttribute('uv', new THREE.Float32BufferAttribute(surface.uvs, 2));
        }
      } else if (tile) {
        material = getMat(name, frontColor, tile.map);
        const uvs: number[] = [];
        for (const face of faces) {
          const { basisU, basisV } = planeBasis(face.normal);
          for (const point of face.points) {
            uvs.push(...tileUv(tile, point, basisU, basisV));
          }
        }
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      }
      parent.add(new THREE.Mesh(geometry, material ?? getMat(name, frontColor)));
    }
    for (const instance of ents.instances.values()) {
      if (instance.hidden || (instance.tag && hidden.has(instance.tag))) {
        continue;
      }
      const group = new THREE.Group();
      group.name = instance.name || instance.definition.name;
      group.matrixAutoUpdate = false;
      group.matrix.copy(instance.matrix);
      instance.matrix.decompose(group.position, group.quaternion, group.scale);
      group.matrixAutoUpdate = true;
      parent.add(group);
      build(instance.definition.entities, group, instance.material ?? inherit);
    }
  };
  build(editor.model.root, root);
  // SketchUp is Z-up; most formats expect Y-up
  const yup = new THREE.Group();
  yup.rotation.x = -Math.PI / 2;
  yup.add(root);
  const wrap = new THREE.Group();
  wrap.add(yup);
  wrap.updateMatrixWorld(true);
  return wrap;
};

export type ExportKind = 'glb' | 'gltf' | 'stl' | 'obj' | 'png' | 'json';

export interface ExportedFile {
  name: string;
  mimeType: string;
  data: Blob | string;
}

/** The model (or for PNG the current view) as a file, without downloading it – also used by the remote API. */
export const exportFile = async (editor: Editor, kind: ExportKind): Promise<ExportedFile> => {
  const name = safeName(editor);
  if (kind === 'json') {
    return { name: `${name}.shap3d.json`, mimeType: 'application/json', data: JSON.stringify(editor.model.toJSON()) };
  }
  if (kind === 'png') {
    const image = await fetch(editor.viewer.snapshot()).then((response) => response.blob());
    return { name: `${name}.png`, mimeType: 'image/png', data: image };
  }
  const scene = modelToThree(editor);
  if (kind === 'stl') {
    return { name: `${name}.stl`, mimeType: 'model/stl', data: new STLExporter().parse(scene, { binary: false }) as string };
  }
  if (kind === 'obj') {
    return { name: `${name}.obj`, mimeType: 'text/plain', data: new OBJExporter().parse(scene) };
  }
  await imageTexturesReady();
  const res: any = await new GLTFExporter().parseAsync(scene, { binary: kind === 'glb' });
  if (kind === 'glb') {
    return { name: `${name}.glb`, mimeType: 'model/gltf-binary', data: new Blob([res], { type: 'model/gltf-binary' }) };
  }
  return { name: `${name}.gltf`, mimeType: 'model/gltf+json', data: JSON.stringify(res) };
};

/** ask to purge unused groups/components when saving (SketchUp's "Purge Unused" reminder) – off by default, kept in the browser */
export const purgeReminder = useLocalStorage('s3d.purgeReminder', false);

/** Saves the model as .shap3d.json – with the purge reminder first, if it is on and there is something to purge. */
const saveModel = async (editor: Editor) => {
  const unused = editor.model.unusedDefinitions().length;
  if (purgeReminder.value && unused && (await editor.confirm(t('confirm.purgeOnSave', { count: unused })))) {
    editor.commit('undo.purge', () => editor.model.purge());
  }
  await exportAs(editor, 'json');
};

export const exportAs = async (editor: Editor, kind: ExportKind) => {
  const file = await exportFile(editor, kind);
  download(file.name, file.data, file.mimeType);
  if (kind === 'json') {
    editor.ui.saved = true;
  }
};

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
  throw new Error(t('import.unsupported', { ext }));
};

export const importFile = async (editor: Editor, file: File) => {
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
  let info = { triangles: 0, groups: 0, materials: 0, skipped: 0 };
  editor.commit('undo.import', () => {
    const result = sceneToEntities(obj, editor.model, conv, base);
    info = result;
    if (!result.root.faces.size && !result.root.instances.size) {
      throw new Error(t('import.noFaces'));
    }
    // put it on the ground, centred on the origin
    const box = result.root.bounds();
    const shift = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z);
    for (const vertex of result.root.vertices.values()) {
      vertex.position.applyMatrix4(shift);
    }
    result.root.invalidateHash();
    for (const instance of result.root.instances.values()) {
      instance.matrix.premultiply(shift);
    }
    const def = editor.model.newDefinition(editor.model.uniqueDefName(base), true, result.root);
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
  editor.zoomExtents();
};

// ------------------------------------------------------------ selection-based operations
export const makeGroup = (editor: Editor, component: boolean, name?: string) => {
  const refs = editor.selected();
  if (!refs.length) {
    editor.toast(t('toast.nothingSelected'));
    return;
  }
  editor.commit(component ? 'undo.makeComponent' : 'commands.makeGroup', () => {
    const { entities } = editor.entities.extract(refs);
    // component axes: put origin at the bbox min corner like SketchUp
    const box = entities.bounds();
    const insertOrigin = component && !box.isEmpty() ? box.min.clone() : new THREE.Vector3();
    const matrix = new THREE.Matrix4().makeTranslation(insertOrigin.x, insertOrigin.y, insertOrigin.z);
    if (component) {
      for (const vertex of entities.vertices.values()) {
        vertex.position.sub(insertOrigin);
      }
      for (const instance of entities.instances.values()) {
        instance.matrix.premultiply(new THREE.Matrix4().makeTranslation(-insertOrigin.x, -insertOrigin.y, -insertOrigin.z));
      }
      entities.invalidateHash();
    }
    const def = editor.model.newDefinition(
      name || editor.model.uniqueDefName(component ? t('names.component') : t('names.group')),
      component,
      entities,
    );
    const inst = editor.entities.addInstance(def, component ? matrix : new THREE.Matrix4(), component ? '' : '');
    editor.select([{ kind: 'instance', id: inst.id }]);
  });
};

export const explode = (editor: Editor) => {
  const refs = editor.selected().filter((entityRef) => entityRef.kind === 'instance');
  if (!refs.length) {
    return;
  }
  editor.commit('commands.explode', () => {
    const out: EntityRef[] = [];
    for (const entityRef of refs) {
      const instance = editor.entities.instances.get(entityRef.id);
      if (!instance) {
        continue;
      }
      out.push(...editor.entities.merge(instance.definition.entities, instance.matrix, editor.model, instance.material));
      editor.entities.instances.delete(instance.id);
    }
    editor.model.purge();
    editor.select(out);
  });
};

export const deleteSelection = (editor: Editor) => {
  const refs = editor.selected();
  if (!refs.length) {
    return;
  }
  editor.commit('commands.delete', () => {
    editor.entities.erase(refs);
    editor.clearSelection();
  });
};

export const copySelection = (editor: Editor, cut = false) => {
  const refs = editor.selected();
  if (!refs.length) {
    return;
  }
  const tmp = new EntitiesClass();
  const ents = editor.entities;
  // copy geometry without removing it from the model
  const faceIds = new Set(refs.filter((entityRef) => entityRef.kind === 'face').map((entityRef) => entityRef.id));
  const edgeIds = new Set(refs.filter((entityRef) => entityRef.kind === 'edge').map((entityRef) => entityRef.id));
  for (const id of faceIds) {
    const face = ents.faces.get(id);
    if (face) {
      ents.faceEdges(face).forEach((edge) => edgeIds.add(edge.id));
    }
  }
  const vmap = new Map<number, number>();
  const mapVertex = (vertex: number) => {
    if (!vmap.has(vertex)) {
      vmap.set(vertex, tmp.rawVertex(editor.toWorld(ents.positionOf(vertex))));
    }
    return vmap.get(vertex)!;
  };
  for (const id of edgeIds) {
    const edge = ents.edges.get(id);
    if (edge) {
      tmp.createEdgeRaw(mapVertex(edge.start), mapVertex(edge.end), { soft: edge.soft, hidden: edge.hidden });
    }
  }
  for (const id of faceIds) {
    const face = ents.faces.get(id);
    if (face) {
      tmp.createFaceRaw(
        face.outer.map(mapVertex),
        face.holes.map((hole) => hole.map(mapVertex)),
        { material: face.material, backMaterial: face.backMaterial },
      );
    }
  }
  for (const entityRef of refs) {
    if (entityRef.kind === 'instance') {
      const instance = ents.instances.get(entityRef.id);
      if (instance) {
        copyInstanceDetails(instance, tmp.addInstance(instance.definition, editor.contextMatrix.multiply(instance.matrix), instance.name));
      }
    }
  }
  editor.clipboard = tmp;
  if (cut) {
    deleteSelection(editor);
  }
  editor.toast(cut ? t('toast.cut') : t('toast.copied'));
};

export const paste = (editor: Editor, inPlace = false) => {
  const clip = editor.clipboard as Entities | null;
  if (!clip) {
    return;
  }
  editor.commit(inPlace ? 'commands.pasteInPlace' : 'commands.paste', () => {
    const refs = editor.entities.merge(clip, editor.contextInverse, editor.model, undefined, true);
    editor.select(refs);
  });
  if (!inPlace) {
    // attach to the cursor like SketchUp: start a move from the selection's bbox corner
    const box = editor.entities.refBounds(editor.selected());
    if (box.isEmpty()) {
      return;
    }
    const moveTool: any = editor.tools.get('move');
    editor.setTool('move');
    const start = editor.toWorld(new THREE.Vector3(box.min.x, box.min.y, box.min.z));
    moveTool.copy = false;
    moveTool.begin(start);
    // the paste and the following move become separate steps; moving starts immediately
  }
};

export const hideSelection = (editor: Editor) => {
  const refs = editor.selected();
  if (!refs.length) {
    return;
  }
  editor.commit('commands.hide', () => {
    for (const entityRef of refs) {
      if (entityRef.kind === 'face') {
        const face = editor.entities.faces.get(entityRef.id);
        if (face) {
          face.hidden = true;
        }
      }
      if (entityRef.kind === 'edge') {
        const edge = editor.entities.edges.get(entityRef.id);
        if (edge) {
          edge.hidden = true;
        }
      }
      if (entityRef.kind === 'instance') {
        const instance = editor.entities.instances.get(entityRef.id);
        if (instance) {
          instance.hidden = true;
        }
      }
    }
    editor.clearSelection();
  });
};
export const unhideAll = (editor: Editor) => {
  editor.commit('commands.unhideAll', () => {
    const entities = editor.entities;
    entities.faces.forEach((face) => (face.hidden = undefined));
    entities.edges.forEach((x) => (x.hidden = undefined));
    entities.instances.forEach((instance) => (instance.hidden = false));
  });
};
export const reverseFaces = (editor: Editor) => {
  const refs = editor.selected().filter((entityRef) => entityRef.kind === 'face');
  if (!refs.length) {
    return;
  }
  editor.commit('commands.reverseFaces', () => {
    for (const entityRef of refs) {
      const face = editor.entities.faces.get(entityRef.id);
      if (face) {
        editor.entities.reverseFace(face);
      }
    }
  });
};
/** Orient all connected faces consistently with the selected one. */
export const orientFaces = (editor: Editor) => {
  const entityRef = editor.selected().find((x) => x.kind === 'face');
  if (!entityRef) {
    return;
  }
  editor.commit('commands.orientFaces', () => {
    const entities = editor.entities;
    const seen = new Set([entityRef.id]);
    const queue = [entityRef.id];
    while (queue.length) {
      const current = entities.faces.get(queue.shift()!)!;
      for (const loop of entities.loops(current)) {
        for (let i = 0; i < loop.length; i++) {
          const vertexA = loop[i],
            vertexB = loop[(i + 1) % loop.length];
          const edge = entities.edgeBetween(vertexA, vertexB);
          if (!edge) {
            continue;
          }
          const faces = entities.facesOfEdge(edge.id);
          if (faces.length !== 2) {
            continue;
          }
          for (const face of faces) {
            if (seen.has(face.id)) {
              continue;
            }
            seen.add(face.id);
            // neighbour must traverse a→b in opposite direction
            let same = false;
            for (const gl of entities.loops(face)) {
              for (let j = 0; j < gl.length; j++) {
                if (gl[j] === vertexA && gl[(j + 1) % gl.length] === vertexB) {
                  same = true;
                }
              }
            }
            if (same) {
              entities.reverseFace(face);
            }
            queue.push(face.id);
          }
        }
      }
    }
  });
};
export const softenSelection = (editor: Editor, soft: boolean) => {
  const refs = editor.selected();
  editor.commit(soft ? 'commands.soften' : 'commands.unsoften', () => {
    const entities = editor.entities;
    const ids = new Set<number>();
    for (const entityRef of refs) {
      if (entityRef.kind === 'edge') {
        ids.add(entityRef.id);
      }
      if (entityRef.kind === 'face') {
        const face = entities.faces.get(entityRef.id);
        if (face) {
          entities.faceEdges(face).forEach((edge) => ids.add(edge.id));
        }
      }
    }
    for (const id of ids) {
      const edge = entities.edges.get(id);
      if (edge && (!soft || entities.facesOfEdge(id).length === 2)) {
        edge.soft = soft || undefined;
      }
    }
  });
};
export const flipSelection = (editor: Editor, axis: 'x' | 'y' | 'z') => {
  const refs = editor.selected();
  if (!refs.length) {
    return;
  }
  const box = editor.entities.refBounds(refs);
  const center = box.getCenter(new THREE.Vector3());
  const scale = new THREE.Vector3(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1);
  const matrix = new THREE.Matrix4()
    .makeTranslation(center.x, center.y, center.z)
    .multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  editor.commit('undo.flip', () => {
    const entities = editor.entities;
    entities.transform(refs, matrix);
    // mirrored faces must be reversed to keep their front side outside
    for (const entityRef of refs) {
      if (entityRef.kind === 'face') {
        const face = entities.faces.get(entityRef.id);
        if (face) {
          entities.reverseFace(face);
        }
      }
    }
  });
};
export const zoomSelection = (editor: Editor) => {
  const refs = editor.selected();
  if (!refs.length) {
    editor.zoomExtents();
    return;
  }
  const box = editor.entities.refBounds(refs).applyMatrix4(editor.contextMatrix);
  editor.viewer.rig.zoomExtents(box);
};
export const intersectSelection = (editor: Editor) => {
  // intersect selected faces with each other: add lines where coplanar-crossing edges meet faces
  const refs = editor.selected().filter((entityRef) => entityRef.kind === 'face');
  if (refs.length < 2) {
    editor.toast(t('toast.selectTwoFaces'));
    return;
  }
  editor.commit('undo.intersect', () => {
    const entities = editor.entities;
    const faces = refs.map((entityRef) => entities.faces.get(entityRef.id)!).filter(Boolean);
    const segs: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const segment = faceFaceIntersection(entities, faces[i], faces[j]);
        if (segment) {
          segs.push(segment);
        }
      }
    }
    for (const [start, end] of segs) {
      entities.addLine(start, end);
    }
  });
};
const faceFaceIntersection = (entities: Entities, faceA: any, faceB: any): [THREE.Vector3, THREE.Vector3] | null => {
  const normalA = entities.faceNormal(faceA),
    normalB = entities.faceNormal(faceB);
  const dir = normalA.clone().cross(normalB);
  if (dir.length() < 1e-6) {
    return null;
  }
  // clip the intersection line of both planes against both polygons
  const pointA = entities.positionOf(faceA.outer[0]),
    pointB = entities.positionOf(faceB.outer[0]);
  const params: number[][] = [];
  const pl2 = new THREE.Plane().setFromNormalAndCoplanarPoint(normalB, pointB),
    pl1 = new THREE.Plane().setFromNormalAndCoplanarPoint(normalA, pointA);
  const crossings = (face: any, plane: THREE.Plane) => {
    const pts: THREE.Vector3[] = [];
    const loop = face.outer.map((vertex: number) => entities.positionOf(vertex));
    for (let i = 0; i < loop.length; i++) {
      const current = loop[i],
        next = loop[(i + 1) % loop.length];
      const distCurrent = plane.distanceToPoint(current),
        distNext = plane.distanceToPoint(next);
      if ((distCurrent <= 0 && distNext > 0) || (distCurrent > 0 && distNext <= 0)) {
        pts.push(current.clone().lerp(next, distCurrent / (distCurrent - distNext)));
      }
    }
    return pts;
  };
  const crossingsA = crossings(faceA, pl2),
    crossingsB = crossings(faceB, pl1);
  if (crossingsA.length < 2 || crossingsB.length < 2) {
    return null;
  }
  const direction = dir.normalize();
  const base = crossingsA[0];
  const paramsA = crossingsA.map((point) => point.clone().sub(base).dot(direction)).sort((x, y) => x - y),
    paramsB = crossingsB.map((point) => point.clone().sub(base).dot(direction)).sort((x, y) => x - y);
  params.push(paramsA, paramsB);
  const overlapStart = Math.max(paramsA[0], paramsB[0]),
    overlapEnd = Math.min(paramsA[paramsA.length - 1], paramsB[paramsB.length - 1]);
  if (overlapEnd - overlapStart < 1e-6) {
    return null;
  }
  return [base.clone().addScaledVector(direction, overlapStart), base.clone().addScaledVector(direction, overlapEnd)];
};

/** SketchUp solid tools on selected groups/components (first selected = cutter). */
export const runSolid = (editor: Editor, operation: SolidOp) => {
  const insts = editor
    .selected()
    .filter((entityRef) => entityRef.kind === 'instance')
    .map((entityRef) => editor.entities.instances.get(entityRef.id)!)
    .filter(Boolean);
  if (insts.length < 2) {
    editor.toast(t('toast.selectTwoSolids'));
    return;
  }
  const bad = insts.find((instance) => !isSolid(instance.definition.entities));
  if (bad) {
    editor.toast(t('toast.notASolid', { name: bad.name || bad.definition.name }));
    return;
  }
  try {
    editor.commit(`commands.solid-${operation}`, () => {
      let pieces: Entities[];
      if (operation === 'outershell' || operation === 'union') {
        let acc = insts[0];
        let res: Entities | null = null;
        for (let k = 1; k < insts.length; k++) {
          res = solidOp('union', acc, insts[k])[0];
          const def = editor.model.newDefinition(editor.model.uniqueDefName(t('names.solid')), false, res);
          acc = { id: -1, definition: def, matrix: new THREE.Matrix4(), name: '' } as any;
        }
        pieces = [res!];
      } else {
        pieces = solidOp(operation, insts[0], insts[1]);
      }
      const keep = operation === 'trim' ? [insts[0]] : [];
      for (const instance of insts) {
        if (!keep.includes(instance) && (operation !== 'subtract' || true)) {
          editor.entities.instances.delete(instance.id);
        }
      }
      const refs: EntityRef[] = [];
      for (const entities of pieces) {
        if (!entities.faces.size) {
          continue;
        }
        const def = editor.model.newDefinition(editor.model.uniqueDefName(t('names.solid')), false, entities);
        refs.push({ kind: 'instance', id: editor.entities.addInstance(def, new THREE.Matrix4(), '').id });
      }
      editor.model.purge();
      editor.select(refs);
    });
  } catch (error: any) {
    editor.toast(t('toast.solidFailed', { error: error?.message ?? error }));
  }
};

/** Empties the whole workspace (geometry, groups, guides, dimensions, labels, sections) as one undo step. */
export const clearAll = (editor: Editor) => {
  const model = editor.model;
  if (
    !model.root.faces.size &&
    !model.root.edges.size &&
    !model.root.instances.size &&
    !model.guides.length &&
    !model.dimensions.length &&
    !model.labels.length &&
    !model.sections.length
  ) {
    editor.toast(t('toast.alreadyEmpty'));
    return;
  }
  editor.setContext([]);
  editor.commit('undo.clearAll', () => {
    const entities = model.root;
    for (const id of [...entities.instances.keys()]) {
      entities.instances.delete(id);
    }
    for (const id of [...entities.faces.keys()]) {
      entities.removeFace(id);
    }
    for (const edge of [...entities.edges.values()]) {
      entities.eraseEdge(edge.id, false);
    }
    entities.removeOrphanVertices();
    model.guides = [];
    model.dimensions = [];
    model.labels = [];
    model.sections = [];
  });
  editor.toast(t('toast.cleared'));
};

export const setFaceStyle = (editor: Editor, style: FaceStyle) => {
  editor.model.settings.style.faceStyle = style;
  editor.invalidate();
};

/** Viewing directions (camera minus target) of the standard views, as CameraRig.standardView sets them. */
const STANDARD_VIEW_DIRECTIONS = {
  iso: [-1, -1, 0.8],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  front: [0, -1, 0],
  back: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
} as const;
/** The camera still looks along the standard view (any zoom or pan, no orbit since). */
const isStandardView = (editor: Editor, view: keyof typeof STANDARD_VIEW_DIRECTIONS): boolean => {
  const rig = editor.viewer?.rig;
  if (!rig) {
    return false;
  }
  const direction = rig.position.clone().sub(rig.target).normalize();
  return direction.dot(new THREE.Vector3(...STANDARD_VIEW_DIRECTIONS[view]).normalize()) > 0.9999;
};

const COMMAND_LIST: CommandDefinition[] = [
  // file
  {
    id: 'new',
    shortcut: 'Ctrl+N',
    group: 'file',
    run: async (editor) => {
      if (editor.ui.saved || (await editor.confirm(t('confirm.discardChanges')))) {
        editor.newModel();
      }
    },
  },
  {
    id: 'open',
    shortcut: 'Ctrl+O',
    group: 'file',
    run: async (editor) => {
      const file = await pickFile('.json,.shap3d.json,application/json');
      if (file) {
        await importFile(editor, file).catch((error) => editor.toast(String(error.message ?? error)));
      }
    },
  },
  { id: 'save', shortcut: 'Ctrl+S', group: 'file', run: (editor) => saveModel(editor) },
  {
    id: 'togglePurgeReminder',
    group: 'file',
    run: () => {
      purgeReminder.value = !purgeReminder.value;
    },
    checked: () => purgeReminder.value,
  },
  {
    id: 'saveLocal',
    group: 'file',
    run: (editor) => {
      try {
        localStorage.setItem('s3d:saved', JSON.stringify(editor.model.toJSON()));
        editor.ui.saved = true;
        editor.toast(t('toast.savedInBrowser'));
      } catch {
        editor.toast(t('toast.saveFailed'));
      }
    },
  },
  {
    id: 'loadLocal',
    group: 'file',
    run: (editor) => {
      try {
        const saved = localStorage.getItem('s3d:saved');
        if (saved) {
          editor.loadJSON(JSON.parse(saved));
        } else {
          editor.toast(t('toast.noSavedModel'));
        }
      } catch {
        editor.toast(t('toast.loadFailed'));
      }
    },
  },
  {
    id: 'import',
    group: 'file',
    run: async (editor) => {
      const file = await pickFile([...IMPORT_EXTS, ...pluginImporters.keys()].map((ext) => '.' + ext).join(','));
      if (file) {
        await importFile(editor, file).catch((error) => editor.toast(String(error.message ?? error)));
      }
    },
  },
  { id: 'export-glb', group: 'file', run: (editor) => exportAs(editor, 'glb') },
  { id: 'export-gltf', group: 'file', run: (editor) => exportAs(editor, 'gltf') },
  { id: 'export-stl', group: 'file', run: (editor) => exportAs(editor, 'stl') },
  { id: 'export-obj', group: 'file', run: (editor) => exportAs(editor, 'obj') },
  { id: 'export-png', group: 'file', run: (editor) => exportAs(editor, 'png') },
  {
    id: 'print',
    group: 'file',
    run: (editor) => {
      const url = editor.viewer.snapshot();
      const printWindow = window.open('');
      if (printWindow) {
        printWindow.document.write(`<img src="${url}" style="max-width:100%">`);
        printWindow.document.close();
        printWindow.onload = () => printWindow.print();
        setTimeout(() => printWindow.print(), 300);
      }
    },
  },
  // edit
  { id: 'undo', shortcut: 'Ctrl+Z', group: 'edit', run: (editor) => editor.undo(), enabled: (editor) => editor.ui.canUndo },
  { id: 'redo', shortcut: 'Ctrl+Y', group: 'edit', run: (editor) => editor.redo(), enabled: (editor) => editor.ui.canRedo },
  { id: 'cut', shortcut: 'Ctrl+X', group: 'edit', run: (editor) => copySelection(editor, true) },
  { id: 'copy', shortcut: 'Ctrl+C', group: 'edit', run: (editor) => copySelection(editor) },
  { id: 'paste', shortcut: 'Ctrl+V', group: 'edit', run: (editor) => paste(editor) },
  { id: 'pasteInPlace', group: 'edit', run: (editor) => paste(editor, true) },
  { id: 'delete', shortcut: 'Del', group: 'edit', run: deleteSelection },
  { id: 'clearAll', group: 'edit', run: clearAll },
  {
    id: 'deleteGuides',
    group: 'edit',
    run: (editor) =>
      editor.commit('commands.deleteGuides', () => {
        editor.model.guides = [];
      }),
  },
  { id: 'selectAll', shortcut: 'Ctrl+A', group: 'edit', run: (editor) => editor.selectAll() },
  { id: 'selectNone', shortcut: 'Ctrl+T', group: 'edit', run: (editor) => editor.clearSelection() },
  {
    id: 'invertSel',
    shortcut: 'Ctrl+Shift+I',
    group: 'edit',
    run: (editor) => {
      const cur = new Set(editor.selected().map((entityRef) => editor.key(entityRef)));
      editor.selectAll();
      editor.select(editor.selected().filter((entityRef) => !cur.has(editor.key(entityRef))));
    },
  },
  { id: 'hide', group: 'edit', run: hideSelection },
  { id: 'unhideAll', group: 'edit', run: unhideAll },
  { id: 'makeGroup', group: 'edit', run: (editor) => makeGroup(editor, false) },
  {
    id: 'makeComponent',
    shortcut: 'G',
    group: 'edit',
    run: async (editor) => {
      if (!editor.selected().length) {
        editor.toast(t('toast.nothingSelected'));
        return;
      }
      const componentName = await editor.prompt(t('prompt.componentName'), editor.model.uniqueDefName(t('names.component')));
      if (componentName != null) {
        makeGroup(editor, true, componentName);
      }
    },
  },
  { id: 'explode', group: 'edit', run: explode },
  {
    id: 'editGroup',
    group: 'edit',
    run: (editor) => {
      const entityRef = editor.selected().find((x) => x.kind === 'instance');
      const instance = entityRef && editor.entities.instances.get(entityRef.id);
      if (instance) {
        editor.enterInstance(instance);
      }
    },
  },
  { id: 'closeGroup', group: 'edit', run: (editor) => editor.exitContext() },
  {
    id: 'makeUnique',
    group: 'edit',
    run: (editor) =>
      editor.commit('commands.makeUnique', () => {
        for (const entityRef of editor.selected()) {
          if (entityRef.kind === 'instance') {
            const instance = editor.entities.instances.get(entityRef.id);
            if (instance) {
              instance.definition = editor.model.cloneDefinition(instance.definition);
            }
          }
        }
      }),
  },
  {
    id: 'lock',
    group: 'edit',
    run: (editor) =>
      editor.commit('commands.lock', () => {
        for (const entityRef of editor.selected()) {
          if (entityRef.kind === 'instance') {
            const instance = editor.entities.instances.get(entityRef.id);
            if (instance) {
              instance.locked = true;
            }
          }
        }
      }),
  },
  {
    id: 'unlock',
    group: 'edit',
    run: (editor) =>
      editor.commit('commands.unlock', () => {
        for (const entityRef of editor.selected()) {
          if (entityRef.kind === 'instance') {
            const instance = editor.entities.instances.get(entityRef.id);
            if (instance) {
              instance.locked = false;
            }
          }
        }
      }),
  },
  { id: 'reverseFaces', group: 'edit', run: reverseFaces },
  { id: 'orientFaces', group: 'edit', run: orientFaces },
  { id: 'soften', group: 'edit', run: (editor) => softenSelection(editor, true) },
  { id: 'unsoften', group: 'edit', run: (editor) => softenSelection(editor, false) },
  { id: 'intersect', group: 'edit', run: intersectSelection },
  { id: 'flipX', group: 'edit', run: (editor) => flipSelection(editor, 'x') },
  { id: 'flipY', group: 'edit', run: (editor) => flipSelection(editor, 'y') },
  { id: 'flipZ', group: 'edit', run: (editor) => flipSelection(editor, 'z') },
  // solid tools
  { id: 'solid-union', group: 'solids', run: (editor) => runSolid(editor, 'union') },
  { id: 'solid-subtract', group: 'solids', run: (editor) => runSolid(editor, 'subtract') },
  { id: 'solid-intersect', group: 'solids', run: (editor) => runSolid(editor, 'intersect') },
  { id: 'solid-outershell', group: 'solids', run: (editor) => runSolid(editor, 'outershell') },
  { id: 'solid-trim', group: 'solids', run: (editor) => runSolid(editor, 'trim') },
  { id: 'solid-split', group: 'solids', run: (editor) => runSolid(editor, 'split') },
  // view
  { id: 'themeDark', group: 'view', run: () => setTheme('dark'), checked: () => theme.mode === 'dark' },
  { id: 'themeLight', group: 'view', run: () => setTheme('light'), checked: () => theme.mode === 'light' },
  { id: 'themeSystem', group: 'view', run: () => setTheme('system'), checked: () => theme.mode === 'system' },
  { id: 'sceneNight', group: 'view', run: () => setScene('night'), checked: () => theme.scene === 'night' },
  { id: 'sceneDay', group: 'view', run: () => setScene('day'), checked: () => theme.scene === 'day' },
  { id: 'sceneAuto', group: 'view', run: () => setScene('auto'), checked: () => theme.scene === 'auto' },
  { id: 'tour', group: 'view', run: () => openTour() },
  { id: 'commandPalette', shortcut: 'Ctrl+Shift+P', group: 'view', run: () => openPalette() },
  { id: 'managePlugins', group: 'plugins', run: () => showPanel('plugins') },
  {
    id: 'toggleAxes',
    group: 'view',
    run: (editor) => {
      editor.model.settings.axes = !editor.model.settings.axes;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.axes,
  },
  {
    id: 'toggleRulers',
    group: 'view',
    run: (editor) => {
      measureView.rulers = !measureView.rulers;
      editor.invalidate();
    },
    checked: () => measureView.rulers,
  },
  {
    id: 'toggleGrid',
    group: 'view',
    run: (editor) => {
      measureView.grid = !measureView.grid;
      editor.invalidate();
    },
    checked: () => measureView.grid,
  },
  {
    id: 'toggleGridAxes',
    group: 'view',
    run: (editor) => {
      measureView.gridAxes = !measureView.gridAxes;
      editor.invalidate();
    },
    checked: () => measureView.gridAxes,
  },
  {
    id: 'toggleGridLabels',
    group: 'view',
    run: (editor) => {
      measureView.labels = !measureView.labels;
      editor.invalidate();
    },
    checked: () => measureView.labels,
  },
  {
    id: 'togglePeopleSize',
    group: 'view',
    run: (editor) => {
      measureView.people = !measureView.people;
      editor.invalidate();
    },
    checked: () => measureView.people,
  },
  {
    id: 'toggleSceneTabs',
    group: 'view',
    run: (editor) => {
      editor.model.settings.sceneTabs = !editor.model.settings.sceneTabs;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.sceneTabs,
  },
  {
    id: 'toggleGuides',
    group: 'view',
    run: (editor) => {
      editor.model.settings.guides = !editor.model.settings.guides;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.guides,
  },
  {
    id: 'toggleShadows',
    group: 'view',
    run: (editor) => {
      editor.model.settings.shadows = !editor.model.settings.shadows;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.shadows,
  },
  {
    id: 'toggleHidden',
    group: 'view',
    run: (editor) => {
      editor.model.settings.hiddenGeometry = !editor.model.settings.hiddenGeometry;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.hiddenGeometry,
  },
  {
    id: 'toggleSectionPlanes',
    group: 'view',
    run: (editor) => {
      editor.model.settings.sectionPlanes = !editor.model.settings.sectionPlanes;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.sectionPlanes,
  },
  {
    id: 'toggleSectionCuts',
    group: 'view',
    run: (editor) => {
      editor.model.settings.sectionCuts = !editor.model.settings.sectionCuts;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.sectionCuts,
  },
  {
    id: 'xray',
    shortcut: 'Alt+K',
    group: 'view',
    run: (editor) => {
      editor.model.settings.style.xray = !editor.model.settings.style.xray;
      editor.invalidate();
    },
    checked: (editor) => editor.model.settings.style.xray,
  },
  {
    id: 'style-wireframe',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'wireframe'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'wireframe',
  },
  {
    id: 'style-hiddenline',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'hiddenline'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'hiddenline',
  },
  {
    id: 'style-shaded',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'shaded'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'shaded',
  },
  {
    id: 'style-textured',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'textured'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'textured',
  },
  {
    id: 'style-monochrome',
    group: 'view',
    run: (editor) => setFaceStyle(editor, 'monochrome'),
    checked: (editor) => editor.model.settings.style.faceStyle === 'monochrome',
  },
  // camera
  { id: 'zoomExtents', shortcut: 'Shift+Z', group: 'camera', run: (editor) => editor.zoomExtents() },
  { id: 'zoomSelection', group: 'camera', run: zoomSelection },
  {
    id: 'persp',
    group: 'camera',
    separator: true,
    run: (editor) => {
      editor.viewer.rig.isOrtho = false;
      editor.ui.projection = 'persp';
      editor.viewer.rig.syncOrtho();
      editor.redraw();
    },
    checked: (editor) => !editor.viewer?.rig.isOrtho,
  },
  {
    id: 'ortho',
    group: 'camera',
    run: (editor) => {
      editor.viewer.rig.isOrtho = true;
      editor.ui.projection = 'ortho';
      editor.viewer.rig.syncOrtho();
      editor.redraw();
    },
    checked: (editor) => !!editor.viewer?.rig.isOrtho,
  },
  ...(['iso', 'top', 'front', 'right', 'back', 'left', 'bottom'] as const).map((view) => ({
    id: 'view-' + view,
    group: 'camera',
    separator: view === 'iso',
    run: (editor: Editor) => editor.viewer.rig.standardView(view, editor.model.bounds()),
    checked: (editor: Editor) => isStandardView(editor, view),
  })),
];

/** Label (`commands.<id>`) and shortcut follow the language. */
const localizeCommand = (definition: CommandDefinition): Command => {
  const shortcut = definition.shortcut;
  const command = localized(definition as Command, 'label', `commands.${definition.id}`);
  if (shortcut) {
    Object.defineProperty(command, 'shortcut', { get: () => shortcutLabel(shortcut), enumerable: true, configurable: true });
  }
  return command;
};

export const COMMANDS: Command[] = COMMAND_LIST.map(localizeCommand);

/** main-menu groups; plugins may still name the German ones */
export const GROUP_ALIASES: Record<string, string> = {
  Datei: 'file',
  Bearbeiten: 'edit',
  Ansicht: 'view',
  Kamera: 'camera',
  Volumenkörper: 'solids',
  Plugins: 'plugins',
};
/** shown name of a command group */
export const groupLabel = (group: string) => {
  const key = `groups.${GROUP_ALIASES[group] ?? group}`;
  return hasMessage(key) ? t(key) : localize(group);
};

export const findCommand = (id: string) => {
  return COMMANDS.find((command) => command.id === id);
};
export const runCommand = (editor: Editor, id: string) => {
  const command = findCommand(id);
  if (command && (!command.enabled || command.enabled(editor))) {
    command.run(editor);
  }
};
