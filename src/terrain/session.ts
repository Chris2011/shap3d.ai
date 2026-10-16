import * as THREE from 'three';
import { reactive } from 'vue';
import type { Editor } from '../engine/editor';
import type { Instance } from '../core/model';
import { shadeUniforms } from '../engine/viewer';
import { makeTexture, isTextureKind, TEXTURE_SIZE } from '../core/textures';
import { libraryMaterial } from '../core/materialLibrary';
import {
  type TerrainData, type Brush, type BrushMode, newTerrain, cellSize, idx, heightAt, applyBrush, generateHills, bakeTerrain, cloneTerrain,
} from '../core/terrain';
import { Entities } from '../core/model';

/**
 * A terrain sculpting session. While it runs the terrain is a plain three.js mesh in the viewer
 * (fast to deform); "Übernehmen" bakes it into a real group as one undo step.
 */
export const terrainUi = reactive({
  /** sculpting is running */
  active: false,
  /** "new terrain" chooser is open */
  chooser: false,
  brush: { mode: 'raise' as BrushMode, radius: 2, strength: 0.5 } as Brush,
  newW: 20, newD: 20, detail: 'mittel' as 'grob' | 'mittel' | 'fein', startHills: false,
  /** bumped whenever the grid or the settings change (panel re-reads info) */
  rev: 0,
  canUndo: false,
  title: '',
});

interface Session {
  ed: Editor;
  data: TerrainData;
  origin: THREE.Vector3;          // world position of the grid corner (0, 0)
  mesh: THREE.Mesh;
  water: THREE.Mesh;
  /** face the terrain was made from – removed on apply */
  srcFace: { ents: Entities; id: number } | null;
  /** existing terrain group being edited – hidden while sculpting */
  inst: Instance | null;
  undo: number[][];
}
let S: Session | null = null;
export const session = () => S;
export const terrainData = () => S?.data ?? null;

// ------------------------------------------------------------------ preview material
const LAYER_DEFAULT = { Gras: '#6fa347', Erde: '#8a6342', Fels: '#9a968e', Schnee: '#f3f6f9' };
function layerTex(name: string, fallback: keyof typeof LAYER_DEFAULT) {
  const m = S?.ed.model.materials.find(x => x.name === name);
  const lib = libraryMaterial(name);
  const color = m?.color ?? lib?.color ?? LAYER_DEFAULT[fallback];
  const kind = m?.texture ?? lib?.texture;
  const size = m?.textureSize ?? lib?.size ?? (kind && isTextureKind(kind) ? TEXTURE_SIZE[kind] : 1);
  return { tex: kind && isTextureKind(kind) ? makeTexture(kind, color) : null, color: new THREE.Color(color), size };
}

const VERT = `
#include <common>
#include <clipping_planes_pars_vertex>
varying vec3 vN; varying vec3 vW; varying float vH;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vH = position.z;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const FRAG = `
uniform vec3 lightDir; uniform float dark; uniform float light;
uniform sampler2D tG; uniform sampler2D tE; uniform sampler2D tR; uniform sampler2D tS;
uniform vec3 cG; uniform vec3 cE; uniform vec3 cR; uniform vec3 cS;
uniform vec4 useTex; uniform vec4 tile;
uniform float autoTex; uniform float rockH; uniform float snowH; uniform float earthSlope; uniform float rockSlope; uniform float dig;
varying vec3 vN; varying vec3 vW; varying float vH;
#include <clipping_planes_pars_fragment>
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 layer(sampler2D t, vec3 c, float use, float size){ return use > 0.5 ? texture2D(t, vW.xy / size).rgb : c; }
void main(){
  #include <clipping_planes_fragment>
  vec3 n = normalize(vN);
  float slope = degrees(acos(clamp(abs(n.z), 0.0, 1.0)));
  vec3 col = layer(tG, cG, useTex.x, tile.x);
  if (autoTex > 0.5) {
    float e = max(smoothstep(earthSlope - 4.0, earthSlope + 4.0, slope), 1.0 - smoothstep(-dig - 0.12, -dig + 0.12, vH));
    float r = max(smoothstep(rockSlope - 4.0, rockSlope + 4.0, slope), smoothstep(rockH - 0.2, rockH + 0.2, vH));
    float s = snowH > -1e8 ? smoothstep(snowH - 0.2, snowH + 0.2, vH) * (1.0 - smoothstep(rockSlope + 5.0, rockSlope + 15.0, slope)) : 0.0;
    col = mix(col, layer(tE, cE, useTex.y, tile.y), e);
    col = mix(col, layer(tR, cR, useTex.z, tile.z), r);
    col = mix(col, layer(tS, cS, useTex.w, tile.w), s);
  }
  float f = clamp(dark + light * max(dot(n * (gl_FrontFacing ? 1.0 : -1.0), lightDir), 0.0), 0.0, 1.0);
  gl_FragColor = vec4(toSRGB(col) * f, 1.0);
}`;

function makeMaterial() {
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); blank.needsUpdate = true;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shadeUniforms,
      tG: { value: blank }, tE: { value: blank }, tR: { value: blank }, tS: { value: blank },
      cG: { value: new THREE.Color() }, cE: { value: new THREE.Color() }, cR: { value: new THREE.Color() }, cS: { value: new THREE.Color() },
      useTex: { value: new THREE.Vector4() }, tile: { value: new THREE.Vector4(1, 1, 1, 1) },
      autoTex: { value: 1 }, rockH: { value: 3 }, snowH: { value: -1e9 }, earthSlope: { value: 32 }, rockSlope: { value: 50 }, dig: { value: 0.3 },
    },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, clipping: true,
    // draws over the flat source face it was made from
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
}

/** Push texture + layer settings into the preview shader. */
export function refreshLook() {
  if (!S) return;
  const u = (S.mesh.material as THREE.ShaderMaterial).uniforms; const L = S.data.layers;
  const layers = [layerTex(L.grass, 'Gras'), layerTex(L.earth, 'Erde'), layerTex(L.rock, 'Fels'), layerTex(L.snow, 'Schnee')];
  (['tG', 'tE', 'tR', 'tS'] as const).forEach((k, i) => { if (layers[i].tex) u[k].value = layers[i].tex; });
  (['cG', 'cE', 'cR', 'cS'] as const).forEach((k, i) => (u[k].value as THREE.Color).copy(layers[i].color).convertSRGBToLinear());
  u.useTex.value.set(...layers.map(l => (l.tex ? 1 : 0)) as [number, number, number, number]);
  u.tile.value.set(...layers.map(l => l.size) as [number, number, number, number]);
  u.autoTex.value = L.auto ? 1 : 0; u.rockH.value = L.rockHeight; u.snowH.value = L.snowHeight ?? -1e9;
  u.earthSlope.value = L.earthSlope; u.rockSlope.value = L.rockSlope; u.dig.value = L.digDepth;
  const d = S.data; S.water.visible = d.water != null;
  if (d.water != null) { S.water.scale.set(d.w, d.d, 1); S.water.position.set(S.origin.x + d.w / 2, S.origin.y + d.d / 2, S.origin.z + d.water); }
  terrainUi.rev++;
  S.ed.redraw();
}

function buildGeometry(t: TerrainData) {
  const { cx, cy } = cellSize(t);
  const pos = new Float32Array((t.nx + 1) * (t.ny + 1) * 3);
  for (let j = 0; j <= t.ny; j++) for (let i = 0; i <= t.nx; i++) { const k = idx(t, i, j); pos[k * 3] = i * cx; pos[k * 3 + 1] = j * cy; pos[k * 3 + 2] = t.h[k]; }
  const index: number[] = [];
  for (let j = 0; j < t.ny; j++) for (let i = 0; i < t.nx; i++) {
    const a = idx(t, i, j), b = idx(t, i + 1, j), c = idx(t, i + 1, j + 1), d = idx(t, i, j + 1);
    if ((i + j) % 2 === 0) index.push(a, b, c, a, c, d); else index.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(index); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
/** Copy heights into the preview mesh after a brush dab. */
export function syncGeometry() {
  if (!S) return;
  const g = S.mesh.geometry; const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let k = 0; k < S.data.h.length; k++) p.setZ(k, S.data.h[k]);
  p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  terrainUi.rev++;
  S.ed.redraw();
}

// ------------------------------------------------------------------ lifecycle
function begin(ed: Editor, data: TerrainData, origin: THREE.Vector3, extra: { srcFace?: Session['srcFace']; inst?: Instance | null; title: string }) {
  if (S) end();
  const mesh = new THREE.Mesh(buildGeometry(data), makeMaterial());
  mesh.position.copy(origin); mesh.renderOrder = 2;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x3f7fae, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  water.renderOrder = 3;
  ed.viewer.helpers.add(mesh, water);
  S = { ed, data, origin: origin.clone(), mesh, water, srcFace: extra.srcFace ?? null, inst: extra.inst ?? null, undo: [] };
  if (S.inst) { S.inst.hidden = true; ed.invalidate(); }
  const longest = Math.max(data.w, data.d);
  terrainUi.brush.radius = +Math.max(0.5, longest / 8).toFixed(1);
  Object.assign(terrainUi, { active: true, chooser: false, canUndo: false, title: extra.title });
  refreshLook();
  if (ed.ui.tool !== 'terrain') ed.setTool('terrain');
  ed.clearSelection();
}
function end() {
  if (!S) return;
  const s = S; S = null;
  s.ed.viewer.helpers.remove(s.mesh, s.water);
  s.mesh.geometry.dispose(); (s.mesh.material as THREE.Material).dispose(); s.water.geometry.dispose(); (s.water.material as THREE.Material).dispose();
  if (s.inst) s.inst.hidden = false;
  terrainUi.active = false; terrainUi.canUndo = false;
  s.ed.invalidate();
}

const CELLS = { grob: 28, mittel: 48, fein: 80 };
/** Grid resolution for a size and the chosen detail level. */
const cellFor = (w: number, d: number) => Math.max(0.1, Math.max(w, d) / CELLS[terrainUi.detail]);

/**
 * Entry point of the terrain tool: edits a selected terrain group, turns a selected horizontal face
 * into terrain, or opens the "new terrain" chooser.
 */
export function openTerrain(ed: Editor) {
  if (S) { if (ed.ui.tool !== 'terrain') ed.setTool('terrain'); return; }
  const sel = ed.selected();
  const inst = sel.find(r => r.kind === 'instance');
  if (inst) {
    const i = ed.entities.instances.get(inst.id);
    if (i?.def.terrain) {
      const origin = new THREE.Vector3().setFromMatrixPosition(ed.contextMatrix.clone().multiply(i.matrix));
      begin(ed, cloneTerrain(i.def.terrain), origin, { inst: i, title: i.name || i.def.name });
      return;
    }
  }
  const face = sel.find(r => r.kind === 'face');
  if (face) {
    const f = ed.entities.faces.get(face.id);
    if (f && Math.abs(ed.entities.faceNormal(f).z) > 0.999) {
      const pts = ed.entities.facePoints(f).map(p => p.clone().applyMatrix4(ed.contextMatrix));
      const bb = new THREE.Box3().setFromPoints(pts); const size = bb.getSize(new THREE.Vector3());
      if (size.x > 0.05 && size.y > 0.05) {
        const data = newTerrain(size.x, size.y, cellFor(size.x, size.y));
        begin(ed, data, new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z), { srcFace: { ents: ed.entities, id: f.id }, title: 'Gelände aus Fläche' });
        return;
      }
    }
    ed.toast('Gelände geht nur aus einer waagerechten Fläche – z. B. einem Rechteck auf dem Boden.');
  }
  terrainUi.chooser = true;
  if (ed.ui.tool !== 'terrain') ed.setTool('terrain');
}

/** Creates a new terrain from the chooser (next to the existing model, or centred on the origin). */
export function createNew(ed: Editor) {
  const w = Math.max(1, terrainUi.newW), d = Math.max(1, terrainUi.newD);
  const data = newTerrain(w, d, cellFor(w, d));
  if (terrainUi.startHills) generateHills(data, { height: Math.max(w, d) * 0.12 });
  const b = ed.model.bounds();
  const origin = b.isEmpty() ? new THREE.Vector3(-w / 2, -d / 2, 0) : new THREE.Vector3(b.max.x + 2, b.min.y, 0);
  begin(ed, data, origin, { title: `Neues Gelände ${w} × ${d} m` });
  ed.viewer.rig.zoomExtents(new THREE.Box3(origin, origin.clone().add(new THREE.Vector3(w, d, Math.max(w, d) * 0.2))), true);
}

/** Bakes the terrain into the model – one undo step. */
export function applyTerrain(switchTool = true) {
  if (!S) return;
  const s = S; const ed = s.ed;
  // un-hide first so the undo snapshot taken by commit() has the old terrain visible
  if (s.inst) s.inst.hidden = false;
  const data = cloneTerrain(s.data);
  let made: Instance | null = null;
  try {
    ed.commit(s.inst ? 'Gelände bearbeiten' : 'Gelände', () => {
      const ents = new Entities();
      bakeTerrain(ents, data, ed.model);
      if (s.inst) {
        const def = s.inst.def;
        def.entities = ents; def.terrain = data; made = s.inst;
      } else {
        const def = ed.model.newDefinition(ed.model.uniqueDefName('Gelände'), false, ents); def.terrain = data;
        const local = s.origin.clone().applyMatrix4(ed.contextInverse);
        made = ed.entities.addInstance(def, new THREE.Matrix4().makeTranslation(local.x, local.y, local.z), 'Gelände');
        if (s.srcFace) {
          // the flat face is replaced by the terrain (edges that only bounded it go too)
          const { ents: E, id } = s.srcFace; const f = E.faces.get(id);
          if (f) { const edges = E.faceEdges(f); E.removeFace(id); for (const e of edges) if (!E.facesOfEdge(e.id).length) E.eraseEdge(e.id, false); E.removeOrphanVertices(); }
        }
      }
    });
  } catch { if (s.inst) s.inst.hidden = true; return; }
  s.inst = null; // already visible again
  end();
  if (made) ed.select([{ kind: 'instance', id: (made as Instance).id }]);
  if (switchTool) ed.setTool('select');
  ed.toast('Gelände übernommen – Strg+Z macht es rückgängig');
}

/** Throws the sculpting away. */
export function discardTerrain() {
  if (!S) { terrainUi.chooser = false; return; }
  const ed = S.ed; end(); ed.setTool('select'); ed.toast('Gelände verworfen');
}
export function closeChooser(ed: Editor) { terrainUi.chooser = false; if (!S && ed.ui.tool === 'terrain') ed.setTool('select'); }

// ------------------------------------------------------------------ editing helpers (used by tool + panel)
export function pushUndo() { if (!S) return; S.undo.push(S.data.h.slice()); if (S.undo.length > 60) S.undo.shift(); terrainUi.canUndo = true; }
export function undoStroke() {
  if (!S || !S.undo.length) return false;
  S.data.h = S.undo.pop()!; terrainUi.canUndo = S.undo.length > 0; syncGeometry(); return true;
}
export function generate(kind: 'hills' | 'mountains' | 'flat') {
  if (!S) return; pushUndo(); const d = S.data; const L = Math.max(d.w, d.d);
  if (kind === 'flat') d.h.fill(0);
  else if (kind === 'hills') generateHills(d, { height: L * 0.06, scale: L / 4 });
  else generateHills(d, { height: L * 0.25, scale: L / 2.5 });
  syncGeometry();
}

/** World hit point on the terrain under the mouse (null when the cursor is off the terrain). */
export function hitTerrain(x: number, y: number): THREE.Vector3 | null {
  if (!S) return null;
  const rc = new THREE.Raycaster(); rc.ray.copy(S.ed.viewer.ray(x, y));
  S.mesh.updateMatrixWorld();
  const h = rc.intersectObject(S.mesh, false)[0];
  return h ? h.point.clone() : null;
}
export const toGrid = (p: THREE.Vector3) => (S ? { x: p.x - S.origin.x, y: p.y - S.origin.y } : { x: 0, y: 0 });
export const gridHeight = (x: number, y: number) => (S ? heightAt(S.data, x, y) : 0);
export const gridToWorld = (x: number, y: number, z: number) => (S ? new THREE.Vector3(S.origin.x + x, S.origin.y + y, S.origin.z + z) : new THREE.Vector3());
export function dab(x: number, y: number, dt: number, invert: boolean, target: number) {
  if (!S) return false;
  return applyBrush(S.data, terrainUi.brush, x, y, dt, invert, target);
}
export function stats() {
  if (!S) return null; const d = S.data; let lo = Infinity, hi = -Infinity; for (const v of d.h) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const { cx } = cellSize(d);
  return { w: d.w, d: d.d, nx: d.nx, ny: d.ny, cell: cx, lo, hi };
}
