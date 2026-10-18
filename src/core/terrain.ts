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
  width: number; depth: number;           // size in metres (X, Y)
  columns: number; rows: number;         // cells along X / Y
  heights: number[];                    // (nx+1)·(ny+1) heights, row-major (y outer)
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
export const newTerrain = (width: number, depth: number, cell?: number): TerrainData => {
  const cellLength = cell ?? Math.max(0.2, Math.max(width, depth) / 48);
  const columns = Math.max(2, Math.min(120, Math.round(width / cellLength))), rows = Math.max(2, Math.min(120, Math.round(depth / cellLength)));
  return { width: width, depth: depth, columns: columns, rows: rows, heights: new Array((columns + 1) * (rows + 1)).fill(0), layers: { ...DEFAULT_LAYERS }, skirt: true, water: null };
};
export const cellSize = (terrain: TerrainData) => ({ cx: terrain.width / terrain.columns, cy: terrain.depth / terrain.rows });
export const idx = (terrain: TerrainData, i: number, j: number) => j * (terrain.columns + 1) + i;

/** Height at a local position (bilinear). */
export const heightAt = (terrain: TerrainData, x: number, y: number): number => {
  const { cx: cellX, cy: cellY } = cellSize(terrain);
  const gridX = THREE.MathUtils.clamp(x / cellX, 0, terrain.columns), gridY = THREE.MathUtils.clamp(y / cellY, 0, terrain.rows);
  const i = Math.min(Math.floor(gridX), terrain.columns - 1), j = Math.min(Math.floor(gridY), terrain.rows - 1), fracX = gridX - i, fracY = gridY - j;
  const heightAtCell = (column: number, row: number) => terrain.heights[idx(terrain, column, row)];
  return (heightAtCell(i, j) * (1 - fracX) + heightAtCell(i + 1, j) * fracX) * (1 - fracY) + (heightAtCell(i, j + 1) * (1 - fracX) + heightAtCell(i + 1, j + 1) * fracX) * fracY;
};

export type Layer = 'grass' | 'earth' | 'rock' | 'snow';
/** Which surface a spot gets (same rules as the live preview shader). */
export const classify = (layers: TerrainLayers, height: number, slopeDeg: number): Layer => {
  if (layers.snowHeight != null && height >= layers.snowHeight && slopeDeg < layers.rockSlope + 10) return 'snow';
  if (slopeDeg >= layers.rockSlope || height >= layers.rockHeight) return 'rock';
  if (slopeDeg >= layers.earthSlope || height <= -layers.digDepth) return 'earth';
  return 'grass';
};

// ------------------------------------------------------------------ brushes
export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten' | 'rough';
export interface Brush { mode: BrushMode; radius: number; strength: number }

/** Smooth bell-shaped falloff: 1 in the centre, 0 at the radius. */
const falloff = (distance: number, radius: number) => (distance >= radius ? 0 : 0.5 * (1 + Math.cos(Math.PI * distance / radius)));

/**
 * Apply a brush dab at local (x, y) for `dt` seconds. `target` is the flatten height.
 * Returns true if anything changed.
 */
export const applyBrush = (terrain: TerrainData, brush: Brush, x: number, y: number, elapsed: number, invert: boolean, target = 0, rnd: () => number = Math.random): boolean => {
  const { cx: cellX, cy: cellY } = cellSize(terrain);
  const minColumn = Math.max(0, Math.floor((x - brush.radius) / cellX)), maxColumn = Math.min(terrain.columns, Math.ceil((x + brush.radius) / cellX));
  const minRow = Math.max(0, Math.floor((y - brush.radius) / cellY)), maxRow = Math.min(terrain.rows, Math.ceil((y + brush.radius) / cellY));
  if (minColumn > maxColumn || minRow > maxRow) return false;
  // raise speed scales with the brush so big brushes build mountains, small ones details
  const rate = brush.strength * Math.max(0.4, brush.radius) * 1.6 * elapsed;
  let mode = brush.mode; if (invert && mode === 'raise') mode = 'lower'; else if (invert && mode === 'lower') mode = 'raise';
  const src = mode === 'smooth' ? terrain.heights.slice() : terrain.heights;
  let changed = false;
  for (let j = minRow; j <= maxRow; j++) for (let i = minColumn; i <= maxColumn; i++) {
    const weight = falloff(Math.hypot(i * cellX - x, j * cellY - y), brush.radius); if (weight <= 0) continue;
    const k = idx(terrain, i, j); const height = terrain.heights[k];
    let newHeight = height;
    if (mode === 'raise') newHeight = height + rate * weight;
    else if (mode === 'lower') newHeight = height - rate * weight;
    else if (mode === 'flatten') newHeight = height + (target - height) * Math.min(1, brush.strength * 6 * elapsed * weight);
    else if (mode === 'smooth') {
      let sum = 0, count = 0;
      for (let rowOffset = -1; rowOffset <= 1; rowOffset++) for (let columnOffset = -1; columnOffset <= 1; columnOffset++) { const column = i + columnOffset, row = j + rowOffset; if (column < 0 || row < 0 || column > terrain.columns || row > terrain.rows) continue; sum += src[idx(terrain, column, row)]; count++; }
      newHeight = height + (sum / count - height) * Math.min(1, brush.strength * 8 * elapsed * weight);
    } else if (mode === 'rough') newHeight = height + (rnd() - 0.5) * rate * weight * 1.5;
    if (newHeight !== height) { terrain.heights[k] = newHeight; changed = true; }
  }
  return changed;
};

// ------------------------------------------------------------------ generators
const hash = (i: number, j: number, seed: number) => { const wave = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return wave - Math.floor(wave); };
const valueNoise = (x: number, y: number, seed: number) => {
  const i = Math.floor(x), j = Math.floor(y), fracX = x - i, fracY = y - j;
  const smoothX = fracX * fracX * (3 - 2 * fracX), smoothY = fracY * fracY * (3 - 2 * fracY);
  const corner00 = hash(i, j, seed), corner10 = hash(i + 1, j, seed), corner01 = hash(i, j + 1, seed), corner11 = hash(i + 1, j + 1, seed);
  return (corner00 * (1 - smoothX) + corner10 * smoothX) * (1 - smoothY) + (corner01 * (1 - smoothX) + corner11 * smoothX) * smoothY;
};
/** Rolling hills / mountains: fractal noise with `height` peak height and `scale` metres per hill. */
export const generateHills = (terrain: TerrainData, opts: { height?: number; scale?: number; seed?: number; add?: boolean } = {}) => {
  const amplitude = opts.height ?? Math.max(terrain.width, terrain.depth) * 0.15, featureSize = opts.scale ?? Math.max(terrain.width, terrain.depth) / 3, seed = opts.seed ?? Math.floor(Math.random() * 1000);
  const { cx: cellX, cy: cellY } = cellSize(terrain);
  for (let j = 0; j <= terrain.rows; j++) for (let i = 0; i <= terrain.columns; i++) {
    const x = i * cellX / featureSize, y = j * cellY / featureSize;
    let noise = 0, amp = 1, frequency = 1, norm = 0;
    for (let octave = 0; octave < 4; octave++) { noise += valueNoise(x * frequency, y * frequency, seed + octave * 13) * amp; norm += amp; amp *= 0.5; frequency *= 2; }
    noise = noise / norm; // 0..1
    const value = Math.pow(noise, 1.6) * amplitude * 1.8 - amplitude * 0.15;
    const k = idx(terrain, i, j); terrain.heights[k] = (opts.add ? terrain.heights[k] : 0) + value;
  }
};

// ------------------------------------------------------------------ baking into real geometry
const ensureMat = (model: Model, name: string) => {
  if (model.materials.some(material => material.name === name)) return name;
  const lib = libraryMaterial(name);
  model.materials.push(lib ? { name: lib.name, color: lib.color, opacity: lib.opacity ?? 1, texture: lib.texture, textureSize: lib.size } : { name, color: '#888888', opacity: 1 });
  return name;
};

/** Turns the grid into faces in `ents` (local coordinates, origin = corner). Returns the face count. */
export const bakeTerrain = (ents: Entities, terrain: TerrainData, model: Model): number => {
  const { cx: cellX, cy: cellY } = cellSize(terrain); const layers = terrain.layers;
  const vertexId: number[] = new Array((terrain.columns + 1) * (terrain.rows + 1));
  for (let j = 0; j <= terrain.rows; j++) for (let i = 0; i <= terrain.columns; i++) vertexId[idx(terrain, i, j)] = ents.addVertex(new THREE.Vector3(i * cellX, j * cellY, terrain.heights[idx(terrain, i, j)]));
  const mats: Record<Layer, string> = { grass: ensureMat(model, layers.grass), earth: ensureMat(model, layers.earth), rock: ensureMat(model, layers.rock), snow: ensureMat(model, layers.snow) };
  const pointAt = (i: number, j: number) => new THREE.Vector3(i * cellX, j * cellY, terrain.heights[idx(terrain, i, j)]);
  const tri = (cellA: [number, number], cellB: [number, number], cellC: [number, number]) => {
    const cornerA = pointAt(...cellA), cornerB = pointAt(...cellB), cornerC = pointAt(...cellC);
    const normal = cornerB.clone().sub(cornerA).cross(cornerC.clone().sub(cornerA)).normalize();
    const slope = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(normal.z, -1, 1)));
    const layer = layers.auto ? classify(layers, (cornerA.z + cornerB.z + cornerC.z) / 3, slope) : 'grass';
    const face = ents.createFaceRaw([vertexId[idx(terrain, ...cellA)], vertexId[idx(terrain, ...cellB)], vertexId[idx(terrain, ...cellC)]], [], { material: mats[layer] });
    return face ? 1 : 0;
  };
  let faces = 0;
  for (let j = 0; j < terrain.rows; j++) for (let i = 0; i < terrain.columns; i++) {
    // alternate the diagonal so ridges don't all run the same way
    if ((i + j) % 2 === 0) { faces += tri([i, j], [i + 1, j], [i + 1, j + 1]); faces += tri([i, j], [i + 1, j + 1], [i, j + 1]); }
    else { faces += tri([i, j], [i + 1, j], [i, j + 1]); faces += tri([i + 1, j], [i + 1, j + 1], [i, j + 1]); }
  }

  if (terrain.skirt) {
    let lowest = Infinity; for (const height of terrain.heights) lowest = Math.min(lowest, height);
    const base = Math.min(0, lowest) - Math.max(0.5, Math.max(terrain.width, terrain.depth) * 0.03);
    const earth = mats.earth;
    const side = (pts: [number, number][], outward: THREE.Vector3) => {
      // one wall per side: top follows the terrain edge, bottom is flat
      const top = pts.map(([i, j]) => vertexId[idx(terrain, i, j)]);
      const first = pts[0], last = pts[pts.length - 1];
      const baseLeft = ents.addVertex(new THREE.Vector3(first[0] * cellX, first[1] * cellY, base)), baseRight = ents.addVertex(new THREE.Vector3(last[0] * cellX, last[1] * cellY, base));
      const loop = [...top, baseRight, baseLeft];
      const skirt = ents.createFaceRaw(loop, [], { material: earth, backMaterial: earth });
      if (skirt && ents.faceNormal(skirt).dot(outward) < 0) ents.reverseFace(skirt);
      faces += skirt ? 1 : 0;
      return [baseLeft, baseRight];
    };
    const row = (j: number) => Array.from({ length: terrain.columns + 1 }, (_, i) => [i, j] as [number, number]);
    const col = (i: number) => Array.from({ length: terrain.rows + 1 }, (_, j) => [i, j] as [number, number]);
    side(row(0), new THREE.Vector3(0, -1, 0)); side(row(terrain.rows), new THREE.Vector3(0, 1, 0));
    side(col(0), new THREE.Vector3(-1, 0, 0)); side(col(terrain.columns), new THREE.Vector3(1, 0, 0));
    const bottom = [[0, 0], [terrain.columns, 0], [terrain.columns, terrain.rows], [0, terrain.rows]].map(([i, j]) => ents.addVertex(new THREE.Vector3(i * cellX, j * cellY, base)));
    const face = ents.createFaceRaw([...bottom].reverse(), [], { material: earth });
    if (face && ents.faceNormal(face).z > 0) ents.reverseFace(face);
    faces += face ? 1 : 0;
  }
  if (terrain.water != null) {
    const wmat = ensureMat(model, 'Wasser');
    const z = terrain.water, inset = 0.001;
    const corners = [[inset, inset], [terrain.width - inset, inset], [terrain.width - inset, terrain.depth - inset], [inset, terrain.depth - inset]].map(([x, y]) => ents.addVertex(new THREE.Vector3(x, y, z)));
    const face = ents.createFaceRaw(corners, [], { material: wmat, backMaterial: wmat });
    if (face && ents.faceNormal(face).z < 0) ents.reverseFace(face);
    faces += face ? 1 : 0;
  }
  // flat areas of the same material become single faces (far fewer faces, same look) –
  // done last, because the side walls above reference the grid's border vertices
  const before = ents.faces.size;
  ents.mergeCoplanar([...ents.edges.keys()]);
  // soften every gentle fold – including almost-flat ones the coplanar merge leaves behind
  // (autoSoften skips those, they would show up as zigzag lines on the grass)
  const cos60 = Math.cos(Math.PI / 3);
  for (const edge of ents.edges.values()) {
    const adjacent = ents.facesOfEdge(edge.id);
    if (adjacent.length === 2 && ents.faceNormal(adjacent[0]).dot(ents.faceNormal(adjacent[1])) > cos60) edge.soft = true;
  }
  return faces - (before - ents.faces.size);
};

// ------------------------------------------------------------------ persistence (compact)
export const terrainToJSON = (terrain: TerrainData) => ({
  width: terrain.width, depth: terrain.depth, columns: terrain.columns, rows: terrain.rows,
  heights: terrain.heights.map(height => Math.round(height * 1000) / 1000),
  layers: terrain.layers, skirt: terrain.skirt, water: terrain.water,
});
export const terrainFromJSON = (json: any): TerrainData | undefined => {
  if (!json || !Array.isArray(json.heights) || json.heights.length !== (json.columns + 1) * (json.rows + 1)) return undefined;
  return { width: json.width, depth: json.depth, columns: json.columns, rows: json.rows, heights: json.heights.slice(), layers: { ...DEFAULT_LAYERS, ...(json.layers ?? {}) }, skirt: json.skirt ?? true, water: json.water ?? null };
};
export const cloneTerrain = (terrain: TerrainData): TerrainData => ({ ...terrain, heights: terrain.heights.slice(), layers: { ...terrain.layers } });
