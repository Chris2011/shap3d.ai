import type { PluginMesh } from '../../../src/plugins/types';
import { approachOf, carriagewayOf, leadIn, meetRoads, type JunctionCorner, type RoadCourse } from './junctions';
import { fractal } from './noise';
import { gridIndex, gridRange, sampleGrid, type TerrainGrid } from './terrain';

/**
 * Rivers and roads on a terrain's height grid: the cheapest way over the grid (rivers keep to the valleys, roads
 * avoid steep grades), smoothed into a curve; then the bed is dug into the grid and a ribbon (water or road
 * surface) laid along it. Everything in the grid's local coordinates (origin = corner).
 */

export type Point2 = [number, number];

export interface RiverOptions {
  /** width at the mouth (m) – the river starts at half of it */
  width: number;
  /** depth of the bed below the banks (m) */
  depth: number;
  /** 0 … 1: how much the river meanders */
  wiggle: number;
  seed: number;
}

export const RIVER_DEFAULTS: RiverOptions = { width: 5, depth: 1.6, wiggle: 0.5, seed: 1 };

export type RoadSurface = 'asphalt' | 'gravel';

export interface RoadOptions {
  width: number;
  surface: RoadSurface;
  /** steepest grade the route should take (%) */
  maxGrade: number;
  /** a dashed centre line (asphalt only) */
  markings: boolean;
  seed: number;
}

/** the course of a river or road, kept on its terrain – scattering leaves it free */
export interface Course {
  line: Point2[];
  /** how far from the line it reaches (m) */
  reach: number;
}

/** a river's course – roads also keep away from it (and cross it where they must) */
export interface RiverCourse extends Course {
  /** the water surface at each point of the line */
  levels: number[];
}

/** is a spot on one of the courses? */
export const onCourse = (courses: Course[], x: number, y: number) =>
  courses.some(({ line, reach }) =>
    line.some((point, index) => {
      if (!index) {
        return false;
      }
      const [ax, ay] = line[index - 1],
        [bx, by] = point;
      const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const along = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / lengthSq, 0, 1);
      return Math.hypot(x - ax - (bx - ax) * along, y - ay - (by - ay) * along) < reach;
    }),
  );

/** the nearest river's water surface at a spot – or null where no river is (within `margin` beyond its banks) */
const riverAt = (rivers: RiverCourse[], x: number, y: number, margin: number) => {
  let best = Infinity,
    level: number | null = null;
  for (const { line, levels, reach } of rivers) {
    for (let index = 1; index < line.length; index++) {
      const [ax, ay] = line[index - 1],
        [bx, by] = line[index];
      const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const along = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / lengthSq, 0, 1);
      const distance = Math.hypot(x - ax - (bx - ax) * along, y - ay - (by - ay) * along);
      if (distance < reach + margin && distance < best) {
        best = distance;
        level = levels[index - 1] + (levels[index] - levels[index - 1]) * along;
      }
    }
  }
  return level;
};

export const ROAD_DEFAULTS: RoadOptions = { width: 6, surface: 'asphalt', maxGrade: 10, markings: true, seed: 1 };

/** fill deeper than this (m) is left out – the road bridges the hollow (a river, a gully) */
const BRIDGE = 1.5;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** a little binary heap of [cost, node] – the open list of the route search */
const heap = () => {
  const items: [number, number][] = [];
  const push = (item: [number, number]) => {
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent][0] <= items[index][0]) {
        break;
      }
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  };
  const pop = () => {
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1,
          right = left + 1;
        let smallest = index;
        if (left < items.length && items[left][0] < items[smallest][0]) {
          smallest = left;
        }
        if (right < items.length && items[right][0] < items[smallest][0]) {
          smallest = right;
        }
        if (smallest === index) {
          break;
        }
        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }
    return top;
  };
  return { push, pop, size: () => items.length };
};

/**
 * The cheapest way over the grid's points from one spot to another (Dijkstra, sixteen directions). `stepCost`
 * gets the two grid points and the step's length and returns what the step costs. Steps are `stride` grid cells
 * long – a road searched with long steps cannot turn tighter than it is wide.
 */
export const findRoute = (
  grid: TerrainGrid,
  from: Point2,
  to: Point2,
  stepCost: (fromIndex: number, toIndex: number, length: number) => number,
  stride = 1,
): Point2[] => {
  const cellX = grid.width / grid.columns,
    cellY = grid.depth / grid.rows;
  const nodeOf = ([x, y]: Point2) =>
    gridIndex(grid, clamp(Math.round(x / cellX), 0, grid.columns), clamp(Math.round(y / cellY), 0, grid.rows));
  const start = nodeOf(from),
    goal = nodeOf(to);
  const count = (grid.columns + 1) * (grid.rows + 1);
  const cost = new Float64Array(count).fill(Infinity);
  const previous = new Int32Array(count).fill(-1);
  const open = heap();
  cost[start] = 0;
  open.push([0, start]);
  const steps: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ];
  const goalColumn = goal % (grid.columns + 1),
    goalRow = Math.floor(goal / (grid.columns + 1));
  let end = goal;
  while (open.size()) {
    const [reached, node] = open.pop();
    if (
      Math.max(Math.abs((node % (grid.columns + 1)) - goalColumn), Math.abs(Math.floor(node / (grid.columns + 1)) - goalRow)) <
      stride * 2
    ) {
      // near enough – the last bit to the goal is a straight line
      end = node;
      break;
    }
    if (reached > cost[node]) {
      continue;
    }
    const column = node % (grid.columns + 1),
      row = Math.floor(node / (grid.columns + 1));
    for (const [stepX, stepY] of steps) {
      // a step running over the border stops at it
      const nextColumn = clamp(column + stepX * stride, 0, grid.columns),
        nextRow = clamp(row + stepY * stride, 0, grid.rows);
      const next = gridIndex(grid, nextColumn, nextRow);
      if (next === node) {
        continue;
      }
      const total = reached + stepCost(node, next, Math.hypot((nextColumn - column) * cellX, (nextRow - row) * cellY));
      if (total < cost[next]) {
        cost[next] = total;
        previous[next] = node;
        open.push([total, next]);
      }
    }
  }
  const route: Point2[] = end === goal ? [] : [to];
  for (let node = end; node !== -1; node = previous[node]) {
    route.push([(node % (grid.columns + 1)) * cellX, Math.floor(node / (grid.columns + 1)) * cellY]);
    if (node === start) {
      break;
    }
  }
  route.reverse();
  route[0] = from;
  route[route.length - 1] = to;
  return route;
};

/** rounds a polyline's corners (Chaikin), the ends stay where they are */
export const smoothLine = (points: Point2[], rounds = 3): Point2[] => {
  let line = points;
  for (let round = 0; round < rounds && line.length > 2; round++) {
    const next: Point2[] = [line[0]];
    for (let index = 0; index < line.length - 1; index++) {
      const [ax, ay] = line[index],
        [bx, by] = line[index + 1];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    next.push(line[line.length - 1]);
    line = next;
  }
  return line;
};

/** the same line with a point every `step` metres */
export const resample = (points: Point2[], step: number): Point2[] => {
  const result: Point2[] = [points[0]];
  let carried = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const [ax, ay] = points[index],
      [bx, by] = points[index + 1];
    const length = Math.hypot(bx - ax, by - ay);
    let along = step - carried;
    while (along <= length) {
      result.push([ax + ((bx - ax) * along) / length, ay + ((by - ay) * along) / length]);
      along += step;
    }
    carried = length - (along - step);
  }
  const last = points[points.length - 1];
  const [lx, ly] = result[result.length - 1];
  if (Math.hypot(last[0] - lx, last[1] - ly) > step * 0.3) {
    result.push(last);
  } else {
    result[result.length - 1] = last;
  }
  return result;
};

/** leaves out the points that lie within `tolerance` of the line through their neighbours (Douglas–Peucker) */
export const simplifyLine = (points: Point2[], tolerance: number): Point2[] => {
  if (points.length < 3) {
    return points;
  }
  const [ax, ay] = points[0],
    [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay) || 1;
  let farthest = 0,
    split = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const [x, y] = points[index];
    const distance = Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / length;
    if (distance > farthest) {
      farthest = distance;
      split = index;
    }
  }
  if (farthest <= tolerance) {
    return [points[0], points[points.length - 1]];
  }
  return [...simplifyLine(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplifyLine(points.slice(split), tolerance)];
};

/** moving average over `reach` points on each side */
const evenOut = (values: number[], reach: number) =>
  values.map((_, index) => {
    const from = Math.max(0, index - reach),
      to = Math.min(values.length - 1, index + reach);
    let sum = 0;
    for (let at = from; at <= to; at++) {
      sum += values[at];
    }
    return sum / (to - from + 1);
  });

export const lineLength = (points: Point2[]) =>
  points.reduce((sum, point, index) => (index ? sum + Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) : 0), 0);

/**
 * Digs or levels a band along a line into the grid. Inside `halfWidths` the ground is set to the line's height
 * (`dig`: only lowered), beyond it a bank of `bank` metres blends into the old ground. Ground more than
 * `fillLimit` below the line stays as it is – a bridge spans it.
 */
const carve = (
  grid: TerrainGrid,
  line: Point2[],
  levels: number[],
  halfWidths: number[],
  bank: number,
  dig: boolean,
  fillLimit = Infinity,
  keep: (x: number, y: number) => boolean = () => false,
) => {
  const cellX = grid.width / grid.columns,
    cellY = grid.depth / grid.rows;
  const reach = Math.max(...halfWidths) + bank;
  const heights = [...grid.heights];
  for (let row = 0; row <= grid.rows; row++) {
    for (let column = 0; column <= grid.columns; column++) {
      const x = column * cellX,
        y = row * cellY;
      let best = Infinity,
        level = 0,
        half = 0;
      for (let index = 0; index < line.length - 1; index++) {
        const [ax, ay] = line[index],
          [bx, by] = line[index + 1];
        // segments far away are skipped quickly
        if (Math.min(ax, bx) - reach > x || Math.max(ax, bx) + reach < x || Math.min(ay, by) - reach > y || Math.max(ay, by) + reach < y) {
          continue;
        }
        const segmentX = bx - ax,
          segmentY = by - ay;
        const lengthSq = segmentX * segmentX + segmentY * segmentY || 1;
        const along = clamp(((x - ax) * segmentX + (y - ay) * segmentY) / lengthSq, 0, 1);
        const distance = Math.hypot(x - ax - segmentX * along, y - ay - segmentY * along);
        if (distance < best) {
          best = distance;
          level = levels[index] + (levels[index + 1] - levels[index]) * along;
          half = halfWidths[index] + (halfWidths[index + 1] - halfWidths[index]) * along;
        }
      }
      if (best > half + bank) {
        continue;
      }
      const index = gridIndex(grid, column, row);
      const old = heights[index];
      if (level - old > fillLimit || keep(x, y)) {
        continue;
      }
      const blend = best <= half ? 0 : ((best - half) / bank) ** 2 * (3 - 2 * ((best - half) / bank));
      const target = level + blend * (old - level);
      heights[index] = Math.round((dig ? Math.min(old, target) : target) * 1000) / 1000;
    }
  }
  return { ...grid, heights };
};

/**
 * A band along a line at the given heights – triangles, facing up (counter-clockwise seen from above). With a
 * thickness it is a slab: underside, sides and ends too (a road deck where it bridges a hollow).
 */
const ribbon = (
  mesh: PluginMesh,
  line: Point2[],
  levels: number[],
  halfWidths: number[],
  material: string,
  bounds: Point2,
  thickness = 0,
  /** cut ends (right edge, left edge) – where the band meets another one at a slant – and how much higher the
   * right edge lies than the middle at each point (the left as much lower) */
  ends: { start?: [Point2, Point2]; end?: [Point2, Point2]; tilts?: number[] } = {},
) => {
  const start = mesh.vertices.length;
  /** an edge point moved back onto a cut end where it reaches past it (`outward`: the way out of the band there) */
  const behind = (edge: Point2, section: [Point2, Point2] | undefined, outward: Point2): Point2 => {
    if (!section) {
      return edge;
    }
    const [[ax, ay], [bx, by]] = section;
    // only near the cut – further along, a bending band may well reach past the cut's line
    if (Math.hypot(edge[0] - (ax + bx) / 2, edge[1] - (ay + by) / 2) > Math.hypot(bx - ax, by - ay)) {
      return edge;
    }
    let normal: Point2 = [by - ay, ax - bx];
    if (normal[0] * outward[0] + normal[1] * outward[1] < 0) {
      normal = [-normal[0], -normal[1]];
    }
    const length = Math.hypot(normal[0], normal[1]) || 1;
    const past = ((edge[0] - ax) * normal[0] + (edge[1] - ay) * normal[1]) / length;
    if (past <= 0) {
      return edge;
    }
    const share = past / Math.max(0.2, (outward[0] * normal[0] + outward[1] * normal[1]) / length);
    return [edge[0] - outward[0] * share, edge[1] - outward[1] * share];
  };
  /** a face, unless an edge waiting in a bend squeezed it to nothing */
  const add = (corners: number[]) => {
    const points = corners.map((corner) => mesh.vertices[corner]);
    const unique = corners.filter((_, at) => {
      const [ax, ay, az] = points[at],
        [bx, by, bz] = points[(at + 1) % points.length];
      return Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz) > 1e-6;
    });
    if (unique.length >= 3) {
      mesh.faces.push(unique);
      mesh.faceMaterials!.push(material);
    }
  };
  // the right and left edge (left of the way along the line), kept on the terrain – a river's mouth or a road's end
  // does not stick out over its border – and moved back onto cut ends
  const edges: [Point2[], Point2[]] = [[], []];
  for (let index = 0; index < line.length; index++) {
    const [px, py] = line[Math.max(0, index - 1)],
      [nx, ny] = line[Math.min(line.length - 1, index + 1)];
    const length = Math.hypot(nx - px, ny - py) || 1;
    const alongX = (nx - px) / length,
      alongY = (ny - py) / length;
    const [x, y] = line[index];
    const half = halfWidths[index];
    [-1, 1].forEach((side, which) => {
      const cut = index === 0 ? ends.start : index === line.length - 1 ? ends.end : undefined;
      if (cut) {
        edges[which].push(cut[which]);
        return;
      }
      const edge: Point2 = [clamp(x - alongY * half * side, 0, bounds[0]), clamp(y + alongX * half * side, 0, bounds[1])];
      edges[which].push(behind(behind(edge, ends.start, [-alongX, -alongY]), ends.end, [alongX, alongY]));
    });
  }
  // on the inside of a bend tighter than the band is wide (a hairpin) an edge runs back and crosses itself: the
  // loop is cut out – its points all go to where the edge crosses, so the band turns around that point without folding
  const crossing = (a: Point2, b: Point2, c: Point2, d: Point2): Point2 | null => {
    const rx = b[0] - a[0],
      ry = b[1] - a[1],
      sx = d[0] - c[0],
      sy = d[1] - c[1];
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 1e-12) {
      return null;
    }
    const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator,
      u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator;
    return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? [a[0] + rx * t, a[1] + ry * t] : null;
  };
  // the height each edge point is drawn at – points gathered at a crossing share one, so no sliver stands up there
  const heights = [-1, 1].map((sign) => levels.map((level, index) => level - sign * (ends.tilts?.[index] ?? 0)));
  edges.forEach((edge, which) => {
    for (let index = 1; index < edge.length - 2; index++) {
      // a loop is never much longer than the band is wide – look that far ahead along the line
      let reach = index + 2;
      let travelled = 0;
      while (reach < edge.length - 1 && travelled < halfWidths[index] * 8 + 4) {
        travelled += Math.hypot(line[reach][0] - line[reach - 1][0], line[reach][1] - line[reach - 1][1]);
        reach++;
      }
      for (let later = reach; later >= index + 2; later--) {
        const point = crossing(edge[index - 1], edge[index], edge[later - 1], edge[later]);
        if (point) {
          const shared = heights[which].slice(index, later).reduce((sum, value) => sum + value, 0) / (later - index);
          for (let inside = index; inside < later; inside++) {
            edge[inside] = point;
            heights[which][inside] = shared;
          }
          index = later - 1;
          break;
        }
      }
    }
  });
  for (let index = 0; index < line.length; index++) {
    mesh.vertices.push(
      [edges[0][index][0], edges[0][index][1], heights[0][index]],
      [edges[1][index][0], edges[1][index][1], heights[1][index]],
    );
  }
  for (let index = 0; index < line.length - 1; index++) {
    const right = start + index * 2,
      left = right + 1,
      nextRight = right + 2,
      nextLeft = right + 3;
    add([right, nextRight, nextLeft]);
    add([right, nextLeft, left]);
  }
  if (thickness <= 0) {
    return;
  }
  const bottom = mesh.vertices.length;
  for (let index = 0; index < line.length; index++) {
    const [x, y, z] = mesh.vertices[start + index * 2],
      [leftX, leftY, leftZ] = mesh.vertices[start + index * 2 + 1];
    mesh.vertices.push([x, y, z - thickness], [leftX, leftY, leftZ - thickness]);
  }
  for (let index = 0; index < line.length - 1; index++) {
    const right = index * 2,
      left = right + 1,
      nextRight = right + 2,
      nextLeft = right + 3;
    add([bottom + right, bottom + nextLeft, bottom + nextRight]);
    add([bottom + right, bottom + left, bottom + nextLeft]);
    add([bottom + right, bottom + nextRight, start + nextRight, start + right]);
    add([bottom + nextLeft, bottom + left, start + left, start + nextLeft]);
  }
  const last = (line.length - 1) * 2;
  add([bottom + 1, bottom, start, start + 1]);
  add([bottom + last, bottom + last + 1, start + last + 1, start + last]);
};

/** a rounded patch filling the corner between two roads – up to `radius` along both edges, curving in between */
const fillet = (mesh: PluginMesh, { corner, away, back, level, awayLevel, backLevel, radius }: JunctionCorner, material: string) => {
  const [x, y] = corner;
  const from: Point2 = [x + away[0] * radius, y + away[1] * radius],
    to: Point2 = [x + back[0] * radius, y + back[1] * radius];
  // counter-clockwise seen from above, whichever side of the road the corner is on
  const turn = away[0] * back[1] - away[1] * back[0];
  if (Math.abs(turn) < 0.05) {
    return;
  }
  const centre = mesh.vertices.length;
  mesh.vertices.push([x, y, level + 0.03]);
  const segments = 6;
  for (let step = 0; step <= segments; step++) {
    const share = step / segments;
    const a = (1 - share) ** 2,
      b = 2 * (1 - share) * share,
      c = share ** 2;
    mesh.vertices.push([
      from[0] * a + x * b + to[0] * c,
      from[1] * a + y * b + to[1] * c,
      awayLevel * a + level * b + backLevel * c + 0.03,
    ]);
  }
  for (let step = 0; step < segments; step++) {
    const face = [centre, centre + 1 + step, centre + 2 + step];
    mesh.faces.push(turn > 0 ? face : face.reverse());
    mesh.faceMaterials!.push(material);
  }
};

const emptyMesh = (): PluginMesh => ({ vertices: [], faces: [], faceMaterials: [] });

/** the grid point heights normalised to 0 … 1 and a noise field for wiggles */
const gridHelpers = (grid: TerrainGrid, seed: number) => {
  const { low, high } = gridRange(grid);
  const range = Math.max(0.01, high - low);
  const cellX = grid.width / grid.columns,
    cellY = grid.depth / grid.rows;
  const position = (node: number): Point2 => [(node % (grid.columns + 1)) * cellX, Math.floor(node / (grid.columns + 1)) * cellY];
  const wiggleAt = (node: number) => {
    const [x, y] = position(node);
    const scale = Math.max(grid.width, grid.depth) / 5;
    return fractal(x / scale, y / scale, undefined, { seed: seed + 31, octaves: 2 }) + 0.5;
  };
  return { low, range, position, wiggleAt };
};

/** where a river starts and ends by default: from a high spot on the border to the lowest one far away from it */
const riverEnds = (grid: TerrainGrid): [Point2, Point2] => {
  const cellX = grid.width / grid.columns,
    cellY = grid.depth / grid.rows;
  const border: [number, number][] = [];
  for (let column = 0; column <= grid.columns; column++) {
    border.push([column, 0], [column, grid.rows]);
  }
  for (let row = 1; row < grid.rows; row++) {
    border.push([0, row], [grid.columns, row]);
  }
  const heightOf = ([column, row]: [number, number]) => grid.heights[gridIndex(grid, column, row)];
  const mouth = border.reduce((lowest, point) => (heightOf(point) < heightOf(lowest) ? point : lowest));
  const { low, high } = gridRange(grid);
  const diagonal = Math.hypot(grid.columns, grid.rows);
  const source = border.reduce((best, point) => {
    const score = (candidate: [number, number]) =>
      (heightOf(candidate) - low) / Math.max(0.01, high - low) +
      (Math.hypot(candidate[0] - mouth[0], candidate[1] - mouth[1]) / diagonal) * 1.5;
    return score(point) > score(best) ? point : best;
  });
  return [
    [source[0] * cellX, source[1] * cellY],
    [mouth[0] * cellX, mouth[1] * cellY],
  ];
};

/**
 * A river from `from` to `to` (default: from high on the border to its lowest spot): keeps to the low ground,
 * meanders by noise, digs a bed that only falls and fills it with a water ribbon. Returns the dug grid and the water.
 */
export const riverOn = (grid: TerrainGrid, options: RiverOptions, waterMaterial: string, from?: Point2, to?: Point2) => {
  const [source, mouth] = from && to ? [from, to] : riverEnds(grid);
  const { low, range, wiggleAt } = gridHelpers(grid, options.seed);
  const route = findRoute(grid, from ?? source, to ?? mouth, (fromIndex, toIndex, length) => {
    const height = (grid.heights[toIndex] - low) / range;
    const uphill = Math.max(0, grid.heights[toIndex] - grid.heights[fromIndex]) / range;
    return length * (1 + height * 6 + uphill * 60) * (1 + options.wiggle * 2.5 * wiggleAt(toIndex));
  });
  const cell = Math.min(grid.width / grid.columns, grid.depth / grid.rows);
  // straightened first (the route steps from grid point to grid point), then rounded into wide bends
  const line = resample(smoothLine(simplifyLine(route, Math.max(cell * 1.5, options.width * 0.4)), 5), cell);
  // the bed only falls: never above the bed upstream, always `depth` below the ground
  const beds: number[] = [];
  for (const [x, y] of line) {
    const ground = sampleGrid(grid, x, y).height - options.depth;
    beds.push(Math.min(beds.length ? beds[beds.length - 1] : ground, ground));
  }
  // evened out over a few metres – an average of a falling line still falls, so no step goes uphill
  const smoothBeds = evenOut(evenOut(beds, Math.max(1, Math.round(4 / cell))), Math.max(1, Math.round(4 / cell)));
  beds.splice(0, beds.length, ...smoothBeds);
  const halfWidths = line.map((_, index) =>
    Math.max(cell * 0.8, (options.width / 2) * (0.5 + (0.5 * index) / Math.max(1, line.length - 1))),
  );
  const bank = Math.max(cell * 2, options.width * 1.2);
  const dug = carve(grid, line, beds, halfWidths, bank, true);
  const water = emptyMesh();
  ribbon(
    water,
    line,
    beds.map((bed) => bed + options.depth * 0.6),
    halfWidths.map((half) => half + bank * 0.35),
    waterMaterial,
    [grid.width, grid.depth],
  );
  // every few metres is enough to remember the course by
  const kept = line.map((_, index) => index).filter((index) => index % 4 === 0 || index === line.length - 1);
  const course: RiverCourse = {
    line: kept.map((index) => line[index]),
    levels: kept.map((index) => Math.round((beds[index] + options.depth * 0.6) * 1000) / 1000),
    reach: Math.max(...halfWidths) + bank * 0.35,
  };
  return { grid: dug, water, length: lineLength(line), course };
};

/**
 * A road or path: along `points` when there are more than two, else the cheapest way between the two ends that
 * keeps below `maxGrade`. The ground is cut and filled to an evenly graded bed with banks; the surface is a ribbon
 * on it (with a dashed centre line for asphalt). Returns the levelled grid and the road surface.
 */
export const roadOn = (
  grid: TerrainGrid,
  options: RoadOptions,
  points: Point2[],
  materials: { surface: string; marking: string },
  rivers: RiverCourse[] = [],
  /** places a found route keeps away from (villages) – it only crosses them where it must */
  avoid: Course[] = [],
  /**
   * roads built already – their ground stays as it is, so they are neither buried nor left hanging; where the new
   * road meets one it ends at its edge, goes on from its end or crosses it at its height
   */
  existing: RoadCourse[] = [],
) => {
  const { wiggleAt, position } = gridHelpers(grid, options.seed);
  const surfacesOf = existing.map((course) => ({ ...course, reach: course.reach * 0.6 }));
  // the grid points in a river – a road crosses there only where it must, and as briefly as it can
  const inRiver = new Uint8Array((grid.columns + 1) * (grid.rows + 1));
  if (rivers.length || avoid.length) {
    inRiver.forEach((_, node) => {
      const [x, y] = position(node);
      inRiver[node] = riverAt(rivers, x, y, options.width / 2) == null && !onCourse(avoid, x, y) ? 0 : 1;
    });
  }
  const steepest = Math.max(0.5, options.maxGrade) / 100;
  const cell = Math.min(grid.width / grid.columns, grid.depth / grid.rows);
  const half = options.width / 2;
  const ways = existing.map((course) => carriagewayOf(course, (x, y) => sampleGrid(grid, x, y).height));
  // to or from another road's end the way is searched from a little out along that road – it comes in straight
  const [startApproach, endApproach] =
    points.length > 2 ? [null, null] : [approachOf(points[0], ways, options.width), approachOf(points[1], ways, options.width)];
  const found =
    points.length > 2
      ? points
      : findRoute(
          grid,
          startApproach ?? points[0],
          endApproach ?? points[1],
          (fromIndex, toIndex, length) => {
            const grade = Math.abs(grid.heights[toIndex] - grid.heights[fromIndex]) / length;
            const wet = (grid.water != null && grid.heights[toIndex] < grid.water) || inRiver[toIndex] ? 20 : 0;
            // along the terrain's border the road would hang over it (and fold in a bend there) – it keeps off
            const [x, y] = position(toIndex);
            const border = Math.min(x, y, grid.width - x, grid.depth - y) < half + 2 ? 20 : 0;
            return length * (1 + 4 * (grade / steepest) ** 2 + (grade > steepest ? 40 : 0) + wet + border + 0.3 * wiggleAt(toIndex));
          },
          // steps a little longer than the road is wide – no bend gets tighter than the road can take
          Math.max(1, Math.round((options.width * 1.2) / cell)),
        );
  const route = [...(startApproach ? [points[0]] : []), ...found, ...(endApproach ? [points[1]] : [])];
  // a found route zigzags from grid point to grid point – straightened first, then rounded into wide bends
  const straight = points.length > 2 ? route : simplifyLine(route, cell);
  // going on from another road's end, it leaves that road straight and bends after
  let line = resample(smoothLine(leadIn(straight, ways, options.width), 5), Math.min(cell, 1));
  // the road's heights: the ground along it, evened out over about ten metres, above any water
  // over a river the road keeps 1.2 m above the water – a bridge – with ramps up to it
  const clearance = line.map(([x, y]) => {
    const water = riverAt(rivers, x, y, half);
    return water == null ? -Infinity : water + 1.2;
  });
  const lowest = grid.water != null ? grid.water + 0.4 : -Infinity;
  let heights = line.map(([x, y], index) => Math.max(sampleGrid(grid, x, y).height, lowest, clearance[index]));
  const window = Math.max(1, Math.round(5 / Math.min(cell, 1)));
  for (let round = 0; round < 3; round++) {
    heights = evenOut(heights, window).map((level, index) => Math.max(level, clearance[index]));
  }
  // the junctions with the roads built already: ends at their edges, crossings split, heights ramped to theirs
  const met = meetRoads(line, heights, half, ways);
  const { levels } = met;
  line = met.line;
  // the ground under the road lies a little lower, so the grid's triangles never poke through the surface
  // only the old roads' own surfaces stay – their banks may still be reshaped
  const keep = (x: number, y: number) => onCourse(surfacesOf, x, y);
  const bank = Math.max(2, options.width * 0.8);
  let levelled = carve(
    grid,
    line,
    levels.map((level) => level - 0.12),
    line.map(() => half + cell * 0.7),
    bank,
    false,
    BRIDGE,
    keep,
  );
  // and under the rounded corners of the junctions
  for (const { corner, away, back, level, awayLevel, backLevel, radius } of met.corners) {
    levelled = carve(
      levelled,
      [[corner[0] + away[0] * radius, corner[1] + away[1] * radius], corner, [corner[0] + back[0] * radius, corner[1] + back[1] * radius]],
      [awayLevel - 0.12, level - 0.12, backLevel - 0.12],
      [radius * 0.45, radius * 0.45, radius * 0.45],
      bank * 0.6,
      false,
      BRIDGE,
      keep,
    );
  }
  const surface = emptyMesh();
  for (const piece of met.pieces) {
    ribbon(
      surface,
      piece.line,
      piece.levels.map((level) => level + 0.03),
      piece.line.map(() => half),
      materials.surface,
      [grid.width, grid.depth],
      0.5,
      piece,
    );
    if (options.markings && options.surface === 'asphalt') {
      // dashes of 3 m with 3 m between them, none in the mouth of a junction
      const step = Math.min(cell, 1);
      const per = Math.max(1, Math.round(3 / step));
      const clear = Math.ceil((half * 1.5) / step);
      const last = piece.line.length - (piece.end ? clear : 0);
      for (let start = piece.start ? clear : per; start + per < last; start += per * 2) {
        const dash = piece.line.slice(start, start + per + 1);
        ribbon(
          surface,
          dash,
          piece.levels.slice(start, start + per + 1).map((level) => level + 0.05),
          dash.map(() => 0.07),
          materials.marking,
          [grid.width, grid.depth],
        );
      }
    }
  }
  for (const corner of met.corners) {
    fillet(surface, corner, materials.surface);
  }
  // every other point is enough to remember the course by – precise enough for later roads to meet it
  const kept = line.map((_, index) => index).filter((index) => index % 2 === 0 || index === line.length - 1);
  const course: RoadCourse = {
    line: kept.map((index) => line[index]),
    levels: kept.map((index) => Math.round(levels[index] * 1000) / 1000),
    half,
    reach: half + bank * 0.5,
  };
  return { grid: levelled, surface, length: lineLength(line), course };
};
