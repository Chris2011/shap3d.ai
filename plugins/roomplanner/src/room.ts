import type { Definition, Instance } from '../../../src/core/model';
import type { PolyhedronFace, ScriptApi } from '../../../src/scripting/api';
import type { Point3 } from './catalog';
import { FINISHES } from './materials';
import {
  ceilingHeight,
  clipPolygon,
  cornersOf,
  edgesOf,
  levelsOf,
  outerCorners,
  pointInPolygon,
  polygonArea,
  polygonOf,
  rectPolygon,
  segmentsOf,
  slopeDistance,
  slopePlane,
  WALL_SIDES,
  type Corner,
  type Edge,
  type Level,
  type PlanCorner,
  type Point2,
  type Rect,
  type Segment,
  type Shape,
  type Slope,
  type WallSide,
} from './outline';
import { convexSolid, usePartsOf } from './parts';
import { pluginContext, t } from './runtime';
import { usePlannerState } from './state';

export * from './outline';

/**
 * Rooms: floor and walls around a floor plan – a rectangle, an L or any polygon with slanted and round walls –
 * with doors and windows. The top floor may have sloped ceilings on several sides (shed, gable or hip roof) with
 * roof windows; a maisonette has an upper floor with a stairwell (square or round). Every room is one group
 * with its data on it: saved with the model, rebuilt when it changes. A model may hold several rooms side by side.
 */

export interface Opening {
  id: string;
  kind: 'door' | 'window';
  /** the wall: its number along the outline (0 = the front wall, counter-clockwise); old rooms: a side */
  wall: number | WallSide;
  /** from the wall's start corner to the opening, m */
  offset: number;
  width: number;
  height: number;
  /** height of the window sill (doors: 0) */
  sill: number;
  /** 0 = lower floor, 1 = upper floor */
  level?: number;
}

/** a window in a sloped ceiling: its middle (room coordinates) and its size in plan */
export interface RoofWindow {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface Stairwell extends Rect {
  /** round (an ellipse in the rectangle) – for spiral stairs */
  round?: boolean;
}

export type FloorId = 'floor' | 'tiles' | 'concrete' | 'carpet';

export interface RoomData {
  kind: 'room';
  /** which room of the model (several may stand side by side) */
  id?: string;
  name?: string;
  width: number;
  depth: number;
  /** height of the (lower) room */
  height: number;
  /** wall thickness */
  wall: number;
  floor: FloorId;
  openings: Opening[];
  shape?: Shape;
  /** an L: this corner is cut out (width along x, depth along y) */
  notch?: { corner: Corner; width: number; depth: number } | null;
  /** a free floor plan: its corners (counter-clockwise), walls may bulge */
  points?: PlanCorner[];
  /** sloped ceilings on the top floor – one (shed), two opposite (gable) or all four (hip) */
  slopes?: Slope[];
  /** older rooms: a single slope */
  slope?: Slope | null;
  roofWindows?: RoofWindow[];
  /** a maisonette: an upper floor of this height over a slab, with a stairwell in it (room coordinates) */
  upper?: { height: number; slab: number; stairwell: Stairwell } | null;
  /** the tags the walls are on (named in the language the room was built in) – to show and hide them */
  tags?: Record<string, string>;
  /** the walls' material per side and the sloped ceilings' – made see-through towards the camera */
  materials?: Record<string, string>;
}

/** s3d.room options: the room data, and where its front left corner goes */
export type RoomInput = Partial<RoomData> & { at?: [number, number] };

export const DEFAULT_ROOM: RoomData = { kind: 'room', width: 5, depth: 4, height: 2.5, wall: 0.2, floor: 'floor', openings: [] };
export const DEFAULT_UPPER = { height: 2.4, slab: 0.25, stairwell: { x: 0.3, y: 0.3, w: 1.0, d: 2.8, round: false } };
export const DEFAULT_SLOPE: Slope = { side: 'north', knee: 1.0, depth: 2.0 };

// ------------------------------------------------------------ the rooms in the model
/** a room in world coordinates (its group may have been moved) */
export interface RoomBox {
  id: string;
  /** the bounding box of the inner floor plan */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z: number;
  height: number;
  data: RoomData;
  instance: Instance;
  /** the straight pieces of the walls' inner lines */
  walls: Segment[];
  /** the walls as drawn (bulging ones as chords) */
  edges: Edge[];
  /** the floor plan as a polygon */
  polygon: Point2[];
  /** floor heights (world) and room heights */
  levels: Level[];
}

const isRoom = (definition: Definition) => (pluginContext().data.get<{ kind?: string }>(definition)?.kind ?? '') === 'room';

const shift = <T extends { a: Point2; b: Point2 }>(item: T, ox: number, oy: number): T => ({
  ...item,
  a: [item.a[0] + ox, item.a[1] + oy],
  b: [item.b[0] + ox, item.b[1] + oy],
});

/** all rooms of the model (top level) */
export const findRooms = (): RoomBox[] =>
  [...pluginContext().editor.model.root.instances.values()]
    .filter((instance) => isRoom(instance.definition))
    .map((instance, index) => {
      const data = normalizeRoom(pluginContext().data.get<RoomData>(instance.definition)!, index);
      const at = instance.matrix.elements;
      const [ox, oy, oz] = [at[12], at[13], at[14]];
      return {
        id: data.id!,
        x0: ox,
        y0: oy,
        x1: ox + data.width,
        y1: oy + data.depth,
        z: oz,
        height: data.height,
        data,
        instance,
        walls: segmentsOf(data).map((segment) => shift(segment, ox, oy)),
        edges: edgesOf(data).map((wall) => shift(wall, ox, oy)),
        polygon: polygonOf(data).map(([x, y]): Point2 => [x + ox, y + oy]),
        levels: levelsOf(data).map((level) => ({ ...level, z: level.z + oz })),
      };
    });

/** the room that is worked on (chosen in the panel) – else the first one */
export const findRoom = (): RoomBox | null => {
  const rooms = findRooms();
  const chosen = usePlannerState().roomId;
  return rooms.find((room) => room.id === chosen) ?? rooms[0] ?? null;
};

/** the room a point lies in (its floor plan) – else the one worked on */
export const roomAt = (x: number, y: number): RoomBox | null => {
  const rooms = findRooms();
  return rooms.find((room) => pointInPolygon(room.polygon, x, y)) ?? findRoom();
};

/**
 * Older rooms named their walls by side and measured north and west walls from the west and south, had one
 * slope and no id – this brings them up to date. A free floor plan is moved so its box starts at (0, 0).
 */
export const normalizeRoom = (input: RoomData, index = 0): RoomData => {
  let room: RoomData = { ...input, id: input.id ?? `room${index + 1}` };
  if (room.slope && !room.slopes) {
    room = { ...room, slopes: [room.slope] };
  }
  delete room.slope;
  if (room.shape === 'polygon' && room.points?.length) {
    const xs = room.points.map((point) => point.x),
      ys = room.points.map((point) => point.y);
    const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
    room = {
      ...room,
      points: room.points.map((point) => ({ ...point, x: point.x - minX, y: point.y - minY })),
      width: Math.max(...xs) - minX,
      depth: Math.max(...ys) - minY,
    };
  }
  const edges = edgesOf(room);
  const openings = room.openings.map((opening) => {
    if (typeof opening.wall === 'number') {
      return opening;
    }
    const wall = edges.find((candidate) => candidate.side === opening.wall) ?? edges[0];
    const flipped = opening.wall === 'north' || opening.wall === 'west';
    return { ...opening, wall: wall.index, offset: flipped ? wall.length - opening.offset - opening.width : opening.offset };
  });
  return { ...room, openings };
};

/** a floor of tiles, concrete … – as finishes of their own */
const FLOORS: Record<FloorId, { color: string; texture?: string; size?: number }> = {
  floor: FINISHES.floor,
  tiles: { color: '#d9d6cf', texture: 'fliesen', size: 0.6 },
  concrete: { color: '#a9a8a3', texture: 'beton', size: 2 },
  carpet: { color: '#8f8a83', texture: 'stoff', size: 0.5 },
};

export const roomName = (room: RoomData, index = 0) => room.name || t('roomplanner.room.numbered', { number: index + 1 });

/** the tags of a room: per level and side, the sloped ceiling and the upper floor */
const tagNames = (room: RoomData): Record<string, string> => {
  const names: Record<string, string> = {};
  const levels = levelsOf(room);
  const name = roomName(room);
  levels.forEach((_, level) => {
    for (const side of WALL_SIDES) {
      const sideName = t(`roomplanner.walls.${side}`);
      names[`${level}:${side}`] =
        levels.length > 1
          ? t('roomplanner.tags.levelWall', { room: name, level: t(`roomplanner.levels.${level}`), side: sideName })
          : t('roomplanner.tags.wall', { room: name, side: sideName });
    }
  });
  names.upper = t('roomplanner.tags.upper', { room: name });
  names.ceiling = t('roomplanner.tags.ceiling', { room: name });
  return names;
};

/**
 * A slab between two rings of points (bottom and top, counter-clockwise from above) with holes – floors,
 * the floor between two levels, sloped ceilings. Faces are turned by hand: the outline may be concave.
 */
const slabSolid = (bottom: Point3[], top: Point3[], holes: { bottom: Point3[]; top: Point3[] }[]) => {
  const vertices: Point3[] = [...bottom, ...top];
  const count = bottom.length;
  const ring = (start: number, length: number) => Array.from({ length }, (_, i) => start + i);
  const holeRings = holes.map((hole) => {
    const start = vertices.length;
    vertices.push(...hole.bottom, ...hole.top);
    return { bottom: ring(start, hole.bottom.length), top: ring(start + hole.bottom.length, hole.top.length) };
  });
  const faces: PolyhedronFace[] = [
    { outer: ring(0, count).reverse(), holes: holeRings.map((hole) => hole.bottom) },
    { outer: ring(count, count), holes: holeRings.map((hole) => [...hole.top].reverse()) },
    ...ring(0, count).map((i) => [i, (i + 1) % count, count + ((i + 1) % count), count + i]),
  ];
  for (const hole of holeRings) {
    const length = hole.bottom.length;
    for (let i = 0; i < length; i++) {
      const next = (i + 1) % length;
      faces.push([hole.bottom[next], hole.bottom[i], hole.top[i], hole.top[next]]);
    }
  }
  return { vertices, faces };
};

/**
 * Builds a room into the script API's current entities (inside s3d.room – one undo step). The room with the
 * same id (without one: the room worked on) is replaced and stays where it was, unless `at` moves it.
 */
export const buildRoom = (api: ScriptApi, input: RoomInput) => {
  const context = pluginContext();
  const rooms = findRooms();
  const old = input.id ? rooms.find((candidate) => candidate.id === input.id) : findRoom();
  const id = input.id ?? old?.id ?? `room${Date.now().toString(36)}`;
  const room = normalizeRoom({ ...DEFAULT_ROOM, ...input, kind: 'room', id, openings: input.openings ?? [] } as RoomData);
  delete (room as RoomInput).at;
  const placement = old ? old.instance.matrix.clone() : null;
  if (old) {
    context.editor.model.root.instances.delete(old.instance.id);
  }
  const floorName = t(`roomplanner.floors.${room.floor}`);
  const floor = FLOORS[room.floor];
  api.material(floorName, floor.color, { texture: floor.texture, size: floor.size });
  const parts = usePartsOf(api);
  const tags = tagNames(room);
  // a material per side (and one for the sloped ceilings): the walls towards the camera become see-through
  const materials: Record<string, string> = Object.fromEntries([
    ...WALL_SIDES.map((side) => [side, t('roomplanner.materials.wallSide', { side: t(`roomplanner.walls.${side}`) })]),
    ['ceiling', t('roomplanner.materials.ceiling')],
  ]);
  for (const name of Object.values(materials)) {
    api.material(name, FINISHES.wall.color);
  }
  const solidOf = ({ vertices, faces }: { vertices: Point3[]; faces: number[][] }, material: string) =>
    api.group(material, () => api.polyhedron(vertices, faces, { material }));
  const levels = levelsOf(room);
  const segments = segmentsOf(room);
  const outer = outerCorners(segments, room.wall);
  const plan = polygonOf(room);
  const slopes = room.slopes ?? [];
  const tagNew = (before: Set<number>, key: string) => {
    for (const [instanceId, instance] of api.ents.instances) {
      if (!before.has(instanceId)) {
        instance.tag = api.ensureTag(tags[key]);
      }
    }
  };
  const slab = (polygon: Point2[], z0: (x: number, y: number) => number, thickness: number, holes: Point2[][], material: string) => {
    const lift = (points: Point2[], extra: number) => points.map(([x, y]): Point3 => [x, y, z0(x, y) + extra]);
    const { vertices, faces } = slabSolid(
      lift(polygon, 0),
      lift(polygon, thickness),
      holes.map((hole) => ({ bottom: lift(hole, 0), top: lift(hole, thickness) })),
    );
    api.group(material, () => api.polyhedron(vertices, faces, { material }));
  };

  const group = api.group(roomName(room, rooms.indexOf(old!) >= 0 ? rooms.indexOf(old!) : rooms.length), () => {
    slab(plan, () => -0.02, 0.02, [], floorName);
    // the floor between the levels, with the stairwell left open
    if (room.upper) {
      const before = new Set(api.ents.instances.keys());
      slab(plan, () => room.height, room.upper.slab, [rectPolygon(room.upper.stairwell, room.upper.stairwell.round)], floorName);
      tagNew(before, 'upper');
    }
    levels.forEach((level, levelIndex) => {
      const top = levelIndex === levels.length - 1;
      // the lower walls reach up to the upper floor, so the outside is closed
      const wallTop = top ? level.z + level.height : levels[levelIndex + 1].z;
      segments.forEach((segment, i) => {
        const before = new Set(api.ents.instances.keys());
        const point = (s: number): Point2 => [segment.a[0] + segment.dir[0] * s, segment.a[1] + segment.dir[1] * s];
        /** the top of the wall at s along it: under the slopes or the full height */
        const topAt = (s: number) =>
          top ? level.z + ceilingHeight(room, levelIndex, ...point(Math.min(segment.length, Math.max(0, s)))) : wallTop;
        // the outer line: mitred at the corners, straight out in between
        const outerAt = (s: number): Point2 =>
          s <= 0.0005
            ? outer[i]
            : s >= segment.length - 0.0005
              ? outer[(i + 1) % segments.length]
              : [point(s)[0] + segment.normal[0] * room.wall, point(s)[1] + segment.normal[1] * room.wall];
        const piece = (a: number, b: number, z0: number, z1: number | null) => {
          if (b - a < 0.001) {
            return;
          }
          // under slopes the top follows the ceiling – sampled, so ridges and the ends of slopes are kept
          const stops = [a];
          if (top && slopes.length && z1 === null) {
            for (let s = a + 0.1; s < b - 0.05; s += 0.1) {
              stops.push(s);
            }
            for (const slope of slopes) {
              const u0 = slopeDistance(room, slope.side, ...point(0)),
                u1 = slopeDistance(room, slope.side, ...point(segment.length));
              const s = Math.abs(u1 - u0) > 1e-6 ? ((slope.depth - u0) / (u1 - u0)) * segment.length : NaN;
              if (s > a + 0.001 && s < b - 0.001) {
                stops.push(s);
              }
            }
            stops.sort((p, q) => p - q);
          }
          stops.push(b);
          const profile: [number, number][] = stops.map((s) => [s, z1 === null ? Math.max(z0 + 0.005, topAt(s)) : z1]);
          if (profile.every(([, z]) => z - z0 < 0.005)) {
            return;
          }
          // the face against the room: along the bottom, back along the top
          const loop = [[a, z0] as [number, number], [b, z0] as [number, number], ...[...profile].reverse()];
          const vertices: Point3[] = [
            ...loop.map(([s, z]): Point3 => [...point(s), z]),
            ...loop.map(([s, z]): Point3 => [...outerAt(s), z]),
          ];
          const count = loop.length;
          const faces = [
            loop.map((_, k) => k),
            loop.map((_, k) => count + k),
            ...loop.map((_, k) => [k, (k + 1) % count, count + ((k + 1) % count), count + k]),
          ];
          solidOf(convexSolid(vertices, faces), materials[segment.side]);
        };
        const openings = segment.curved
          ? []
          : room.openings
              .filter((opening) => opening.wall === segment.edge && (opening.level ?? 0) === levelIndex)
              .sort((p, q) => p.offset - q.offset);
        let position = 0;
        for (const opening of openings) {
          const from = Math.max(position, opening.offset),
            to = Math.min(segment.length, opening.offset + opening.width);
          if (to <= from) {
            continue;
          }
          piece(position, from, level.z, null);
          piece(from, to, level.z, level.z + opening.sill);
          piece(from, to, level.z + opening.sill + opening.height, null);
          openingFrame(parts, segment, from, to, { ...opening, sill: level.z + opening.sill }, room.wall);
          position = to;
        }
        piece(position, segment.length, level.z, null);
        tagNew(before, `${levelIndex}:${segment.side}`);
      });
    });
    // sloped ceilings: each slope where it is the lowest, with its roof windows
    if (slopes.length) {
      const before = new Set(api.ents.instances.keys());
      const level = levels[levels.length - 1];
      slopes.forEach((slope, i) => {
        const plane = slopePlane(room, slope, level.height);
        let area = clipPolygon(plan, (x, y) => slopeDistance(room, slope.side, x, y) - slope.depth);
        slopes.forEach((other, j) => {
          if (j !== i) {
            const otherPlane = slopePlane(room, other, level.height);
            area = clipPolygon(area, (x, y) => plane(x, y) - otherPlane(x, y));
          }
        });
        if (area.length < 3 || polygonArea(area) < 0.01) {
          return;
        }
        const windows = (room.roofWindows ?? []).filter((window) => pointInPolygon(area, window.x, window.y));
        const holes = windows.map((window) =>
          rectPolygon({ x: window.x - window.w / 2, y: window.y - window.d / 2, w: window.w, d: window.d }),
        );
        slab(area, (x, y) => level.z + plane(x, y), 0.1, holes, materials.ceiling);
        // the windows: glass in a frame along the slope
        for (const hole of holes) {
          const lifted = hole.map(([x, y]): Point3 => [x, y, level.z + plane(x, y) + 0.05]);
          slab(hole, (x, y) => level.z + plane(x, y) + 0.04, 0.02, [], parts.material('glass'));
          lifted.forEach((corner, k) => parts.beam(corner, lifted[(k + 1) % lifted.length], 0.06, 0.12, 'white'));
        }
      });
      tagNew(before, 'ceiling');
    }
  });
  if (placement) {
    group.inst.matrix.copy(placement);
  }
  if (input.at) {
    group.inst.matrix.setPosition(input.at[0], input.at[1], group.inst.matrix.elements[14]);
  }
  context.data.set(group.inst.definition, { ...room, tags, materials });
  return group;
};

/** frame, glass or door leaf of an opening, in the middle of the wall */
const openingFrame = (
  parts: ReturnType<typeof usePartsOf>,
  wall: Segment,
  from: number,
  to: number,
  opening: Opening,
  thickness: number,
) => {
  const frame = 0.05;
  const z0 = opening.sill,
    z1 = opening.sill + opening.height;
  // along the wall from a by length, across it (outwards) from across0 by across – a box turned with the wall
  const box = (a: number, across0: number, z: number, length: number, across: number, height: number, material: 'white' | 'glass') => {
    const corner = (s: number, n: number): [number, number] => [
      wall.a[0] + wall.dir[0] * s + wall.normal[0] * n,
      wall.a[1] + wall.dir[1] * s + wall.normal[1] * n,
    ];
    parts.prism(
      [corner(a, across0), corner(a + length, across0), corner(a + length, across0 + across), corner(a, across0 + across)],
      z,
      height,
      material,
    );
  };
  const middle = thickness / 2 - 0.035;
  box(from, middle, z0, frame, 0.07, opening.height, 'white');
  box(to - frame, middle, z0, frame, 0.07, opening.height, 'white');
  box(from + frame, middle, z1 - frame, to - from - 2 * frame, 0.07, frame, 'white');
  if (opening.kind === 'window') {
    box(from + frame, middle, z0, to - from - 2 * frame, 0.07, frame, 'white');
    box(from + frame, thickness / 2 - 0.005, z0 + frame, to - from - 2 * frame, 0.01, opening.height - 2 * frame, 'glass');
    if (to - from > 1) {
      box((from + to) / 2 - frame / 2, middle, z0 + frame, frame, 0.07, opening.height - 2 * frame, 'white');
    }
  } else {
    // the door leaf, closed
    box(from + frame, thickness / 2 - 0.02, z0, to - from - 2 * frame, 0.04, opening.height - frame, 'white');
  }
};

// ------------------------------------------------------------ figures
/**
 * Floor area, living area (as in German rules: under 1 m ceiling height not at all, 1–2 m half), perimeter,
 * wall area and volume – over all levels; the stairwell does not count on the upper floor.
 */
export const roomFigures = (room: RoomData) => {
  const levels = levelsOf(room);
  const plan = polygonOf(room);
  const perimeter = segmentsOf(room).reduce((sum, segment) => sum + segment.length, 0);
  const hole = room.upper ? rectPolygon(room.upper.stairwell, room.upper.stairwell.round) : null;
  let area = 0,
    living = 0,
    volume = 0;
  const step = 0.05;
  levels.forEach((_, index) => {
    for (let x = step / 2; x < room.width; x += step) {
      for (let y = step / 2; y < room.depth; y += step) {
        if (!pointInPolygon(plan, x, y) || (index > 0 && hole && pointInPolygon(hole, x, y))) {
          continue;
        }
        const cell = step * step;
        const height = ceilingHeight(room, index, x, y);
        area += cell;
        living += height >= 2 ? cell : height >= 1 ? cell / 2 : 0;
        volume += cell * height;
      }
    }
  });
  const wallArea =
    perimeter * levels.reduce((sum, level) => sum + level.height, 0) -
    room.openings.reduce((sum, opening) => sum + opening.width * opening.height, 0);
  return { area, living, perimeter, volume, wallArea };
};

// ------------------------------------------------------------ what is shown
/**
 * Which walls are shown: "front" – the walls between the camera and the rooms (and the sloped ceilings) turn
 * see-through, "hide" – those walls are hidden (a doll's house view), "all", or "none". `upperShown` false hides
 * the upper floors (walls, their floor and the furniture on them). Sets the visibility of the rooms' tags and
 * the opacity of their wall materials; returns true when something changed.
 */
export type WallView = 'front' | 'hide' | 'all' | 'none';
export const WALL_VIEWS: WallView[] = ['front', 'hide', 'all', 'none'];
/** how much of a see-through wall is left */
const SEE_THROUGH = 0.3;

export const applyWallView = (view: WallView, upperShown: boolean) => {
  const context = pluginContext();
  const model = context.editor.model;
  const camera = context.editor.viewer.rig.position;
  const rooms = findRooms();
  let changed = false;
  // the sides the camera looks at the whole flat from
  const box = {
    x0: Math.min(...rooms.map((room) => room.x0)),
    y0: Math.min(...rooms.map((room) => room.y0)),
    x1: Math.max(...rooms.map((room) => room.x1)),
    y1: Math.max(...rooms.map((room) => room.y1)),
  };
  const inFront: Record<WallSide, boolean> = {
    south: camera.y < box.y0,
    north: camera.y > box.y1,
    west: camera.x < box.x0,
    east: camera.x > box.x1,
  };
  for (const room of rooms) {
    const tags = room.data.tags;
    const top = room.levels.length - 1;
    const visibleFor = (key: string) => {
      if (key === 'upper') {
        return upperShown;
      }
      const [level, side] = key === 'ceiling' ? [String(top), ''] : key.split(':');
      const levelShown = level === '0' || upperShown;
      if (!levelShown || view === 'none') {
        return false;
      }
      if (key === 'ceiling') {
        return view !== 'hide';
      }
      return view !== 'hide' || !inFront[side as WallSide];
    };
    for (const [key, name] of Object.entries(tags ?? {})) {
      const tag = model.tags.find((candidate) => candidate.name === name);
      const visible = visibleFor(key);
      if (tag && tag.visible !== visible) {
        tag.visible = visible;
        changed = true;
      }
    }
    for (const [key, name] of Object.entries(room.data.materials ?? {})) {
      const material = model.materials.find((candidate) => candidate.name === name);
      const opacity = view === 'front' && (key === 'ceiling' || inFront[key as WallSide]) ? SEE_THROUGH : 1;
      if (material && material.opacity !== opacity) {
        material.opacity = opacity;
        changed = true;
      }
    }
  }
  if (changed) {
    context.editor.invalidate();
  }
  return changed;
};

/** the corners of the floor plan as they are now – for editing it as a free polygon */
export const planCorners = (room: RoomData) => cornersOf(room);
