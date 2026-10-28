import type { PluginMesh } from '../../../src/plugins/types';
import { HEIGHT_DEFAULTS, heightField, type HeightOptions } from './noise';

/**
 * Noise terrains as height grids – in the format of the built-in terrain plugin (`pluginData.terrain` on the
 * group's definition), so the Terrain tool opens them like its own and keeps sculpting them.
 */

/** the built-in terrain plugin's id – its height grid lives in `definition.pluginData.terrain` */
export const TERRAIN_PLUGIN = 'terrain';

/** surface layers like the terrain plugin's (same material names, same rules) */
export interface TerrainLayers {
  auto: boolean;
  grass: string;
  earth: string;
  rock: string;
  snow: string;
  rockHeight: number;
  snowHeight: number | null;
  earthSlope: number;
  rockSlope: number;
  digDepth: number;
}

/** the terrain plugin's stored grid (see src/plugins/builtin/terrain/terrainData.ts) */
export interface TerrainGrid {
  width: number;
  depth: number;
  columns: number;
  rows: number;
  /** (columns+1)·(rows+1) heights, row-major (y outer) */
  heights: number[];
  layers: TerrainLayers;
  skirt: boolean;
  water: number | null;
}

// i18n-ignore-next-line – material names (model content, the app's material library)
export const MATERIALS = { grass: 'Gras', earth: 'Erde', rock: 'Fels', snow: 'Schnee', water: 'Wasser' };

/** everything that makes a noise terrain – kept on the group (`pluginData.noise`) so it can be changed later */
export interface TerrainSettings extends Required<HeightOptions> {
  width: number;
  depth: number;
  /** cells along the longer side (8–120) */
  detail: number;
  /** water surface (m) – null = none */
  water: number | null;
  /** above this height the ground is rock – null = automatic (70 % of the height) */
  rock: number | null;
  /** above this height snow – null = none */
  snow: number | null;
  /** a closed block with earth walls down to below the lowest point */
  skirt: boolean;
}

export const TERRAIN_DEFAULTS: TerrainSettings = {
  ...HEIGHT_DEFAULTS,
  width: 60,
  depth: 40,
  detail: 72,
  water: null,
  rock: null,
  snow: null,
  skirt: true,
};

/** the settings with every gap filled and every number in its range */
export const normaliseSettings = (settings: Partial<TerrainSettings>): TerrainSettings => {
  const merged = { ...TERRAIN_DEFAULTS, ...settings };
  return {
    ...merged,
    width: Math.max(1, merged.width),
    depth: Math.max(1, merged.depth),
    detail: Math.max(8, Math.min(120, Math.round(merged.detail))),
    octaves: Math.max(1, Math.min(10, Math.round(merged.octaves))),
    persistence: Math.max(0, Math.min(1, merged.persistence)),
    lacunarity: Math.max(1, Math.min(4, merged.lacunarity)),
    height: Math.max(0, merged.height),
  };
};

/** the rock line: given, or 70 % of the height (at least 1 m) */
export const rockLine = (settings: TerrainSettings) => settings.rock ?? Math.max(1, settings.height * 0.7);

/** samples the noise into a grid of the terrain plugin's format */
export const makeGrid = (settings: TerrainSettings): TerrainGrid => {
  const longer = Math.max(settings.width, settings.depth);
  const cell = longer / settings.detail;
  const columns = Math.max(2, Math.min(120, Math.round(settings.width / cell))),
    rows = Math.max(2, Math.min(120, Math.round(settings.depth / cell)));
  const field = heightField(settings, settings.width, settings.depth);
  const heights: number[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      heights.push(Math.round(field((column / columns) * settings.width, (row / rows) * settings.depth) * 1000) / 1000);
    }
  }
  return {
    width: settings.width,
    depth: settings.depth,
    columns,
    rows,
    heights,
    layers: {
      auto: true,
      ...MATERIALS,
      rockHeight: rockLine(settings),
      snowHeight: settings.snow,
      earthSlope: 32,
      rockSlope: 50,
      digDepth: 0.3,
    },
    skirt: settings.skirt,
    water: settings.water,
  };
};

export const gridIndex = (grid: TerrainGrid, column: number, row: number) => row * (grid.columns + 1) + column;

/** height and slope (degrees) of a grid at a local point – bilinear, clamped to the grid */
export const sampleGrid = (grid: TerrainGrid, x: number, y: number) => {
  const cellX = grid.width / grid.columns,
    cellY = grid.depth / grid.rows;
  const gridX = Math.min(grid.columns, Math.max(0, x / cellX)),
    gridY = Math.min(grid.rows, Math.max(0, y / cellY));
  const column = Math.min(Math.floor(gridX), grid.columns - 1),
    row = Math.min(Math.floor(gridY), grid.rows - 1);
  const fracX = gridX - column,
    fracY = gridY - row;
  const at = (i: number, j: number) => grid.heights[gridIndex(grid, i, j)];
  const h00 = at(column, row),
    h10 = at(column + 1, row),
    h01 = at(column, row + 1),
    h11 = at(column + 1, row + 1);
  const height = (h00 * (1 - fracX) + h10 * fracX) * (1 - fracY) + (h01 * (1 - fracX) + h11 * fracX) * fracY;
  const slopeX = ((h10 - h00) * (1 - fracY) + (h11 - h01) * fracY) / cellX,
    slopeY = ((h01 - h00) * (1 - fracX) + (h11 - h10) * fracX) / cellY;
  const slope = (Math.atan(Math.hypot(slopeX, slopeY)) * 180) / Math.PI;
  return { height, slope };
};

export type Layer = 'grass' | 'earth' | 'rock' | 'snow';

/** which surface a spot gets – the terrain plugin's rules, so baking there again looks the same */
export const classify = (layers: TerrainLayers, height: number, slope: number): Layer => {
  if (layers.snowHeight != null && height >= layers.snowHeight && slope < layers.rockSlope + 10) {
    return 'snow';
  }
  if (slope >= layers.rockSlope || height >= layers.rockHeight) {
    return 'rock';
  }
  if (slope >= layers.earthSlope || height <= -layers.digDepth) {
    return 'earth';
  }
  return 'grass';
};

type Vector = [number, number, number];
const triangleSlope = (a: Vector, b: Vector, c: Vector) => {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2];
  const vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return (Math.acos(Math.min(1, Math.abs(nz) / length)) * 180) / Math.PI;
};

/**
 * The grid as a mesh (local coordinates, origin = corner): two triangles per cell with alternating diagonals,
 * painted grass/earth/rock/snow by height and slope; optionally earth walls with a floor and a water surface.
 */
export const gridMesh = (grid: TerrainGrid): PluginMesh => {
  const cellX = grid.width / grid.columns,
    cellY = grid.depth / grid.rows;
  const vertices: Vector[] = [];
  const faces: number[][] = [];
  const faceMaterials: (string | null)[] = [];
  for (let row = 0; row <= grid.rows; row++) {
    for (let column = 0; column <= grid.columns; column++) {
      vertices.push([column * cellX, row * cellY, grid.heights[gridIndex(grid, column, row)]]);
    }
  }
  const triangle = (a: number, b: number, c: number) => {
    const height = (vertices[a][2] + vertices[b][2] + vertices[c][2]) / 3;
    const layer = classify(grid.layers, height, triangleSlope(vertices[a], vertices[b], vertices[c]));
    faces.push([a, b, c]);
    faceMaterials.push(grid.layers[layer]);
  };
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const corner00 = gridIndex(grid, column, row),
        corner10 = gridIndex(grid, column + 1, row),
        corner01 = gridIndex(grid, column, row + 1),
        corner11 = gridIndex(grid, column + 1, row + 1);
      // alternating diagonals, so ridges don't all run the same way
      if ((column + row) % 2 === 0) {
        triangle(corner00, corner10, corner11);
        triangle(corner00, corner11, corner01);
      } else {
        triangle(corner00, corner10, corner01);
        triangle(corner10, corner11, corner01);
      }
    }
  }

  if (grid.skirt) {
    const lowest = Math.min(0, ...grid.heights);
    const base = lowest - Math.max(0.5, Math.max(grid.width, grid.depth) * 0.03);
    const addBase = (column: number, row: number) => vertices.push([column * cellX, row * cellY, base]) - 1;
    const baseCorners = [addBase(0, 0), addBase(grid.columns, 0), addBase(grid.columns, grid.rows), addBase(0, grid.rows)];
    // each wall: the terrain edge on top (outside view, counter-clockwise), flat at the bottom
    const along = (count: number, index: (step: number) => number) => Array.from({ length: count + 1 }, (_, step) => index(step));
    const front = along(grid.columns, (step) => gridIndex(grid, step, 0));
    const right = along(grid.rows, (step) => gridIndex(grid, grid.columns, step));
    const back = along(grid.columns, (step) => gridIndex(grid, grid.columns - step, grid.rows));
    const left = along(grid.rows, (step) => gridIndex(grid, 0, grid.rows - step));
    const walls: [number[], number, number][] = [
      [front, baseCorners[1], baseCorners[0]],
      [right, baseCorners[2], baseCorners[1]],
      [back, baseCorners[3], baseCorners[2]],
      [left, baseCorners[0], baseCorners[3]],
    ];
    for (const [top, baseEnd, baseStart] of walls) {
      // counter-clockwise seen from outside: along the bottom, then back along the top
      faces.push([baseStart, baseEnd, ...[...top].reverse()]);
      faceMaterials.push(grid.layers.earth);
    }
    faces.push([baseCorners[3], baseCorners[2], baseCorners[1], baseCorners[0]]);
    faceMaterials.push(grid.layers.earth);
  }

  if (grid.water != null) {
    const inset = 0.001;
    const start = vertices.length;
    vertices.push(
      [inset, inset, grid.water],
      [grid.width - inset, inset, grid.water],
      [grid.width - inset, grid.depth - inset, grid.water],
      [inset, grid.depth - inset, grid.water],
    );
    faces.push([start, start + 1, start + 2, start + 3]);
    faceMaterials.push(MATERIALS.water);
  }
  return { vertices, faces, faceMaterials };
};

/** lowest and highest point of a grid */
export const gridRange = (grid: TerrainGrid) => {
  let low = Infinity,
    high = -Infinity;
  for (const height of grid.heights) {
    low = Math.min(low, height);
    high = Math.max(high, height);
  }
  return { low, high };
};

/** a stored terrain grid (the terrain plugin's JSON), or undefined */
export const gridFrom = (json: unknown): TerrainGrid | undefined => {
  const value = json as TerrainGrid | undefined;
  if (!value || !Array.isArray(value.heights) || value.heights.length !== (value.columns + 1) * (value.rows + 1)) {
    return undefined;
  }
  return value;
};
