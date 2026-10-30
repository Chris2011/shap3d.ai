import type { Entities } from '../../../src/core/model';
import { KINDS } from './kinds';
import { kindOf, type LevelObject } from './objects';
import { pluginContext, THREE } from './runtime';

/**
 * What the test run collides with: every visible face of the model in world coordinates (level objects left out –
 * they are game objects, not walls), kept in a grid for quick ray tests, plus the leaves of the level doors, which
 * only block while they are closed.
 */

type Vector = InstanceType<typeof THREE.Vector3>;

export interface Polygon {
  normal: Vector;
  /** the plane: normal · p = d */
  d: number;
  /** the axis left out when the polygon is looked at in 2D (where its normal is largest) */
  drop: 0 | 1 | 2;
  outer: [number, number][];
  holes: [number, number][][];
  min: Vector;
  max: Vector;
  /** the door it belongs to (its leaf) – it blocks only while that door is closed */
  door?: string;
}

export interface Hit {
  distance: number;
  point: Vector;
  normal: Vector;
  polygon: Polygon;
}

const GRID = 2;

const project = (point: Vector, drop: 0 | 1 | 2): [number, number] =>
  drop === 0 ? [point.y, point.z] : drop === 1 ? [point.x, point.z] : [point.x, point.y];

const inside = (point: [number, number], ring: [number, number][]) => {
  let result = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index],
      [xj, yj] = ring[previous];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      result = !result;
    }
  }
  return result;
};

/** a polygon from its corners (and holes) in world coordinates; null when it has no area */
const polygonOf = (outer: Vector[], holes: Vector[][] = [], door?: string): Polygon | null => {
  // Newell's normal – works for any flat polygon
  const normal = new THREE.Vector3();
  outer.forEach((point, index) => {
    const next = outer[(index + 1) % outer.length];
    normal.x += (point.y - next.y) * (point.z + next.z);
    normal.y += (point.z - next.z) * (point.x + next.x);
    normal.z += (point.x - next.x) * (point.y + next.y);
  });
  if (normal.lengthSq() < 1e-12) {
    return null;
  }
  normal.normalize();
  const absolute = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
  const drop = (absolute[0] >= absolute[1] && absolute[0] >= absolute[2] ? 0 : absolute[1] >= absolute[2] ? 1 : 2) as 0 | 1 | 2;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity),
    max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  outer.forEach((point) => {
    min.min(point);
    max.max(point);
  });
  return {
    normal,
    d: normal.dot(outer[0]),
    drop,
    outer: outer.map((point) => project(point, drop)),
    holes: holes.map((hole) => hole.map((point) => project(point, drop))),
    min,
    max,
    door,
  };
};

/** the six faces of a box (local corners min/max) placed by a matrix */
const boxPolygons = (min: Vector, max: Vector, matrix: InstanceType<typeof THREE.Matrix4>, door: string) => {
  const corner = (x: number, y: number, z: number) =>
    new THREE.Vector3(x ? max.x : min.x, y ? max.y : min.y, z ? max.z : min.z).applyMatrix4(matrix);
  const faces = [
    [corner(0, 0, 0), corner(1, 0, 0), corner(1, 1, 0), corner(0, 1, 0)],
    [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)],
    [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)],
    [corner(0, 1, 0), corner(1, 1, 0), corner(1, 1, 1), corner(0, 1, 1)],
    [corner(0, 0, 0), corner(0, 1, 0), corner(0, 1, 1), corner(0, 0, 1)],
    [corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)],
  ];
  return faces.map((points) => polygonOf(points, [], door)).filter((polygon): polygon is Polygon => !!polygon);
};

export interface World {
  polygons: Polygon[];
  /** grid cell "x,y" → indices of the polygons whose box reaches into it */
  grid: Map<string, number[]>;
}

export const buildWorld = (objects: LevelObject[]): World => {
  const model = pluginContext().editor.model;
  const hiddenTags = model.hiddenTags();
  const polygons: Polygon[] = [];
  const walk = (entities: Entities, matrix: InstanceType<typeof THREE.Matrix4>) => {
    for (const face of entities.faces.values()) {
      if (face.hidden || (face.tag && hiddenTags.has(face.tag))) {
        continue;
      }
      const world = (vertex: number) => entities.positionOf(vertex).clone().applyMatrix4(matrix);
      const polygon = polygonOf(
        face.outer.map(world),
        face.holes.map((hole) => hole.map(world)),
      );
      if (polygon) {
        polygons.push(polygon);
      }
    }
    for (const instance of entities.instances.values()) {
      if (instance.hidden || (instance.tag && hiddenTags.has(instance.tag)) || kindOf(instance.definition)) {
        continue;
      }
      walk(instance.definition.entities, matrix.clone().multiply(instance.matrix));
    }
  };
  walk(model.root, new THREE.Matrix4());
  // the doors' leaves (inside the frame)
  const [, width, height] = KINDS.door.size;
  for (const door of objects.filter((object) => object.kind === 'door')) {
    polygons.push(
      ...boxPolygons(
        new THREE.Vector3(-0.03, -(width - 0.12) / 2, 0),
        new THREE.Vector3(0.03, (width - 0.12) / 2, height - 0.06),
        door.world,
        door.id,
      ),
    );
  }
  const grid = new Map<string, number[]>();
  polygons.forEach((polygon, index) => {
    for (let x = Math.floor(polygon.min.x / GRID); x <= Math.floor(polygon.max.x / GRID); x++) {
      for (let y = Math.floor(polygon.min.y / GRID); y <= Math.floor(polygon.max.y / GRID); y++) {
        const name = `${x},${y}`;
        const list = grid.get(name);
        if (list) {
          list.push(index);
        } else {
          grid.set(name, [index]);
        }
      }
    }
  });
  return { polygons, grid };
};

/**
 * The nearest polygon a ray hits within `reach` – faces count from both sides; `accept` filters (e.g. walls only,
 * doors that are open left out).
 */
export const raycast = (
  world: World,
  origin: Vector,
  direction: Vector,
  reach: number,
  accept: (polygon: Polygon) => boolean,
): Hit | null => {
  const end = origin.clone().addScaledVector(direction, reach);
  const seen = new Set<number>();
  let best: Hit | null = null;
  for (let x = Math.floor(Math.min(origin.x, end.x) / GRID); x <= Math.floor(Math.max(origin.x, end.x) / GRID); x++) {
    for (let y = Math.floor(Math.min(origin.y, end.y) / GRID); y <= Math.floor(Math.max(origin.y, end.y) / GRID); y++) {
      for (const index of world.grid.get(`${x},${y}`) ?? []) {
        if (seen.has(index)) {
          continue;
        }
        seen.add(index);
        const polygon = world.polygons[index];
        if (!accept(polygon)) {
          continue;
        }
        const facing = polygon.normal.dot(direction);
        if (Math.abs(facing) < 1e-9) {
          continue;
        }
        const distance = (polygon.d - polygon.normal.dot(origin)) / facing;
        if (distance < 0 || distance > reach || (best && distance >= best.distance)) {
          continue;
        }
        const point = origin.clone().addScaledVector(direction, distance);
        const flat = project(point, polygon.drop);
        if (!inside(flat, polygon.outer) || polygon.holes.some((hole) => inside(flat, hole))) {
          continue;
        }
        // the side the ray came from
        const normal = facing > 0 ? polygon.normal.clone().negate() : polygon.normal.clone();
        best = { distance, point, normal, polygon };
      }
    }
  }
  return best;
};
