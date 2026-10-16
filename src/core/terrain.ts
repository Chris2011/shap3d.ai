import * as THREE from 'three';
import type { Entities } from './model';
import type { Model } from './document';
import { libraryMaterial } from './materialLibrary';

/**
 * Terrain = regular height grid (like SketchUp's Sandbox). It is sculpted live as a plain three.js
 * mesh and only turned into real faces ("baked") when the user applies it. The grid is stored on
 * the group's definition, so the terrain can be re-opened and edited later.
 */
export interface TerrainLayers {
  /** auto-texture: grass on flat ground, earth on slopes and dug-out ground, rock high up / on cliffs, snow on peaks */
  auto: boolean;
  grass: string; earth: string; rock: string; snow: string;
  /** above this height (m over the base) the ground turns to rock */
  rockHeight: number;
  /** above this height snow lies on top – null = no snow */
  snowHeight: number | null;
  /** slopes steeper than this (degrees) show earth, steeper than rockSlope bare rock */
  earthSlope: number; rockSlope: number;
  /** below −digDepth (m) the ground shows earth (valleys, holes) */
  digDepth: number;
}
export interface TerrainData {
  w: number; d: number;           // size in metres (X, Y)
  nx: number; ny: number;         // cells along X / Y
  h: number[];                    // (nx+1)·(ny+1) heights, row-major (y outer)
  layers: TerrainLayers;
  /** closed block with earth side walls down below the lowest point */
  skirt: boolean;
  /** water surface height (m) – null = no water */
  water: number | null;
}

export const DEFAULT_LAYERS: TerrainLayers = {
  auto: true, grass: 'Gras', earth: 'Erde', rock: 'Fels', snow: 'Schnee',
  rockHeight: 3, snowHeight: null, earthSlope: 32, rockSlope: 50, digDepth: 0.3,
};

/** Grid with roughly `targetCells` cells along the longer side (max ~60 keeps baking fast). */
export function newTerrain(w: number, d: number, cell?: number): TerrainData {
  const c = cell ?? Math.max(0.2, Math.max(w, d) / 48);
  const nx = Math.max(2, Math.min(120, Math.round(w / c))), ny = Math.max(2, Math.min(120, Math.round(d / c)));
  return { w, d, nx, ny, h: new Array((nx + 1) * (ny + 1)).fill(0), layers: { ...DEFAULT_LAYERS }, skirt: true, water: null };
}
export const cellSize = (t: TerrainData) => ({ cx: t.w / t.nx, cy: t.d / t.ny });
export const idx = (t: TerrainData, i: number, j: number) => j * (t.nx + 1) + i;

/** Height at a local position (bilinear). */
export function heightAt(t: TerrainData, x: number, y: number): number {
  const { cx, cy } = cellSize(t);
  const fx = THREE.MathUtils.clamp(x / cx, 0, t.nx), fy = THREE.MathUtils.clamp(y / cy, 0, t.ny);
  const i = Math.min(Math.floor(fx), t.nx - 1), j = Math.min(Math.floor(fy), t.ny - 1), u = fx - i, v = fy - j;
  const h = (a: number, b: number) => t.h[idx(t, a, b)];
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}

export type Layer = 'grass' | 'earth' | 'rock' | 'snow';
/** Which surface a spot gets (same rules as the live preview shader). */
export function classify(L: TerrainLayers, height: number, slopeDeg: number): Layer {
  if (L.snowHeight != null && height >= L.snowHeight && slopeDeg < L.rockSlope + 10) return 'snow';
  if (slopeDeg >= L.rockSlope || height >= L.rockHeight) return 'rock';
  if (slopeDeg >= L.earthSlope || height <= -L.digDepth) return 'earth';
  return 'grass';
}

// ------------------------------------------------------------------ brushes
export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten' | 'rough';
export interface Brush { mode: BrushMode; radius: number; strength: number }

/** Smooth bell-shaped falloff: 1 in the centre, 0 at the radius. */
const falloff = (d: number, r: number) => (d >= r ? 0 : 0.5 * (1 + Math.cos(Math.PI * d / r)));

/**
 * Apply a brush dab at local (x, y) for `dt` seconds. `target` is the flatten height.
 * Returns true if anything changed.
 */
export function applyBrush(t: TerrainData, b: Brush, x: number, y: number, dt: number, invert: boolean, target = 0, rnd: () => number = Math.random): boolean {
  const { cx, cy } = cellSize(t);
  const i0 = Math.max(0, Math.floor((x - b.radius) / cx)), i1 = Math.min(t.nx, Math.ceil((x + b.radius) / cx));
  const j0 = Math.max(0, Math.floor((y - b.radius) / cy)), j1 = Math.min(t.ny, Math.ceil((y + b.radius) / cy));
  if (i0 > i1 || j0 > j1) return false;
  // raise speed scales with the brush so big brushes build mountains, small ones details
  const rate = b.strength * Math.max(0.4, b.radius) * 1.6 * dt;
  let mode = b.mode; if (invert && mode === 'raise') mode = 'lower'; else if (invert && mode === 'lower') mode = 'raise';
  const src = mode === 'smooth' ? t.h.slice() : t.h;
  let changed = false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const w = falloff(Math.hypot(i * cx - x, j * cy - y), b.radius); if (w <= 0) continue;
    const k = idx(t, i, j); const h = t.h[k];
    let nh = h;
    if (mode === 'raise') nh = h + rate * w;
    else if (mode === 'lower') nh = h - rate * w;
    else if (mode === 'flatten') nh = h + (target - h) * Math.min(1, b.strength * 6 * dt * w);
    else if (mode === 'smooth') {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, c = j + dj; if (a < 0 || c < 0 || a > t.nx || c > t.ny) continue; s += src[idx(t, a, c)]; n++; }
      nh = h + (s / n - h) * Math.min(1, b.strength * 8 * dt * w);
    } else if (mode === 'rough') nh = h + (rnd() - 0.5) * rate * w * 1.5;
    if (nh !== h) { t.h[k] = nh; changed = true; }
  }
  return changed;
}

// ------------------------------------------------------------------ generators
function hash(i: number, j: number, seed: number) { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); }
function valueNoise(x: number, y: number, seed: number) {
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
}
/** Rolling hills / mountains: fractal noise with `height` peak height and `scale` metres per hill. */
export function generateHills(t: TerrainData, opts: { height?: number; scale?: number; seed?: number; add?: boolean } = {}) {
  const H = opts.height ?? Math.max(t.w, t.d) * 0.15, S = opts.scale ?? Math.max(t.w, t.d) / 3, seed = opts.seed ?? Math.floor(Math.random() * 1000);
  const { cx, cy } = cellSize(t);
  for (let j = 0; j <= t.ny; j++) for (let i = 0; i <= t.nx; i++) {
    const x = i * cx / S, y = j * cy / S;
    let n = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { n += valueNoise(x * f, y * f, seed + o * 13) * amp; norm += amp; amp *= 0.5; f *= 2; }
    n = n / norm; // 0..1
    const v = Math.pow(n, 1.6) * H * 1.8 - H * 0.15;
    const k = idx(t, i, j); t.h[k] = (opts.add ? t.h[k] : 0) + v;
  }
}

// ------------------------------------------------------------------ baking into real geometry
function ensureMat(model: Model, name: string) {
  if (model.materials.some(m => m.name === name)) return name;
  const lib = libraryMaterial(name);
  model.materials.push(lib ? { name: lib.name, color: lib.color, opacity: lib.opacity ?? 1, texture: lib.texture, textureSize: lib.size } : { name, color: '#888888', opacity: 1 });
  return name;
}

/** Turns the grid into faces in `ents` (local coordinates, origin = corner). Returns the face count. */
export function bakeTerrain(ents: Entities, t: TerrainData, model: Model): number {
  const { cx, cy } = cellSize(t); const L = t.layers;
  const vid: number[] = new Array((t.nx + 1) * (t.ny + 1));
  for (let j = 0; j <= t.ny; j++) for (let i = 0; i <= t.nx; i++) vid[idx(t, i, j)] = ents.addVertex(new THREE.Vector3(i * cx, j * cy, t.h[idx(t, i, j)]));
  const mats: Record<Layer, string> = { grass: ensureMat(model, L.grass), earth: ensureMat(model, L.earth), rock: ensureMat(model, L.rock), snow: ensureMat(model, L.snow) };
  const P = (i: number, j: number) => new THREE.Vector3(i * cx, j * cy, t.h[idx(t, i, j)]);
  const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
    const A = P(...a), B = P(...b), C = P(...c);
    const n = B.clone().sub(A).cross(C.clone().sub(A)).normalize();
    const slope = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(n.z, -1, 1)));
    const layer = L.auto ? classify(L, (A.z + B.z + C.z) / 3, slope) : 'grass';
    const f = ents.createFaceRaw([vid[idx(t, ...a)], vid[idx(t, ...b)], vid[idx(t, ...c)]], [], { material: mats[layer] });
    return f ? 1 : 0;
  };
  let faces = 0;
  for (let j = 0; j < t.ny; j++) for (let i = 0; i < t.nx; i++) {
    // alternate the diagonal so ridges don't all run the same way
    if ((i + j) % 2 === 0) { faces += tri([i, j], [i + 1, j], [i + 1, j + 1]); faces += tri([i, j], [i + 1, j + 1], [i, j + 1]); }
    else { faces += tri([i, j], [i + 1, j], [i, j + 1]); faces += tri([i + 1, j], [i + 1, j + 1], [i, j + 1]); }
  }

  if (t.skirt) {
    let lo = Infinity; for (const h of t.h) lo = Math.min(lo, h);
    const base = Math.min(0, lo) - Math.max(0.5, Math.max(t.w, t.d) * 0.03);
    const earth = mats.earth;
    const side = (pts: [number, number][], outward: THREE.Vector3) => {
      // one wall per side: top follows the terrain edge, bottom is flat
      const top = pts.map(([i, j]) => vid[idx(t, i, j)]);
      const a = pts[0], b = pts[pts.length - 1];
      const bl = ents.addVertex(new THREE.Vector3(a[0] * cx, a[1] * cy, base)), br = ents.addVertex(new THREE.Vector3(b[0] * cx, b[1] * cy, base));
      const loop = [...top, br, bl];
      const f = ents.createFaceRaw(loop, [], { material: earth, backMaterial: earth });
      if (f && ents.faceNormal(f).dot(outward) < 0) ents.reverseFace(f);
      faces += f ? 1 : 0;
      return [bl, br];
    };
    const row = (j: number) => Array.from({ length: t.nx + 1 }, (_, i) => [i, j] as [number, number]);
    const col = (i: number) => Array.from({ length: t.ny + 1 }, (_, j) => [i, j] as [number, number]);
    side(row(0), new THREE.Vector3(0, -1, 0)); side(row(t.ny), new THREE.Vector3(0, 1, 0));
    side(col(0), new THREE.Vector3(-1, 0, 0)); side(col(t.nx), new THREE.Vector3(1, 0, 0));
    const bottom = [[0, 0], [t.nx, 0], [t.nx, t.ny], [0, t.ny]].map(([i, j]) => ents.addVertex(new THREE.Vector3(i * cx, j * cy, base)));
    const f = ents.createFaceRaw([...bottom].reverse(), [], { material: earth });
    if (f && ents.faceNormal(f).z > 0) ents.reverseFace(f);
    faces += f ? 1 : 0;
  }
  if (t.water != null) {
    const wmat = ensureMat(model, 'Wasser');
    const z = t.water, m = 0.001;
    const q = [[m, m], [t.w - m, m], [t.w - m, t.d - m], [m, t.d - m]].map(([x, y]) => ents.addVertex(new THREE.Vector3(x, y, z)));
    const f = ents.createFaceRaw(q, [], { material: wmat, backMaterial: wmat });
    if (f && ents.faceNormal(f).z < 0) ents.reverseFace(f);
    faces += f ? 1 : 0;
  }
  // flat areas of the same material become single faces (far fewer faces, same look) –
  // done last, because the side walls above reference the grid's border vertices
  const before = ents.faces.size;
  ents.mergeCoplanar([...ents.edges.keys()]);
  // soften every gentle fold – including almost-flat ones the coplanar merge leaves behind
  // (autoSoften skips those, they would show up as zigzag lines on the grass)
  const cos60 = Math.cos(Math.PI / 3);
  for (const e of ents.edges.values()) {
    const fs = ents.facesOfEdge(e.id);
    if (fs.length === 2 && ents.faceNormal(fs[0]).dot(ents.faceNormal(fs[1])) > cos60) e.soft = true;
  }
  return faces - (before - ents.faces.size);
}

// ------------------------------------------------------------------ persistence (compact)
export function terrainToJSON(t: TerrainData) { return { ...t, h: t.h.map(v => Math.round(v * 1000) / 1000) }; }
export function terrainFromJSON(j: any): TerrainData | undefined {
  if (!j || !Array.isArray(j.h) || j.h.length !== (j.nx + 1) * (j.ny + 1)) return undefined;
  return { w: j.w, d: j.d, nx: j.nx, ny: j.ny, h: j.h.slice(), layers: { ...DEFAULT_LAYERS, ...(j.layers ?? {}) }, skirt: j.skirt ?? true, water: j.water ?? null };
}
export const cloneTerrain = (t: TerrainData): TerrainData => ({ ...t, h: t.h.slice(), layers: { ...t.layers } });
