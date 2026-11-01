import type { Entities, Instance } from '../../../src/core/model';
import { objectAnimation, type ObjectAnimation, type Vec } from './data';
import { pluginContext, THREE } from './runtime';

/**
 * The model as the animation sees it: the animated groups and components (outer ones first, so a child moves with
 * its parent), any instance by its id with the groups it lies in, the middle of a group's box and the line a path
 * group's edges make.
 */

type Matrix = InstanceType<typeof THREE.Matrix4>;

export interface AnimatedNode {
  instance: Instance;
  animation: ObjectAnimation;
  /** the instances it lies in, outermost first */
  ancestors: Instance[];
}

/** every animated instance, also inside groups – parents before their children */
export const animatedNodes = (): AnimatedNode[] => {
  const nodes: AnimatedNode[] = [];
  const walk = (entities: Entities, ancestors: Instance[]) => {
    for (const instance of entities.instances.values()) {
      const animation = objectAnimation(instance);
      if (animation) {
        nodes.push({ instance, animation, ancestors });
      }
      walk(instance.definition.entities, [...ancestors, instance]);
    }
  };
  walk(pluginContext().editor.model.root, []);
  return nodes;
};

/** an instance anywhere in the model by its id, with the instances it lies in */
export const findInstance = (id: number) => {
  const search = (entities: Entities, ancestors: Instance[]): { instance: Instance; ancestors: Instance[] } | null => {
    for (const instance of entities.instances.values()) {
      if (instance.id === id) {
        return { instance, ancestors };
      }
      const found = search(instance.definition.entities, [...ancestors, instance]);
      if (found) {
        return found;
      }
    }
    return null;
  };
  return search(pluginContext().editor.model.root, []);
};

/** the product of the instances' own matrices – where a path of groups puts things */
export const chain = (instances: Instance[]) =>
  instances.reduce((matrix, instance) => matrix.multiply(instance.matrix), new THREE.Matrix4());

const boxes = new WeakMap<Entities, { box: InstanceType<typeof THREE.Box3>; size: number }>();

/** the box around a definition's geometry (its own coordinates), its inner groups included */
export const boxOf = (entities: Entities): InstanceType<typeof THREE.Box3> => {
  const cached = boxes.get(entities);
  if (cached && cached.size === entities.vertices.size + entities.instances.size) {
    return cached.box.clone();
  }
  const box = new THREE.Box3();
  for (const vertex of entities.vertices.values()) {
    box.expandByPoint(vertex.position);
  }
  for (const instance of entities.instances.values()) {
    const inner = boxOf(instance.definition.entities);
    if (!inner.isEmpty()) {
      box.union(inner.applyMatrix4(instance.matrix));
    }
  }
  boxes.set(entities, { box: box.clone(), size: entities.vertices.size + entities.instances.size });
  return box;
};

/** the point an object turns and scales about: its own, or the middle of its box */
export const pivotOf = (instance: Instance, animation?: ObjectAnimation): Vec => {
  if (animation?.pivot) {
    return animation.pivot;
  }
  const box = boxOf(instance.definition.entities);
  return box.isEmpty() ? [0, 0, 0] : (box.getCenter(new THREE.Vector3()).toArray() as Vec);
};

/** the middle of an instance in the model (at its place in the model) */
export const centerOf = (instance: Instance, world: Matrix) => {
  const box = boxOf(instance.definition.entities);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  return center.applyMatrix4(world);
};

export interface PathLine {
  /** the corner points in the path group's own coordinates */
  points: InstanceType<typeof THREE.Vector3>[];
  /** distance along the line at each point */
  lengths: number[];
  closed: boolean;
}

const lines = new WeakMap<Entities, { line: PathLine | null; size: number }>();

/**
 * The line a group's edges make: the edges joined end to end, starting at a loose end (or anywhere on a closed
 * loop). Edges that branch off are left out. Null when the group has no edges.
 */
export const pathLine = (entities: Entities): PathLine | null => {
  const cached = lines.get(entities);
  if (cached && cached.size === entities.edges.size) {
    return cached.line;
  }
  const neighbours = new Map<number, number[]>();
  for (const edge of entities.edges.values()) {
    neighbours.set(edge.start, [...(neighbours.get(edge.start) ?? []), edge.end]);
    neighbours.set(edge.end, [...(neighbours.get(edge.end) ?? []), edge.start]);
  }
  let line: PathLine | null = null;
  if (neighbours.size >= 2) {
    const ends = [...neighbours.entries()].filter(([, next]) => next.length === 1).map(([vertex]) => vertex);
    // the end lowest in x, then y – so a line drawn left to right runs that way
    const position = (vertex: number) => entities.positionOf(vertex);
    ends.sort((a, b) => position(a).x - position(b).x || position(a).y - position(b).y);
    const start = ends[0] ?? neighbours.keys().next().value!;
    const order = [start];
    const seen = new Set(order);
    let current = start;
    for (;;) {
      const next = (neighbours.get(current) ?? []).find((vertex) => !seen.has(vertex));
      if (next === undefined) {
        break;
      }
      order.push(next);
      seen.add(next);
      current = next;
    }
    const closed = !ends.length && (neighbours.get(current) ?? []).includes(start) && order.length > 2;
    if (closed) {
      order.push(start);
    }
    const points = order.map((vertex) => position(vertex).clone());
    const lengths = [0];
    for (let index = 1; index < points.length; index++) {
      lengths.push(lengths[index - 1] + points[index].distanceTo(points[index - 1]));
    }
    line = { points, lengths, closed };
  }
  lines.set(entities, { line, size: entities.edges.size });
  return line;
};

/** the point and the direction at a share (0 … 1) of the line's length */
export const pointOnLine = (line: PathLine, share: number) => {
  const total = line.lengths[line.lengths.length - 1];
  if (line.closed) {
    share = ((share % 1) + 1) % 1;
  } else {
    share = Math.min(1, Math.max(0, share));
  }
  const distance = share * total;
  let index = 1;
  while (index < line.points.length - 1 && line.lengths[index] < distance) {
    index++;
  }
  const from = line.points[index - 1];
  const to = line.points[index];
  const length = line.lengths[index] - line.lengths[index - 1];
  const along = length > 0 ? (distance - line.lengths[index - 1]) / length : 0;
  const point = from.clone().lerp(to, along);
  // the direction: smoothed over the corner near either end of the piece, so turns are not sudden
  const direction = to.clone().sub(from).normalize();
  const blend = 0.25;
  if (along < blend && index > 1) {
    const before = from
      .clone()
      .sub(line.points[index - 2])
      .normalize();
    direction.lerp(before, 0.5 - along / blend / 2).normalize();
  } else if (along > 1 - blend && index < line.points.length - 1) {
    const after = line.points[index + 1].clone().sub(to).normalize();
    direction.lerp(after, (along - (1 - blend)) / blend / 2).normalize();
  }
  return { point, direction };
};

/**
 * A fingerprint of what the animation is built from: every instance (which one, where, hidden, its data) and the
 * geometry of every definition. The app's revision also counts redraws, so the plugin compares this instead to see
 * whether the model really changed.
 */
export const modelFingerprint = () => {
  const model = pluginContext().editor.model;
  const seen = new Set<Entities>();
  let hash = 0;
  const add = (value: number) => {
    hash = (hash * 31 + Math.round(value * 1e4)) % 2147483647;
  };
  const walk = (entities: Entities) => {
    if (seen.has(entities)) {
      return;
    }
    seen.add(entities);
    add(entities.faces.size);
    add(entities.edges.size);
    add(entities.vertices.size);
    for (const instance of entities.instances.values()) {
      add(instance.id);
      instance.matrix.elements.forEach(add);
      add(instance.hidden ? 1 : 0);
      add(JSON.stringify(instance.pluginData ?? null).length);
      walk(instance.definition.entities);
    }
  };
  walk(model.root);
  add(JSON.stringify(model.pluginData ?? null).length);
  return hash;
};
