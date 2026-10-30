import type { BlockPiece } from './blockout';
import { randomGenerator } from './noise';

/**
 * Floor plans from a seed: rooms of random size spread over an area without touching, linked by corridors – every
 * room reached (the shortest network that links them all) plus a few more links for loops – each corridor bending
 * once. Plain blockout pieces, metres; sizes and places on whole metres so corridors meet the grid. The start room
 * lies nearest the area's corner, the end room is the one furthest from it along the links.
 */

export interface FloorplanOptions {
  /** how many rooms */
  rooms: number;
  /** the side of the square area they spread over (m) */
  size: number;
  /** a room's sides between these (m) */
  minRoom: number;
  maxRoom: number;
  /** corridor width (m) */
  corridor: number;
  /** room height (m) */
  height: number;
  ceiling: boolean;
  /** 0 … 1: share of extra links for loops */
  loops: number;
  seed: number;
}

export const FLOORPLAN_DEFAULTS: FloorplanOptions = {
  rooms: 8,
  size: 48,
  minRoom: 5,
  maxRoom: 11,
  corridor: 2,
  height: 3,
  ceiling: false,
  loops: 0.2,
  seed: 1,
};

export interface FloorplanRoom {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface Floorplan {
  rooms: FloorplanRoom[];
  /** pairs of room indices a corridor links */
  links: [number, number][];
  pieces: BlockPiece[];
  /** the room the player starts in, and the one furthest from it */
  start: number;
  end: number;
  /** how many links each room is from the start */
  depth: number[];
}

export const roomCentre = (room: FloorplanRoom): [number, number] => [room.x + room.width / 2, room.y + room.depth / 2];

export const generateFloorplan = (given: Partial<FloorplanOptions> = {}): Floorplan => {
  const options = { ...FLOORPLAN_DEFAULTS, ...given };
  const random = randomGenerator(options.seed + 0.37);
  const count = Math.max(1, Math.round(options.rooms));
  const gap = options.corridor + 2;
  const whole = (value: number) => Math.max(1, Math.round(value));

  // rooms: random size and place, kept apart so a corridor fits between them
  const rooms: FloorplanRoom[] = [];
  for (let attempt = 0; attempt < count * 60 && rooms.length < count; attempt++) {
    const width = whole(options.minRoom + random() * (options.maxRoom - options.minRoom)),
      depth = whole(options.minRoom + random() * (options.maxRoom - options.minRoom));
    const x = Math.floor(random() * Math.max(1, options.size - width)),
      y = Math.floor(random() * Math.max(1, options.size - depth));
    const apart = rooms.every(
      (other) =>
        x + width + gap <= other.x || other.x + other.width + gap <= x || y + depth + gap <= other.y || other.y + other.depth + gap <= y,
    );
    if (apart) {
      rooms.push({ x, y, width, depth });
    }
  }

  // links: the shortest network that reaches every room (Prim), then the shortest other pairs for loops
  const distance = (a: number, b: number) => {
    const [ax, ay] = roomCentre(rooms[a]),
      [bx, by] = roomCentre(rooms[b]);
    return Math.abs(ax - bx) + Math.abs(ay - by);
  };
  const links: [number, number][] = [];
  const reached = new Set<number>(rooms.length ? [0] : []);
  while (reached.size < rooms.length) {
    let best: [number, number] | null = null;
    for (const from of reached) {
      for (let to = 0; to < rooms.length; to++) {
        if (!reached.has(to) && (!best || distance(from, to) < distance(best[0], best[1]))) {
          best = [from, to];
        }
      }
    }
    links.push(best!);
    reached.add(best![1]);
  }
  const linked = (a: number, b: number) => links.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  const others: [number, number][] = [];
  for (let a = 0; a < rooms.length; a++) {
    for (let b = a + 1; b < rooms.length; b++) {
      if (!linked(a, b)) {
        others.push([a, b]);
      }
    }
  }
  others.sort((p, q) => distance(...p) - distance(...q));
  links.push(...others.slice(0, Math.round(options.loops * rooms.length)));

  // start: the room nearest the corner; end: the most links away from it (ties: the furthest)
  const start = rooms.reduce((best, room, index) => (room.x + room.y < rooms[best].x + rooms[best].y ? index : best), 0);
  const depth = rooms.map(() => Infinity);
  const queue = [start];
  depth[start] = 0;
  while (queue.length) {
    const room = queue.shift()!;
    for (const [a, b] of links) {
      const next = a === room ? b : b === room ? a : -1;
      if (next >= 0 && depth[next] === Infinity) {
        depth[next] = depth[room] + 1;
        queue.push(next);
      }
    }
  }
  const end = rooms.reduce(
    (best, _, index) =>
      depth[index] > depth[best] || (depth[index] === depth[best] && distance(start, index) > distance(start, best)) ? index : best,
    start,
  );

  const pieces: BlockPiece[] = [
    ...links.map(([a, b]): BlockPiece => ({
      kind: 'corridor',
      from: roomCentre(rooms[a]),
      to: roomCentre(rooms[b]),
      width: options.corridor,
      bend: random() < 0.5 ? 'x' : 'y',
      floor: 0,
      height: Math.min(options.height, 3),
      ceiling: options.ceiling,
    })),
    ...rooms.map((room): BlockPiece => ({ kind: 'room', ...room, floor: 0, height: options.height, ceiling: options.ceiling })),
  ];
  return { rooms, links, pieces, start, end, depth };
};
