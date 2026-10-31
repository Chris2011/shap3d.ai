import type { Entities, Instance } from '../../../src/core/model';
import { bodyData, isRegion, type BodyData } from './data';
import { pluginContext, THREE } from './runtime';

/**
 * The model as the simulation sees it: every instance with physics data is a body (or a region), its geometry in
 * parts – its own faces one part, every group inside it without data another (each becomes a convex hull of a
 * dynamic body, so a table of a top and four legs keeps its shape). Everything else that is visible – loose faces,
 * groups without data – is the static world everything collides with.
 */

type Matrix = InstanceType<typeof THREE.Matrix4>;

/** geometry in model coordinates: corner points (x, y, z …) and triangles (9 numbers each) */
export interface Part {
  points: number[];
  triangles: number[];
}

export interface BodyNode {
  instance: Instance;
  data: BodyData;
  /** its place in the model at the start */
  world: Matrix;
  /** the body it lies in (null: none) */
  parent: BodyNode | null;
  /**
   * from the parent body's inner coordinates (or the model's) to the coordinates the instance lies in: the matrices
   * of the plain groups between – so its place can be shown while the parent moves
   */
  between: Matrix;
  parts: Part[];
}

export interface PhysicsScene {
  bodies: BodyNode[];
  regions: BodyNode[];
  /** the static world: all visible geometry that is not part of a body or a region */
  world: Part;
}

const emptyPart = (): Part => ({ points: [], triangles: [] });

/** adds the visible faces of `entities` (placed by `matrix`) to a part */
const addFaces = (entities: Entities, matrix: Matrix, part: Part, hiddenTags: Set<string>) => {
  const corner = new THREE.Vector3();
  for (const face of entities.faces.values()) {
    if (face.hidden || (face.tag && hiddenTags.has(face.tag))) {
      continue;
    }
    const points = [...face.outer, ...face.holes.flat()].map((vertex) =>
      corner.copy(entities.positionOf(vertex)).applyMatrix4(matrix).toArray(),
    );
    for (const point of points) {
      part.points.push(...point);
    }
    for (const index of entities.faceTriangles(face)) {
      part.triangles.push(...points[index]);
    }
  }
};

export const collectScene = (): PhysicsScene => {
  const model = pluginContext().editor.model;
  const hiddenTags = model.hiddenTags();
  const scene: PhysicsScene = { bodies: [], regions: [], world: emptyPart() };
  const walk = (entities: Entities, matrix: Matrix, owner: BodyNode | null, between: Matrix, part: Part) => {
    addFaces(entities, matrix, part, hiddenTags);
    for (const instance of entities.instances.values()) {
      if (instance.hidden || (instance.tag && hiddenTags.has(instance.tag))) {
        continue;
      }
      const world = matrix.clone().multiply(instance.matrix);
      const data = bodyData(instance);
      if (data?.type === 'off') {
        continue;
      }
      if (data && isRegion(data.type)) {
        scene.regions.push({ instance, data, world, parent: owner, between: between.clone(), parts: [] });
        continue;
      }
      if (data) {
        const node: BodyNode = { instance, data, world, parent: owner, between: between.clone(), parts: [emptyPart()] };
        scene.bodies.push(node);
        walk(instance.definition.entities, world, node, new THREE.Matrix4(), node.parts[0]);
        continue;
      }
      // a plain group: inside a body a part of its own (directly in the body) or of the part it lies in
      let inner = part;
      if (owner && part === owner.parts[0]) {
        inner = emptyPart();
        owner.parts.push(inner);
      }
      walk(instance.definition.entities, world, owner, between.clone().multiply(instance.matrix), inner);
    }
  };
  walk(model.root, new THREE.Matrix4(), null, new THREE.Matrix4(), scene.world);
  for (const body of scene.bodies) {
    body.parts = body.parts.filter((part) => part.points.length >= 9);
  }
  return scene;
};

/** every instance with physics data, also inside groups – with its place in the model */
export const physicsInstances = () => {
  const model = pluginContext().editor.model;
  const found: { instance: Instance; data: BodyData; world: Matrix }[] = [];
  const walk = (entities: Entities, matrix: Matrix) => {
    for (const instance of entities.instances.values()) {
      const world = matrix.clone().multiply(instance.matrix);
      const data = bodyData(instance);
      if (data) {
        found.push({ instance, data, world });
      }
      walk(instance.definition.entities, world);
    }
  };
  walk(model.root, new THREE.Matrix4());
  return found;
};

/** an instance anywhere in the model by its id, with its place in the model */
export const findInstance = (id: number) => {
  const model = pluginContext().editor.model;
  const search = (entities: Entities, matrix: Matrix): { instance: Instance; world: Matrix } | null => {
    for (const instance of entities.instances.values()) {
      const world = matrix.clone().multiply(instance.matrix);
      if (instance.id === id) {
        return { instance, world };
      }
      const found = search(instance.definition.entities, world);
      if (found) {
        return found;
      }
    }
    return null;
  };
  return search(model.root, new THREE.Matrix4());
};

/**
 * A fingerprint of what the simulation is built from: every instance (which one, where, hidden, its data) and the
 * geometry of every definition (counts and the sum of its corners). The app's revision also counts redraws, so the
 * plugin compares this instead to see whether the model really changed while the simulation runs.
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
    add(entities.vertices.size);
    let sum = 0;
    for (const vertex of entities.vertices.values()) {
      sum += vertex.position.x * 1.3 + vertex.position.y * 1.7 + vertex.position.z * 1.9;
    }
    add(sum);
    for (const instance of entities.instances.values()) {
      add(instance.id);
      instance.matrix.elements.forEach(add);
      add(instance.hidden ? 1 : 0);
      add(JSON.stringify(instance.pluginData ?? null).length);
      walk(instance.definition.entities);
    }
  };
  walk(model.root);
  return hash;
};
