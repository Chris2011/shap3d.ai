import { footprint, overlaps, type Footprint, type FurnitureData } from './furniture';
import type { RoomBox, Segment, WallSide } from './room';

/**
 * Where a piece goes while it follows the pointer: it turns its back to a wall it comes near (also a slanted or
 * curved one) and stands flush against it, its sides snap to straight walls and to the sides of other pieces,
 * otherwise it moves in whole centimetres and stays inside the room. The result also says what it collides
 * with and how far it is from what is around it.
 */

/** how close (m) a side has to come to snap */
const SNAP = 0.1;
/** pieces lower than this (m) are flat: rugs */
const FLAT = 0.05;
/** how far (m) beyond its own half size a piece "feels" a wall */
const WALL_REACH = 0.45;

export interface SnapInput {
  data: Pick<FurnitureData, 'size' | 'mount' | 'elevation'>;
  /** does it turn its back to walls (catalog: wall) */
  toWall: boolean;
  /** the pointer on the floor */
  x: number;
  y: number;
  /** its rotation away from walls (a piece being moved keeps its own) */
  rotation: number;
  /** extra quarter turns the user added (R) */
  turn: number;
  /** its height above the floor */
  z: number;
  /** the room it is in – it stays inside its box */
  room: RoomBox | null;
  /** the walls of all rooms */
  walls: Segment[];
  /** the other pieces */
  others: Footprint[];
  /** snapping off (Alt): only whole centimetres */
  free: boolean;
}

/** a line on the floor plan (x, y) – a snapped side or a measured distance */
export interface PlanLine {
  from: [number, number];
  to: [number, number];
  /** distance in metres for measurements */
  length?: number;
}

export interface SnapResult {
  x: number;
  y: number;
  rotation: number;
  box: Footprint;
  wall: WallSide | null;
  collides: boolean;
  guides: PlanLine[];
  distances: PlanLine[];
}

const centimetres = (value: number) => Math.round(value * 100) / 100;
const normalAngle = (degrees: number) => Math.round((((degrees % 360) + 360) % 360) * 100) / 100;
/** straight walls along x or y snap sides; slanted ones only turn and hold pieces */
const upright = (wall: Segment) => Math.abs(wall.normal[0]) > 0.999;
const lying = (wall: Segment) => Math.abs(wall.normal[1]) > 0.999;

export const snapPlacement = (input: SnapInput): SnapResult => {
  const { data, room } = input;
  let { x, y } = input;
  const [w, d] = data.size;

  // 1. near a wall (any wall the pointer is in front of): back to it, flush
  let nearest: { wall: Segment; inside: number; along: number } | null = null;
  if (input.toWall && !input.free) {
    for (const candidate of input.walls) {
      const along = (x - candidate.a[0]) * candidate.dir[0] + (y - candidate.a[1]) * candidate.dir[1];
      const inside = -((x - candidate.a[0]) * candidate.normal[0] + (y - candidate.a[1]) * candidate.normal[1]);
      if (along < -0.2 || along > candidate.length + 0.2 || inside < -0.05) {
        continue;
      }
      if (!nearest || inside < nearest.inside) {
        nearest = { wall: candidate, inside, along };
      }
    }
    if (nearest && data.mount !== 'wall' && nearest.inside >= Math.max(w, d) / 2 + WALL_REACH) {
      nearest = null;
    }
  }
  const wall = nearest?.wall ?? null;
  // its back (+y) to the wall: the wall's outward normal turned into a rotation
  const rotation = normalAngle((wall ? (Math.atan2(-wall.normal[0], wall.normal[1]) * 180) / Math.PI : input.rotation) + input.turn);
  if (wall && nearest) {
    const reach = (input.turn % 180 === 0 ? d : w) / 2;
    const along = Math.min(wall.length, Math.max(0, nearest.along));
    x = wall.a[0] + wall.dir[0] * along - wall.normal[0] * reach;
    y = wall.a[1] + wall.dir[1] * along - wall.normal[1] * reach;
  }
  let box = footprint(data.size, x, y, input.z, rotation);
  let halfX = (box.x1 - box.x0) / 2,
    halfY = (box.y1 - box.y0) / 2;
  // against a wall along x or y only the other axis is free; against a slanted one the piece stays where it is
  const lockedX = !!wall && (upright(wall) || !lying(wall)),
    lockedY = !!wall && (lying(wall) || !upright(wall));

  // 2. sides snap to straight walls and to the sides of others that are beside it
  const guides: PlanLine[] = [];
  const level = { z0: input.z, z1: input.z + data.size[2] };
  const near = (other: Footprint, axis: 'x' | 'y') =>
    other.z0 < level.z1 &&
    level.z0 < other.z1 &&
    (axis === 'x' ? other.y0 < y + halfY + 0.6 && y - halfY - 0.6 < other.y1 : other.x0 < x + halfX + 0.6 && x - halfX - 0.6 < other.x1);
  const snapAxis = (axis: 'x' | 'y') => {
    const centre = axis === 'x' ? x : y;
    const half = axis === 'x' ? halfX : halfY;
    const edges: number[] = [];
    for (const candidate of input.walls) {
      const crossing = axis === 'x' ? upright(candidate) : lying(candidate);
      const [from, to] = axis === 'x' ? [candidate.a[1], candidate.b[1]] : [candidate.a[0], candidate.b[0]];
      const [low, high] = axis === 'x' ? [y - halfY - 0.6, y + halfY + 0.6] : [x - halfX - 0.6, x + halfX + 0.6];
      if (crossing && Math.min(from, to) < high && low < Math.max(from, to)) {
        edges.push(axis === 'x' ? candidate.a[0] : candidate.a[1]);
      }
    }
    for (const other of input.others) {
      if (near(other, axis)) {
        edges.push(axis === 'x' ? other.x0 : other.y0, axis === 'x' ? other.x1 : other.y1);
      }
    }
    let best: { shift: number; edge: number } | null = null;
    for (const edge of edges) {
      for (const side of [centre - half, centre + half]) {
        const shift = edge - side;
        if (Math.abs(shift) < SNAP && (!best || Math.abs(shift) < Math.abs(best.shift))) {
          best = { shift, edge };
        }
      }
    }
    if (!best) {
      return centimetres(centre);
    }
    const along = axis === 'x' ? [y - halfY - 0.3, y + halfY + 0.3] : [x - halfX - 0.3, x + halfX + 0.3];
    guides.push(
      axis === 'x'
        ? { from: [best.edge, along[0]], to: [best.edge, along[1]] }
        : { from: [along[0], best.edge], to: [along[1], best.edge] },
    );
    return centre + best.shift;
  };
  if (!input.free) {
    if (!lockedX) {
      x = snapAxis('x');
    }
    if (!lockedY) {
      y = snapAxis('y');
    }
  } else {
    x = centimetres(x);
    y = centimetres(y);
  }

  // 3. inside the room's box (when it fits) – a piece against a wall stays where the wall holds it
  if (room && !wall) {
    if (room.x1 - room.x0 >= 2 * halfX) {
      x = Math.min(room.x1 - halfX, Math.max(room.x0 + halfX, x));
    }
    if (room.y1 - room.y0 >= 2 * halfY) {
      y = Math.min(room.y1 - halfY, Math.max(room.y0 + halfY, y));
    }
  }

  box = footprint(data.size, x, y, input.z, rotation);
  halfX = (box.x1 - box.x0) / 2;
  halfY = (box.y1 - box.y0) / 2;
  return {
    x,
    y,
    rotation,
    box,
    wall: wall?.side ?? null,
    // flat things (rugs) lie under others – they collide with nothing
    collides: data.size[2] >= FLAT && input.others.some((other) => other.z1 - other.z0 >= FLAT && overlaps(box, other)),
    guides,
    distances: clearances(box, input.walls, input.others),
  };
};

/**
 * How far a piece is from what is around it – to the left, right, front and back: the nearest straight wall or
 * piece (at the same height) whose side faces it. Only distances above 1 cm.
 */
export const clearances = (box: Footprint, walls: Segment[], others: Footprint[]): PlanLine[] => {
  const result: PlanLine[] = [];
  const midX = (box.x0 + box.x1) / 2,
    midY = (box.y0 + box.y1) / 2;
  const sameLevel = others.filter((other) => other.z1 - other.z0 >= FLAT && other.z0 < box.z1 && box.z0 < other.z1);
  const facingX = sameLevel.filter((other) => other.y0 < box.y1 && box.y0 < other.y1);
  const facingY = sameLevel.filter((other) => other.x0 < box.x1 && box.x0 < other.x1);
  // the walls facing the piece: upright ones beside it (left, right), lying ones in front and behind
  const wallsX = walls
    .filter((wall) => upright(wall) && Math.min(wall.a[1], wall.b[1]) < box.y1 && box.y0 < Math.max(wall.a[1], wall.b[1]))
    .map((wall) => wall.a[0]);
  const wallsY = walls
    .filter((wall) => lying(wall) && Math.min(wall.a[0], wall.b[0]) < box.x1 && box.x0 < Math.max(wall.a[0], wall.b[0]))
    .map((wall) => wall.a[1]);
  const left = Math.max(
    ...wallsX.filter((value) => value <= box.x0 + 0.001),
    ...facingX.filter((other) => other.x1 <= box.x0 + 0.001).map((other) => other.x1),
  );
  const right = Math.min(
    ...wallsX.filter((value) => value >= box.x1 - 0.001),
    ...facingX.filter((other) => other.x0 >= box.x1 - 0.001).map((other) => other.x0),
  );
  const front = Math.max(
    ...wallsY.filter((value) => value <= box.y0 + 0.001),
    ...facingY.filter((other) => other.y1 <= box.y0 + 0.001).map((other) => other.y1),
  );
  const back = Math.min(
    ...wallsY.filter((value) => value >= box.y1 - 0.001),
    ...facingY.filter((other) => other.y0 >= box.y1 - 0.001).map((other) => other.y0),
  );
  const add = (from: [number, number], to: [number, number]) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (Number.isFinite(length) && length > 0.01) {
      result.push({ from, to, length });
    }
  };
  add([left, midY], [box.x0, midY]);
  add([box.x1, midY], [right, midY]);
  add([midX, front], [midX, box.y0]);
  add([midX, box.y1], [midX, back]);
  return result;
};
