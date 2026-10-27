/**
 * The geometry of a room's floor plan, without the model: its corners (a rectangle, an L or any polygon whose
 * walls may also bulge into arcs), the walls along it, polygons, clipping and the ceiling under sloped roofs.
 * Room coordinates: metres, x to the right, y to the back, the bounding box starting at (0, 0).
 */

export type WallSide = 'south' | 'east' | 'north' | 'west';
export const WALL_SIDES: WallSide[] = ['south', 'east', 'north', 'west'];
export type Corner = 'ne' | 'nw' | 'se' | 'sw';
export const CORNERS: Corner[] = ['ne', 'nw', 'se', 'sw'];
export type Shape = 'rect' | 'L' | 'polygon';

export type Point2 = [number, number];

/** a corner of a free floor plan; `bulge` bows the wall to the next corner outwards (m in the middle, < 0 inwards) */
export interface PlanCorner {
  x: number;
  y: number;
  bulge?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

/** a sloped ceiling: the knee wall on `side`, the slope rising over `depth` to the full height */
export interface Slope {
  side: WallSide;
  knee: number;
  depth: number;
}

/** the part of the room the geometry needs */
export interface PlanData {
  width: number;
  depth: number;
  height: number;
  shape?: Shape;
  notch?: { corner: Corner; width: number; depth: number } | null;
  points?: PlanCorner[];
  slopes?: Slope[];
  upper?: { height: number; slab: number } | null;
}

/** a wall of the floor plan (a straight one, or the chord of a bulging one) */
export interface Edge {
  index: number;
  a: Point2;
  b: Point2;
  /** along the wall, unit */
  dir: Point2;
  /** out of the room, unit */
  normal: Point2;
  side: WallSide;
  length: number;
  bulge: number;
}

/** a straight piece of wall: a whole straight wall, or one of the pieces a bulging wall is built from */
export interface Segment extends Edge {
  /** the wall it belongs to */
  edge: number;
  /** a piece of a curved wall (no openings there) */
  curved: boolean;
}

// ------------------------------------------------------------ the corners
const area = (points: Point2[]) =>
  points.reduce((sum, [x, y], i) => sum + x * points[(i + 1) % points.length][1] - points[(i + 1) % points.length][0] * y, 0) / 2;

/** the corners, counter-clockwise, starting with the front wall */
export const cornersOf = (room: PlanData): PlanCorner[] => {
  const { width: W, depth: D } = room;
  if ((room.shape ?? (room.notch ? 'L' : 'rect')) === 'polygon' && room.points && room.points.length >= 3) {
    const points = room.points;
    if (area(points.map((point) => [point.x, point.y])) >= 0) {
      return points;
    }
    // clockwise: turn round – each bulge goes with its wall, which now starts at the other corner
    const reversed = [...points].reverse();
    return reversed.map((point, i) => ({ x: point.x, y: point.y, bulge: reversed[(i + 1) % reversed.length].bulge }));
  }
  const notch = room.notch;
  const plain = (points: Point2[]) => points.map(([x, y]) => ({ x, y }));
  if (!notch || room.shape === 'rect') {
    return plain([
      [0, 0],
      [W, 0],
      [W, D],
      [0, D],
    ]);
  }
  const nw = Math.min(notch.width, W - 0.3),
    nd = Math.min(notch.depth, D - 0.3);
  switch (notch.corner) {
    case 'ne':
      return plain([
        [0, 0],
        [W, 0],
        [W, D - nd],
        [W - nw, D - nd],
        [W - nw, D],
        [0, D],
      ]);
    case 'se':
      return plain([
        [0, 0],
        [W - nw, 0],
        [W - nw, nd],
        [W, nd],
        [W, D],
        [0, D],
      ]);
    case 'nw':
      return plain([
        [0, 0],
        [W, 0],
        [W, D],
        [nw, D],
        [nw, D - nd],
        [0, D - nd],
      ]);
    default:
      return plain([
        [nw, 0],
        [W, 0],
        [W, D],
        [0, D],
        [0, nd],
        [nw, nd],
      ]);
  }
};

const sideOf = (normal: Point2): WallSide => {
  // the side a wall faces most: south, east, north or west
  if (Math.abs(normal[1]) >= Math.abs(normal[0])) {
    return normal[1] < 0 ? 'south' : 'north';
  }
  return normal[0] > 0 ? 'east' : 'west';
};

const edge = (index: number, a: Point2, b: Point2, bulge = 0): Edge => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
  const dir: Point2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const normal: Point2 = [dir[1], -dir[0]];
  return { index, a, b, dir, normal, side: sideOf(normal), length, bulge };
};

/** the walls along the floor plan (a bulging wall as its chord) */
export const edgesOf = (room: PlanData): Edge[] => {
  const corners = cornersOf(room);
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    return edge(index, [corner.x, corner.y], [next.x, next.y], corner.bulge ?? 0);
  });
};

/** the points of an arc from a to b that bulges `bulge` outwards (to the right of a → b) in the middle */
const arcPoints = (a: Point2, b: Point2, bulge: number): Point2[] => {
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const middle: Point2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const normal: Point2 = [(b[1] - a[1]) / chord, -(b[0] - a[0]) / chord];
  const sagitta = Math.abs(bulge);
  const outward = Math.sign(bulge);
  const radius = (chord * chord) / 4 / (2 * sagitta) + sagitta / 2;
  const centre: Point2 = [middle[0] - normal[0] * outward * (radius - sagitta), middle[1] - normal[1] * outward * (radius - sagitta)];
  const start = Math.atan2(a[1] - centre[1], a[0] - centre[0]);
  const top = Math.atan2(middle[1] + normal[1] * bulge - centre[1], middle[0] + normal[0] * bulge - centre[0]);
  let end = Math.atan2(b[1] - centre[1], b[0] - centre[0]);
  // go the way that passes the top of the arc
  const between = (from: number, to: number, value: number) => {
    const span = (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const offset = (((value - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return offset <= span;
  };
  const counterClockwise = between(start, end, top);
  if (counterClockwise) {
    while (end < start) {
      end += 2 * Math.PI;
    }
  } else {
    while (end > start) {
      end -= 2 * Math.PI;
    }
  }
  const steps = Math.max(4, Math.ceil(Math.abs(end - start) / (Math.PI / 18)));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = start + ((end - start) * i) / steps;
    return [centre[0] + Math.cos(angle) * radius, centre[1] + Math.sin(angle) * radius] as Point2;
  });
};

/** the straight pieces walls are built from – a bulging wall in pieces of about 10° */
export const segmentsOf = (room: PlanData): Segment[] => {
  const segments: Segment[] = [];
  for (const wall of edgesOf(room)) {
    if (Math.abs(wall.bulge) < 0.01) {
      segments.push({ ...wall, index: segments.length, edge: wall.index, curved: false });
      continue;
    }
    const points = arcPoints(wall.a, wall.b, wall.bulge);
    for (let i = 0; i < points.length - 1; i++) {
      segments.push({ ...edge(segments.length, points[i], points[i + 1]), edge: wall.index, curved: true });
    }
  }
  return segments;
};

/** the floor plan as a polygon (counter-clockwise, curved walls in pieces) */
export const polygonOf = (room: PlanData): Point2[] => segmentsOf(room).map((segment) => segment.a);

export const polygonArea = (points: Point2[]) => Math.abs(area(points));

export const pointInPolygon = (points: Point2[], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i],
      [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

/** the polygon where f(x, y) ≤ 0 for a linear f (Sutherland–Hodgman against one half-plane) */
export const clipPolygon = (points: Point2[], f: (x: number, y: number) => number): Point2[] => {
  const result: Point2[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i],
      next = points[(i + 1) % points.length];
    const fc = f(...current),
      fn = f(...next);
    if (fc <= 0) {
      result.push(current);
    }
    if (fc <= 0 !== fn <= 0) {
      const share = fc / (fc - fn);
      result.push([current[0] + (next[0] - current[0]) * share, current[1] + (next[1] - current[1]) * share]);
    }
  }
  return result;
};

/** a rectangle, or the ellipse inside it (24 points), counter-clockwise */
export const rectPolygon = (rect: Rect, round = false): Point2[] => {
  if (!round) {
    return [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x + rect.w, rect.y + rect.d],
      [rect.x, rect.y + rect.d],
    ];
  }
  return Array.from({ length: 24 }, (_, i) => {
    const angle = (i * Math.PI) / 12;
    return [rect.x + rect.w / 2 + (Math.cos(angle) * rect.w) / 2, rect.y + rect.d / 2 + (Math.sin(angle) * rect.d) / 2] as Point2;
  });
};

/** the outer line of the walls: each corner moved out by the wall thickness (mitred, also at slanted corners) */
export const outerCorners = (segments: Segment[], thickness: number): Point2[] =>
  segments.map((segment, i) => {
    const previous = segments[(i - 1 + segments.length) % segments.length];
    // the two outer lines: previous.a + n1·t + s·d1 and segment.a + n2·t + r·d2 – where they cross
    const p: Point2 = [previous.a[0] + previous.normal[0] * thickness, previous.a[1] + previous.normal[1] * thickness];
    const q: Point2 = [segment.a[0] + segment.normal[0] * thickness, segment.a[1] + segment.normal[1] * thickness];
    const cross = previous.dir[0] * segment.dir[1] - previous.dir[1] * segment.dir[0];
    if (Math.abs(cross) < 1e-6) {
      return q;
    }
    const s = ((q[0] - p[0]) * segment.dir[1] - (q[1] - p[1]) * segment.dir[0]) / cross;
    return [p[0] + previous.dir[0] * s, p[1] + previous.dir[1] * s];
  });

// ------------------------------------------------------------ floors and ceilings
export interface Level {
  /** floor height (room coordinates) */
  z: number;
  height: number;
}

export const levelsOf = (room: PlanData): Level[] =>
  room.upper
    ? [
        { z: 0, height: room.height },
        { z: room.height + room.upper.slab, height: room.upper.height },
      ]
    : [{ z: 0, height: room.height }];

/** how far a point lies from the side a slope starts at */
export const slopeDistance = (room: PlanData, side: WallSide, x: number, y: number) => {
  switch (side) {
    case 'south':
      return y;
    case 'north':
      return room.depth - y;
    case 'west':
      return x;
    default:
      return room.width - x;
  }
};

/** a slope's ceiling as a linear function (not capped) – for clipping */
export const slopePlane = (room: PlanData, slope: Slope, height: number) => (x: number, y: number) =>
  slope.knee + ((height - slope.knee) * slopeDistance(room, slope.side, x, y)) / Math.max(0.01, slope.depth);

/** the height of the ceiling over a point on a level: the lowest of the slopes there (only on the top floor) */
export const ceilingHeight = (room: PlanData, level: number, x: number, y: number) => {
  const levels = levelsOf(room);
  const height = levels[level]?.height ?? room.height;
  if (level !== levels.length - 1) {
    return height;
  }
  return (room.slopes ?? []).reduce((lowest, slope) => Math.min(lowest, slopePlane(room, slope, height)(x, y)), height);
};

/** floor-to-floor height – what a stair has to climb */
export const floorToFloor = (room: PlanData | null | undefined) => (room?.upper ? room.height + room.upper.slab : (room?.height ?? 2.75));
