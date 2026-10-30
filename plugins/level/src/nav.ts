import { markRaw } from 'vue';
import type { LevelProblem } from './checks';
import { KINDS, type ObjectKind } from './kinds';
import { levelObjects, type LevelObject } from './objects';
import { pluginContext, t, THREE } from './runtime';
import { useLevelState } from './state';
import { buildWorld, raycast, type Polygon, type World } from './world';

/**
 * Where a player can walk: the floors of the model on a grid of cells, each with room to stand (headroom, away from
 * walls), linked to its neighbours when the step between them is low enough and no wall stands in the way – on
 * several floors above each other. Teleporters and jump pads link to where they send the player. From the player's
 * spawn points the grid shows what can be reached; objects the player must get to and cannot are problems.
 */

type Vector = InstanceType<typeof THREE.Vector3>;

export interface NavNode {
  position: Vector;
  /** reached from a player's spawn point */
  reached: boolean;
}

export interface NavGrid {
  /** the cells' size in metres */
  cell: number;
  nodes: NavNode[];
  /** per node the nodes it leads to */
  links: number[][];
  /** the problems: objects the player cannot get to, a spawn point where nobody can stand */
  problems: LevelProblem[];
}

const STEP = 0.45;
const HEADROOM = 1.8;
const CLEARANCE = 0.2;
const MAX_CELLS = 160_000;
/** objects the player has to get to – the others (lights, cameras, enemies …) work from where they are */
const VISITED: ObjectKind[] = ['pickup', 'door', 'savepoint', 'trigger', 'teleporter', 'jumppad'];

const isFloor = (polygon: Polygon) => !polygon.door && Math.abs(polygon.normal.z) >= 0.7;
const isWall = (polygon: Polygon) => !polygon.door && Math.abs(polygon.normal.z) < 0.7;
const isSolid = (polygon: Polygon) => !polygon.door;

// made on first use – the app's three.js is only there once the plugin is active
let down: Vector | null = null;
let around: Vector[] | null = null;
const DOWN = () => (down ??= new THREE.Vector3(0, 0, -1));
const AROUND = () =>
  (around ??= [0, 1, 2, 3, 4, 5, 6, 7].map(
    (index) => new THREE.Vector3(Math.cos((index * Math.PI) / 4), Math.sin((index * Math.PI) / 4), 0),
  ));

/** the floors in one column, top down: every upward surface with headroom above it */
const floorsAt = (world: World, x: number, y: number, top: number, bottom: number) => {
  const surfaces: { z: number; floor: boolean }[] = [];
  let from = top;
  for (let guard = 0; guard < 24; guard++) {
    const hit = raycast(world, new THREE.Vector3(x, y, from), DOWN(), from - bottom + 1, isSolid);
    if (!hit) {
      break;
    }
    surfaces.push({ z: hit.point.z, floor: isFloor(hit.polygon) });
    from = hit.point.z - 0.02;
  }
  // a floor to stand on: the surface above it (the list is top down) is high enough – a ceiling, the floor above
  return surfaces
    .filter((surface, index) => surface.floor && (index === 0 || surfaces[index - 1].z - surface.z >= HEADROOM))
    .map((surface) => surface.z);
};

/** room around a standing point: no wall closer than the clearance, at the knees and at the chest */
const hasRoom = (world: World, point: Vector) =>
  [STEP + 0.05, 1.2].every((height) =>
    AROUND().every((direction) => !raycast(world, point.clone().add(new THREE.Vector3(0, 0, height)), direction, CLEARANCE, isWall)),
  );

/** can the player walk straight from one standing point to the next? */
const canWalk = (world: World, from: Vector, to: Vector) => {
  const flat = new THREE.Vector3(to.x - from.x, to.y - from.y, 0);
  const length = flat.length();
  flat.normalize();
  const base = Math.max(from.z, to.z);
  return [STEP + 0.05, 1.2].every(
    (height) => !raycast(world, new THREE.Vector3(from.x, from.y, base + height), flat, length + CLEARANCE, isWall),
  );
};

const nameOf = (object: LevelObject) => object.instance.name || object.id;

export const buildNav = (objects: LevelObject[], world: World = buildWorld(objects)): NavGrid => {
  const polygons = world.polygons.filter(isSolid);
  if (!polygons.length) {
    return { cell: 0, nodes: [], links: [], problems: [] };
  }
  const min = new THREE.Vector3(Infinity, Infinity, Infinity),
    max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  polygons.forEach((polygon) => {
    min.min(polygon.min);
    max.max(polygon.max);
  });
  // 0.4 m cells (a doorway has a centre in it), larger on big models
  const cell = Math.max(0.4, Math.sqrt(((max.x - min.x) * (max.y - min.y)) / MAX_CELLS));
  const columns = Math.max(1, Math.ceil((max.x - min.x) / cell)),
    rows = Math.max(1, Math.ceil((max.y - min.y) / cell));

  const nodes: NavNode[] = [];
  const byColumn = new Map<number, number[]>();
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const x = min.x + (column + 0.5) * cell,
        y = min.y + (row + 0.5) * cell;
      for (const z of floorsAt(world, x, y, max.z + 1, min.z)) {
        const position = new THREE.Vector3(x, y, z);
        if (hasRoom(world, position)) {
          byColumn.set(column * rows + row, [...(byColumn.get(column * rows + row) ?? []), nodes.length]);
          nodes.push({ position, reached: false });
        }
      }
    }
  }

  const links: number[][] = nodes.map(() => []);
  const link = (from: number, to: number) => links[from].includes(to) || links[from].push(to);
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      for (const here of byColumn.get(column * rows + row) ?? []) {
        // the four neighbours ahead – the other four link back to this one
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [1, 1],
          [1, -1],
        ]) {
          if (column + dx >= columns || row + dy < 0 || row + dy >= rows) {
            continue;
          }
          for (const there of byColumn.get((column + dx) * rows + row + dy) ?? []) {
            const a = nodes[here].position,
              b = nodes[there].position;
            if (Math.abs(a.z - b.z) <= STEP && canWalk(world, a, b)) {
              link(here, there);
              link(there, here);
            }
          }
        }
      }
    }
  }

  /** the node a point stands on: the nearest within a radius, about at its height */
  const nodeAt = (point: Vector, radius = 0.8) => {
    let best = -1,
      bestDistance = Infinity;
    const reach = Math.ceil(radius / cell);
    const column = Math.floor((point.x - min.x) / cell),
      row = Math.floor((point.y - min.y) / cell);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        if (column + dx < 0 || column + dx >= columns || row + dy < 0 || row + dy >= rows) {
          continue;
        }
        for (const index of byColumn.get((column + dx) * rows + row + dy) ?? []) {
          const position = nodes[index].position;
          const flat = Math.hypot(position.x - point.x, position.y - point.y);
          const rise = point.z - position.z;
          if (flat <= radius && rise > -STEP - 0.1 && rise < 1.2 && flat + Math.abs(rise) < bestDistance) {
            best = index;
            bestDistance = flat + Math.abs(rise);
          }
        }
      }
    }
    return best;
  };
  const positionOf = (object: LevelObject) => new THREE.Vector3().setFromMatrixPosition(object.world);
  /** how far around an object the player may stand to get to it (half its footprint, a little more) */
  const radiusOf = (object: LevelObject) => {
    const scale = new THREE.Vector3();
    object.world.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    const [width, depth] = KINDS[object.kind].size;
    return Math.max(0.8, (Math.max(width * scale.x, depth * scale.y) / 2) * Math.SQRT2 + 0.3);
  };

  // teleporters send the player to their destination, jump pads to where the flight ends
  const byId = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) {
    const from = nodeAt(positionOf(object), radiusOf(object));
    if (from < 0) {
      continue;
    }
    if (object.kind === 'teleporter') {
      const target = byId.get(String(object.props.target));
      const to = target ? nodeAt(positionOf(target), radiusOf(target)) : -1;
      if (to >= 0) {
        link(from, to);
      }
    } else if (object.kind === 'jumppad') {
      const along = new THREE.Vector3(1, 0, 0).transformDirection(object.world).setZ(0).normalize();
      const landing = positionOf(object).addScaledVector(along, Number(object.props.distance) || 0);
      const highest = positionOf(object).z + Math.max(0.5, Number(object.props.height) || 0);
      nodes.forEach((node, index) => {
        if (Math.hypot(node.position.x - landing.x, node.position.y - landing.y) <= 1.5 && node.position.z <= highest) {
          link(from, index);
        }
      });
    }
  }

  // walk from the player's spawn points
  const problems: LevelProblem[] = [];
  const spawns = objects.filter((object) => object.kind === 'spawn' && String(object.props.team ?? 'player') !== 'enemy');
  const queue: number[] = [];
  for (const spawn of spawns) {
    const start = nodeAt(positionOf(spawn));
    if (start < 0) {
      problems.push({ text: t('level.warnings.spawnNowhere', { name: nameOf(spawn) }), object: spawn });
    } else if (!nodes[start].reached) {
      nodes[start].reached = true;
      queue.push(start);
    }
  }
  while (queue.length) {
    const here = queue.pop()!;
    for (const there of links[here]) {
      if (!nodes[there].reached) {
        nodes[there].reached = true;
        queue.push(there);
      }
    }
  }
  if (nodes.some((node) => node.reached)) {
    for (const object of objects.filter((candidate) => VISITED.includes(candidate.kind))) {
      const at = positionOf(object);
      const radius = radiusOf(object);
      // reached when any reached node stands within its reach (a trigger's volume, a door's both sides …)
      const reached = nodes.some(
        (node) =>
          node.reached &&
          Math.hypot(node.position.x - at.x, node.position.y - at.y) <= radius &&
          at.z - node.position.z > -STEP - 0.1 &&
          at.z - node.position.z < 1.2,
      );
      if (!reached) {
        problems.push({ text: t('level.warnings.unreachable', { name: nameOf(object) }), object });
      }
    }
  }
  return { cell, nodes, links, problems };
};

let refresh: ReturnType<typeof setTimeout> | undefined;

/** builds the walking grid of the model as it is now */
const checkNow = () => {
  const editor = pluginContext().editor;
  useLevelState().nav = { grid: markRaw(buildNav(levelObjects())), revision: editor.ui.revision };
  editor.redraw();
};

/**
 * The walking grid while it is shown, else null. After the model changed it is built again once the changes rest
 * for a moment (not on every step of a drag) – until then the last one is shown.
 */
export const shownNav = () => {
  const nav = useLevelState().nav;
  if (nav && nav.revision !== pluginContext().editor.ui.revision) {
    clearTimeout(refresh);
    refresh = setTimeout(() => useLevelState().nav && checkNow(), 400);
  }
  return nav?.grid ?? null;
};

/** checks what can be reached and shows the walking grid in the view – or hides it again */
export const toggleNav = (on = !useLevelState().nav) => {
  clearTimeout(refresh);
  if (on) {
    checkNow();
  } else {
    useLevelState().nav = null;
    pluginContext().editor.redraw();
  }
};
