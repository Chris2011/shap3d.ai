import type { Definition, Instance } from '../../../src/core/model';
import { colorById, ensureColorMaterial } from './colors';
import { buildablePart, buildOptions, modelSpec, partInfo, type Credit } from './parts';
import { pluginContext, t, THREE } from './runtime';
import { PITCH, PLATE_HEIGHT } from './shapes';

/**
 * Placed bricks: component instances at the top level of the model. Equal parts share one component whatever their
 * colour – the colour is the instance's material, which is why a wall of a thousand bricks stays light.
 */

/** on the component: what it is. A model comes from anywhere, so this is checked when it is read */
export interface BrickData {
  kind: 'brick';
  part: string;
  name: string;
  w: number;
  d: number;
  height: number;
  credit?: Credit;
  /** a finished model: its component holds its bricks, each in its own colour */
  model?: boolean;
  /** for a model: whose it is, which its licence asks to say */
  modelCredit?: { author: string; license: string };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

export const brickOf = (definition: Definition) => {
  const data = pluginContext().data.get<BrickData>(definition);
  return data?.kind === 'brick' &&
    typeof data.part === 'string' &&
    typeof data.name === 'string' &&
    isNumber(data.w) &&
    isNumber(data.d) &&
    isNumber(data.height)
    ? data
    : null;
};

/** on the instance: its colour */
export const colorOf = (instance: Instance) => {
  const data = pluginContext().data.get<{ color?: string }>(instance);
  return colorById(typeof data?.color === 'string' ? data.color : '').id;
};

export const placedBricks = () =>
  [...pluginContext().editor.model.root.instances.values()].flatMap((instance) => {
    const data = brickOf(instance.definition);
    return data ? [{ instance, data }] : [];
  });

export const placementOf = (instance: Instance) => {
  const elements = instance.matrix.elements;
  const degrees = (Math.atan2(elements[1], elements[0]) * 180) / Math.PI;
  return { x: elements[12], y: elements[13], z: elements[14], rotation: (((Math.round(degrees / 90) * 90) % 360) + 360) % 360 };
};

export const placementMatrix = (x: number, y: number, z: number, rotation: number) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (rotation * Math.PI) / 180),
    new THREE.Vector3(1, 1, 1),
  );

/** cells along x and y once turned */
export const turned = (w: number, d: number, rotation: number) => (rotation % 180 === 0 ? [w, d] : [d, w]);

/** the middle of `cells` cells nearest to a point: an even number sits between studs, an odd one on a stud */
export const snapCentre = (value: number, cells: number) => {
  const shift = cells % 2 === 0 ? 0 : PITCH / 2;
  return Math.round((value - shift) / PITCH) * PITCH + shift;
};

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export const boxAt = (x: number, y: number, z: number, w: number, d: number, height: number): Box => ({
  x0: x - (w * PITCH) / 2,
  x1: x + (w * PITCH) / 2,
  y0: y - (d * PITCH) / 2,
  y1: y + (d * PITCH) / 2,
  z0: z,
  z1: z + height,
});

export const boxOf = (instance: Instance, data: BrickData) => {
  const at = placementOf(instance);
  const [w, d] = turned(data.w, data.d, at.rotation);
  return boxAt(at.x, at.y, at.z, w, d, data.height);
};

const TOUCHING = 1e-5;
const overlapsPlan = (a: Box, b: Box) =>
  a.x0 < b.x1 - TOUCHING && b.x0 < a.x1 - TOUCHING && a.y0 < b.y1 - TOUCHING && b.y0 < a.y1 - TOUCHING;
const overlaps = (a: Box, b: Box) => overlapsPlan(a, b) && a.z0 < b.z1 - TOUCHING && b.z0 < a.z1 - TOUCHING;

const boxesExcept = (except?: Instance) =>
  placedBricks()
    .filter(({ instance }) => instance !== except)
    .map(({ instance, data }) => boxOf(instance, data));

/** where a brick comes to rest over this spot: on top of whatever is under it, or on the ground */
export const restingHeight = (plan: Box, except?: Instance) =>
  boxesExcept(except).reduce((height, box) => (overlapsPlan(plan, box) ? Math.max(height, box.z1) : height), 0);

/** a whole number of plates above or below the rest; never below the ground */
export const liftedHeight = (rest: number, lift: number) => Math.max(0, rest + lift * PLATE_HEIGHT);

export const collides = (box: Box, except?: Instance) => boxesExcept(except).some((other) => overlaps(box, other));

export interface PlaceOptions {
  /** the point it goes to, in cells from the origin; snapped to the grid */
  at?: [number, number];
  /** degrees around z, in quarter turns */
  rotation?: number;
  /** height in plates above the ground; without it the brick comes to rest on what is below */
  level?: number;
  color?: string;
}

/** the component of a part: made once in each model */
const definitionOf = (partId: string): Definition => {
  const context = pluginContext();
  const model = context.editor.model;
  const info = partInfo(partId);
  const existing = [...model.definitions.values()].find((definition) => definition.isComponent && brickOf(definition)?.part === partId);
  if (existing) {
    return existing;
  }
  const spec = modelSpec(partId);
  if (spec && info) {
    const whole = model.newDefinition(info.name, true);
    for (const placement of spec.placements) {
      const child = whole.entities.addInstance(definitionOf(placement.part), new THREE.Matrix4().fromArray(placement.matrix), '');
      child.material = ensureColorMaterial(placement.color);
      context.data.set(child, { color: colorById(placement.color).id });
    }
    const data: BrickData = {
      kind: 'brick',
      part: partId,
      name: info.name,
      w: spec.w,
      d: spec.d,
      height: spec.height,
      model: true,
      modelCredit: spec.credit,
    };
    context.data.set(whole, data);
    return whole;
  }
  const source = buildablePart(partId);
  if (!info || !source) {
    throw new Error(t('bricks.errors.unknownPart', { part: partId }));
  }
  const definition = model.newDefinition(info.name, true);
  context.meshes.build(definition.entities, source, buildOptions);
  const data: BrickData = { kind: 'brick', part: partId, name: info.name, w: info.w, d: info.d, height: info.height, credit: info.credit };
  context.data.set(definition, data);
  return definition;
};

/** a part already in this model: what it needs is on its component, even if the part is not loaded in this session */
export const measuresOf = (partId: string) => {
  const info = partInfo(partId);
  if (info) {
    return info;
  }
  for (const definition of pluginContext().editor.model.definitions.values()) {
    const data = brickOf(definition);
    if (data?.part === partId) {
      return data;
    }
  }
  return undefined;
};

/** puts a brick into the model – inside an undo step (a commit, or a script) */
export const addBrick = (partId: string, options: PlaceOptions = {}) => {
  const context = pluginContext();
  const measures = measuresOf(partId);
  if (!measures) {
    throw new Error(t('bricks.errors.unknownPart', { part: partId }));
  }
  const rotation = (((Math.round((options.rotation ?? 0) / 90) * 90) % 360) + 360) % 360;
  const [w, d] = turned(measures.w, measures.d, rotation);
  const x = snapCentre((options.at?.[0] ?? 0) * PITCH, w);
  const y = snapCentre((options.at?.[1] ?? 0) * PITCH, d);
  const z = options.level === undefined ? restingHeight(boxAt(x, y, 0, w, d, measures.height)) : Math.max(0, options.level) * PLATE_HEIGHT;
  const definition = definitionOf(partId);
  const instance = context.editor.model.root.addInstance(definition, placementMatrix(x, y, z, rotation), '');
  // the bricks of a finished model keep their own colours
  if (!brickOf(definition)?.model) {
    const color = colorById(options.color ?? '').id;
    instance.material = ensureColorMaterial(color);
    context.data.set(instance, { color });
  }
  return instance;
};

const commit = (label: string, change: () => void) => pluginContext().editor.commit(label, change);

/** a brick placed by hand, at a point worked out by the tool (in metres) */
export const placeBrick = (partId: string, x: number, y: number, z: number, rotation: number, color: string) => {
  let instance: Instance | null = null;
  commit('bricks.undo.place', () => {
    instance = addBrick(partId, { at: [x / PITCH, y / PITCH], rotation, level: z / PLATE_HEIGHT, color });
  });
  return instance as Instance | null;
};

export const moveBrick = (instance: Instance, x: number, y: number, z: number, rotation: number) =>
  commit('bricks.undo.move', () => instance.matrix.copy(placementMatrix(x, y, z, rotation)));

/** a quarter turn around its middle, snapped to the grid again, resting on what is there */
export const turnBrick = (instance: Instance, data: BrickData, degrees: number) => {
  const at = placementOf(instance);
  const rotation = (at.rotation + degrees + 360) % 360;
  const [w, d] = turned(data.w, data.d, rotation);
  const x = snapCentre(at.x, w);
  const y = snapCentre(at.y, d);
  const free = !collides(boxAt(x, y, at.z, w, d, data.height), instance);
  moveBrick(instance, x, y, free ? at.z : restingHeight(boxAt(x, y, 0, w, d, data.height), instance), rotation);
};

export const removeBricks = (instances: Instance[]) =>
  commit('bricks.undo.remove', () => instances.forEach((instance) => pluginContext().editor.model.root.instances.delete(instance.id)));

export const recolorBricks = (instances: Instance[], color: string) =>
  commit('bricks.undo.color', () => {
    const material = ensureColorMaterial(color);
    for (const instance of instances) {
      instance.material = material;
      pluginContext().data.set(instance, { color });
    }
  });

/** a copy on top of it */
export const duplicateBrick = (instance: Instance, data: BrickData) => {
  const at = placementOf(instance);
  const [w, d] = turned(data.w, data.d, at.rotation);
  let copy: Instance | null = null;
  commit('bricks.undo.duplicate', () => {
    copy = pluginContext().editor.model.root.addInstance(
      instance.definition,
      placementMatrix(at.x, at.y, restingHeight(boxAt(at.x, at.y, 0, w, d, data.height)), at.rotation),
      instance.name,
    );
    if (!data.model) {
      copy.material = instance.material;
      pluginContext().data.set(copy, { color: colorOf(instance) });
    }
  });
  return copy as Instance | null;
};

export const selectBricks = (ids: number[]) =>
  pluginContext().editor.select(
    ids.map((id) => ({ kind: 'instance', id })),
    'set',
  );

export const selectedBricks = () => {
  const editor = pluginContext().editor;
  return [...editor.selection.values()].flatMap((ref) => {
    if (ref.kind !== 'instance') {
      return [];
    }
    const instance = editor.model.root.instances.get(ref.id as number);
    const data = instance && brickOf(instance.definition);
    return instance && data ? [{ instance, data }] : [];
  });
};

const DEFAULT_RADIUS = 0.13;

/** the camera on the bricks, or on the grid while there are none – the app's other views are far too wide for them */
export const frameBricks = () => {
  const boxes = placedBricks().map(({ instance, data }) => boxOf(instance, data));
  const around = boxes.reduce(
    (all, box) => ({
      x0: Math.min(all.x0, box.x0),
      x1: Math.max(all.x1, box.x1),
      y0: Math.min(all.y0, box.y0),
      y1: Math.max(all.y1, box.y1),
      z1: Math.max(all.z1, box.z1),
    }),
    boxes.length
      ? { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z1: 0 }
      : { x0: -DEFAULT_RADIUS, x1: DEFAULT_RADIUS, y0: -DEFAULT_RADIUS, y1: DEFAULT_RADIUS, z1: 0 },
  );
  const centre = [(around.x0 + around.x1) / 2, (around.y0 + around.y1) / 2, around.z1 / 2];
  const radius = Math.max(0.05, Math.hypot(around.x1 - around.x0, around.y1 - around.y0, around.z1) / 2);
  const distance = radius * 3;
  pluginContext().editor.viewer.rig.applyState({
    position: [centre[0] - distance * 0.45, centre[1] - distance * 0.7, centre[2] + distance * 0.6],
    target: centre,
    fov: 35,
    ortho: false,
  });
};
