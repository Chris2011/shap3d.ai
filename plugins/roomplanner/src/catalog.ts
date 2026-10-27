import { FABRICS, WOOD_FINISHES, type MaterialId } from './materials';

/**
 * The catalog: simple furniture that is built from boxes, cylinders and spheres – parametric (width, finish,
 * doors …), in real size. Every piece is built around its own origin: x from -w/2 to w/2, y from -d/2 (front) to
 * d/2 (back), z from 0 up. Placed pieces become components of the model, so the app's own tools work on them too.
 */

export type Category =
  | 'living'
  | 'bedroom'
  | 'wardrobe'
  | 'kitchen'
  | 'dining'
  | 'office'
  | 'storage'
  | 'bath'
  | 'kids'
  | 'stairs'
  | 'extras';
export const CATEGORIES: Category[] = [
  'living',
  'bedroom',
  'wardrobe',
  'kitchen',
  'dining',
  'office',
  'storage',
  'bath',
  'kids',
  'stairs',
  'extras',
];

export type Point3 = [number, number, number];

/** where a piece sits: on the floor, on a wall (at a height) or hanging from the ceiling */
export type Mount = 'floor' | 'wall' | 'ceiling';

export type ParamValue = number | string;
export type Params = Record<string, ParamValue>;

export type ParamDef =
  /** one of a few values – numbers are metres or counts, strings are message keys under roomplanner.options */
  { key: string; kind: 'choice'; options: ParamValue[]; unit?: 'm' | 'count' } | { key: string; kind: 'material'; options: MaterialId[] };

/** what a piece is built with (coordinates in the piece's own space, metres) */
export interface Parts {
  /** a box from the corner (x, y, z) with width (x), depth (y) and height (z) */
  box: (x: number, y: number, z: number, w: number, d: number, h: number, material: MaterialId) => void;
  /** an upright cylinder around (x, y) from z up */
  cylinder: (x: number, y: number, z: number, radius: number, h: number, material: MaterialId, segments?: number) => void;
  sphere: (x: number, y: number, z: number, radius: number, material: MaterialId) => void;
  /** a convex polygon (x, y) from z up by h – sector steps, slanted pieces */
  prism: (points: [number, number][], z: number, h: number, material: MaterialId) => void;
  /** a bar of width × height from a to b – handrails, stair stringers */
  beam: (a: Point3, b: Point3, width: number, height: number, material: MaterialId) => void;
}

/** what a piece may take from the room when it is placed (a stair rises from floor to floor) */
export interface RoomContext {
  floorToFloor: number;
}

export interface CatalogItem {
  id: string;
  category: Category;
  mount: Mount;
  /** turns its back to a wall when placed near one */
  wall: boolean;
  params: ParamDef[];
  defaults: Params;
  /** width (x), depth (y), height (z) in metres */
  size: (params: Params) => [number, number, number];
  /** height of the underside above the floor for wall pieces (default 0) */
  elevation?: (params: Params) => number;
  build: (parts: Parts, params: Params, size: [number, number, number]) => void;
  /** turns choices like "auto" into numbers from the room – the result is what size and build get */
  resolve?: (params: Params, room: RoomContext) => Params;
}

// ------------------------------------------------------------ helpers
const num = (params: Params, key: string) => Number(params[key]);
const str = (params: Params, key: string) => String(params[key]);
const mat = (params: Params, key = 'finish') => str(params, key) as MaterialId;
const finish = (options: MaterialId[] = WOOD_FINISHES): ParamDef => ({ key: 'finish', kind: 'material', options });
const fabric = (): ParamDef => ({ key: 'fabric', kind: 'material', options: FABRICS });
const metres = (key: string, options: number[]): ParamDef => ({ key, kind: 'choice', options, unit: 'm' });
const count = (key: string, options: number[]): ParamDef => ({ key, kind: 'choice', options, unit: 'count' });
const choice = (key: string, options: string[]): ParamDef => ({ key, kind: 'choice', options });

const FRONT = 0.02;

/** four legs under a top of w × d, inset a little */
const legs = (parts: Parts, w: number, d: number, h: number, material: MaterialId, size = 0.04, inset = 0.04) => {
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    parts.box(sx * (w / 2 - inset) - size / 2, sy * (d / 2 - inset) - size / 2, 0, size, size, h, material);
  }
};

/** a small handle on a front */
const handle = (parts: Parts, x: number, z: number, d: number, horizontal = true) =>
  horizontal
    ? parts.box(x - 0.06, -d / 2 - 0.02, z, 0.12, 0.02, 0.015, 'metal')
    : parts.box(x - 0.008, -d / 2 - 0.02, z - 0.06, 0.015, 0.02, 0.12, 'metal');

/** fronts across the width: doors (handles at the meeting edges), drawers (handles centred) or open shelves */
const fronts = (parts: Parts, x0: number, w: number, z0: number, h: number, kind: string, material: MaterialId, d: number) => {
  const y = -d / 2;
  if (kind === 'open') {
    // open: a shelf in the middle, the back is the carcass
    parts.box(x0 + 0.018, y + 0.02, z0 + h / 2, w - 0.036, d - 0.04, 0.018, material);
    return;
  }
  if (kind === 'drawers') {
    const rows = h > 0.6 ? 4 : h > 0.35 ? 3 : 1;
    const rowHeight = h / rows;
    for (let row = 0; row < rows; row++) {
      parts.box(x0 + 0.002, y, z0 + row * rowHeight + 0.002, w - 0.004, FRONT, rowHeight - 0.004, material);
      handle(parts, x0 + w / 2, z0 + row * rowHeight + rowHeight * 0.7, d);
    }
    return;
  }
  const doors = w > 0.65 ? 2 : 1;
  const doorWidth = w / doors;
  for (let i = 0; i < doors; i++) {
    parts.box(x0 + i * doorWidth + 0.002, y, z0 + 0.002, doorWidth - 0.004, FRONT, h - 0.004, material);
    const edge = doors === 2 ? (i === 0 ? x0 + doorWidth - 0.04 : x0 + doorWidth + 0.04) : x0 + doorWidth - 0.04;
    handle(parts, edge, z0 + h * (z0 > 1 ? 0.15 : 0.8), d, false);
  }
};

/** a cabinet body (sides, top, bottom, back) of w × d × h standing from z0, fronts in front of it */
const carcass = (parts: Parts, x0: number, w: number, z0: number, h: number, d: number, material: MaterialId) => {
  const y = -d / 2 + FRONT,
    depth = d - FRONT,
    t = 0.018;
  parts.box(x0, y, z0, t, depth, h, material);
  parts.box(x0 + w - t, y, z0, t, depth, h, material);
  parts.box(x0 + t, y, z0, w - 2 * t, depth, t, material);
  parts.box(x0 + t, y, z0 + h - t, w - 2 * t, depth, t, material);
  parts.box(x0 + t, d / 2 - 0.008, z0 + t, w - 2 * t, 0.008, h - 2 * t, material);
};

/** the same parts, moved by dy (e.g. a shallow wall cabinet at the back of a deep base cabinet) */
const shifted = (parts: Parts, dy: number): Parts => ({
  box: (x, y, z, w, d, h, material) => parts.box(x, y + dy, z, w, d, h, material),
  cylinder: (x, y, z, radius, h, material, segments) => parts.cylinder(x, y + dy, z, radius, h, material, segments),
  sphere: (x, y, z, radius, material) => parts.sphere(x, y + dy, z, radius, material),
  prism: (points, z, h, material) =>
    parts.prism(
      points.map(([x, y]): [number, number] => [x, y + dy]),
      z,
      h,
      material,
    ),
  beam: (a, b, width, height, material) => parts.beam([a[0], a[1] + dy, a[2]], [b[0], b[1] + dy, b[2]], width, height, material),
});

/** a plinth under kitchen and storage cabinets */
const plinth = (parts: Parts, w: number, d: number, h: number, material: MaterialId) =>
  parts.box(-w / 2 + 0.01, -d / 2 + 0.05, 0, w - 0.02, d - 0.07, h, material);

// ------------------------------------------------------------ stairs
/** the going of one step (m) */
const TREAD = 0.26;
const STAIR_FINISHES: MaterialId[] = ['oak', 'walnut', 'white', 'black', 'anthracite'];
/** the steps of a stair rising `rise`: how many and how high one is (at most 19 cm) */
const stepsFor = (rise: number) => {
  const steps = Math.max(2, Math.ceil(rise / 0.19 - 0.001));
  return { count: steps, riser: rise / steps };
};
/** a quarter-turn stair: treads before the landing and after it */
const quarterFlights = (rise: number) => {
  const treads = stepsFor(rise).count - 1;
  const first = Math.floor((treads - 1) / 2);
  return { first, second: treads - 1 - first };
};
/** the rise: "auto" (from floor to floor of the room) or a height */
const rise = (): ParamDef => ({ key: 'rise', kind: 'choice', options: ['auto', 2.5, 2.75, 3.0], unit: 'm' });
const resolveRise = (params: Params, room: RoomContext): Params => ({
  ...params,
  rise: params.rise === 'auto' ? Math.round(room.floorToFloor * 1000) / 1000 : Number(params.rise),
});

// ------------------------------------------------------------ the pieces
const piece = (definition: Omit<CatalogItem, 'mount' | 'wall'> & Partial<Pick<CatalogItem, 'mount' | 'wall'>>): CatalogItem => ({
  mount: 'floor',
  wall: true,
  ...definition,
});

export const CATALOG: CatalogItem[] = [
  // ---------------------------------------------------- living room
  piece({
    id: 'sofa',
    category: 'living',
    params: [count('seats', [2, 3, 4]), fabric()],
    defaults: { seats: 3, fabric: 'fabricGrey' },
    size: (p) => [0.3 + num(p, 'seats') * 0.68, 0.92, 0.82],
    build: (parts, p, [w, d]) => {
      const fabricId = mat(p, 'fabric');
      const seats = num(p, 'seats');
      parts.box(-w / 2, -d / 2 + 0.05, 0.08, w, d - 0.05, 0.3, fabricId); // base
      parts.box(-w / 2, d / 2 - 0.2, 0.38, w, 0.2, 0.44, fabricId); // back
      parts.box(-w / 2, -d / 2 + 0.05, 0.38, 0.15, d - 0.25, 0.24, fabricId); // arms
      parts.box(w / 2 - 0.15, -d / 2 + 0.05, 0.38, 0.15, d - 0.25, 0.24, fabricId);
      const seatWidth = (w - 0.3) / seats;
      for (let i = 0; i < seats; i++) {
        parts.box(-w / 2 + 0.15 + i * seatWidth + 0.005, -d / 2 + 0.03, 0.38, seatWidth - 0.01, d - 0.24, 0.12, fabricId); // cushions
      }
      legs(parts, w, d - 0.05, 0.08, 'black', 0.04, 0.06);
    },
  }),
  piece({
    id: 'cornerSofa',
    category: 'living',
    params: [choice('side', ['left', 'right']), fabric()],
    defaults: { side: 'left', fabric: 'fabricBeige' },
    size: () => [2.6, 1.6, 0.82],
    build: (parts, p, [w, d]) => {
      const fabricId = mat(p, 'fabric');
      const mirror = str(p, 'side') === 'right' ? -1 : 1;
      const x = (value: number, width: number) => (mirror === 1 ? value : -value - width);
      parts.box(-w / 2, d / 2 - 0.92, 0.08, w, 0.92, 0.3, fabricId);
      parts.box(x(-w / 2, 0.92), -d / 2, 0.08, 0.92, d - 0.92, 0.3, fabricId); // chaise
      parts.box(-w / 2, d / 2 - 0.2, 0.38, w, 0.2, 0.44, fabricId);
      parts.box(x(w / 2 - 0.15, 0.15), d / 2 - 0.92, 0.38, 0.15, 0.72, 0.24, fabricId);
      parts.box(x(-w / 2, 0.92), -d / 2 + 0.02, 0.38, 0.9, d - 0.24, 0.12, fabricId);
      parts.box(x(-w / 2 + 0.92, w - 1.07), d / 2 - 0.9, 0.38, w - 1.07, 0.7, 0.12, fabricId);
    },
  }),
  piece({
    id: 'armchair',
    category: 'living',
    params: [fabric()],
    defaults: { fabric: 'fabricBlue' },
    size: () => [0.8, 0.85, 0.85],
    build: (parts, p, [w, d]) => {
      const fabricId = mat(p, 'fabric');
      parts.box(-w / 2, -d / 2, 0.12, w, d, 0.3, fabricId);
      parts.box(-w / 2, d / 2 - 0.18, 0.42, w, 0.18, 0.43, fabricId);
      parts.box(-w / 2, -d / 2, 0.42, 0.12, d - 0.18, 0.2, fabricId);
      parts.box(w / 2 - 0.12, -d / 2, 0.42, 0.12, d - 0.18, 0.2, fabricId);
      legs(parts, w, d, 0.12, 'oak', 0.035, 0.05);
    },
  }),
  piece({
    id: 'coffeeTable',
    category: 'living',
    wall: false,
    params: [metres('width', [0.9, 1.2]), finish()],
    defaults: { width: 1.2, finish: 'oak' },
    size: (p) => [num(p, 'width'), 0.6, 0.42],
    build: (parts, p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, h - 0.04, w, d, 0.04, mat(p));
      parts.box(-w / 2 + 0.05, -d / 2 + 0.05, 0.08, w - 0.1, d - 0.1, 0.02, mat(p)); // shelf
      legs(parts, w, d, h - 0.04, mat(p), 0.04, 0.03);
    },
  }),
  piece({
    id: 'tvBench',
    category: 'living',
    params: [metres('width', [1.2, 1.6, 2.0]), choice('front', ['doors', 'drawers', 'open']), finish()],
    defaults: { width: 1.6, front: 'drawers', finish: 'white' },
    size: (p) => [num(p, 'width'), 0.42, 0.5],
    build: (parts, p, [w, d, h]) => {
      const sections = Math.round(w / 0.4);
      carcass(parts, -w / 2, w, 0.05, h - 0.05, d, mat(p));
      for (let i = 0; i < sections; i++) {
        fronts(parts, -w / 2 + (i * w) / sections, w / sections, 0.05, h - 0.05, str(p, 'front'), mat(p), d);
      }
      plinth(parts, w, d, 0.05, 'black');
    },
  }),
  piece({
    id: 'tv',
    category: 'living',
    mount: 'wall',
    params: [choice('screen', ['inch43', 'inch55', 'inch65'])],
    defaults: { screen: 'inch55' },
    size: (p) => {
      const width = { inch43: 0.97, inch55: 1.23, inch65: 1.45 }[str(p, 'screen')] ?? 1.23;
      return [width, 0.06, width * 0.58];
    },
    elevation: () => 1.0,
    build: (parts, _p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, 0, w, d, h, 'black');
      parts.box(-w / 2 + 0.01, -d / 2 - 0.002, 0.01, w - 0.02, 0.002, h - 0.02, 'screen');
    },
  }),
  piece({
    id: 'floorLamp',
    category: 'living',
    wall: false,
    params: [],
    defaults: {},
    size: () => [0.4, 0.4, 1.6],
    build: (parts) => {
      parts.cylinder(0, 0, 0, 0.16, 0.03, 'black', 24);
      parts.cylinder(0, 0, 0.03, 0.012, 1.3, 'metal', 8);
      parts.cylinder(0, 0, 1.3, 0.2, 0.3, 'lamp', 24);
    },
  }),
  piece({
    id: 'sideTable',
    category: 'living',
    wall: false,
    params: [finish()],
    defaults: { finish: 'walnut' },
    size: () => [0.45, 0.45, 0.5],
    build: (parts, p) => {
      parts.cylinder(0, 0, 0.47, 0.225, 0.03, mat(p), 28);
      parts.cylinder(0, 0, 0, 0.02, 0.47, 'black', 8);
      parts.cylinder(0, 0, 0, 0.15, 0.015, 'black', 20);
    },
  }),

  // ---------------------------------------------------- bedroom
  piece({
    id: 'bed',
    category: 'bedroom',
    params: [metres('width', [0.9, 1.4, 1.6, 1.8]), metres('length', [2.0, 2.2]), finish()],
    defaults: { width: 1.6, length: 2.0, finish: 'oak' },
    size: (p) => [num(p, 'width') + 0.06, num(p, 'length') + 0.06, 1.0],
    build: (parts, p, [w, d]) => {
      const wood = mat(p);
      parts.box(-w / 2, -d / 2, 0.12, w, d, 0.2, wood); // frame
      parts.box(-w / 2, d / 2 - 0.05, 0, w, 0.05, 1.0, wood); // headboard
      parts.box(-w / 2 + 0.03, -d / 2 + 0.03, 0.32, w - 0.06, d - 0.08, 0.2, 'mattress');
      const pillows = w > 1.2 ? 2 : 1;
      for (let i = 0; i < pillows; i++) {
        const pillowWidth = (w - 0.2) / pillows - 0.05;
        parts.box(-w / 2 + 0.1 + i * (pillowWidth + 0.05), d / 2 - 0.5, 0.52, pillowWidth, 0.4, 0.1, 'ceramic');
      }
      parts.box(-w / 2 + 0.02, -d / 2 + 0.02, 0.5, w - 0.04, d * 0.6, 0.04, 'fabricBlue'); // blanket
      legs(parts, w, d, 0.12, wood, 0.06, 0.04);
    },
  }),
  piece({
    id: 'nightstand',
    category: 'bedroom',
    params: [finish()],
    defaults: { finish: 'oak' },
    size: () => [0.45, 0.38, 0.55],
    build: (parts, p, [w, d, h]) => {
      carcass(parts, -w / 2, w, 0.1, h - 0.1, d, mat(p));
      fronts(parts, -w / 2, w, 0.1, 0.2, 'drawers', mat(p), d);
      legs(parts, w, d, 0.1, 'black', 0.03, 0.03);
    },
  }),
  piece({
    id: 'dresser',
    category: 'bedroom',
    params: [metres('width', [0.8, 1.2, 1.6]), finish()],
    defaults: { width: 1.2, finish: 'white' },
    size: (p) => [num(p, 'width'), 0.48, 0.78],
    build: (parts, p, [w, d, h]) => {
      const columns = w > 1 ? 2 : 1;
      carcass(parts, -w / 2, w, 0.06, h - 0.06, d, mat(p));
      for (let i = 0; i < columns; i++) {
        fronts(parts, -w / 2 + (i * w) / columns, w / columns, 0.06, h - 0.06, 'drawers', mat(p), d);
      }
      plinth(parts, w, d, 0.06, mat(p));
    },
  }),
  piece({
    id: 'mirror',
    category: 'bedroom',
    mount: 'wall',
    params: [metres('height', [1.2, 1.6, 1.9])],
    defaults: { height: 1.6 },
    size: (p) => [0.6, 0.03, num(p, 'height')],
    elevation: (p) => (num(p, 'height') > 1.7 ? 0.1 : 0.4),
    build: (parts, _p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, 0, w, d, h, 'black');
      parts.box(-w / 2 + 0.03, -d / 2 - 0.002, 0.03, w - 0.06, 0.002, h - 0.06, 'mirror');
    },
  }),

  // ---------------------------------------------------- wardrobes (a PAX-like system)
  piece({
    id: 'wardrobe',
    category: 'wardrobe',
    params: [
      count('sections', [1, 2, 3, 4]),
      metres('sectionWidth', [0.5, 0.75, 1.0]),
      metres('height', [2.01, 2.36]),
      metres('depth', [0.35, 0.58]),
      choice('doors', ['hinged', 'sliding', 'none']),
      choice('interior', ['shelves', 'rail', 'drawers', 'mixed']),
      finish(['white', 'oak', 'walnut', 'anthracite', 'black', 'mirror']),
    ],
    defaults: { sections: 2, sectionWidth: 1.0, height: 2.36, depth: 0.58, doors: 'hinged', interior: 'mixed', finish: 'white' },
    size: (p) => [num(p, 'sections') * num(p, 'sectionWidth'), num(p, 'depth') + 0.02, num(p, 'height')],
    build: (parts, p, [w, d, h]) => {
      const sections = num(p, 'sections'),
        sectionWidth = num(p, 'sectionWidth');
      const frame: MaterialId = mat(p) === 'mirror' ? 'white' : mat(p);
      const y = -d / 2 + FRONT,
        depth = d - FRONT;
      for (let i = 0; i < sections; i++) {
        const x0 = -w / 2 + i * sectionWidth;
        carcass(parts, x0, sectionWidth, 0, h, d, frame);
        // the inside: shelves, a rail, drawers – "mixed" changes from section to section
        const kinds = ['rail', 'shelves', 'drawers'];
        const inside = str(p, 'interior') === 'mixed' ? kinds[i % 3] : str(p, 'interior');
        const inner = { x: x0 + 0.02, w: sectionWidth - 0.04 };
        if (inside === 'shelves') {
          for (let z = 0.4; z < h - 0.3; z += 0.36) {
            parts.box(inner.x, y + 0.02, z, inner.w, depth - 0.04, 0.018, frame);
          }
        } else if (inside === 'rail') {
          parts.box(inner.x, y + 0.02, h - 0.3, inner.w, depth - 0.04, 0.018, frame);
          parts.box(inner.x, y + depth / 2, h - 0.38, inner.w, 0.02, 0.02, 'metal');
          parts.box(inner.x, y + 0.02, 0.6, inner.w, depth - 0.04, 0.018, frame);
        } else {
          for (let row = 0; row < 4; row++) {
            parts.box(inner.x, y + 0.03, 0.1 + row * 0.2, inner.w, depth - 0.06, 0.16, frame);
          }
          for (let z = 1.0; z < h - 0.3; z += 0.4) {
            parts.box(inner.x, y + 0.02, z, inner.w, depth - 0.04, 0.018, frame);
          }
        }
        if (str(p, 'doors') === 'hinged') {
          fronts(parts, x0, sectionWidth, 0, h, 'doors', mat(p), d);
        }
      }
      if (str(p, 'doors') === 'sliding') {
        // two sliding doors over the whole width, one in front of the other
        const doorWidth = w / 2 + 0.03;
        parts.box(-w / 2, -d / 2, 0.02, doorWidth, FRONT, h - 0.04, mat(p));
        parts.box(w / 2 - doorWidth, -d / 2 - FRONT, 0.02, doorWidth, FRONT, h - 0.04, mat(p));
        parts.box(-w / 2, -d / 2 - FRONT, h - 0.03, w, 2 * FRONT, 0.03, 'metal');
      }
    },
  }),
  piece({
    id: 'openWardrobe',
    category: 'wardrobe',
    params: [metres('width', [0.8, 1.2, 1.6]), finish(['black', 'white', 'oak'])],
    defaults: { width: 1.2, finish: 'black' },
    size: (p) => [num(p, 'width'), 0.4, 1.8],
    build: (parts, p, [w, d, h]) => {
      for (const x of [-w / 2, w / 2 - 0.03]) {
        parts.box(x, -d / 2, 0, 0.03, 0.03, h, mat(p));
        parts.box(x, d / 2 - 0.03, 0, 0.03, 0.03, h, mat(p));
      }
      parts.box(-w / 2, -d / 2, 0.15, w, d, 0.02, 'oak');
      parts.box(-w / 2, -d / 2, h - 0.02, w, d, 0.02, 'oak');
      parts.box(-w / 2, 0, h - 0.15, w, 0.02, 0.02, 'metal');
    },
  }),

  // ---------------------------------------------------- kitchen
  piece({
    id: 'kitchenRun',
    category: 'kitchen',
    params: [
      metres('length', [1.8, 2.4, 3.0, 3.6, 4.2]),
      choice('wallCabinets', ['yes', 'no']),
      finish(['white', 'oak', 'walnut', 'anthracite', 'black']),
    ],
    defaults: { length: 3.0, wallCabinets: 'yes', finish: 'white' },
    size: (p) => [num(p, 'length'), 0.62, str(p, 'wallCabinets') === 'yes' ? 2.2 : 0.92],
    build: (parts, p, [w]) => {
      // a complete kitchen run: sink, dishwasher, cooktop with oven and drawers, a tall fridge at the end
      const front = mat(p);
      const modules: { width: number; kind: string }[] = [];
      let left = w - 0.6; // the tall fridge cabinet takes 0.6 m
      const want = [
        { width: 0.6, kind: 'drawers' },
        { width: 0.6, kind: 'stove' },
        { width: 0.6, kind: 'dishwasher' },
        { width: 0.8, kind: 'sink' },
      ];
      for (const module of want) {
        if (left >= module.width) {
          modules.push(module);
          left -= module.width;
        }
      }
      while (left >= 0.4) {
        const width = left >= 0.8 ? 0.8 : left >= 0.6 ? 0.6 : 0.4;
        modules.push({ width, kind: 'doors' });
        left -= width;
      }
      modules.push({ width: 0.6 + left, kind: 'tall' });
      let x = -w / 2;
      for (const module of modules) {
        kitchenModule(parts, x, module.width, module.kind, front, str(p, 'wallCabinets') === 'yes');
        x += module.width;
      }
    },
  }),
  piece({
    id: 'baseCabinet',
    category: 'kitchen',
    params: [metres('width', [0.4, 0.6, 0.8]), choice('front', ['doors', 'drawers', 'sink', 'stove', 'dishwasher']), finish()],
    defaults: { width: 0.6, front: 'drawers', finish: 'white' },
    size: (p) => [num(p, 'width'), 0.62, 0.92],
    build: (parts, p, [w]) => kitchenModule(parts, -w / 2, w, str(p, 'front'), mat(p), false),
  }),
  piece({
    id: 'wallCabinet',
    category: 'kitchen',
    mount: 'wall',
    params: [metres('width', [0.4, 0.6, 0.8]), metres('height', [0.6, 0.8]), finish()],
    defaults: { width: 0.6, height: 0.8, finish: 'white' },
    size: (p) => [num(p, 'width'), 0.37, num(p, 'height')],
    elevation: (p) => 2.2 - num(p, 'height'),
    build: (parts, p, [w, d, h]) => {
      carcass(parts, -w / 2, w, 0, h, d, mat(p));
      fronts(parts, -w / 2, w, 0, h, 'doors', mat(p), d);
    },
  }),
  piece({
    id: 'tallCabinet',
    category: 'kitchen',
    params: [choice('front', ['fridge', 'oven', 'pantry']), finish()],
    defaults: { front: 'fridge', finish: 'white' },
    size: () => [0.6, 0.62, 2.2],
    build: (parts, p, [w, d, h]) => {
      carcass(parts, -w / 2, w, 0.1, h - 0.1, d, mat(p));
      plinth(parts, w, d, 0.1, 'black');
      if (str(p, 'front') === 'oven') {
        fronts(parts, -w / 2, w, 0.1, 0.6, 'drawers', mat(p), d);
        parts.box(-w / 2 + 0.01, -d / 2, 0.72, w - 0.02, FRONT, 0.58, 'black');
        parts.box(-w / 2 + 0.05, -d / 2 - 0.002, 0.8, w - 0.1, 0.002, 0.35, 'glass');
        fronts(parts, -w / 2, w, 1.32, h - 1.32, 'doors', mat(p), d);
      } else if (str(p, 'front') === 'fridge') {
        fronts(parts, -w / 2, w, 0.1, 0.8, 'doors', mat(p), d);
        fronts(parts, -w / 2, w, 0.9, h - 0.9, 'doors', mat(p), d);
      } else {
        fronts(parts, -w / 2, w, 0.1, h - 0.1, 'doors', mat(p), d);
      }
    },
  }),
  piece({
    id: 'island',
    category: 'kitchen',
    wall: false,
    params: [metres('width', [1.2, 1.8, 2.4]), finish()],
    defaults: { width: 1.8, finish: 'anthracite' },
    size: (p) => [num(p, 'width'), 0.9, 0.92],
    build: (parts, p, [w, d, h]) => {
      // the cabinets at the front, the worktop reaches over them at the back (for stools)
      const front = shifted(parts, -d / 2 + 0.31);
      const modules = Math.round(w / 0.6);
      for (let i = 0; i < modules; i++) {
        const x0 = -w / 2 + (i * w) / modules;
        carcass(front, x0, w / modules, 0.1, h - 0.14, 0.62, mat(p));
        fronts(front, x0, w / modules, 0.1, h - 0.14, i % 2 ? 'doors' : 'drawers', mat(p), 0.62);
      }
      front.box(-w / 2 + 0.01, -0.62 / 2 + 0.05, 0, w - 0.02, 0.55, 0.1, 'black');
      parts.box(-w / 2, -d / 2, h - 0.04, w, d, 0.04, 'worktop'); // overhang at the back for stools
    },
  }),
  piece({
    id: 'fridge',
    category: 'kitchen',
    params: [choice('type', ['single', 'sideBySide'])],
    defaults: { type: 'single' },
    size: (p) => (str(p, 'type') === 'sideBySide' ? [0.91, 0.72, 1.78] : [0.6, 0.66, 1.86]),
    build: (parts, p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2 + 0.03, 0, w, d - 0.03, h, 'steel');
      if (str(p, 'type') === 'sideBySide') {
        parts.box(-w / 2, -d / 2, 0.02, w / 2 - 0.003, 0.03, h - 0.04, 'steel');
        parts.box(0.003, -d / 2, 0.02, w / 2 - 0.003, 0.03, h - 0.04, 'steel');
        handle(parts, -0.04, h * 0.6, d, false);
        handle(parts, 0.04, h * 0.6, d, false);
      } else {
        parts.box(-w / 2, -d / 2, 0.02, w, 0.03, 0.66, 'steel');
        parts.box(-w / 2, -d / 2, 0.7, w, 0.03, h - 0.72, 'steel');
        handle(parts, w / 2 - 0.05, 0.55, d, false);
        handle(parts, w / 2 - 0.05, 0.9, d, false);
      }
    },
  }),

  // ---------------------------------------------------- dining
  piece({
    id: 'diningTable',
    category: 'dining',
    wall: false,
    params: [metres('width', [1.2, 1.6, 2.0, 2.4]), metres('depth', [0.8, 0.9, 1.0]), finish()],
    defaults: { width: 1.6, depth: 0.9, finish: 'oak' },
    size: (p) => [num(p, 'width'), num(p, 'depth'), 0.75],
    build: (parts, p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, h - 0.04, w, d, 0.04, mat(p));
      parts.box(-w / 2 + 0.06, -d / 2 + 0.06, h - 0.12, w - 0.12, d - 0.12, 0.08, mat(p)); // frame
      legs(parts, w, d, h - 0.04, mat(p), 0.06, 0.06);
    },
  }),
  piece({
    id: 'roundTable',
    category: 'dining',
    wall: false,
    params: [metres('diameter', [0.8, 1.0, 1.2]), finish()],
    defaults: { diameter: 1.0, finish: 'white' },
    size: (p) => [num(p, 'diameter'), num(p, 'diameter'), 0.75],
    build: (parts, p, [w, , h]) => {
      parts.cylinder(0, 0, h - 0.035, w / 2, 0.035, mat(p), 40);
      parts.cylinder(0, 0, 0.02, 0.05, h - 0.055, mat(p), 12);
      parts.cylinder(0, 0, 0, 0.25, 0.02, mat(p), 24);
    },
  }),
  piece({
    id: 'chair',
    category: 'dining',
    wall: false,
    params: [finish(['oak', 'walnut', 'white', 'black'])],
    defaults: { finish: 'oak' },
    size: () => [0.45, 0.52, 0.85],
    build: (parts, p, [w, d]) => {
      parts.box(-w / 2, -d / 2, 0.43, w, d - 0.04, 0.04, mat(p));
      parts.box(-w / 2, d / 2 - 0.04, 0.47, w, 0.03, 0.38, mat(p));
      legs(parts, w, d, 0.43, mat(p), 0.035, 0.03);
    },
  }),
  piece({
    id: 'bench',
    category: 'dining',
    wall: false,
    params: [metres('width', [1.2, 1.6]), finish()],
    defaults: { width: 1.6, finish: 'oak' },
    size: (p) => [num(p, 'width'), 0.36, 0.45],
    build: (parts, p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, h - 0.04, w, d, 0.04, mat(p));
      parts.box(-w / 2 + 0.06, -d / 2 + 0.03, 0, 0.04, d - 0.06, h - 0.04, mat(p));
      parts.box(w / 2 - 0.1, -d / 2 + 0.03, 0, 0.04, d - 0.06, h - 0.04, mat(p));
    },
  }),
  piece({
    id: 'barStool',
    category: 'dining',
    wall: false,
    params: [finish(['black', 'oak', 'white'])],
    defaults: { finish: 'black' },
    size: () => [0.4, 0.4, 0.75],
    build: (parts, p) => {
      parts.cylinder(0, 0, 0.72, 0.19, 0.04, mat(p), 24);
      parts.cylinder(0, 0, 0.02, 0.025, 0.7, 'metal', 10);
      parts.cylinder(0, 0, 0, 0.19, 0.02, 'metal', 24);
      parts.cylinder(0, 0, 0.3, 0.15, 0.015, 'metal', 20);
    },
  }),

  // ---------------------------------------------------- office
  piece({
    id: 'desk',
    category: 'office',
    params: [metres('width', [1.2, 1.4, 1.6]), metres('depth', [0.6, 0.7, 0.8]), finish()],
    defaults: { width: 1.4, depth: 0.7, finish: 'white' },
    size: (p) => [num(p, 'width'), num(p, 'depth'), 0.75],
    build: (parts, p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, h - 0.03, w, d, 0.03, mat(p));
      for (const x of [-w / 2 + 0.03, w / 2 - 0.06]) {
        parts.box(x, -d / 2 + 0.05, 0, 0.03, d - 0.1, h - 0.03, 'metal');
      }
      parts.box(-w / 2 + 0.06, d / 2 - 0.1, h - 0.25, w - 0.12, 0.02, 0.2, 'metal');
    },
  }),
  piece({
    id: 'officeChair',
    category: 'office',
    wall: false,
    params: [fabric()],
    defaults: { fabric: 'fabricGrey' },
    size: () => [0.65, 0.65, 1.1],
    build: (parts, p) => {
      const fabricId = mat(p, 'fabric');
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5;
        parts.box(Math.cos(angle) * 0.15 - 0.15, Math.sin(angle) * 0.15 - 0.02, 0.04, 0.3, 0.04, 0.03, 'black');
        parts.sphere(Math.cos(angle) * 0.29, Math.sin(angle) * 0.29, 0.03, 0.03, 'black');
      }
      parts.cylinder(0, 0, 0.07, 0.03, 0.38, 'metal', 10);
      parts.box(-0.25, -0.24, 0.45, 0.5, 0.48, 0.08, fabricId);
      parts.box(-0.23, 0.18, 0.55, 0.46, 0.06, 0.55, fabricId);
    },
  }),
  piece({
    id: 'drawerUnit',
    category: 'office',
    params: [finish()],
    defaults: { finish: 'white' },
    size: () => [0.42, 0.5, 0.6],
    build: (parts, p, [w, d, h]) => {
      carcass(parts, -w / 2, w, 0.05, h - 0.05, d, mat(p));
      fronts(parts, -w / 2, w, 0.05, h - 0.05, 'drawers', mat(p), d);
      for (const [x, y] of [
        [-w / 2 + 0.05, -d / 2 + 0.05],
        [w / 2 - 0.05, -d / 2 + 0.05],
        [-w / 2 + 0.05, d / 2 - 0.05],
        [w / 2 - 0.05, d / 2 - 0.05],
      ]) {
        parts.sphere(x, y, 0.025, 0.025, 'black');
      }
    },
  }),

  // ---------------------------------------------------- storage
  piece({
    id: 'bookcase',
    category: 'storage',
    params: [metres('width', [0.4, 0.8]), metres('height', [1.06, 2.02, 2.37]), finish()],
    defaults: { width: 0.8, height: 2.02, finish: 'white' },
    size: (p) => [num(p, 'width'), 0.28, num(p, 'height')],
    build: (parts, p, [w, d, h]) => {
      const t = 0.018;
      parts.box(-w / 2, -d / 2, 0, t, d, h, mat(p));
      parts.box(w / 2 - t, -d / 2, 0, t, d, h, mat(p));
      parts.box(-w / 2 + t, d / 2 - 0.005, 0, w - 2 * t, 0.005, h, mat(p));
      for (let z = 0.06; z < h; z += 0.36) {
        parts.box(-w / 2 + t, -d / 2, Math.min(z, h - t), w - 2 * t, d - 0.005, t, mat(p));
      }
      parts.box(-w / 2 + t, -d / 2, 0, w - 2 * t, 0.02, 0.06, mat(p));
    },
  }),
  piece({
    id: 'cubeShelf',
    category: 'storage',
    params: [count('columns', [1, 2, 3, 4, 5]), count('rows', [1, 2, 3, 4, 5]), choice('inserts', ['none', 'some', 'all']), finish()],
    defaults: { columns: 4, rows: 2, inserts: 'some', finish: 'white' },
    size: (p) => [num(p, 'columns') * 0.385 + 0.04, 0.39, num(p, 'rows') * 0.385 + 0.04],
    build: (parts, p, [w, d, h]) => {
      const columns = num(p, 'columns'),
        rows = num(p, 'rows'),
        cell = 0.385,
        t = 0.02;
      parts.box(-w / 2, -d / 2, 0, w, d, t, mat(p));
      parts.box(-w / 2, -d / 2, h - t, w, d, t, mat(p));
      for (let c = 0; c <= columns; c++) {
        parts.box(-w / 2 + c * cell + (c === columns ? 0.02 : 0), -d / 2, t, t, d, h - 2 * t, mat(p));
      }
      for (let r = 1; r < rows; r++) {
        parts.box(-w / 2 + t, -d / 2, r * cell + t / 2, w - 2 * t, d, t, mat(p));
      }
      // boxes or doors in some cells
      const inserts = str(p, 'inserts');
      for (let c = 0; c < columns; c++) {
        for (let r = 0; r < rows; r++) {
          if (inserts === 'all' || (inserts === 'some' && (c + r) % 2 === 0)) {
            parts.box(
              -w / 2 + c * cell + t + 0.01,
              -d / 2 + 0.01,
              r * cell + t + 0.01,
              cell - t - 0.02,
              d - 0.03,
              cell - t - 0.02,
              'fabricBeige',
            );
          }
        }
      }
    },
  }),
  piece({
    id: 'sideboard',
    category: 'storage',
    params: [metres('width', [1.2, 1.6, 2.0]), finish()],
    defaults: { width: 1.6, finish: 'walnut' },
    size: (p) => [num(p, 'width'), 0.45, 0.8],
    build: (parts, p, [w, d, h]) => {
      const sections = Math.round(w / 0.4);
      carcass(parts, -w / 2, w, 0.15, h - 0.15, d, mat(p));
      for (let i = 0; i < sections; i++) {
        fronts(parts, -w / 2 + (i * w) / sections, w / sections, 0.15, h - 0.15, i % 3 === 1 ? 'drawers' : 'doors', mat(p), d);
      }
      legs(parts, w, d, 0.15, 'black', 0.03, 0.05);
    },
  }),
  piece({
    id: 'wallShelf',
    category: 'storage',
    mount: 'wall',
    params: [metres('width', [0.6, 0.9, 1.2]), finish()],
    defaults: { width: 0.9, finish: 'oak' },
    size: (p) => [num(p, 'width'), 0.2, 0.03],
    elevation: () => 1.5,
    build: (parts, p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, 0, w, d, h, mat(p));
    },
  }),
  piece({
    id: 'shoeCabinet',
    category: 'storage',
    params: [finish()],
    defaults: { finish: 'white' },
    size: () => [0.8, 0.24, 1.0],
    build: (parts, p, [w, d, h]) => {
      carcass(parts, -w / 2, w, 0, h, d, mat(p));
      fronts(parts, -w / 2, w, 0, h / 2, 'drawers', mat(p), d);
      fronts(parts, -w / 2, w, h / 2, h / 2, 'drawers', mat(p), d);
    },
  }),

  // ---------------------------------------------------- bath
  piece({
    id: 'toilet',
    category: 'bath',
    params: [],
    defaults: {},
    size: () => [0.38, 0.55, 0.42],
    build: (parts, _p, [w, d]) => {
      parts.box(-w / 2, d / 2 - 0.12, 0.1, w, 0.12, 0.35, 'ceramic'); // cistern, wall mounted
      parts.box(-0.16, -d / 2 + 0.02, 0.32, 0.32, d - 0.14, 0.08, 'ceramic');
      parts.cylinder(0, -d / 2 + 0.2, 0.28, 0.17, 0.12, 'ceramic', 24);
      parts.box(-0.16, -d / 2 + 0.03, 0.4, 0.32, d - 0.16, 0.02, 'white');
    },
  }),
  piece({
    id: 'washbasin',
    category: 'bath',
    params: [metres('width', [0.6, 0.8, 1.2]), choice('cabinet', ['yes', 'no']), finish()],
    defaults: { width: 0.8, cabinet: 'yes', finish: 'oak' },
    size: (p) => [num(p, 'width'), 0.48, 0.88],
    build: (parts, p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, h - 0.05, w, d, 0.05, 'ceramic');
      const basins = w >= 1.2 ? 2 : 1;
      for (let i = 0; i < basins; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / basins;
        parts.cylinder(x, -0.02, h - 0.051, 0.16, 0.052, 'steel', 24);
        parts.box(x - 0.012, d / 2 - 0.1, h, 0.024, 0.024, 0.15, 'steel'); // tap
        parts.box(x - 0.012, d / 2 - 0.2, h + 0.13, 0.024, 0.12, 0.02, 'steel');
      }
      if (str(p, 'cabinet') === 'yes') {
        carcass(parts, -w / 2, w, 0.3, h - 0.35, d, mat(p));
        fronts(parts, -w / 2, w, 0.3, h - 0.35, 'drawers', mat(p), d);
      }
    },
  }),
  piece({
    id: 'shower',
    category: 'bath',
    params: [metres('width', [0.8, 0.9, 1.0, 1.2])],
    defaults: { width: 0.9 },
    size: (p) => [num(p, 'width'), num(p, 'width'), 2.0],
    build: (parts, _p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, 0, w, d, 0.04, 'ceramic');
      parts.box(-w / 2, -d / 2, 0.04, w, 0.008, h - 0.04, 'glass');
      parts.box(-w / 2, -d / 2, 0.04, 0.008, d, h - 0.04, 'glass');
      parts.box(-0.012, d / 2 - 0.05, 0.9, 0.024, 0.024, 1.1, 'steel');
      parts.cylinder(0, d / 2 - 0.25, h - 0.05, 0.12, 0.02, 'steel', 20);
      parts.box(-0.01, d / 2 - 0.25, h - 0.05, 0.02, 0.22, 0.02, 'steel');
    },
  }),
  piece({
    id: 'bathtub',
    category: 'bath',
    params: [metres('length', [1.6, 1.7, 1.8])],
    defaults: { length: 1.7 },
    size: (p) => [num(p, 'length'), 0.75, 0.58],
    build: (parts, _p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, 0, w, 0.06, h, 'ceramic');
      parts.box(-w / 2, d / 2 - 0.06, 0, w, 0.06, h, 'ceramic');
      parts.box(-w / 2, -d / 2 + 0.06, 0, 0.06, d - 0.12, h, 'ceramic');
      parts.box(w / 2 - 0.06, -d / 2 + 0.06, 0, 0.06, d - 0.12, h, 'ceramic');
      parts.box(-w / 2 + 0.06, -d / 2 + 0.06, 0, w - 0.12, d - 0.12, 0.12, 'ceramic');
      parts.box(w / 2 - 0.25, d / 2 - 0.05, h, 0.03, 0.03, 0.12, 'steel');
    },
  }),
  piece({
    id: 'towelRadiator',
    category: 'bath',
    mount: 'wall',
    params: [],
    defaults: {},
    size: () => [0.5, 0.08, 1.2],
    elevation: () => 0.3,
    build: (parts, _p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, 0, 0.03, d, h, 'white');
      parts.box(w / 2 - 0.03, -d / 2, 0, 0.03, d, h, 'white');
      for (let z = 0.05; z < h; z += 0.08) {
        parts.box(-w / 2 + 0.03, -d / 2 + 0.02, z, w - 0.06, 0.03, 0.02, 'white');
      }
    },
  }),

  // ---------------------------------------------------- kids
  piece({
    id: 'bunkBed',
    category: 'kids',
    params: [finish(['white', 'oak'])],
    defaults: { finish: 'white' },
    size: () => [0.97, 2.06, 1.6],
    build: (parts, p, [w, d, h]) => {
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        parts.box(sx * (w / 2 - 0.03) - 0.03, sy * (d / 2 - 0.03) - 0.03, 0, 0.06, 0.06, h, mat(p));
      }
      for (const z of [0.15, 1.0]) {
        parts.box(-w / 2, -d / 2, z, w, d, 0.08, mat(p));
        parts.box(-w / 2 + 0.03, -d / 2 + 0.03, z + 0.08, w - 0.06, d - 0.06, 0.12, 'mattress');
      }
      parts.box(-w / 2, -d / 2, 1.3, 0.03, d * 0.7, 0.2, mat(p)); // guard rail
      for (let z = 0.3; z < 1.0; z += 0.25) {
        parts.box(w / 2 - 0.03, d / 2 - 0.45, z, 0.03, 0.4, 0.03, mat(p)); // ladder
      }
    },
  }),
  piece({
    id: 'toyChest',
    category: 'kids',
    params: [finish(['white', 'oak', 'fabricBlue', 'fabricGreen'])],
    defaults: { finish: 'fabricGreen' },
    size: () => [0.8, 0.42, 0.45],
    build: (parts, p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, 0.03, w, d, h - 0.06, mat(p));
      parts.box(-w / 2 - 0.01, -d / 2 - 0.01, h - 0.03, w + 0.02, d + 0.02, 0.03, mat(p));
      legs(parts, w, d, 0.03, 'black', 0.04, 0.03);
    },
  }),
  piece({
    id: 'playTable',
    category: 'kids',
    wall: false,
    params: [],
    defaults: {},
    size: () => [0.8, 0.6, 0.5],
    build: (parts, _p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, h - 0.03, w, d, 0.03, 'white');
      legs(parts, w, d, h - 0.03, 'fabricBlue', 0.04, 0.04);
    },
  }),

  // ---------------------------------------------------- stairs (for a maisonette: "auto" rises from floor to floor)
  piece({
    id: 'stairStraight',
    category: 'stairs',
    wall: false,
    params: [metres('width', [0.8, 0.9, 1.0]), rise(), choice('railing', ['both', 'left', 'right', 'none']), finish(STAIR_FINISHES)],
    defaults: { width: 0.9, rise: 'auto', railing: 'right', finish: 'oak' },
    resolve: resolveRise,
    size: (p) => {
      const { count: steps } = stepsFor(num(p, 'rise'));
      return [num(p, 'width') + 0.1, (steps - 1) * TREAD + 0.05, num(p, 'rise')];
    },
    build: (parts, p, [w, d, h]) => {
      const { count: steps, riser } = stepsFor(h);
      const inner = w - 0.1;
      for (const x of [-w / 2, w / 2 - 0.05]) {
        parts.beam([x + 0.025, -d / 2 + 0.05, riser * 0.5], [x + 0.025, d / 2 - 0.02, h - riser * 0.6], 0.05, 0.28, mat(p)); // stringers
      }
      for (let i = 0; i < steps - 1; i++) {
        parts.box(-inner / 2, -d / 2 + i * TREAD, (i + 1) * riser - 0.04, inner, TREAD + 0.03, 0.04, mat(p));
      }
      const sides = { both: [-1, 1], left: [-1], right: [1], none: [] }[str(p, 'railing')] ?? [];
      for (const side of sides) {
        const x = side * (w / 2 - 0.025);
        const bottom: Point3 = [x, -d / 2 + 0.05, riser + 0.9],
          top: Point3 = [x, d / 2 - 0.05, h - riser + 0.9];
        parts.cylinder(x, bottom[1], riser, 0.02, 0.9, 'metal', 8);
        parts.cylinder(x, top[1], h - riser, 0.02, 0.9, 'metal', 8);
        parts.beam(bottom, top, 0.04, 0.04, 'metal');
      }
    },
  }),
  piece({
    id: 'stairQuarter',
    category: 'stairs',
    wall: false,
    params: [metres('width', [0.8, 0.9, 1.0]), choice('turn', ['right', 'left']), rise(), finish(STAIR_FINISHES)],
    defaults: { width: 0.9, turn: 'right', rise: 'auto', finish: 'oak' },
    resolve: resolveRise,
    size: (p) => {
      const { first, second } = quarterFlights(num(p, 'rise'));
      const w = num(p, 'width');
      return [w + second * TREAD, first * TREAD + w, num(p, 'rise')];
    },
    build: (parts, p, [W, D, h]) => {
      const { count: steps, riser } = stepsFor(h);
      const { first, second } = quarterFlights(h);
      const w = num(p, 'width');
      // climbing +y, then turning to the right (+x) or left (-x) on a landing
      const flip = str(p, 'turn') === 'left' ? -1 : 1;
      const X = (x: number) => flip * (x - W / 2);
      const Y = (y: number) => y - D / 2;
      const tread = (x0: number, x1: number, y0: number, y1: number, z: number) =>
        parts.box(Math.min(X(x0), X(x1)), Y(y0), z - 0.04, Math.abs(X(x1) - X(x0)), y1 - y0, 0.04, mat(p));
      for (let i = 0; i < first; i++) {
        tread(0, w, i * TREAD, (i + 1) * TREAD + 0.03, (i + 1) * riser);
      }
      const landing = first * TREAD;
      tread(0, w, landing, landing + w, (first + 1) * riser);
      for (let j = 0; j < second; j++) {
        tread(w + j * TREAD - 0.03, w + (j + 1) * TREAD, landing, landing + w, (first + 2 + j) * riser);
      }
      // a post under the landing, stringers under the flights
      parts.box(Math.min(X(0.02), X(0.12)), Y(landing + w - 0.12), 0, 0.1, 0.1, (first + 1) * riser - 0.04, mat(p));
      parts.beam([X(0.03), Y(0.05), riser * 0.5], [X(0.03), Y(landing), (first + 0.5) * riser], 0.05, 0.25, mat(p));
      parts.beam(
        [X(w), Y(landing + w - 0.03), (first + 1.5) * riser],
        [X(W - 0.02), Y(landing + w - 0.03), (steps - 1) * riser],
        0.05,
        0.25,
        mat(p),
      );
      // a handrail on the outside: along the first flight, round the landing, along the second
      const rail = 0.9;
      const points: Point3[] = [
        [X(0.03), Y(0.05), riser + rail],
        [X(0.03), Y(landing + w - 0.03), (first + 1) * riser + rail],
        [X(w), Y(landing + w - 0.03), (first + 1) * riser + rail],
        [X(W - 0.05), Y(landing + w - 0.03), (steps - 1) * riser + rail],
      ];
      for (let i = 0; i < points.length - 1; i++) {
        parts.beam(points[i], points[i + 1], 0.04, 0.04, 'metal');
      }
      for (const point of points) {
        parts.cylinder(point[0], point[1], point[2] - rail, 0.02, rail, 'metal', 8);
      }
    },
  }),
  piece({
    id: 'stairSpiral',
    category: 'stairs',
    wall: false,
    params: [metres('diameter', [1.2, 1.4, 1.6, 1.8, 2.0]), choice('turn', ['right', 'left']), rise(), finish(STAIR_FINISHES)],
    defaults: { diameter: 1.6, turn: 'right', rise: 'auto', finish: 'oak' },
    resolve: resolveRise,
    size: (p) => [num(p, 'diameter'), num(p, 'diameter'), num(p, 'rise')],
    build: (parts, p, [w, , h]) => {
      const { count: steps, riser } = stepsFor(h);
      const treads = steps - 1;
      const step = 330 / treads; // a little less than one turn: the exit lies above the start
      const sign = str(p, 'turn') === 'left' ? -1 : 1;
      const radius = w / 2 - 0.02;
      const at = (angle: number, r: number): [number, number] => {
        const radians = ((-90 + sign * angle) * Math.PI) / 180;
        return [Math.cos(radians) * r, Math.sin(radians) * r];
      };
      parts.cylinder(0, 0, 0, 0.06, h + 0.9, 'metal', 16);
      const tops: Point3[] = [];
      for (let i = 0; i < treads; i++) {
        const a = i * step,
          b = a + step + 2;
        const z = (i + 1) * riser;
        parts.prism([at(a, 0.05), at(a, radius), at((a + b) / 2, radius), at(b, radius), at(b, 0.05)], z - 0.04, 0.04, mat(p));
        const [x, y] = at(b - 3, radius - 0.03);
        parts.cylinder(x, y, z, 0.012, 0.9, 'metal', 6);
        tops.push([x, y, z + 0.9]);
      }
      for (let i = 0; i < tops.length - 1; i++) {
        parts.beam(tops[i], tops[i + 1], 0.035, 0.035, 'metal');
      }
    },
  }),
  piece({
    id: 'railing',
    category: 'stairs',
    wall: false,
    params: [metres('length', [1.0, 1.5, 2.0, 2.5, 3.0]), finish(['metal', 'black', 'white', 'oak'])],
    defaults: { length: 2.0, finish: 'metal' },
    size: (p) => [num(p, 'length'), 0.05, 1.0],
    build: (parts, p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, h - 0.04, w, d, 0.04, mat(p));
      parts.box(-w / 2, -0.01, 0.08, w, 0.02, 0.02, mat(p));
      const posts = Math.max(2, Math.round(w / 0.12) + 1);
      for (let i = 0; i < posts; i++) {
        const x = -w / 2 + 0.02 + (i * (w - 0.04)) / (posts - 1);
        parts.box(x - 0.01, -0.01, 0, 0.02, 0.02, h - 0.04, i === 0 || i === posts - 1 ? mat(p) : 'metal');
      }
    },
  }),

  // ---------------------------------------------------- extras
  piece({
    id: 'rug',
    category: 'extras',
    wall: false,
    params: [metres('width', [1.6, 2.0, 2.4]), metres('depth', [1.2, 1.6, 2.0])],
    defaults: { width: 2.0, depth: 1.6 },
    size: (p) => [num(p, 'width'), num(p, 'depth'), 0.012],
    build: (parts, _p, [w, d, h]) => parts.box(-w / 2, -d / 2, 0, w, d, h, 'rug'),
  }),
  piece({
    id: 'plant',
    category: 'extras',
    wall: false,
    params: [choice('plantSize', ['small', 'large'])],
    defaults: { plantSize: 'large' },
    size: (p) => (str(p, 'plantSize') === 'large' ? [0.6, 0.6, 1.5] : [0.35, 0.35, 0.6]),
    build: (parts, _p, [w, , h]) => {
      parts.cylinder(0, 0, 0, w * 0.32, h * 0.22, 'anthracite', 20);
      parts.cylinder(0, 0, h * 0.2, w * 0.3, 0.02, 'soil', 20);
      parts.cylinder(0, 0, h * 0.22, 0.015, h * 0.4, 'walnut', 6);
      parts.sphere(0, 0, h * 0.7, w * 0.45, 'plant');
      parts.sphere(w * 0.15, -w * 0.05, h * 0.55, w * 0.3, 'plant');
    },
  }),
  piece({
    id: 'pendantLamp',
    category: 'extras',
    mount: 'ceiling',
    wall: false,
    params: [],
    defaults: {},
    size: () => [0.4, 0.4, 0.9],
    build: (parts, _p, [, , h]) => {
      parts.cylinder(0, 0, h - 0.02, 0.06, 0.02, 'white', 16);
      parts.cylinder(0, 0, 0.25, 0.004, h - 0.27, 'black', 6);
      parts.cylinder(0, 0, 0, 0.2, 0.25, 'black', 28);
      parts.sphere(0, 0, 0.05, 0.06, 'lamp');
    },
  }),
  piece({
    id: 'picture',
    category: 'extras',
    mount: 'wall',
    params: [choice('format', ['portrait', 'landscape'])],
    defaults: { format: 'landscape' },
    size: (p) => (str(p, 'format') === 'portrait' ? [0.5, 0.03, 0.7] : [0.9, 0.03, 0.6]),
    elevation: () => 1.3,
    build: (parts, _p, [w, d, h]) => {
      parts.box(-w / 2, -d / 2, 0, w, d, h, 'black');
      parts.box(-w / 2 + 0.04, -d / 2 - 0.002, 0.04, w - 0.08, 0.002, h - 0.08, 'fabricBlue');
    },
  }),
  piece({
    id: 'coatRack',
    category: 'extras',
    wall: false,
    params: [],
    defaults: {},
    size: () => [0.5, 0.5, 1.8],
    build: (parts) => {
      parts.cylinder(0, 0, 0, 0.22, 0.03, 'black', 20);
      parts.cylinder(0, 0, 0.03, 0.02, 1.75, 'oak', 8);
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        parts.box(Math.cos(angle) * 0.06 - 0.06, Math.sin(angle) * 0.06 - 0.01, 1.65, 0.12, 0.02, 0.02, 'oak');
      }
    },
  }),
  piece({
    id: 'radiator',
    category: 'extras',
    mount: 'wall',
    params: [metres('width', [0.6, 1.0, 1.4])],
    defaults: { width: 1.0 },
    size: (p) => [num(p, 'width'), 0.1, 0.6],
    elevation: () => 0.12,
    build: (parts, _p, [w, d, h]) => {
      const fins = Math.round(w / 0.05);
      for (let i = 0; i < fins; i++) {
        parts.box(-w / 2 + i * (w / fins), -d / 2, 0, w / fins - 0.01, d, h, 'white');
      }
    },
  }),
];

/** one module of a kitchen run: base cabinet with worktop, the fronts by kind, a wall cabinet above */
const kitchenModule = (parts: Parts, x0: number, w: number, kind: string, front: MaterialId, wallCabinet: boolean) => {
  const d = 0.62;
  if (kind === 'tall') {
    carcass(parts, x0, w, 0.1, 2.1, d, front);
    parts.box(x0 + 0.01, -d / 2 + 0.05, 0, w - 0.02, d - 0.07, 0.1, 'black');
    fronts(parts, x0, w, 0.1, 0.8, 'doors', front, d);
    fronts(parts, x0, w, 0.9, 1.3, 'doors', front, d);
    return;
  }
  carcass(parts, x0, w, 0.1, 0.78, d, front);
  parts.box(x0 + 0.01, -d / 2 + 0.05, 0, w - 0.02, d - 0.07, 0.1, 'black');
  parts.box(x0, -d / 2 - 0.01, 0.88, w, d + 0.01, 0.04, 'worktop');
  if (kind === 'stove') {
    // oven with drawer, cooktop with four zones
    parts.box(x0 + 0.01, -d / 2, 0.12, w - 0.02, FRONT, 0.16, front);
    parts.box(x0 + 0.01, -d / 2, 0.3, w - 0.02, FRONT, 0.56, 'black');
    parts.box(x0 + 0.06, -d / 2 - 0.002, 0.4, w - 0.12, 0.002, 0.34, 'glass');
    parts.box(x0 + 0.03, -d / 2 + 0.05, 0.92, w - 0.06, d - 0.1, 0.005, 'black');
    for (const [dx, dy] of [
      [0.25, 0.3],
      [0.75, 0.3],
      [0.25, 0.7],
      [0.75, 0.7],
    ]) {
      parts.cylinder(x0 + dx * w, -d / 2 + dy * d, 0.925, 0.08, 0.002, 'anthracite', 20);
    }
  } else if (kind === 'sink') {
    fronts(parts, x0, w, 0.1, 0.78, 'doors', front, d);
    parts.box(x0 + w / 2 - 0.25, -d / 2 + 0.08, 0.9, 0.5, 0.4, 0.025, 'steel');
    parts.box(x0 + w / 2 - 0.012, d / 2 - 0.1, 0.92, 0.024, 0.024, 0.3, 'steel');
    parts.box(x0 + w / 2 - 0.012, d / 2 - 0.3, 1.2, 0.024, 0.22, 0.024, 'steel');
  } else if (kind === 'dishwasher') {
    parts.box(x0 + 0.002, -d / 2, 0.102, w - 0.004, FRONT, 0.776, front);
    handle(parts, x0 + w / 2, 0.8, d);
  } else {
    fronts(parts, x0, w, 0.1, 0.78, kind === 'drawers' ? 'drawers' : 'doors', front, d);
  }
  if (wallCabinet) {
    if (kind === 'stove') {
      // an extractor hood instead of a cabinet
      parts.box(x0 + 0.03, d / 2 - 0.5, 1.55, w - 0.06, 0.5, 0.08, 'steel');
      parts.box(x0 + w / 2 - 0.12, d / 2 - 0.3, 1.63, 0.24, 0.24, 0.57, 'steel');
    } else {
      // wall cabinets (0.37 deep) against the wall at the back
      const back = shifted(parts, d / 2 - 0.37 / 2);
      carcass(back, x0, w, 1.45, 0.75, 0.37, front);
      fronts(back, x0, w, 1.45, 0.75, 'doors', front, 0.37);
    }
  }
};

export const itemById = (id: string) => CATALOG.find((candidate) => candidate.id === id);

/** the parameters of a piece: its defaults, overridden by what is given (unknown keys are dropped) */
export const withDefaults = (item: CatalogItem, params: Params = {}): Params => {
  const result: Params = { ...item.defaults };
  for (const definition of item.params) {
    if (params[definition.key] !== undefined) {
      result[definition.key] = params[definition.key];
    }
  }
  return result;
};
