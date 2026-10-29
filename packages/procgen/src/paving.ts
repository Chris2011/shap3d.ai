import type { PluginMesh } from '../../../src/plugins/types';
import { cellSite, hash2 } from './noise';
import { ProcgenError } from './errors';

/**
 * Stones from cellular noise: the Voronoi cells of jittered grid sites become flagstones, cobbles or the stones
 * of a dry wall – each one a small prism with a chamfered top, kept apart by a joint, of its own height and shade.
 * Everything is computed in the 2D coordinates of a plane (u, v) and only placed in 3D at the end.
 */

type Point = [number, number];

export interface PavingOptions {
  /** metres across one stone */
  size: number;
  /** width of the joints (m) */
  gap: number;
  /** 0 = a regular grid of squares … 1 = wild polygons */
  jitter: number;
  /** stones longer along u than along v (1 = round) */
  stretch: number;
  /** stone height (m) */
  thickness: number;
  /** 0 … 1: how much the heights differ */
  variation: number;
  /** the chamfer round the top (m) */
  bevel: number;
  /** number of shades the stones get */
  shades: number;
  seed: number;
}

export const PAVING_DEFAULTS: PavingOptions = {
  size: 0.45,
  gap: 0.02,
  jitter: 1,
  stretch: 1,
  thickness: 0.06,
  variation: 0.3,
  bevel: 0.01,
  shades: 3,
  seed: 1,
};

/** at most this many stones in one call */
export const MAX_STONES = 20000;

const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const signedArea = (polygon: Point[]) =>
  polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;

/** keeps the part of a convex polygon where (x − origin)·direction ≤ limit (Sutherland–Hodgman, one plane) */
const clipHalfPlane = (polygon: Point[], origin: Point, direction: Point, limit: number): Point[] => {
  const side = (point: Point) => (point[0] - origin[0]) * direction[0] + (point[1] - origin[1]) * direction[1] - limit;
  const result: Point[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index],
      next = polygon[(index + 1) % polygon.length];
    const currentSide = side(current),
      nextSide = side(next);
    if (currentSide <= 0) {
      result.push(current);
    }
    if (currentSide * nextSide < 0) {
      const share = currentSide / (currentSide - nextSide);
      result.push([current[0] + (next[0] - current[0]) * share, current[1] + (next[1] - current[1]) * share]);
    }
  }
  return result;
};

const isConvex = (polygon: Point[]) => {
  let sign = 0;
  for (let index = 0; index < polygon.length; index++) {
    const turn = cross(polygon[index], polygon[(index + 1) % polygon.length], polygon[(index + 2) % polygon.length]);
    if (Math.abs(turn) < 1e-12) {
      continue;
    }
    if (sign && Math.sign(turn) !== sign) {
      return false;
    }
    sign = Math.sign(turn);
  }
  return true;
};

/** is a point inside a polygon (even–odd rule) */
export const inside = (polygon: Point[], [x, y]: Point) => {
  let within = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index],
      [xj, yj] = polygon[previous];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      within = !within;
    }
  }
  return within;
};

export interface Stone {
  outline: Point[];
  height: number;
  shade: number;
}

/**
 * The stones inside an outline (any polygon in the plane, m). A convex outline cuts the border stones to fit;
 * in a concave one only the stones that lie wholly inside are kept.
 */
export const pavingStones = (outline: Point[], options: PavingOptions): Stone[] => {
  const area = signedArea(outline);
  const boundary = area < 0 ? [...outline].reverse() : outline;
  const convex = isConvex(boundary);
  const cellU = Math.max(0.01, options.size * Math.max(0.2, options.stretch)),
    cellV = Math.max(0.01, options.size);
  // a joint of at least 2 mm: stones touching each other would share their side faces
  const halfGap = Math.max(0.002, options.gap) / 2;
  const jitter = Math.min(1, Math.max(0, options.jitter));
  const site = (i: number, j: number): Point => {
    const [u, v] = cellSite(i, j, options.seed, jitter);
    return [u * cellU, v * cellV];
  };
  const us = boundary.map((point) => point[0]),
    vs = boundary.map((point) => point[1]);
  const minI = Math.floor(Math.min(...us) / cellU) - 1,
    maxI = Math.ceil(Math.max(...us) / cellU) + 1,
    minJ = Math.floor(Math.min(...vs) / cellV) - 1,
    maxJ = Math.ceil(Math.max(...vs) / cellV) + 1;
  if ((maxI - minI) * (maxJ - minJ) > MAX_STONES * 2) {
    throw new ProcgenError('paving.tooMany', { max: MAX_STONES });
  }
  const stones: Stone[] = [];
  for (let j = minJ; j <= maxJ; j++) {
    for (let i = minI; i <= maxI; i++) {
      const centre = site(i, j);
      const reach = 3 * Math.max(cellU, cellV);
      let cell: Point[] = [
        [centre[0] - reach, centre[1] - reach],
        [centre[0] + reach, centre[1] - reach],
        [centre[0] + reach, centre[1] + reach],
        [centre[0] - reach, centre[1] + reach],
      ];
      // the Voronoi cell: closer to this site than to any neighbour – each border moved in by half a joint
      for (let dj = -2; dj <= 2 && cell.length; dj++) {
        for (let di = -2; di <= 2 && cell.length; di++) {
          if (!di && !dj) {
            continue;
          }
          const other = site(i + di, j + dj);
          const dx = other[0] - centre[0],
            dy = other[1] - centre[1];
          const length = Math.hypot(dx, dy);
          if (length < 1e-9) {
            continue;
          }
          const middle: Point = [(centre[0] + other[0]) / 2, (centre[1] + other[1]) / 2];
          cell = clipHalfPlane(cell, middle, [dx / length, dy / length], -halfGap);
        }
      }
      if (cell.length < 3) {
        continue;
      }
      if (convex) {
        // cut by the outline, its edges moved in by half a joint
        for (let index = 0; index < boundary.length && cell.length >= 3; index++) {
          const start = boundary[index],
            end = boundary[(index + 1) % boundary.length];
          const ex = end[0] - start[0],
            ey = end[1] - start[1];
          const length = Math.hypot(ex, ey);
          if (length < 1e-9) {
            continue;
          }
          // outward normal of a counter-clockwise edge
          cell = clipHalfPlane(cell, start, [ey / length, -ex / length], -halfGap);
        }
      } else if (!cell.every((point) => inside(boundary, point))) {
        continue;
      }
      if (cell.length < 3 || Math.abs(signedArea(cell)) < 1e-6) {
        continue;
      }
      const variation = (hash2(i, j, options.seed + 31) - 0.5) * 2 * Math.min(1, Math.max(0, options.variation));
      stones.push({
        outline: cell,
        height: Math.max(0.002, options.thickness * (1 + variation)),
        shade: Math.floor(hash2(i, j, options.seed + 57) * Math.max(1, options.shades)),
      });
      if (stones.length >= MAX_STONES) {
        return stones;
      }
    }
  }
  return stones;
};

/** a plane in 3D: origin, two axes in it and its normal (all of length 1) */
export interface Plane {
  origin: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  normal: [number, number, number];
}

/**
 * The stones as one mesh on a plane: a prism each, its top chamfered by `bevel`; `materialOf(shade)` names the
 * material per shade. With `joint` the outline itself becomes the bed of mortar at half the stone height.
 */
export const pavingMesh = (
  stones: Stone[],
  plane: Plane,
  bevel: number,
  materialOf: (shade: number) => string,
  joint: { outline: Point[]; material: string } | null,
): PluginMesh => {
  const vertices: [number, number, number][] = [];
  const faces: number[][] = [];
  const faceMaterials: (string | null)[] = [];
  const at = ([u, v]: Point, height: number) =>
    vertices.push(
      [0, 1, 2].map((axis) => plane.origin[axis] + plane.u[axis] * u + plane.v[axis] * v + plane.normal[axis] * height) as [
        number,
        number,
        number,
      ],
    ) - 1;
  for (const stone of stones) {
    const outline = signedArea(stone.outline) < 0 ? [...stone.outline].reverse() : stone.outline;
    const material = materialOf(stone.shade);
    const count = outline.length;
    const centre: Point = [
      outline.reduce((sum, point) => sum + point[0], 0) / count,
      outline.reduce((sum, point) => sum + point[1], 0) / count,
    ];
    const radius = Math.min(...outline.map((point) => Math.hypot(point[0] - centre[0], point[1] - centre[1])));
    const chamfer = Math.min(bevel, stone.height * 0.6, radius * 0.4);
    const shrink = radius > 0 ? 1 - chamfer / radius : 1;
    const bottom = outline.map((point) => at(point, 0));
    const middle = chamfer > 0 ? outline.map((point) => at(point, stone.height - chamfer)) : bottom;
    const top = outline.map((point) =>
      at([centre[0] + (point[0] - centre[0]) * shrink, centre[1] + (point[1] - centre[1]) * shrink], stone.height),
    );
    const add = (face: number[]) => {
      faces.push(face);
      faceMaterials.push(material);
    };
    add([...bottom].reverse());
    add(top);
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count;
      if (chamfer > 0) {
        add([bottom[index], bottom[next], middle[next], middle[index]]);
        add([middle[index], middle[next], top[next], top[index]]);
      } else {
        add([bottom[index], bottom[next], top[next], top[index]]);
      }
    }
  }
  if (joint && stones.length) {
    const lowest = Math.min(...stones.map((stone) => stone.height));
    const outline = signedArea(joint.outline) < 0 ? [...joint.outline].reverse() : joint.outline;
    faces.push(outline.map((point) => at(point, lowest * 0.45)));
    faceMaterials.push(joint.material);
  }
  return { vertices, faces, faceMaterials };
};
