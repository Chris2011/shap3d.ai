import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { KMZLoader } from 'three/examples/jsm/loaders/KMZLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js';
import { sceneToEntities } from './importMesh';
import { readBlend } from '../core/blend/blendScene';
import type { Editor } from './editor';
import { theme, setTheme, setScene } from '../theme';
import { openTour } from '../components/tour';
import { openPalette } from '../components/paletteState';
import { measureView } from './measureView';
import type { Entities, EntityRef } from '../core/model';
import { Entities as EntitiesClass } from '../core/model';
import type { FaceStyle } from '../core/document';
import { solidOp, isSolid, type SolidOp } from '../core/solids';
import { pluginImporters } from '../plugins/fileFormats';
import { showPanel } from '../components/panelState';

export interface Command { id: string; label: string; shortcut?: string; group: string; icon?: string; keywords?: string; run: (editor: Editor) => void; enabled?: (editor: Editor) => boolean; checked?: (editor: Editor) => boolean }

// ------------------------------------------------------------ file helpers
export const download = (name: string, data: Blob | string, type = 'application/octet-stream') => {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
};
export const pickFile = (accept: string): Promise<File | null> => {
  return new Promise(res => { const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.onchange = () => res(input.files?.[0] ?? null); input.click(); });
};
const safeName = (editor: Editor) => (editor.model.name || 'Modell').replace(/[^\w\-äöüÄÖÜß ]+/g, '_');

/** Build a plain three.js scene of the model (for exporters). */
export const modelToThree = (editor: Editor): THREE.Group => {
  const root = new THREE.Group(); root.name = editor.model.name;
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const getMat = (name: string | undefined, fallback: string) => {
    const key = name ?? '__default'; let cached = mats.get(key);
    if (!cached) { const material = editor.model.material(name); cached = new THREE.MeshStandardMaterial({ color: material?.color ?? fallback, transparent: (material?.opacity ?? 1) < 1, opacity: material?.opacity ?? 1, side: THREE.DoubleSide, roughness: 0.8 }); cached.name = name ?? 'Standard'; mats.set(key, cached); }
    return cached;
  };
  const hidden = editor.model.hiddenTags();
  const build = (ents: Entities, parent: THREE.Object3D, inherit?: string) => {
    const byMat = new Map<string, number[]>();
    for (const face of ents.faces.values()) {
      if (face.hidden || (face.tag && hidden.has(face.tag))) continue;
      const key = face.material ?? inherit ?? '__default';
      const tri = ents.faceTriangles(face); const pts = [...face.outer, ...face.holes.flat()].map(vertex => ents.positionOf(vertex));
      const arr = byMat.get(key) ?? []; for (const i of tri) arr.push(pts[i].x, pts[i].y, pts[i].z); byMat.set(key, arr);
    }
    for (const [materialKey, arr] of byMat) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); geometry.computeVertexNormals();
      parent.add(new THREE.Mesh(geometry, getMat(materialKey === '__default' ? undefined : materialKey, editor.model.settings.style.frontColor)));
    }
    for (const instance of ents.instances.values()) {
      if (instance.hidden || (instance.tag && hidden.has(instance.tag))) continue;
      const group = new THREE.Group(); group.name = instance.name || instance.definition.name; group.matrixAutoUpdate = false; group.matrix.copy(instance.matrix); instance.matrix.decompose(group.position, group.quaternion, group.scale); group.matrixAutoUpdate = true;
      parent.add(group); build(instance.definition.entities, group, instance.material ?? inherit);
    }
  };
  build(editor.model.root, root);
  // SketchUp is Z-up; most formats expect Y-up
  const yup = new THREE.Group(); yup.rotation.x = -Math.PI / 2; yup.add(root);
  const wrap = new THREE.Group(); wrap.add(yup); wrap.updateMatrixWorld(true);
  return wrap;
};

export const exportAs = async (editor: Editor, kind: 'glb' | 'gltf' | 'stl' | 'obj' | 'png' | 'json') => {
  const name = safeName(editor);
  if (kind === 'json') { download(`${name}.shap3d.json`, JSON.stringify(editor.model.toJSON()), 'application/json'); editor.ui.saved = true; return; }
  if (kind === 'png') { const url = editor.viewer.snapshot(); const link = document.createElement('a'); link.href = url; link.download = `${name}.png`; link.click(); return; }
  const scene = modelToThree(editor);
  if (kind === 'stl') { download(`${name}.stl`, new STLExporter().parse(scene, { binary: false }) as string, 'model/stl'); return; }
  if (kind === 'obj') { download(`${name}.obj`, new OBJExporter().parse(scene), 'text/plain'); return; }
  const res: any = await new GLTFExporter().parseAsync(scene, { binary: kind === 'glb' });
  if (kind === 'glb') download(`${name}.glb`, new Blob([res], { type: 'model/gltf-binary' }));
  else download(`${name}.gltf`, JSON.stringify(res), 'model/gltf+json');
};

/** Import mesh files as a component made of faces (coplanar triangles merged). */
/** File extensions the importer understands (menu filter, drop overlay, README). */
export const IMPORT_EXTS = ['skp', 'blend', 'dae', 'kmz', 'fbx', '3ds', 'obj', 'stl', 'glb', 'gltf', 'ply', '3mf', 'amf', 'wrl', 'vrml', 'usdz', 'usda', 'usdc', 'usd'];

/** Sends a .skp/.blend file to the local converter and returns the resulting .glb. */
const convertLocally = async (ext: 'skp' | 'blend', file: File): Promise<ArrayBuffer> => {
  let response: Response;
  try { response = await fetch(`/__convert?from=${ext}`, { method: 'POST', body: file }); }
  catch { throw new Error('Der lokale Konverter ist nicht erreichbar – die App über „npm run dev“ oder „npm run preview“ starten.'); }
  if (response.status === 404) throw new Error('.skp- und .blend-Dateien gehen nur mit dem lokalen Server („npm run dev“ oder „npm run preview“).');
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? `Konvertierung fehlgeschlagen (HTTP ${response.status})`); }
  return response.arrayBuffer();
};

/**
 * FBX stores its unit in GlobalSettings › UnitScaleFactor (centimetres per unit: cm = 1, m = 100, inch = 2.54).
 * Returns the factor to metres, or null if the file does not say.
 */
const fbxUnitScale = (data: ArrayBuffer): number | null => {
  const bytes = new Uint8Array(data);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 23));
  if (!head.startsWith('Kaydara FBX Binary')) {
    const match = new TextDecoder().decode(bytes).match(/"UnitScaleFactor"[^\n]*?,\s*([-\d.eE+]+)\s*$/m);
    return match ? parseFloat(match[1]) / 100 : null;
  }
  // binary: P: "UnitScaleFactor", "double", "Number", "", <double> – three 'S' string props, then a 'D'
  const key = new TextEncoder().encode('UnitScaleFactor');
  outer: for (let i = 0; i < bytes.length - key.length; i++) {
    for (let k = 0; k < key.length; k++) if (bytes[i + k] !== key[k]) continue outer;
    const view = new DataView(data); let cursor = i + key.length;
    for (let skip = 0; skip < 3; skip++) { if (bytes[cursor] !== 0x53) return null; cursor += 5 + view.getUint32(cursor + 1, true); }
    if (bytes[cursor] !== 0x44) return null;
    const value = view.getFloat64(cursor + 1, true);
    return value > 0 ? value / 100 : null;
  }
  return null;
};

/**
 * Loads a foreign 3D file into a three.js scene.
 * upY: the scene comes Y-up and must be turned to our Z-up; scale: known unit factor to metres (null = guess).
 */
const loadForeign = async (ext: string, file: File): Promise<{ object: THREE.Object3D; upY: boolean; scale: number | null }> => {
  const buf = () => file.arrayBuffer(), txt = () => file.text();
  switch (ext) {
    case 'obj': return { object: new OBJLoader().parse(await txt()), upY: true, scale: null };
    case 'stl': return { object: new THREE.Mesh(new STLLoader().parse(await buf())), upY: false, scale: 1 };
    case 'glb': return { object: (await new GLTFLoader().parseAsync(await buf(), '')).scene, upY: true, scale: 1 };
    case 'gltf': return { object: (await new GLTFLoader().parseAsync(await txt(), '')).scene, upY: true, scale: 1 };
    // Collada handles its own unit (<unit meter>) and up axis (<up_axis>) and hands back a Y-up scene in metres
    case 'dae': { const collada = new ColladaLoader().parse(await txt(), ''); if (!collada?.scene) throw new Error('Die Collada-Datei konnte nicht gelesen werden.'); return { object: collada.scene, upY: true, scale: 1 }; }
    case 'kmz': return { object: new KMZLoader().parse(await buf()).scene, upY: true, scale: 1 };
    // FBX (3ds Max, Blender, Maya): the loader turns Z-up files to Y-up, units vary (often cm)
    case 'fbx': { const data = await buf(); return { object: new FBXLoader().parse(data, ''), upY: true, scale: fbxUnitScale(data) }; }
    // 3DS (old 3ds Max format): stays in its own Z-up space, units vary
    case '3ds': return { object: new TDSLoader().parse(await buf(), ''), upY: false, scale: null };
    case 'ply': { const geometry = new PLYLoader().parse(await buf()); geometry.computeVertexNormals(); return { object: new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: geometry.hasAttribute('color') })), upY: true, scale: null }; }
    // 3MF and AMF (3D printing) are Z-up in millimetres
    case '3mf': return { object: new ThreeMFLoader().parse(await buf()), upY: false, scale: 0.001 };
    case 'amf': return { object: new AMFLoader().parse(await buf()), upY: false, scale: 0.001 };
    case 'wrl': case 'vrml': return { object: new VRMLLoader().parse(await txt(), ''), upY: true, scale: 1 };
    // SketchUp and Blender files are converted to glTF by the local converter (tools/convertBridge.ts)
    // Blender files are read right here in the browser (Z-up, metres) – no Blender needed
    case 'blend': {
      const result = readBlend(await buf());
      if (!result.objects) throw new Error(`In der Blender-Datei (Version ${(result.version / 100).toFixed(2)}) wurden keine Mesh-Objekte gefunden.` + (result.skipped.length ? ` Übersprungen: ${result.skipped.slice(0, 3).join(', ')}` : ''));
      return { object: result.scene, upY: false, scale: 1 };
    }
    // SketchUp files are converted to glTF by the local converter (tools/convertBridge.ts + SketchUp SDK)
    // (tools/skp/skp2glb.py writes Z-up in metres, like SketchUp itself)
    case 'skp': return { object: (await new GLTFLoader().parseAsync(await convertLocally('skp', file), '')).scene, upY: false, scale: 1 };
    case 'usdz': case 'usda': case 'usdc': case 'usd': {
      const data = await buf();
      const obj = await new Promise<THREE.Object3D>((res, rej) => new USDLoader().parse(data, '', res as any, rej as any));
      return { object: obj, upY: true, scale: 1 };
    }
  }
  throw new Error('Nicht unterstütztes Format: ' + ext);
};

export const importFile = async (editor: Editor, file: File) => {
  const ext = file.name.split('.').pop()!.toLowerCase();
  const pluginImporter = pluginImporters.get(ext);
  if (pluginImporter) { await pluginImporter.import(file, editor); editor.invalidate(); return; }
  if (ext === 'json') { const json = JSON.parse(await file.text()); if (typeof json.format === 'string' && json.format.startsWith('shap3d/')) { editor.loadJSON(json); editor.model.name = file.name.replace(/\.(shap3d|formwerk|suv)\.json$|\.json$/i, ''); return; } throw new Error('Unbekanntes JSON-Format'); }
  if (ext === 'max') throw new Error('3ds-Max-Dateien (.max) kann nur 3ds Max selbst lesen – dort über Datei › Exportieren als FBX (oder .3ds/.obj) speichern und diese Datei importieren.');
  const { object: obj, upY, scale: fixedScale } = await loadForeign(ext, file);
  // unit guess for formats without reliable units (cm/mm are common in FBX and 3DS)
  let scale = fixedScale ?? 1, unitNote = '';
  if (fixedScale == null) {
    // no unit in the file: objects bigger than 100 units are almost always modelled in cm (or mm)
    obj.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()); const big = Math.max(size.x, size.y, size.z);
    if (big > 10000) { scale = 0.001; unitNote = ' (Millimeter erkannt)'; } else if (big > 100) { scale = 0.01; unitNote = ' (Zentimeter erkannt)'; }
  } else if (ext === 'fbx' && Math.abs(fixedScale - 1) > 1e-6) unitNote = fixedScale === 0.01 ? ' (Zentimeter)' : fixedScale === 0.001 ? ' (Millimeter)' : Math.abs(fixedScale - 0.0254) < 1e-6 ? ' (Zoll)' : '';
  // our world is Z-up in metres
  const conv = new THREE.Matrix4().makeScale(scale, scale, scale); if (upY) conv.premultiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  const base = file.name.replace(/\.[^.]+$/, '');
  let info = { triangles: 0, groups: 0, materials: 0, skipped: 0 };
  editor.commit('Importieren', () => {
    const result = sceneToEntities(obj, editor.model, conv, base); info = result;
    if (!result.root.faces.size && !result.root.instances.size) throw new Error('Die Datei enthält keine Flächen.');
    // put it on the ground, centred on the origin
    const box = result.root.bounds();
    const shift = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z);
    for (const vertex of result.root.vertices.values()) vertex.position.applyMatrix4(shift); result.root.invalidateHash();
    for (const instance of result.root.instances.values()) instance.matrix.premultiply(shift);
    const def = editor.model.newDefinition(editor.model.uniqueDefName(base), true, result.root);
    const inst = editor.entities.addInstance(def, new THREE.Matrix4(), '');
    editor.select([{ kind: 'instance', id: inst.id }]);
  });
  const plural = (k: number, one: string, many: string) => `${k.toLocaleString('de-DE')} ${k === 1 ? one : many}`;
  editor.toast(`${file.name}${unitNote}: ${plural(info.triangles, 'Dreieck', 'Dreiecke')}` + (info.groups ? `, ${plural(info.groups, 'Gruppe', 'Gruppen')}` : '') + (info.materials ? `, ${plural(info.materials, 'Material', 'Materialien')}` : '') + (info.skipped ? ` – ${plural(info.skipped, 'Dreieck', 'Dreiecke')} über dem Limit ausgelassen` : ''));
  editor.zoomExtents();
};

// ------------------------------------------------------------ selection-based operations
export const makeGroup = (editor: Editor, component: boolean, name?: string) => {
  const refs = editor.selected(); if (!refs.length) { editor.toast('Nichts ausgewählt'); return; }
  editor.commit(component ? 'Komponente erstellen' : 'Gruppe erstellen', () => {
    const { entities } = editor.entities.extract(refs);
    // component axes: put origin at the bbox min corner like SketchUp
    const box = entities.bounds(); const insertOrigin = component && !box.isEmpty() ? box.min.clone() : new THREE.Vector3();
    const matrix = new THREE.Matrix4().makeTranslation(insertOrigin.x, insertOrigin.y, insertOrigin.z);
    if (component) { for (const vertex of entities.vertices.values()) vertex.position.sub(insertOrigin); for (const instance of entities.instances.values()) instance.matrix.premultiply(new THREE.Matrix4().makeTranslation(-insertOrigin.x, -insertOrigin.y, -insertOrigin.z)); entities.invalidateHash(); }
    const def = editor.model.newDefinition(name || editor.model.uniqueDefName(component ? 'Komponente' : 'Gruppe'), component, entities);
    const inst = editor.entities.addInstance(def, component ? matrix : new THREE.Matrix4(), component ? '' : '');
    editor.select([{ kind: 'instance', id: inst.id }]);
  });
};

export const explode = (editor: Editor) => {
  const refs = editor.selected().filter(entityRef => entityRef.kind === 'instance'); if (!refs.length) return;
  editor.commit('Auflösen', () => {
    const out: EntityRef[] = [];
    for (const entityRef of refs) {
      const instance = editor.entities.instances.get(entityRef.id); if (!instance) continue;
      out.push(...editor.entities.merge(instance.definition.entities, instance.matrix, editor.model, instance.material));
      editor.entities.instances.delete(instance.id);
    }
    editor.model.purge();
    editor.select(out);
  });
};

export const deleteSelection = (editor: Editor) => {
  const refs = editor.selected(); if (!refs.length) return;
  editor.commit('Löschen', () => { editor.entities.erase(refs); editor.clearSelection(); });
};

export const copySelection = (editor: Editor, cut = false) => {
  const refs = editor.selected(); if (!refs.length) return;
  const tmp = new EntitiesClass();
  const ents = editor.entities;
  // copy geometry without removing it from the model
  const faceIds = new Set(refs.filter(entityRef => entityRef.kind === 'face').map(entityRef => entityRef.id));
  const edgeIds = new Set(refs.filter(entityRef => entityRef.kind === 'edge').map(entityRef => entityRef.id));
  for (const id of faceIds) { const face = ents.faces.get(id); if (face) ents.faceEdges(face).forEach(edge => edgeIds.add(edge.id)); }
  const vmap = new Map<number, number>(); const mapVertex = (vertex: number) => { if (!vmap.has(vertex)) vmap.set(vertex, tmp.rawVertex(editor.toWorld(ents.positionOf(vertex)))); return vmap.get(vertex)!; };
  for (const id of edgeIds) { const edge = ents.edges.get(id); if (edge) tmp.createEdgeRaw(mapVertex(edge.start), mapVertex(edge.end), { soft: edge.soft, hidden: edge.hidden }); }
  for (const id of faceIds) { const face = ents.faces.get(id); if (face) tmp.createFaceRaw(face.outer.map(mapVertex), face.holes.map(hole => hole.map(mapVertex)), { material: face.material, backMaterial: face.backMaterial }); }
  for (const entityRef of refs) if (entityRef.kind === 'instance') { const instance = ents.instances.get(entityRef.id); if (instance) tmp.addInstance(instance.definition, editor.contextMatrix.multiply(instance.matrix), instance.name).material = instance.material; }
  editor.clipboard = tmp;
  if (cut) deleteSelection(editor);
  editor.toast(cut ? 'Ausgeschnitten' : 'Kopiert');
};

export const paste = (editor: Editor, inPlace = false) => {
  const clip = editor.clipboard as Entities | null; if (!clip) return;
  editor.commit(inPlace ? 'An Position einfügen' : 'Einfügen', () => {
    const refs = editor.entities.merge(clip, editor.contextInverse, editor.model, undefined, true);
    editor.select(refs);
  });
  if (!inPlace) {
    // attach to the cursor like SketchUp: start a move from the selection's bbox corner
    const box = editor.entities.refBounds(editor.selected()); if (box.isEmpty()) return;
    const moveTool: any = editor.tools.get('move'); editor.setTool('move');
    const start = editor.toWorld(new THREE.Vector3(box.min.x, box.min.y, box.min.z));
    moveTool.copy = false; moveTool.begin(start);
    // the paste and the following move become separate steps; moving starts immediately
  }
};

export const hideSelection = (editor: Editor) => {
  const refs = editor.selected(); if (!refs.length) return;
  editor.commit('Ausblenden', () => {
    for (const entityRef of refs) { if (entityRef.kind === 'face') { const face = editor.entities.faces.get(entityRef.id); if (face) face.hidden = true; } if (entityRef.kind === 'edge') { const edge = editor.entities.edges.get(entityRef.id); if (edge) edge.hidden = true; } if (entityRef.kind === 'instance') { const instance = editor.entities.instances.get(entityRef.id); if (instance) instance.hidden = true; } }
    editor.clearSelection();
  });
};
export const unhideAll = (editor: Editor) => {
  editor.commit('Alle einblenden', () => { const entities = editor.entities; entities.faces.forEach(face => (face.hidden = undefined)); entities.edges.forEach(x => (x.hidden = undefined)); entities.instances.forEach(instance => (instance.hidden = false)); });
};
export const reverseFaces = (editor: Editor) => {
  const refs = editor.selected().filter(entityRef => entityRef.kind === 'face'); if (!refs.length) return;
  editor.commit('Flächen umkehren', () => { for (const entityRef of refs) { const face = editor.entities.faces.get(entityRef.id); if (face) editor.entities.reverseFace(face); } });
};
/** Orient all connected faces consistently with the selected one. */
export const orientFaces = (editor: Editor) => {
  const entityRef = editor.selected().find(x => x.kind === 'face'); if (!entityRef) return;
  editor.commit('Flächen ausrichten', () => {
    const entities = editor.entities; const seen = new Set([entityRef.id]); const queue = [entityRef.id];
    while (queue.length) {
      const current = entities.faces.get(queue.shift()!)!;
      for (const loop of entities.loops(current)) for (let i = 0; i < loop.length; i++) {
        const vertexA = loop[i], vertexB = loop[(i + 1) % loop.length]; const edge = entities.edgeBetween(vertexA, vertexB); if (!edge) continue;
        const faces = entities.facesOfEdge(edge.id); if (faces.length !== 2) continue;
        for (const face of faces) {
          if (seen.has(face.id)) continue; seen.add(face.id);
          // neighbour must traverse a→b in opposite direction
          let same = false; for (const gl of entities.loops(face)) for (let j = 0; j < gl.length; j++) if (gl[j] === vertexA && gl[(j + 1) % gl.length] === vertexB) same = true;
          if (same) entities.reverseFace(face);
          queue.push(face.id);
        }
      }
    }
  });
};
export const softenSelection = (editor: Editor, soft: boolean) => {
  const refs = editor.selected(); editor.commit(soft ? 'Abmildern' : 'Abmildern aufheben', () => {
    const entities = editor.entities; const ids = new Set<number>();
    for (const entityRef of refs) { if (entityRef.kind === 'edge') ids.add(entityRef.id); if (entityRef.kind === 'face') { const face = entities.faces.get(entityRef.id); if (face) entities.faceEdges(face).forEach(edge => ids.add(edge.id)); } }
    for (const id of ids) { const edge = entities.edges.get(id); if (edge && (!soft || entities.facesOfEdge(id).length === 2)) edge.soft = soft || undefined; }
  });
};
export const flipSelection = (editor: Editor, axis: 'x' | 'y' | 'z') => {
  const refs = editor.selected(); if (!refs.length) return;
  const box = editor.entities.refBounds(refs); const center = box.getCenter(new THREE.Vector3());
  const scale = new THREE.Vector3(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1);
  const matrix = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z).multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z)).multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  editor.commit('Spiegeln', () => {
    const entities = editor.entities; entities.transform(refs, matrix);
    // mirrored faces must be reversed to keep their front side outside
    for (const entityRef of refs) if (entityRef.kind === 'face') { const face = entities.faces.get(entityRef.id); if (face) entities.reverseFace(face); }
  });
};
export const zoomSelection = (editor: Editor) => {
  const refs = editor.selected(); if (!refs.length) { editor.zoomExtents(); return; }
  const box = editor.entities.refBounds(refs).applyMatrix4(editor.contextMatrix); editor.viewer.rig.zoomExtents(box);
};
export const intersectSelection = (editor: Editor) => {
  // intersect selected faces with each other: add lines where coplanar-crossing edges meet faces
  const refs = editor.selected().filter(entityRef => entityRef.kind === 'face'); if (refs.length < 2) { editor.toast('Wählen Sie mindestens zwei Flächen aus.'); return; }
  editor.commit('Verschneiden', () => {
    const entities = editor.entities; const faces = refs.map(entityRef => entities.faces.get(entityRef.id)!).filter(Boolean);
    const segs: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
      const segment = faceFaceIntersection(entities, faces[i], faces[j]); if (segment) segs.push(segment);
    }
    for (const [start, end] of segs) entities.addLine(start, end);
  });
};
const faceFaceIntersection = (entities: Entities, faceA: any, faceB: any): [THREE.Vector3, THREE.Vector3] | null => {
  const normalA = entities.faceNormal(faceA), normalB = entities.faceNormal(faceB); const dir = normalA.clone().cross(normalB); if (dir.length() < 1e-6) return null;
  // clip the intersection line of both planes against both polygons
  const pointA = entities.positionOf(faceA.outer[0]), pointB = entities.positionOf(faceB.outer[0]);
  const params: number[][] = [];
  const pl2 = new THREE.Plane().setFromNormalAndCoplanarPoint(normalB, pointB), pl1 = new THREE.Plane().setFromNormalAndCoplanarPoint(normalA, pointA);
  const crossings = (face: any, plane: THREE.Plane) => { const pts: THREE.Vector3[] = []; const loop = face.outer.map((vertex: number) => entities.positionOf(vertex)); for (let i = 0; i < loop.length; i++) { const current = loop[i], next = loop[(i + 1) % loop.length]; const distCurrent = plane.distanceToPoint(current), distNext = plane.distanceToPoint(next); if ((distCurrent <= 0 && distNext > 0) || (distCurrent > 0 && distNext <= 0)) pts.push(current.clone().lerp(next, distCurrent / (distCurrent - distNext))); } return pts; };
  const crossingsA = crossings(faceA, pl2), crossingsB = crossings(faceB, pl1); if (crossingsA.length < 2 || crossingsB.length < 2) return null;
  const direction = dir.normalize(); const base = crossingsA[0];
  const paramsA = crossingsA.map(point => point.clone().sub(base).dot(direction)).sort((x, y) => x - y), paramsB = crossingsB.map(point => point.clone().sub(base).dot(direction)).sort((x, y) => x - y);
  params.push(paramsA, paramsB);
  const overlapStart = Math.max(paramsA[0], paramsB[0]), overlapEnd = Math.min(paramsA[paramsA.length - 1], paramsB[paramsB.length - 1]); if (overlapEnd - overlapStart < 1e-6) return null;
  return [base.clone().addScaledVector(direction, overlapStart), base.clone().addScaledVector(direction, overlapEnd)];
};

/** SketchUp solid tools on selected groups/components (first selected = cutter). */
export const runSolid = (editor: Editor, operation: SolidOp) => {
  const insts = editor.selected().filter(entityRef => entityRef.kind === 'instance').map(entityRef => editor.entities.instances.get(entityRef.id)!).filter(Boolean);
  if (insts.length < 2) { editor.toast('Wählen Sie zwei Gruppen oder Komponenten (Volumenkörper) aus.'); return; }
  const bad = insts.find(instance => !isSolid(instance.definition.entities)); if (bad) { editor.toast(`„${bad.name || bad.definition.name}“ ist kein Volumenkörper.`); return; }
  const names: Record<SolidOp, string> = { union: 'Vereinigen', subtract: 'Subtrahieren', intersect: 'Schnittmenge', outershell: 'Äußere Hülle', trim: 'Abziehen', split: 'Teilen' };
  try {
    editor.commit(names[operation], () => {
      let pieces: Entities[];
      if (operation === 'outershell' || operation === 'union') {
        let acc = insts[0]; let res: Entities | null = null;
        for (let k = 1; k < insts.length; k++) {
          res = solidOp('union', acc, insts[k])[0];
          const def = editor.model.newDefinition(editor.model.uniqueDefName('Volumenkörper'), false, res);
          acc = { id: -1, definition: def, matrix: new THREE.Matrix4(), name: '' } as any;
        }
        pieces = [res!];
      } else pieces = solidOp(operation, insts[0], insts[1]);
      const keep = operation === 'trim' ? [insts[0]] : [];
      for (const instance of insts) if (!keep.includes(instance) && (operation !== 'subtract' || true)) editor.entities.instances.delete(instance.id);
      const refs: EntityRef[] = [];
      for (const entities of pieces) { if (!entities.faces.size) continue; const def = editor.model.newDefinition(editor.model.uniqueDefName('Volumenkörper'), false, entities); refs.push({ kind: 'instance', id: editor.entities.addInstance(def, new THREE.Matrix4(), '').id }); }
      editor.model.purge();
      editor.select(refs);
    });
  } catch (error: any) { editor.toast('Volumenkörper-Operation fehlgeschlagen: ' + (error?.message ?? error)); }
};

/** Empties the whole workspace (geometry, groups, guides, dimensions, labels, sections) as one undo step. */
export const clearAll = (editor: Editor) => {
  const model = editor.model;
  if (!model.root.faces.size && !model.root.edges.size && !model.root.instances.size && !model.guides.length && !model.dimensions.length && !model.labels.length && !model.sections.length) { editor.toast('Die Arbeitsfläche ist bereits leer'); return; }
  editor.setContext([]);
  editor.commit('Alles löschen', () => {
    const entities = model.root;
    for (const id of [...entities.instances.keys()]) entities.instances.delete(id);
    for (const id of [...entities.faces.keys()]) entities.removeFace(id);
    for (const edge of [...entities.edges.values()]) entities.eraseEdge(edge.id, false);
    entities.removeOrphanVertices();
    model.guides = []; model.dimensions = []; model.labels = []; model.sections = [];
  });
  editor.toast('Arbeitsfläche geleert – Strg+Z holt alles zurück');
};

export const setFaceStyle = (editor: Editor, style: FaceStyle) => { editor.model.settings.style.faceStyle = style; editor.invalidate(); };

export const COMMANDS: Command[] = [
  // file
  { id: 'new', label: 'Neu', shortcut: 'Strg+N', group: 'Datei', run: async editor => { if (editor.ui.saved || await editor.confirm('Ungespeicherte Änderungen verwerfen?')) editor.newModel(); } },
  { id: 'open', label: 'Öffnen…', shortcut: 'Strg+O', group: 'Datei', run: async editor => { const file = await pickFile('.json,.shap3d.json,application/json'); if (file) await importFile(editor, file).catch(error => editor.toast(String(error.message ?? error))); } },
  { id: 'save', label: 'Speichern (Download)', shortcut: 'Strg+S', group: 'Datei', run: editor => exportAs(editor, 'json') },
  { id: 'saveLocal', label: 'Im Browser speichern', group: 'Datei', run: editor => { try { localStorage.setItem('s3d:saved', JSON.stringify(editor.model.toJSON())); editor.ui.saved = true; editor.toast('Im Browser gespeichert'); } catch { editor.toast('Speichern fehlgeschlagen'); } } },
  { id: 'loadLocal', label: 'Aus Browser laden', group: 'Datei', run: editor => { try { const saved = localStorage.getItem('s3d:saved'); if (saved) editor.loadJSON(JSON.parse(saved)); else editor.toast('Kein gespeichertes Modell'); } catch { editor.toast('Laden fehlgeschlagen'); } } },
  { id: 'import', label: 'Importieren (DAE, FBX, 3DS, OBJ, STL, glTF …)…', group: 'Datei', run: async editor => { const file = await pickFile([...IMPORT_EXTS, ...pluginImporters.keys()].map(ext => '.' + ext).join(',')); if (file) await importFile(editor, file).catch(error => editor.toast(String(error.message ?? error))); } },
  { id: 'export-glb', label: 'Exportieren: GLB', group: 'Datei', run: editor => exportAs(editor, 'glb') },
  { id: 'export-gltf', label: 'Exportieren: glTF', group: 'Datei', run: editor => exportAs(editor, 'gltf') },
  { id: 'export-stl', label: 'Exportieren: STL', group: 'Datei', run: editor => exportAs(editor, 'stl') },
  { id: 'export-obj', label: 'Exportieren: OBJ', group: 'Datei', run: editor => exportAs(editor, 'obj') },
  { id: 'export-png', label: 'Exportieren: PNG-Bild', group: 'Datei', run: editor => exportAs(editor, 'png') },
  { id: 'print', label: 'Drucken', group: 'Datei', run: editor => { const url = editor.viewer.snapshot(); const printWindow = window.open(''); if (printWindow) { printWindow.document.write(`<img src="${url}" style="max-width:100%">`); printWindow.document.close(); printWindow.onload = () => printWindow.print(); setTimeout(() => printWindow.print(), 300); } } },
  // edit
  { id: 'undo', label: 'Rückgängig', shortcut: 'Strg+Z', group: 'Bearbeiten', run: editor => editor.undo(), enabled: editor => editor.ui.canUndo },
  { id: 'redo', label: 'Wiederholen', shortcut: 'Strg+Y', group: 'Bearbeiten', run: editor => editor.redo(), enabled: editor => editor.ui.canRedo },
  { id: 'cut', label: 'Ausschneiden', shortcut: 'Strg+X', group: 'Bearbeiten', run: editor => copySelection(editor, true) },
  { id: 'copy', label: 'Kopieren', shortcut: 'Strg+C', group: 'Bearbeiten', run: editor => copySelection(editor) },
  { id: 'paste', label: 'Einfügen', shortcut: 'Strg+V', group: 'Bearbeiten', run: editor => paste(editor) },
  { id: 'pasteInPlace', label: 'An Position einfügen', group: 'Bearbeiten', run: editor => paste(editor, true) },
  { id: 'delete', label: 'Löschen', shortcut: 'Entf', group: 'Bearbeiten', run: deleteSelection },
  { id: 'clearAll', label: 'Arbeitsfläche leeren', group: 'Bearbeiten', run: clearAll },
  { id: 'deleteGuides', label: 'Hilfslinien löschen', group: 'Bearbeiten', run: editor => editor.commit('Hilfslinien löschen', () => { editor.model.guides = []; }) },
  { id: 'selectAll', label: 'Alles auswählen', shortcut: 'Strg+A', group: 'Bearbeiten', run: editor => editor.selectAll() },
  { id: 'selectNone', label: 'Auswahl aufheben', shortcut: 'Strg+T', group: 'Bearbeiten', run: editor => editor.clearSelection() },
  { id: 'invertSel', label: 'Auswahl umkehren', shortcut: 'Strg+Umschalt+I', group: 'Bearbeiten', run: editor => { const cur = new Set(editor.selected().map(entityRef => editor.key(entityRef))); editor.selectAll(); editor.select(editor.selected().filter(entityRef => !cur.has(editor.key(entityRef)))); } },
  { id: 'hide', label: 'Ausblenden', shortcut: 'H (Auswahl)', group: 'Bearbeiten', run: hideSelection },
  { id: 'unhideAll', label: 'Alle einblenden', group: 'Bearbeiten', run: unhideAll },
  { id: 'terrain', label: 'Gelände (Sandkiste): Berge & Täler formen', group: 'Bearbeiten', run: editor => editor.setTool('terrain') },
  { id: 'makeGroup', label: 'Gruppe erstellen', group: 'Bearbeiten', run: editor => makeGroup(editor, false) },
  { id: 'makeComponent', label: 'Komponente erstellen…', shortcut: 'G', group: 'Bearbeiten', run: async editor => { if (!editor.selected().length) { editor.toast('Nichts ausgewählt'); return; } const componentName = await editor.prompt('Name der Komponente', editor.model.uniqueDefName('Komponente')); if (componentName != null) makeGroup(editor, true, componentName); } },
  { id: 'explode', label: 'Auflösen', group: 'Bearbeiten', run: explode },
  { id: 'editGroup', label: 'Gruppe bearbeiten', group: 'Bearbeiten', run: editor => { const entityRef = editor.selected().find(x => x.kind === 'instance'); const instance = entityRef && editor.entities.instances.get(entityRef.id); if (instance) editor.enterInstance(instance); } },
  { id: 'closeGroup', label: 'Gruppe/Komponente schließen', group: 'Bearbeiten', run: editor => editor.exitContext() },
  { id: 'makeUnique', label: 'Eindeutig machen', group: 'Bearbeiten', run: editor => editor.commit('Eindeutig machen', () => { for (const entityRef of editor.selected()) if (entityRef.kind === 'instance') { const instance = editor.entities.instances.get(entityRef.id); if (instance) instance.definition = editor.model.cloneDefinition(instance.definition); } }) },
  { id: 'lock', label: 'Sperren', group: 'Bearbeiten', run: editor => editor.commit('Sperren', () => { for (const entityRef of editor.selected()) if (entityRef.kind === 'instance') { const instance = editor.entities.instances.get(entityRef.id); if (instance) instance.locked = true; } }) },
  { id: 'unlock', label: 'Entsperren', group: 'Bearbeiten', run: editor => editor.commit('Entsperren', () => { for (const entityRef of editor.selected()) if (entityRef.kind === 'instance') { const instance = editor.entities.instances.get(entityRef.id); if (instance) instance.locked = false; } }) },
  { id: 'reverseFaces', label: 'Flächen umkehren', group: 'Bearbeiten', run: reverseFaces },
  { id: 'orientFaces', label: 'Flächen ausrichten', group: 'Bearbeiten', run: orientFaces },
  { id: 'soften', label: 'Kanten abmildern', group: 'Bearbeiten', run: editor => softenSelection(editor, true) },
  { id: 'unsoften', label: 'Abmilderung aufheben', group: 'Bearbeiten', run: editor => softenSelection(editor, false) },
  { id: 'intersect', label: 'Flächen verschneiden (Auswahl)', group: 'Bearbeiten', run: intersectSelection },
  { id: 'flipX', label: 'Spiegeln: Rote Richtung', group: 'Bearbeiten', run: editor => flipSelection(editor, 'x') },
  { id: 'flipY', label: 'Spiegeln: Grüne Richtung', group: 'Bearbeiten', run: editor => flipSelection(editor, 'y') },
  { id: 'flipZ', label: 'Spiegeln: Blaue Richtung', group: 'Bearbeiten', run: editor => flipSelection(editor, 'z') },
  // solid tools
  { id: 'solid-union', label: 'Vereinigen', group: 'Volumenkörper', run: editor => runSolid(editor, 'union') },
  { id: 'solid-subtract', label: 'Subtrahieren (erstes von zweitem)', group: 'Volumenkörper', run: editor => runSolid(editor, 'subtract') },
  { id: 'solid-intersect', label: 'Schnittmenge', group: 'Volumenkörper', run: editor => runSolid(editor, 'intersect') },
  { id: 'solid-outershell', label: 'Äußere Hülle', group: 'Volumenkörper', run: editor => runSolid(editor, 'outershell') },
  { id: 'solid-trim', label: 'Abziehen', group: 'Volumenkörper', run: editor => runSolid(editor, 'trim') },
  { id: 'solid-split', label: 'Teilen', group: 'Volumenkörper', run: editor => runSolid(editor, 'split') },
  // view
  { id: 'themeDark', label: 'Dunkles Design', group: 'Ansicht', run: () => setTheme('dark'), checked: () => theme.mode === 'dark' },
  { id: 'themeLight', label: 'Helles Design', group: 'Ansicht', run: () => setTheme('light'), checked: () => theme.mode === 'light' },
  { id: 'themeSystem', label: 'Design wie System', group: 'Ansicht', run: () => setTheme('system'), checked: () => theme.mode === 'system' },
  { id: 'sceneNight', label: '3D-Szene: Nacht', group: 'Ansicht', run: () => setScene('night'), checked: () => theme.scene === 'night' },
  { id: 'sceneDay', label: '3D-Szene: Tag', group: 'Ansicht', run: () => setScene('day'), checked: () => theme.scene === 'day' },
  { id: 'sceneAuto', label: '3D-Szene wie Oberfläche', group: 'Ansicht', run: () => setScene('auto'), checked: () => theme.scene === 'auto' },
  { id: 'tour', label: 'Einführung anzeigen', group: 'Ansicht', run: () => openTour() },
  { id: 'commandPalette', label: 'Befehlspalette…', shortcut: 'Strg+Umschalt+P', group: 'Ansicht', run: () => openPalette() },
  { id: 'managePlugins', label: 'Plugins verwalten…', group: 'Plugins', run: () => showPanel('plugins') },
  { id: 'toggleAxes', label: 'Achsen', group: 'Ansicht', run: editor => { editor.model.settings.axes = !editor.model.settings.axes; editor.invalidate(); }, checked: editor => editor.model.settings.axes },
  { id: 'toggleRulers', label: 'Maßstab an den Achsen', group: 'Ansicht', run: editor => { measureView.rulers = !measureView.rulers; editor.invalidate(); }, checked: () => measureView.rulers },
  { id: 'togglePeopleSize', label: 'Größe der Personen', group: 'Ansicht', run: editor => { measureView.people = !measureView.people; editor.invalidate(); }, checked: () => measureView.people },
  { id: 'toggleGuides', label: 'Hilfslinien', group: 'Ansicht', run: editor => { editor.model.settings.guides = !editor.model.settings.guides; editor.invalidate(); }, checked: editor => editor.model.settings.guides },
  { id: 'toggleShadows', label: 'Schatten', group: 'Ansicht', run: editor => { editor.model.settings.shadows = !editor.model.settings.shadows; editor.invalidate(); }, checked: editor => editor.model.settings.shadows },
  { id: 'toggleHidden', label: 'Ausgeblendete Geometrie', group: 'Ansicht', run: editor => { editor.model.settings.hiddenGeometry = !editor.model.settings.hiddenGeometry; editor.invalidate(); }, checked: editor => editor.model.settings.hiddenGeometry },
  { id: 'toggleSectionPlanes', label: 'Schnittebenen', group: 'Ansicht', run: editor => { editor.model.settings.sectionPlanes = !editor.model.settings.sectionPlanes; editor.invalidate(); }, checked: editor => editor.model.settings.sectionPlanes },
  { id: 'toggleSectionCuts', label: 'Schnitte', group: 'Ansicht', run: editor => { editor.model.settings.sectionCuts = !editor.model.settings.sectionCuts; editor.invalidate(); }, checked: editor => editor.model.settings.sectionCuts },
  { id: 'xray', label: 'Röntgen', shortcut: 'Alt+K', group: 'Ansicht', run: editor => { editor.model.settings.style.xray = !editor.model.settings.style.xray; editor.invalidate(); }, checked: editor => editor.model.settings.style.xray },
  { id: 'style-wireframe', label: 'Drahtgitter', group: 'Ansicht', run: editor => setFaceStyle(editor, 'wireframe'), checked: editor => editor.model.settings.style.faceStyle === 'wireframe' },
  { id: 'style-hiddenline', label: 'Verdeckte Linien', group: 'Ansicht', run: editor => setFaceStyle(editor, 'hiddenline'), checked: editor => editor.model.settings.style.faceStyle === 'hiddenline' },
  { id: 'style-shaded', label: 'Schattiert', group: 'Ansicht', run: editor => setFaceStyle(editor, 'shaded'), checked: editor => editor.model.settings.style.faceStyle === 'shaded' },
  { id: 'style-textured', label: 'Schattiert mit Texturen', group: 'Ansicht', run: editor => setFaceStyle(editor, 'textured'), checked: editor => editor.model.settings.style.faceStyle === 'textured' },
  { id: 'style-monochrome', label: 'Monochrom', group: 'Ansicht', run: editor => setFaceStyle(editor, 'monochrome'), checked: editor => editor.model.settings.style.faceStyle === 'monochrome' },
  // camera
  { id: 'zoomExtents', label: 'Zoom Grenzen', shortcut: 'Umschalt+Z', group: 'Kamera', run: editor => editor.zoomExtents() },
  { id: 'zoomSelection', label: 'Auswahl zoomen', group: 'Kamera', run: zoomSelection },
  { id: 'persp', label: 'Perspektive', group: 'Kamera', run: editor => { editor.viewer.rig.isOrtho = false; editor.ui.projection = 'persp'; editor.viewer.rig.syncOrtho(); editor.redraw(); }, checked: editor => !editor.viewer?.rig.isOrtho },
  { id: 'ortho', label: 'Parallele Projektion', group: 'Kamera', run: editor => { editor.viewer.rig.isOrtho = true; editor.ui.projection = 'ortho'; editor.viewer.rig.syncOrtho(); editor.redraw(); }, checked: editor => !!editor.viewer?.rig.isOrtho },
  ...(['iso', 'top', 'front', 'right', 'back', 'left', 'bottom'] as const).map(view => ({
    id: 'view-' + view, label: { iso: 'Iso', top: 'Oben', front: 'Vorne', right: 'Rechts', back: 'Hinten', left: 'Links', bottom: 'Unten' }[view], group: 'Kamera',
    run: (editor: Editor) => editor.viewer.rig.standardView(view, editor.model.bounds()),
  })),
];

export const findCommand = (id: string) => { return COMMANDS.find(command => command.id === id); };
export const runCommand = (editor: Editor, id: string) => { const command = findCommand(id); if (command && (!command.enabled || command.enabled(editor))) command.run(editor); };
