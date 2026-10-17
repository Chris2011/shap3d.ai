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
import type { Entities, EntityRef } from '../core/model';
import { Entities as EntitiesClass } from '../core/model';
import type { FaceStyle } from '../core/document';
import { solidOp, isSolid, type SolidOp } from '../core/solids';

export interface Command { id: string; label: string; shortcut?: string; group: string; run: (ed: Editor) => void; enabled?: (ed: Editor) => boolean; checked?: (ed: Editor) => boolean }

// ------------------------------------------------------------ file helpers
export function download(name: string, data: Blob | string, type = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function pickFile(accept: string): Promise<File | null> {
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files?.[0] ?? null); i.click(); });
}
const safeName = (ed: Editor) => (ed.model.name || 'Modell').replace(/[^\w\-äöüÄÖÜß ]+/g, '_');

/** Build a plain three.js scene of the model (for exporters). */
export function modelToThree(ed: Editor): THREE.Group {
  const root = new THREE.Group(); root.name = ed.model.name;
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const getMat = (name: string | undefined, fallback: string) => {
    const key = name ?? '__default'; let m = mats.get(key);
    if (!m) { const md = ed.model.material(name); m = new THREE.MeshStandardMaterial({ color: md?.color ?? fallback, transparent: (md?.opacity ?? 1) < 1, opacity: md?.opacity ?? 1, side: THREE.DoubleSide, roughness: 0.8 }); m.name = name ?? 'Standard'; mats.set(key, m); }
    return m;
  };
  const hidden = ed.model.hiddenTags();
  const build = (ents: Entities, parent: THREE.Object3D, inherit?: string) => {
    const byMat = new Map<string, number[]>();
    for (const f of ents.faces.values()) {
      if (f.hidden || (f.tag && hidden.has(f.tag))) continue;
      const key = f.material ?? inherit ?? '__default';
      const tri = ents.faceTriangles(f); const pts = [...f.outer, ...f.holes.flat()].map(v => ents.pos(v));
      const arr = byMat.get(key) ?? []; for (const i of tri) arr.push(pts[i].x, pts[i].y, pts[i].z); byMat.set(key, arr);
    }
    for (const [k, arr] of byMat) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
      parent.add(new THREE.Mesh(g, getMat(k === '__default' ? undefined : k, ed.model.settings.style.frontColor)));
    }
    for (const i of ents.instances.values()) {
      if (i.hidden || (i.tag && hidden.has(i.tag))) continue;
      const o = new THREE.Group(); o.name = i.name || i.def.name; o.matrixAutoUpdate = false; o.matrix.copy(i.matrix); i.matrix.decompose(o.position, o.quaternion, o.scale); o.matrixAutoUpdate = true;
      parent.add(o); build(i.def.entities, o, i.material ?? inherit);
    }
  };
  build(ed.model.root, root);
  // SketchUp is Z-up; most formats expect Y-up
  const yup = new THREE.Group(); yup.rotation.x = -Math.PI / 2; yup.add(root);
  const wrap = new THREE.Group(); wrap.add(yup); wrap.updateMatrixWorld(true);
  return wrap;
}

export async function exportAs(ed: Editor, kind: 'glb' | 'gltf' | 'stl' | 'obj' | 'png' | 'json') {
  const name = safeName(ed);
  if (kind === 'json') { download(`${name}.shap3d.json`, JSON.stringify(ed.model.toJSON()), 'application/json'); ed.ui.saved = true; return; }
  if (kind === 'png') { const url = ed.viewer.snapshot(); const a = document.createElement('a'); a.href = url; a.download = `${name}.png`; a.click(); return; }
  const scene = modelToThree(ed);
  if (kind === 'stl') { download(`${name}.stl`, new STLExporter().parse(scene, { binary: false }) as string, 'model/stl'); return; }
  if (kind === 'obj') { download(`${name}.obj`, new OBJExporter().parse(scene), 'text/plain'); return; }
  const res: any = await new GLTFExporter().parseAsync(scene, { binary: kind === 'glb' });
  if (kind === 'glb') download(`${name}.glb`, new Blob([res], { type: 'model/gltf-binary' }));
  else download(`${name}.gltf`, JSON.stringify(res), 'model/gltf+json');
}

/** Import mesh files as a component made of faces (coplanar triangles merged). */
/** File extensions the importer understands (menu filter, drop overlay, README). */
export const IMPORT_EXTS = ['skp', 'blend', 'dae', 'kmz', 'fbx', '3ds', 'obj', 'stl', 'glb', 'gltf', 'ply', '3mf', 'amf', 'wrl', 'vrml', 'usdz', 'usda', 'usdc', 'usd'];

/** Sends a .skp/.blend file to the local converter and returns the resulting .glb. */
async function convertLocally(ext: 'skp' | 'blend', file: File): Promise<ArrayBuffer> {
  let r: Response;
  try { r = await fetch(`/__convert?from=${ext}`, { method: 'POST', body: file }); }
  catch { throw new Error('Der lokale Konverter ist nicht erreichbar – die App über „npm run dev“ oder „npm run preview“ starten.'); }
  if (r.status === 404) throw new Error('.skp- und .blend-Dateien gehen nur mit dem lokalen Server („npm run dev“ oder „npm run preview“).');
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? `Konvertierung fehlgeschlagen (HTTP ${r.status})`); }
  return r.arrayBuffer();
}

/**
 * FBX stores its unit in GlobalSettings › UnitScaleFactor (centimetres per unit: cm = 1, m = 100, inch = 2.54).
 * Returns the factor to metres, or null if the file does not say.
 */
function fbxUnitScale(data: ArrayBuffer): number | null {
  const bytes = new Uint8Array(data);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 23));
  if (!head.startsWith('Kaydara FBX Binary')) {
    const m = new TextDecoder().decode(bytes).match(/"UnitScaleFactor"[^\n]*?,\s*([-\d.eE+]+)\s*$/m);
    return m ? parseFloat(m[1]) / 100 : null;
  }
  // binary: P: "UnitScaleFactor", "double", "Number", "", <double> – three 'S' string props, then a 'D'
  const key = new TextEncoder().encode('UnitScaleFactor');
  outer: for (let i = 0; i < bytes.length - key.length; i++) {
    for (let k = 0; k < key.length; k++) if (bytes[i + k] !== key[k]) continue outer;
    const dv = new DataView(data); let p = i + key.length;
    for (let s = 0; s < 3; s++) { if (bytes[p] !== 0x53) return null; p += 5 + dv.getUint32(p + 1, true); }
    if (bytes[p] !== 0x44) return null;
    const v = dv.getFloat64(p + 1, true);
    return v > 0 ? v / 100 : null;
  }
  return null;
}

/**
 * Loads a foreign 3D file into a three.js scene.
 * upY: the scene comes Y-up and must be turned to our Z-up; scale: known unit factor to metres (null = guess).
 */
async function loadForeign(ext: string, file: File): Promise<{ obj: THREE.Object3D; upY: boolean; scale: number | null }> {
  const buf = () => file.arrayBuffer(), txt = () => file.text();
  switch (ext) {
    case 'obj': return { obj: new OBJLoader().parse(await txt()), upY: true, scale: null };
    case 'stl': return { obj: new THREE.Mesh(new STLLoader().parse(await buf())), upY: false, scale: 1 };
    case 'glb': return { obj: (await new GLTFLoader().parseAsync(await buf(), '')).scene, upY: true, scale: 1 };
    case 'gltf': return { obj: (await new GLTFLoader().parseAsync(await txt(), '')).scene, upY: true, scale: 1 };
    // Collada handles its own unit (<unit meter>) and up axis (<up_axis>) and hands back a Y-up scene in metres
    case 'dae': { const c = new ColladaLoader().parse(await txt(), ''); if (!c?.scene) throw new Error('Die Collada-Datei konnte nicht gelesen werden.'); return { obj: c.scene, upY: true, scale: 1 }; }
    case 'kmz': return { obj: new KMZLoader().parse(await buf()).scene, upY: true, scale: 1 };
    // FBX (3ds Max, Blender, Maya): the loader turns Z-up files to Y-up, units vary (often cm)
    case 'fbx': { const data = await buf(); return { obj: new FBXLoader().parse(data, ''), upY: true, scale: fbxUnitScale(data) }; }
    // 3DS (old 3ds Max format): stays in its own Z-up space, units vary
    case '3ds': return { obj: new TDSLoader().parse(await buf(), ''), upY: false, scale: null };
    case 'ply': { const g = new PLYLoader().parse(await buf()); g.computeVertexNormals(); return { obj: new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: g.hasAttribute('color') })), upY: true, scale: null }; }
    // 3MF and AMF (3D printing) are Z-up in millimetres
    case '3mf': return { obj: new ThreeMFLoader().parse(await buf()), upY: false, scale: 0.001 };
    case 'amf': return { obj: new AMFLoader().parse(await buf()), upY: false, scale: 0.001 };
    case 'wrl': case 'vrml': return { obj: new VRMLLoader().parse(await txt(), ''), upY: true, scale: 1 };
    // SketchUp and Blender files are converted to glTF by the local converter (tools/convertBridge.ts)
    // Blender files are read right here in the browser (Z-up, metres) – no Blender needed
    case 'blend': {
      const r = readBlend(await buf());
      if (!r.objects) throw new Error(`In der Blender-Datei (Version ${(r.version / 100).toFixed(2)}) wurden keine Mesh-Objekte gefunden.` + (r.skipped.length ? ` Übersprungen: ${r.skipped.slice(0, 3).join(', ')}` : ''));
      return { obj: r.scene, upY: false, scale: 1 };
    }
    // SketchUp files are converted to glTF by the local converter (tools/convertBridge.ts + SketchUp SDK)
    // (tools/skp/skp2glb.py writes Z-up in metres, like SketchUp itself)
    case 'skp': return { obj: (await new GLTFLoader().parseAsync(await convertLocally('skp', file), '')).scene, upY: false, scale: 1 };
    case 'usdz': case 'usda': case 'usdc': case 'usd': {
      const data = await buf();
      const obj = await new Promise<THREE.Object3D>((res, rej) => new USDLoader().parse(data, '', res as any, rej as any));
      return { obj, upY: true, scale: 1 };
    }
  }
  throw new Error('Nicht unterstütztes Format: ' + ext);
}

export async function importFile(ed: Editor, file: File) {
  const ext = file.name.split('.').pop()!.toLowerCase();
  if (ext === 'json') { const j = JSON.parse(await file.text()); if (['shap3d/1', 'formwerk/1', 'sketchup-vue/1'].includes(j.format)) { ed.loadJSON(j); ed.model.name = file.name.replace(/\.(shap3d|formwerk|suv)\.json$|\.json$/i, ''); return; } throw new Error('Unbekanntes JSON-Format'); }
  if (ext === 'max') throw new Error('3ds-Max-Dateien (.max) kann nur 3ds Max selbst lesen – dort über Datei › Exportieren als FBX (oder .3ds/.obj) speichern und diese Datei importieren.');
  const { obj, upY, scale: fixedScale } = await loadForeign(ext, file);
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
  ed.commit('Importieren', () => {
    const r = sceneToEntities(obj, ed.model, conv, base); info = r;
    if (!r.root.faces.size && !r.root.instances.size) throw new Error('Die Datei enthält keine Flächen.');
    // put it on the ground, centred on the origin
    const bb = r.root.bounds();
    const shift = new THREE.Matrix4().makeTranslation(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z);
    for (const v of r.root.vertices.values()) v.p.applyMatrix4(shift); r.root.invalidateHash();
    for (const i of r.root.instances.values()) i.matrix.premultiply(shift);
    const def = ed.model.newDefinition(ed.model.uniqueDefName(base), true, r.root);
    const inst = ed.entities.addInstance(def, new THREE.Matrix4(), '');
    ed.select([{ kind: 'instance', id: inst.id }]);
  });
  const n = (k: number, one: string, many: string) => `${k.toLocaleString('de-DE')} ${k === 1 ? one : many}`;
  ed.toast(`${file.name}${unitNote}: ${n(info.triangles, 'Dreieck', 'Dreiecke')}` + (info.groups ? `, ${n(info.groups, 'Gruppe', 'Gruppen')}` : '') + (info.materials ? `, ${n(info.materials, 'Material', 'Materialien')}` : '') + (info.skipped ? ` – ${n(info.skipped, 'Dreieck', 'Dreiecke')} über dem Limit ausgelassen` : ''));
  ed.zoomExtents();
}

// ------------------------------------------------------------ selection-based operations
export function makeGroup(ed: Editor, component: boolean, name?: string) {
  const refs = ed.selected(); if (!refs.length) { ed.toast('Nichts ausgewählt'); return; }
  ed.commit(component ? 'Komponente erstellen' : 'Gruppe erstellen', () => {
    const { entities } = ed.entities.extract(refs);
    // component axes: put origin at the bbox min corner like SketchUp
    const bb = entities.bounds(); const o = component && !bb.isEmpty() ? bb.min.clone() : new THREE.Vector3();
    const m = new THREE.Matrix4().makeTranslation(o.x, o.y, o.z);
    if (component) { for (const v of entities.vertices.values()) v.p.sub(o); for (const i of entities.instances.values()) i.matrix.premultiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z)); entities.invalidateHash(); }
    const def = ed.model.newDefinition(name || ed.model.uniqueDefName(component ? 'Komponente' : 'Gruppe'), component, entities);
    const inst = ed.entities.addInstance(def, component ? m : new THREE.Matrix4(), component ? '' : '');
    ed.select([{ kind: 'instance', id: inst.id }]);
  });
}

export function explode(ed: Editor) {
  const refs = ed.selected().filter(r => r.kind === 'instance'); if (!refs.length) return;
  ed.commit('Auflösen', () => {
    const out: EntityRef[] = [];
    for (const r of refs) {
      const i = ed.entities.instances.get(r.id); if (!i) continue;
      out.push(...ed.entities.merge(i.def.entities, i.matrix, ed.model, i.material));
      ed.entities.instances.delete(i.id);
    }
    ed.model.purge();
    ed.select(out);
  });
}

export function deleteSelection(ed: Editor) {
  const refs = ed.selected(); if (!refs.length) return;
  ed.commit('Löschen', () => { ed.entities.erase(refs); ed.clearSelection(); });
}

export function copySelection(ed: Editor, cut = false) {
  const refs = ed.selected(); if (!refs.length) return;
  const tmp = new EntitiesClass();
  const ents = ed.entities;
  // copy geometry without removing it from the model
  const faceIds = new Set(refs.filter(r => r.kind === 'face').map(r => r.id));
  const edgeIds = new Set(refs.filter(r => r.kind === 'edge').map(r => r.id));
  for (const id of faceIds) { const f = ents.faces.get(id); if (f) ents.faceEdges(f).forEach(e => edgeIds.add(e.id)); }
  const vmap = new Map<number, number>(); const mv = (v: number) => { if (!vmap.has(v)) vmap.set(v, tmp.rawVertex(ed.toWorld(ents.pos(v)))); return vmap.get(v)!; };
  for (const id of edgeIds) { const e = ents.edges.get(id); if (e) tmp.createEdgeRaw(mv(e.a), mv(e.b), { soft: e.soft, hidden: e.hidden }); }
  for (const id of faceIds) { const f = ents.faces.get(id); if (f) tmp.createFaceRaw(f.outer.map(mv), f.holes.map(h => h.map(mv)), { material: f.material, backMaterial: f.backMaterial }); }
  for (const r of refs) if (r.kind === 'instance') { const i = ents.instances.get(r.id); if (i) tmp.addInstance(i.def, ed.contextMatrix.multiply(i.matrix), i.name).material = i.material; }
  ed.clipboard = tmp;
  if (cut) deleteSelection(ed);
  ed.toast(cut ? 'Ausgeschnitten' : 'Kopiert');
}

export function paste(ed: Editor, inPlace = false) {
  const clip = ed.clipboard as Entities | null; if (!clip) return;
  ed.commit(inPlace ? 'An Position einfügen' : 'Einfügen', () => {
    const refs = ed.entities.merge(clip, ed.contextInverse, ed.model, undefined, true);
    ed.select(refs);
  });
  if (!inPlace) {
    // attach to the cursor like SketchUp: start a move from the selection's bbox corner
    const b = ed.entities.refBounds(ed.selected()); if (b.isEmpty()) return;
    const mv: any = ed.tools.get('move'); ed.setTool('move');
    const start = ed.toWorld(new THREE.Vector3(b.min.x, b.min.y, b.min.z));
    mv.copy = false; mv.begin(start);
    // the paste and the following move become separate steps; moving starts immediately
  }
}

export function hideSelection(ed: Editor) {
  const refs = ed.selected(); if (!refs.length) return;
  ed.commit('Ausblenden', () => {
    for (const r of refs) { if (r.kind === 'face') { const f = ed.entities.faces.get(r.id); if (f) f.hidden = true; } if (r.kind === 'edge') { const e = ed.entities.edges.get(r.id); if (e) e.hidden = true; } if (r.kind === 'instance') { const i = ed.entities.instances.get(r.id); if (i) i.hidden = true; } }
    ed.clearSelection();
  });
}
export function unhideAll(ed: Editor) {
  ed.commit('Alle einblenden', () => { const e = ed.entities; e.faces.forEach(f => (f.hidden = undefined)); e.edges.forEach(x => (x.hidden = undefined)); e.instances.forEach(i => (i.hidden = false)); });
}
export function reverseFaces(ed: Editor) {
  const refs = ed.selected().filter(r => r.kind === 'face'); if (!refs.length) return;
  ed.commit('Flächen umkehren', () => { for (const r of refs) { const f = ed.entities.faces.get(r.id); if (f) ed.entities.reverseFace(f); } });
}
/** Orient all connected faces consistently with the selected one. */
export function orientFaces(ed: Editor) {
  const r = ed.selected().find(x => x.kind === 'face'); if (!r) return;
  ed.commit('Flächen ausrichten', () => {
    const E = ed.entities; const seen = new Set([r.id]); const queue = [r.id];
    while (queue.length) {
      const f = E.faces.get(queue.shift()!)!;
      for (const l of E.loops(f)) for (let i = 0; i < l.length; i++) {
        const a = l[i], b = l[(i + 1) % l.length]; const e = E.edgeBetween(a, b); if (!e) continue;
        const fs = E.facesOfEdge(e.id); if (fs.length !== 2) continue;
        for (const g of fs) {
          if (seen.has(g.id)) continue; seen.add(g.id);
          // neighbour must traverse a→b in opposite direction
          let same = false; for (const gl of E.loops(g)) for (let j = 0; j < gl.length; j++) if (gl[j] === a && gl[(j + 1) % gl.length] === b) same = true;
          if (same) E.reverseFace(g);
          queue.push(g.id);
        }
      }
    }
  });
}
export function softenSelection(ed: Editor, soft: boolean) {
  const refs = ed.selected(); ed.commit(soft ? 'Abmildern' : 'Abmildern aufheben', () => {
    const E = ed.entities; const ids = new Set<number>();
    for (const r of refs) { if (r.kind === 'edge') ids.add(r.id); if (r.kind === 'face') { const f = E.faces.get(r.id); if (f) E.faceEdges(f).forEach(e => ids.add(e.id)); } }
    for (const id of ids) { const e = E.edges.get(id); if (e && (!soft || E.facesOfEdge(id).length === 2)) e.soft = soft || undefined; }
  });
}
export function flipSelection(ed: Editor, axis: 'x' | 'y' | 'z') {
  const refs = ed.selected(); if (!refs.length) return;
  const b = ed.entities.refBounds(refs); const c = b.getCenter(new THREE.Vector3());
  const s = new THREE.Vector3(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1);
  const M = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  ed.commit('Spiegeln', () => {
    const E = ed.entities; E.transform(refs, M);
    // mirrored faces must be reversed to keep their front side outside
    for (const r of refs) if (r.kind === 'face') { const f = E.faces.get(r.id); if (f) E.reverseFace(f); }
  });
}
export function zoomSelection(ed: Editor) {
  const refs = ed.selected(); if (!refs.length) { ed.zoomExtents(); return; }
  const b = ed.entities.refBounds(refs).applyMatrix4(ed.contextMatrix); ed.viewer.rig.zoomExtents(b);
}
export function intersectSelection(ed: Editor) {
  // intersect selected faces with each other: add lines where coplanar-crossing edges meet faces
  const refs = ed.selected().filter(r => r.kind === 'face'); if (refs.length < 2) { ed.toast('Wählen Sie mindestens zwei Flächen aus.'); return; }
  ed.commit('Verschneiden', () => {
    const E = ed.entities; const faces = refs.map(r => E.faces.get(r.id)!).filter(Boolean);
    const segs: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
      const s = faceFaceIntersection(E, faces[i], faces[j]); if (s) segs.push(s);
    }
    for (const [a, b] of segs) E.addLine(a, b);
  });
}
function faceFaceIntersection(E: Entities, f: any, g: any): [THREE.Vector3, THREE.Vector3] | null {
  const n1 = E.faceNormal(f), n2 = E.faceNormal(g); const dir = n1.clone().cross(n2); if (dir.length() < 1e-6) return null;
  // clip the intersection line of both planes against both polygons
  const p1 = E.pos(f.outer[0]), p2 = E.pos(g.outer[0]);
  const ts: number[][] = [];
  const pl2 = new THREE.Plane().setFromNormalAndCoplanarPoint(n2, p2), pl1 = new THREE.Plane().setFromNormalAndCoplanarPoint(n1, p1);
  const ln = (face: any, plane: THREE.Plane) => { const pts: THREE.Vector3[] = []; const loop = face.outer.map((v: number) => E.pos(v)); for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b); if ((da <= 0 && db > 0) || (da > 0 && db <= 0)) pts.push(a.clone().lerp(b, da / (da - db))); } return pts; };
  const A = ln(f, pl2), B = ln(g, pl1); if (A.length < 2 || B.length < 2) return null;
  const d = dir.normalize(); const o = A[0];
  const ta = A.map(p => p.clone().sub(o).dot(d)).sort((x, y) => x - y), tb = B.map(p => p.clone().sub(o).dot(d)).sort((x, y) => x - y);
  ts.push(ta, tb);
  const lo = Math.max(ta[0], tb[0]), hi = Math.min(ta[ta.length - 1], tb[tb.length - 1]); if (hi - lo < 1e-6) return null;
  return [o.clone().addScaledVector(d, lo), o.clone().addScaledVector(d, hi)];
}

/** SketchUp solid tools on selected groups/components (first selected = cutter). */
export function runSolid(ed: Editor, op: SolidOp) {
  const insts = ed.selected().filter(r => r.kind === 'instance').map(r => ed.entities.instances.get(r.id)!).filter(Boolean);
  if (insts.length < 2) { ed.toast('Wählen Sie zwei Gruppen oder Komponenten (Volumenkörper) aus.'); return; }
  const bad = insts.find(i => !isSolid(i.def.entities)); if (bad) { ed.toast(`„${bad.name || bad.def.name}“ ist kein Volumenkörper.`); return; }
  const names: Record<SolidOp, string> = { union: 'Vereinigen', subtract: 'Subtrahieren', intersect: 'Schnittmenge', outershell: 'Äußere Hülle', trim: 'Abziehen', split: 'Teilen' };
  try {
    ed.commit(names[op], () => {
      let pieces: Entities[];
      if (op === 'outershell' || op === 'union') {
        let acc = insts[0]; let res: Entities | null = null;
        for (let k = 1; k < insts.length; k++) {
          res = solidOp('union', acc, insts[k])[0];
          const def = ed.model.newDefinition(ed.model.uniqueDefName('Volumenkörper'), false, res);
          acc = { id: -1, def, matrix: new THREE.Matrix4(), name: '' } as any;
        }
        pieces = [res!];
      } else pieces = solidOp(op, insts[0], insts[1]);
      const keep = op === 'trim' ? [insts[0]] : [];
      for (const i of insts) if (!keep.includes(i) && (op !== 'subtract' || true)) ed.entities.instances.delete(i.id);
      const refs: EntityRef[] = [];
      for (const p of pieces) { if (!p.faces.size) continue; const def = ed.model.newDefinition(ed.model.uniqueDefName('Volumenkörper'), false, p); refs.push({ kind: 'instance', id: ed.entities.addInstance(def, new THREE.Matrix4(), '').id }); }
      ed.model.purge();
      ed.select(refs);
    });
  } catch (e: any) { ed.toast('Volumenkörper-Operation fehlgeschlagen: ' + (e?.message ?? e)); }
}

/** Empties the whole workspace (geometry, groups, guides, dimensions, labels, sections) as one undo step. */
export function clearAll(ed: Editor) {
  const m = ed.model;
  if (!m.root.faces.size && !m.root.edges.size && !m.root.instances.size && !m.guides.length && !m.dimensions.length && !m.labels.length && !m.sections.length) { ed.toast('Die Arbeitsfläche ist bereits leer'); return; }
  ed.setContext([]);
  ed.commit('Alles löschen', () => {
    const e = m.root;
    for (const id of [...e.instances.keys()]) e.instances.delete(id);
    for (const id of [...e.faces.keys()]) e.removeFace(id);
    for (const edge of [...e.edges.values()]) e.eraseEdge(edge.id, false);
    e.removeOrphanVertices();
    m.guides = []; m.dimensions = []; m.labels = []; m.sections = [];
  });
  ed.toast('Arbeitsfläche geleert – Strg+Z holt alles zurück');
}

export function setFaceStyle(ed: Editor, s: FaceStyle) { ed.model.settings.style.faceStyle = s; ed.invalidate(); }

export const COMMANDS: Command[] = [
  // file
  { id: 'new', label: 'Neu', shortcut: 'Strg+N', group: 'Datei', run: async ed => { if (ed.ui.saved || await ed.confirm('Ungespeicherte Änderungen verwerfen?')) ed.newModel(); } },
  { id: 'open', label: 'Öffnen…', shortcut: 'Strg+O', group: 'Datei', run: async ed => { const f = await pickFile('.json,.shap3d.json,application/json'); if (f) await importFile(ed, f).catch(e => ed.toast(String(e.message ?? e))); } },
  { id: 'save', label: 'Speichern (Download)', shortcut: 'Strg+S', group: 'Datei', run: ed => exportAs(ed, 'json') },
  { id: 'saveLocal', label: 'Im Browser speichern', group: 'Datei', run: ed => { try { localStorage.setItem('s3d:saved', JSON.stringify(ed.model.toJSON())); ed.ui.saved = true; ed.toast('Im Browser gespeichert'); } catch { ed.toast('Speichern fehlgeschlagen'); } } },
  { id: 'loadLocal', label: 'Aus Browser laden', group: 'Datei', run: ed => { try { const s = localStorage.getItem('s3d:saved'); if (s) ed.loadJSON(JSON.parse(s)); else ed.toast('Kein gespeichertes Modell'); } catch { ed.toast('Laden fehlgeschlagen'); } } },
  { id: 'import', label: 'Importieren (DAE, FBX, 3DS, OBJ, STL, glTF …)…', group: 'Datei', run: async ed => { const f = await pickFile(IMPORT_EXTS.map(e => '.' + e).join(',')); if (f) await importFile(ed, f).catch(e => ed.toast(String(e.message ?? e))); } },
  { id: 'export-glb', label: 'Exportieren: GLB', group: 'Datei', run: ed => exportAs(ed, 'glb') },
  { id: 'export-gltf', label: 'Exportieren: glTF', group: 'Datei', run: ed => exportAs(ed, 'gltf') },
  { id: 'export-stl', label: 'Exportieren: STL', group: 'Datei', run: ed => exportAs(ed, 'stl') },
  { id: 'export-obj', label: 'Exportieren: OBJ', group: 'Datei', run: ed => exportAs(ed, 'obj') },
  { id: 'export-png', label: 'Exportieren: PNG-Bild', group: 'Datei', run: ed => exportAs(ed, 'png') },
  { id: 'print', label: 'Drucken', group: 'Datei', run: ed => { const url = ed.viewer.snapshot(); const w = window.open(''); if (w) { w.document.write(`<img src="${url}" style="max-width:100%">`); w.document.close(); w.onload = () => w.print(); setTimeout(() => w.print(), 300); } } },
  // edit
  { id: 'undo', label: 'Rückgängig', shortcut: 'Strg+Z', group: 'Bearbeiten', run: ed => ed.undo(), enabled: ed => ed.ui.canUndo },
  { id: 'redo', label: 'Wiederholen', shortcut: 'Strg+Y', group: 'Bearbeiten', run: ed => ed.redo(), enabled: ed => ed.ui.canRedo },
  { id: 'cut', label: 'Ausschneiden', shortcut: 'Strg+X', group: 'Bearbeiten', run: ed => copySelection(ed, true) },
  { id: 'copy', label: 'Kopieren', shortcut: 'Strg+C', group: 'Bearbeiten', run: ed => copySelection(ed) },
  { id: 'paste', label: 'Einfügen', shortcut: 'Strg+V', group: 'Bearbeiten', run: ed => paste(ed) },
  { id: 'pasteInPlace', label: 'An Position einfügen', group: 'Bearbeiten', run: ed => paste(ed, true) },
  { id: 'delete', label: 'Löschen', shortcut: 'Entf', group: 'Bearbeiten', run: deleteSelection },
  { id: 'clearAll', label: 'Arbeitsfläche leeren', group: 'Bearbeiten', run: clearAll },
  { id: 'deleteGuides', label: 'Hilfslinien löschen', group: 'Bearbeiten', run: ed => ed.commit('Hilfslinien löschen', () => { ed.model.guides = []; }) },
  { id: 'selectAll', label: 'Alles auswählen', shortcut: 'Strg+A', group: 'Bearbeiten', run: ed => ed.selectAll() },
  { id: 'selectNone', label: 'Auswahl aufheben', shortcut: 'Strg+T', group: 'Bearbeiten', run: ed => ed.clearSelection() },
  { id: 'invertSel', label: 'Auswahl umkehren', shortcut: 'Strg+Umschalt+I', group: 'Bearbeiten', run: ed => { const cur = new Set(ed.selected().map(r => ed.key(r))); ed.selectAll(); ed.select(ed.selected().filter(r => !cur.has(ed.key(r)))); } },
  { id: 'hide', label: 'Ausblenden', shortcut: 'H (Auswahl)', group: 'Bearbeiten', run: hideSelection },
  { id: 'unhideAll', label: 'Alle einblenden', group: 'Bearbeiten', run: unhideAll },
  { id: 'terrain', label: 'Gelände (Sandkiste): Berge & Täler formen', group: 'Bearbeiten', run: ed => ed.setTool('terrain') },
  { id: 'makeGroup', label: 'Gruppe erstellen', group: 'Bearbeiten', run: ed => makeGroup(ed, false) },
  { id: 'makeComponent', label: 'Komponente erstellen…', shortcut: 'G', group: 'Bearbeiten', run: async ed => { if (!ed.selected().length) { ed.toast('Nichts ausgewählt'); return; } const n = await ed.prompt('Name der Komponente', ed.model.uniqueDefName('Komponente')); if (n != null) makeGroup(ed, true, n); } },
  { id: 'explode', label: 'Auflösen', group: 'Bearbeiten', run: explode },
  { id: 'editGroup', label: 'Gruppe bearbeiten', group: 'Bearbeiten', run: ed => { const r = ed.selected().find(x => x.kind === 'instance'); const i = r && ed.entities.instances.get(r.id); if (i) ed.enterInstance(i); } },
  { id: 'closeGroup', label: 'Gruppe/Komponente schließen', group: 'Bearbeiten', run: ed => ed.exitContext() },
  { id: 'makeUnique', label: 'Eindeutig machen', group: 'Bearbeiten', run: ed => ed.commit('Eindeutig machen', () => { for (const r of ed.selected()) if (r.kind === 'instance') { const i = ed.entities.instances.get(r.id); if (i) i.def = ed.model.cloneDefinition(i.def); } }) },
  { id: 'lock', label: 'Sperren', group: 'Bearbeiten', run: ed => ed.commit('Sperren', () => { for (const r of ed.selected()) if (r.kind === 'instance') { const i = ed.entities.instances.get(r.id); if (i) i.locked = true; } }) },
  { id: 'unlock', label: 'Entsperren', group: 'Bearbeiten', run: ed => ed.commit('Entsperren', () => { for (const r of ed.selected()) if (r.kind === 'instance') { const i = ed.entities.instances.get(r.id); if (i) i.locked = false; } }) },
  { id: 'reverseFaces', label: 'Flächen umkehren', group: 'Bearbeiten', run: reverseFaces },
  { id: 'orientFaces', label: 'Flächen ausrichten', group: 'Bearbeiten', run: orientFaces },
  { id: 'soften', label: 'Kanten abmildern', group: 'Bearbeiten', run: ed => softenSelection(ed, true) },
  { id: 'unsoften', label: 'Abmilderung aufheben', group: 'Bearbeiten', run: ed => softenSelection(ed, false) },
  { id: 'intersect', label: 'Flächen verschneiden (Auswahl)', group: 'Bearbeiten', run: intersectSelection },
  { id: 'flipX', label: 'Spiegeln: Rote Richtung', group: 'Bearbeiten', run: ed => flipSelection(ed, 'x') },
  { id: 'flipY', label: 'Spiegeln: Grüne Richtung', group: 'Bearbeiten', run: ed => flipSelection(ed, 'y') },
  { id: 'flipZ', label: 'Spiegeln: Blaue Richtung', group: 'Bearbeiten', run: ed => flipSelection(ed, 'z') },
  // solid tools
  { id: 'solid-union', label: 'Vereinigen', group: 'Volumenkörper', run: ed => runSolid(ed, 'union') },
  { id: 'solid-subtract', label: 'Subtrahieren (erstes von zweitem)', group: 'Volumenkörper', run: ed => runSolid(ed, 'subtract') },
  { id: 'solid-intersect', label: 'Schnittmenge', group: 'Volumenkörper', run: ed => runSolid(ed, 'intersect') },
  { id: 'solid-outershell', label: 'Äußere Hülle', group: 'Volumenkörper', run: ed => runSolid(ed, 'outershell') },
  { id: 'solid-trim', label: 'Abziehen', group: 'Volumenkörper', run: ed => runSolid(ed, 'trim') },
  { id: 'solid-split', label: 'Teilen', group: 'Volumenkörper', run: ed => runSolid(ed, 'split') },
  // view
  { id: 'themeDark', label: 'Dunkles Design', group: 'Ansicht', run: () => setTheme('dark'), checked: () => theme.mode === 'dark' },
  { id: 'themeLight', label: 'Helles Design', group: 'Ansicht', run: () => setTheme('light'), checked: () => theme.mode === 'light' },
  { id: 'themeSystem', label: 'Design wie System', group: 'Ansicht', run: () => setTheme('system'), checked: () => theme.mode === 'system' },
  { id: 'sceneNight', label: '3D-Szene: Nacht', group: 'Ansicht', run: () => setScene('night'), checked: () => theme.scene === 'night' },
  { id: 'sceneDay', label: '3D-Szene: Tag', group: 'Ansicht', run: () => setScene('day'), checked: () => theme.scene === 'day' },
  { id: 'sceneAuto', label: '3D-Szene wie Oberfläche', group: 'Ansicht', run: () => setScene('auto'), checked: () => theme.scene === 'auto' },
  { id: 'tour', label: 'Einführung anzeigen', group: 'Ansicht', run: () => openTour() },
  { id: 'toggleAxes', label: 'Achsen', group: 'Ansicht', run: ed => { ed.model.settings.axes = !ed.model.settings.axes; ed.invalidate(); }, checked: ed => ed.model.settings.axes },
  { id: 'toggleGuides', label: 'Hilfslinien', group: 'Ansicht', run: ed => { ed.model.settings.guides = !ed.model.settings.guides; ed.invalidate(); }, checked: ed => ed.model.settings.guides },
  { id: 'toggleShadows', label: 'Schatten', group: 'Ansicht', run: ed => { ed.model.settings.shadows = !ed.model.settings.shadows; ed.invalidate(); }, checked: ed => ed.model.settings.shadows },
  { id: 'toggleHidden', label: 'Ausgeblendete Geometrie', group: 'Ansicht', run: ed => { ed.model.settings.hiddenGeometry = !ed.model.settings.hiddenGeometry; ed.invalidate(); }, checked: ed => ed.model.settings.hiddenGeometry },
  { id: 'toggleSectionPlanes', label: 'Schnittebenen', group: 'Ansicht', run: ed => { ed.model.settings.sectionPlanes = !ed.model.settings.sectionPlanes; ed.invalidate(); }, checked: ed => ed.model.settings.sectionPlanes },
  { id: 'toggleSectionCuts', label: 'Schnitte', group: 'Ansicht', run: ed => { ed.model.settings.sectionCuts = !ed.model.settings.sectionCuts; ed.invalidate(); }, checked: ed => ed.model.settings.sectionCuts },
  { id: 'xray', label: 'Röntgen', shortcut: 'Alt+K', group: 'Ansicht', run: ed => { ed.model.settings.style.xray = !ed.model.settings.style.xray; ed.invalidate(); }, checked: ed => ed.model.settings.style.xray },
  { id: 'style-wireframe', label: 'Drahtgitter', group: 'Ansicht', run: ed => setFaceStyle(ed, 'wireframe'), checked: ed => ed.model.settings.style.faceStyle === 'wireframe' },
  { id: 'style-hiddenline', label: 'Verdeckte Linien', group: 'Ansicht', run: ed => setFaceStyle(ed, 'hiddenline'), checked: ed => ed.model.settings.style.faceStyle === 'hiddenline' },
  { id: 'style-shaded', label: 'Schattiert', group: 'Ansicht', run: ed => setFaceStyle(ed, 'shaded'), checked: ed => ed.model.settings.style.faceStyle === 'shaded' },
  { id: 'style-textured', label: 'Schattiert mit Texturen', group: 'Ansicht', run: ed => setFaceStyle(ed, 'textured'), checked: ed => ed.model.settings.style.faceStyle === 'textured' },
  { id: 'style-monochrome', label: 'Monochrom', group: 'Ansicht', run: ed => setFaceStyle(ed, 'monochrome'), checked: ed => ed.model.settings.style.faceStyle === 'monochrome' },
  // camera
  { id: 'zoomExtents', label: 'Zoom Grenzen', shortcut: 'Umschalt+Z', group: 'Kamera', run: ed => ed.zoomExtents() },
  { id: 'zoomSelection', label: 'Auswahl zoomen', group: 'Kamera', run: zoomSelection },
  { id: 'persp', label: 'Perspektive', group: 'Kamera', run: ed => { ed.viewer.rig.isOrtho = false; ed.ui.projection = 'persp'; ed.viewer.rig.syncOrtho(); ed.redraw(); }, checked: ed => !ed.viewer?.rig.isOrtho },
  { id: 'ortho', label: 'Parallele Projektion', group: 'Kamera', run: ed => { ed.viewer.rig.isOrtho = true; ed.ui.projection = 'ortho'; ed.viewer.rig.syncOrtho(); ed.redraw(); }, checked: ed => !!ed.viewer?.rig.isOrtho },
  ...(['iso', 'top', 'front', 'right', 'back', 'left', 'bottom'] as const).map(v => ({
    id: 'view-' + v, label: { iso: 'Iso', top: 'Oben', front: 'Vorne', right: 'Rechts', back: 'Hinten', left: 'Links', bottom: 'Unten' }[v], group: 'Kamera',
    run: (ed: Editor) => ed.viewer.rig.standardView(v, ed.model.bounds()),
  })),
];

export function findCommand(id: string) { return COMMANDS.find(c => c.id === id); }
export function runCommand(ed: Editor, id: string) { const c = findCommand(id); if (c && (!c.enabled || c.enabled(ed))) c.run(ed); }
