import type { PluginMesh } from '../../../src/plugins/types';

/**
 * Blockout: rooms, corridors and stairs on a grid of cells, built into one mesh the way level designers block out a
 * level – floors, walls and (where wanted) ceilings. Each piece fills the cells its rectangle covers. Between a room and
 * a corridor or stairs there is no wall (the corridor opens into the room); between two rooms, and towards empty
 * cells, there is. Doorways cut openings into walls. Walls are faces on the cells' edges (no thickness), facing the
 * inside; floors and ceilings are merged into as few rectangles as the cells allow. Pieces may lie above each other
 * (a room on the floor above another): a cell holds a stack of them, one per height they span – a piece only replaces
 * what it overlaps in height. Metres, Z up.
 */

export type BlockDirection = '+x' | '-x' | '+y' | '-y';

interface PieceBase {
  /** floor height (m) */
  floor: number;
  /** clear height above the floor (m) */
  height: number;
  /** a ceiling over it */
  ceiling?: boolean;
}

export interface RoomPiece extends PieceBase {
  kind: 'room';
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface CorridorPiece extends PieceBase {
  kind: 'corridor';
  from: [number, number];
  to: [number, number];
  width: number;
  /** which way it goes first when from and to are not in line (it bends once) */
  bend?: 'x' | 'y';
}

export interface StairsPiece extends PieceBase {
  kind: 'stairs';
  x: number;
  y: number;
  width: number;
  depth: number;
  /** how far it climbs from its floor (m) */
  rise: number;
  /** the way it goes up */
  direction: BlockDirection;
}

export type BlockPiece = RoomPiece | CorridorPiece | StairsPiece;

/** an opening cut into the walls: a door's middle on the floor, the way its wall runs, its width and height */
export interface Doorway {
  x: number;
  y: number;
  z: number;
  /** the direction its wall runs in (radians around z) */
  angle: number;
  width: number;
  height: number;
}

export interface BlockoutMaterials {
  floor: string;
  wall: string;
  ceiling: string;
  stairs: string;
}

/** the cell a piece leaves in the grid */
interface Cell {
  piece: number;
  kind: BlockPiece['kind'];
  floor: number;
  top: number;
  ceiling: boolean;
  /** corridors and stairs: the way they run – they open into rooms only at their ends */
  axis?: 'x' | 'y' | 'both';
}

const key = (column: number, row: number) => `${column},${row}`;

/** the rectangles a piece covers (a corridor that bends covers two) */
export const pieceRects = (piece: BlockPiece): [number, number, number, number][] => {
  if (piece.kind !== 'corridor') {
    return [[piece.x, piece.y, piece.x + piece.width, piece.y + piece.depth]];
  }
  const half = piece.width / 2;
  const [[ax, ay], [bx, by]] = [piece.from, piece.to];
  const segment = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] => [
    Math.min(x0, x1) - half,
    Math.min(y0, y1) - half,
    Math.max(x0, x1) + half,
    Math.max(y0, y1) + half,
  ];
  if (ax === bx || ay === by) {
    return [segment(ax, ay, bx, by)];
  }
  // one bend: along x first (or y), then the other way
  return piece.bend === 'y' ? [segment(ax, ay, ax, by), segment(ax, by, bx, by)] : [segment(ax, ay, bx, ay), segment(bx, ay, bx, by)];
};

/** do two cells overlap in height (touching does not count – a room on the floor above another)? */
const overlaps = (a: { floor: number; top: number }, b: { floor: number; top: number }) => a.floor < b.top - 1e-6 && b.floor < a.top - 1e-6;

/**
 * Which cells are filled by what – per cell a stack of the pieces above each other: corridors first, then rooms over
 * them, stairs over both (each replacing what it overlaps in height).
 */
const rasterise = (pieces: BlockPiece[], cell: number) => {
  const cells = new Map<string, Cell[]>();
  const order = (kind: BlockPiece['kind']) => (kind === 'corridor' ? 0 : kind === 'room' ? 1 : 2);
  const sorted = pieces.map((piece, index) => ({ piece, index })).sort((a, b) => order(a.piece.kind) - order(b.piece.kind));
  for (const { piece, index } of sorted) {
    const top = piece.floor + (piece.kind === 'stairs' ? piece.rise : 0) + piece.height;
    for (const [x0, y0, x1, y1] of pieceRects(piece)) {
      const axis: Cell['axis'] =
        piece.kind === 'room'
          ? undefined
          : piece.kind === 'stairs'
            ? piece.direction.endsWith('x')
              ? 'x'
              : 'y'
            : x1 - x0 > y1 - y0 + 1e-9
              ? 'x'
              : y1 - y0 > x1 - x0 + 1e-9
                ? 'y'
                : 'both';
      // the cells whose middle lies inside
      for (let column = Math.ceil(x0 / cell - 0.5); column + 0.5 <= x1 / cell; column++) {
        for (let row = Math.ceil(y0 / cell - 0.5); row + 0.5 <= y1 / cell; row++) {
          const stack = cells.get(key(column, row)) ?? [];
          const made: Cell = { piece: index, kind: piece.kind, floor: piece.floor, top, ceiling: !!piece.ceiling, axis };
          // where a corridor bends, its corner opens both ways
          if (stack.some((other) => other.piece === index && other.axis !== axis)) {
            made.axis = 'both';
          }
          cells.set(key(column, row), [...stack.filter((other) => !overlaps(other, made)), made]);
        }
      }
    }
  }
  return cells;
};

/** z intervals minus one interval */
const cut = (intervals: [number, number][], [z0, z1]: [number, number]) =>
  intervals.flatMap(([a, b]): [number, number][] => {
    if (z1 <= a || z0 >= b) {
      return [[a, b]];
    }
    return [...(z0 > a ? [[a, z0] as [number, number]] : []), ...(z1 < b ? [[z1, b] as [number, number]] : [])];
  });

/** z intervals sorted and joined where they touch */
const union = (intervals: [number, number][]) => {
  const sorted = intervals.filter(([z0, z1]) => z1 - z0 > 1e-6).sort((a, b) => a[0] - b[0]);
  const joined: [number, number][] = [];
  for (const [z0, z1] of sorted) {
    const last = joined[joined.length - 1];
    if (last && z0 <= last[1] + 1e-6) {
      last[1] = Math.max(last[1], z1);
    } else {
      joined.push([z0, z1]);
    }
  }
  return joined;
};
const cutAll = (intervals: [number, number][], away: [number, number][]) => away.reduce(cut, intervals);

/**
 * The walls on the edge between two neighbouring stacks of cells (`vertical`: an edge along y, between columns), as z
 * intervals with the side they face: −1 the cells before the edge, +1 those after it. Wherever a cell on one side
 * spans a height there is wall, except where it is open to a cell on the other side (the same piece, or a corridor
 * or stairs running into it) – so a step between different floors or tops stays, and a room on the floor above
 * another meets its own neighbours.
 */
const wallsBetween = (before: Cell[], after: Cell[], vertical: boolean): { facing: 1 | -1; intervals: [number, number][] }[] => {
  // a corridor or stairs opens into a room only at its ends – along its sides there is a wall
  const opensInto = (passage: Cell) => passage.axis === 'both' || (passage.axis === 'x') === vertical;
  const open = (a: Cell, b: Cell) =>
    a.piece === b.piece ||
    !(
      (a.kind === 'room' && b.kind === 'room') ||
      (a.kind === 'room' && !opensInto(b)) ||
      (b.kind === 'room' && !opensInto(a)) ||
      (a.kind === 'stairs' && b.kind !== 'room' && !opensInto(a)) ||
      (b.kind === 'stairs' && a.kind !== 'room' && !opensInto(b))
    );
  const spans = (stack: Cell[]) => union(stack.map((entry): [number, number] => [entry.floor, entry.top]));
  const openings = union(
    before.flatMap((a) =>
      after.filter((b) => open(a, b)).map((b): [number, number] => [Math.max(a.floor, b.floor), Math.min(a.top, b.top)]),
    ),
  );
  const walls = cutAll(union([...spans(before), ...spans(after)]), openings);
  // a wall faces the side whose cell it closes – where cells on both sides meet a closed wall, the side before it
  const afterOnly = cutAll(spans(after), spans(before));
  const facingAfter = union(
    walls.flatMap((wall) => afterOnly.map(([z0, z1]): [number, number] => [Math.max(wall[0], z0), Math.min(wall[1], z1)])),
  );
  return [
    { facing: -1 as const, intervals: cutAll(walls, facingAfter) },
    { facing: 1 as const, intervals: facingAfter },
  ].filter((wall) => wall.intervals.length);
};

/** rectangles of cells with the same value, merged greedily (rows first) */
const mergeCells = (cells: Map<string, number>) => {
  const rects: { column: number; row: number; columns: number; rows: number; value: number }[] = [];
  const done = new Set<string>();
  const sorted = [...cells.keys()]
    .map((name) => name.split(',').map(Number) as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [column, row] of sorted) {
    if (done.has(key(column, row))) {
      continue;
    }
    const value = cells.get(key(column, row))!;
    const same = (c: number, r: number) => !done.has(key(c, r)) && cells.get(key(c, r)) === value;
    let columns = 1;
    while (same(column + columns, row)) {
      columns++;
    }
    let rows = 1;
    while (Array.from({ length: columns }, (_, offset) => same(column + offset, row + rows)).every(Boolean)) {
      rows++;
    }
    for (let r = row; r < row + rows; r++) {
      for (let c = column; c < column + columns; c++) {
        done.add(key(c, r));
      }
    }
    rects.push({ column, row, columns, rows, value });
  }
  return rects;
};

/** the stairs' steps: boxes across its width, each one riser higher, climbing the way it goes up */
const stepsOf = (piece: StairsPiece, quad: (points: [number, number, number][], material: string) => void, material: string) => {
  const count = Math.max(1, Math.round(piece.rise / 0.18));
  const along = piece.direction.endsWith('x') ? piece.width : piece.depth;
  const tread = along / count,
    riser = piece.rise / count;
  const up = piece.direction.startsWith('+') ? 1 : -1;
  for (let step = 0; step < count; step++) {
    // the step's extent along the way up, from the low end
    const start = up > 0 ? step * tread : along - (step + 1) * tread;
    const z0 = piece.floor,
      z1 = piece.floor + (step + 1) * riser;
    const [x0, y0, x1, y1] = piece.direction.endsWith('x')
      ? [piece.x + start, piece.y, piece.x + start + tread, piece.y + piece.depth]
      : [piece.x, piece.y + start, piece.x + piece.width, piece.y + start + tread];
    // top, then the four sides (the bottom lies on the floor)
    quad(
      [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      material,
    );
    quad(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
      material,
    );
    quad(
      [
        [x1, y1, z0],
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
      ],
      material,
    );
    quad(
      [
        [x0, y1, z0],
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
      ],
      material,
    );
    quad(
      [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
      material,
    );
  }
};

/** the whole blockout as one mesh */
export const blockoutMesh = (pieces: BlockPiece[], cell: number, materials: BlockoutMaterials, doorways: Doorway[] = []): PluginMesh => {
  const mesh: PluginMesh = { vertices: [], faces: [], faceMaterials: [] };
  const quad = (points: [number, number, number][], material: string) => {
    const start = mesh.vertices.length;
    mesh.vertices.push(...points.map(([x, y, z]) => [round(x), round(y), round(z)] as [number, number, number]));
    mesh.faces.push(points.map((_, index) => start + index));
    mesh.faceMaterials!.push(material);
  };
  const cells = rasterise(pieces, cell);

  // floors and ceilings: rectangles of cells at the same height (stairs have steps instead of a floor) – per height,
  // so floors above each other are merged each on its own; a ceiling under the floor above is that floor
  const byHeight = (entries: [string, number][]) => {
    const heights = new Map<number, Map<string, number>>();
    for (const [name, z] of entries) {
      heights.set(z, (heights.get(z) ?? new Map<string, number>()).set(name, z));
    }
    return [...heights.values()].flatMap(mergeCells);
  };
  const floorCells: [string, number][] = [],
    ceilingCells: [string, number][] = [];
  for (const [name, stack] of cells) {
    for (const entry of stack) {
      if (entry.kind !== 'stairs') {
        floorCells.push([name, entry.floor]);
      }
      if (entry.ceiling && !stack.some((other) => other.kind !== 'stairs' && Math.abs(other.floor - entry.top) < 1e-6)) {
        ceilingCells.push([name, entry.top]);
      }
    }
  }
  for (const { column, row, columns, rows, value } of byHeight(floorCells)) {
    const [x0, y0, x1, y1] = [column * cell, row * cell, (column + columns) * cell, (row + rows) * cell];
    quad(
      [
        [x0, y0, value],
        [x1, y0, value],
        [x1, y1, value],
        [x0, y1, value],
      ],
      materials.floor,
    );
  }
  for (const { column, row, columns, rows, value } of byHeight(ceilingCells)) {
    const [x0, y0, x1, y1] = [column * cell, row * cell, (column + columns) * cell, (row + rows) * cell];
    quad(
      [
        [x0, y0, value],
        [x0, y1, value],
        [x1, y1, value],
        [x1, y0, value],
      ],
      materials.ceiling,
    );
  }

  // walls on the cells' edges: for each edge the intervals, then runs of edges with the same intervals merged
  type Run = { line: number; from: number; to: number; intervals: [number, number][]; facing: 1 | -1; vertical: boolean };
  const runs: Run[] = [];
  const opening = (vertical: boolean, line: number, along: number, intervals: [number, number][]) => {
    // the middle of the edge, and the doorways whose wall runs along it and which cover that middle
    const [mx, my] = vertical ? [line * cell, (along + 0.5) * cell] : [(along + 0.5) * cell, line * cell];
    let result = intervals;
    for (const door of doorways) {
      const dx = Math.cos(door.angle),
        dy = Math.sin(door.angle);
      const runsAlongY = Math.abs(dy) > Math.abs(dx);
      if (runsAlongY !== vertical) {
        continue;
      }
      const lengthwise = (mx - door.x) * dx + (my - door.y) * dy;
      const across = Math.abs(-(mx - door.x) * dy + (my - door.y) * dx);
      if (Math.abs(lengthwise) < door.width / 2 && across < cell / 2) {
        result = cut(result, [door.z, door.z + door.height]);
      }
    }
    return result;
  };
  const collect = (vertical: boolean) => {
    // vertical edges: x = line · cell between columns line − 1 and line; horizontal: y = line · cell between rows
    const lines = new Map<string, { line: number; along: number; intervals: [number, number][]; facing: 1 | -1 }[]>();
    const seen = new Set<string>();
    for (const name of cells.keys()) {
      const [column, row] = name.split(',').map(Number);
      for (const [line, along] of vertical
        ? [
            [column, row],
            [column + 1, row],
          ]
        : [
            [row, column],
            [row + 1, column],
          ]) {
        const edge = `${line},${along}`;
        if (seen.has(edge)) {
          continue;
        }
        seen.add(edge);
        const before = (vertical ? cells.get(key(line - 1, along)) : cells.get(key(along, line - 1))) ?? [];
        const after = (vertical ? cells.get(key(line, along)) : cells.get(key(along, line))) ?? [];
        for (const wall of wallsBetween(before, after, vertical)) {
          const intervals = opening(vertical, line, along, wall.intervals).filter(([z0, z1]) => z1 - z0 > 1e-6);
          if (!intervals.length) {
            continue;
          }
          // it faces the cell it belongs to: towards +x/+y when that cell lies after the edge
          const id = `${line},${wall.facing}`;
          lines.set(id, [...(lines.get(id) ?? []), { line, along, intervals, facing: wall.facing }]);
        }
      }
    }
    for (const entries of lines.values()) {
      entries.sort((a, b) => a.along - b.along);
      let run: Run | null = null;
      for (const entry of entries) {
        const same =
          run && run.to === entry.along && JSON.stringify(run.intervals) === JSON.stringify(entry.intervals) && run.facing === entry.facing;
        if (same) {
          run!.to = entry.along + 1;
        } else {
          run = { line: entry.line, from: entry.along, to: entry.along + 1, intervals: entry.intervals, facing: entry.facing, vertical };
          runs.push(run);
        }
      }
    }
  };
  collect(true);
  collect(false);
  for (const run of runs) {
    const at = run.line * cell,
      a = run.from * cell,
      b = run.to * cell;
    for (const [z0, z1] of run.intervals) {
      // counter-clockwise seen from the cell it faces
      const points: [number, number, number][] = run.vertical
        ? [
            [at, a, z0],
            [at, b, z0],
            [at, b, z1],
            [at, a, z1],
          ]
        : [
            [b, at, z0],
            [a, at, z0],
            [a, at, z1],
            [b, at, z1],
          ];
      quad(run.facing === 1 ? points : [...points].reverse(), materials.wall);
    }
  }

  for (const piece of pieces) {
    if (piece.kind === 'stairs') {
      stepsOf(piece, quad, materials.stairs);
    }
  }
  return mesh;
};

const round = (value: number) => Math.round(value * 10000) / 10000;

/** the floor height at a point – the highest floor of the pieces there (stairs climb along their way up), or null */
export const blockoutFloorAt = (pieces: BlockPiece[], x: number, y: number) => {
  let best: number | null = null;
  for (const piece of pieces) {
    for (const [x0, y0, x1, y1] of pieceRects(piece)) {
      if (x < x0 || x > x1 || y < y0 || y > y1) {
        continue;
      }
      let floor = piece.floor;
      if (piece.kind === 'stairs') {
        const share =
          piece.direction === '+x'
            ? (x - x0) / (x1 - x0)
            : piece.direction === '-x'
              ? (x1 - x) / (x1 - x0)
              : piece.direction === '+y'
                ? (y - y0) / (y1 - y0)
                : (y1 - y) / (y1 - y0);
        floor += Math.min(1, Math.max(0, share)) * piece.rise;
      }
      best = best == null ? floor : Math.max(best, floor);
    }
  }
  return best;
};
