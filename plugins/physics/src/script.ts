import type { Entities, Instance } from '../../../src/core/model';
import type { ScriptApi } from '../../../src/scripting/api';
import {
  BODY_TYPES,
  JOINT_KINDS,
  REGION_TYPES,
  bodyData,
  settingsOf,
  writeBodyData,
  writeSettings,
  type BodyData,
  type JointData,
  type PhysicsSettings,
  type Vec,
} from './data';
import { physicsInstances, findInstance } from './scene';
import { resetSim, startSim } from './sim';
import { pluginContext, t, THREE } from './runtime';
import { usePhysicsState } from './state';

/**
 * The script functions: s3d.physicsBody(), s3d.physicsJoint(), s3d.physicsSettings(), s3d.physicsStart(),
 * s3d.physicsBodies() and s3d.physicsRemove(). Points and axes in scripts are model coordinates – the plugin
 * keeps them in the instance's own coordinates, so they move with it.
 */

/** what a script may name a group by: its handle (s3d.box …), the instance, its id or its name */
export type TargetRef = { inst: Instance } | Instance | number | string;

const findByName = (entities: Entities, name: string): Instance | null => {
  for (const instance of entities.instances.values()) {
    if (instance.name === name) {
      return instance;
    }
    const found = findByName(instance.definition.entities, name);
    if (found) {
      return found;
    }
  }
  return null;
};

export const resolveTarget = (target: TargetRef): Instance => {
  const context = pluginContext();
  let instance: Instance | null = null;
  if (typeof target === 'number') {
    instance = findInstance(target)?.instance ?? null;
  } else if (typeof target === 'string') {
    instance = findByName(context.editor.model.root, target);
  } else if (target && 'inst' in target) {
    instance = target.inst;
  } else if (target && 'definition' in target) {
    instance = target;
  }
  if (!instance) {
    throw new Error(t('physics.errors.noTarget', { target: String(typeof target === 'object' ? '?' : target) }));
  }
  return instance;
};

const worldOf = (instance: Instance) => findInstance(instance.id)?.world ?? instance.matrix.clone();

const toLocal = (point: Vec, world: InstanceType<typeof THREE.Matrix4>, direction = false): Vec => {
  const inverse = world.clone().invert();
  const vector = new THREE.Vector3(point[0], point[1], point[2]);
  if (direction) {
    // a direction: through the inverse without moving, kept at its length 1
    vector.transformDirection(inverse);
  } else {
    vector.applyMatrix4(inverse);
  }
  return vector.toArray().map((value) => Math.round(value * 1e6) / 1e6) as Vec;
};

const isVec = (value: unknown): value is Vec =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number');

/** s3d.physicsBody(target, props) – makes a group a body (or region) or changes it; returns the instance id */
export const scriptBody = (_api: ScriptApi, target: TargetRef, props: Partial<BodyData> = {}) => {
  const instance = resolveTarget(target);
  const type = props.type ?? bodyData(instance)?.type ?? 'dynamic';
  if (!([...BODY_TYPES, ...REGION_TYPES] as string[]).includes(type)) {
    throw new Error(t('physics.errors.unknownType', { type, types: [...BODY_TYPES, ...REGION_TYPES].join(', ') }));
  }
  for (const key of ['velocity', 'spin', 'force', 'thrust'] as const) {
    if (props[key] !== undefined && !isVec(props[key])) {
      throw new Error(t('physics.errors.vector', { name: key }));
    }
  }
  const { joints: _joints, ...rest } = props;
  writeBodyData(instance, { ...bodyData(instance), ...rest, type } as BodyData);
  usePhysicsState().revision++;
  return instance.id;
};

export interface ScriptJoint extends Omit<JointData, 'to'> {
  /** another group (handle, instance, id, name), 'world' or 'parent' */
  to?: TargetRef | 'world' | 'parent';
}

/**
 * s3d.physicsJoint(target, { kind, to, at, axis, toAt, … }) – adds a joint to a body (it becomes dynamic when it is
 * no body yet); `at`, `axis` and `toAt` in model coordinates. Returns the joint's index on the body.
 */
export const scriptJoint = (_api: ScriptApi, target: TargetRef, joint: ScriptJoint) => {
  const instance = resolveTarget(target);
  if (!JOINT_KINDS.includes(joint.kind)) {
    throw new Error(t('physics.errors.unknownJoint', { kind: String(joint.kind), kinds: JOINT_KINDS.join(', ') }));
  }
  if (!isVec(joint.at)) {
    throw new Error(t('physics.errors.vector', { name: 'at' }));
  }
  const world = worldOf(instance);
  let to: JointData['to'] = 'parent';
  let otherWorld: InstanceType<typeof THREE.Matrix4> | null = null;
  if (joint.to === 'world' || joint.to === 'parent' || joint.to === undefined) {
    to = joint.to ?? 'parent';
  } else {
    const other = resolveTarget(joint.to);
    to = other.id;
    otherWorld = worldOf(other);
    if (!bodyData(other)) {
      writeBodyData(other, { type: 'dynamic' });
    }
  }
  const stored: JointData = { ...joint, to, at: toLocal(joint.at, world) };
  if (joint.axis) {
    stored.axis = toLocal(joint.axis, world, true);
  }
  if (joint.toAt) {
    stored.toAt = otherWorld ? toLocal(joint.toAt, otherWorld) : joint.toAt;
  }
  const data = bodyData(instance) ?? { type: 'dynamic' as const };
  const joints = [...(data.joints ?? []), stored];
  writeBodyData(instance, { ...data, joints });
  usePhysicsState().revision++;
  return joints.length - 1;
};

export const scriptSettings = (_api: ScriptApi, change: Partial<PhysicsSettings> = {}) =>
  Object.keys(change).length ? writeSettings(change) : settingsOf();

let starting: Promise<void> = Promise.resolve();
/** done when the simulation a script asked for has started */
export const whenStarted = () => starting;

/** s3d.physicsStart({ at, pause }) – starts the simulation once the script is done */
export const scriptStart = (_api: ScriptApi, options: { at?: number; pause?: boolean } = {}) => {
  starting = new Promise((resolve) =>
    setTimeout(() => {
      resetSim();
      void startSim(options).then(resolve);
    }),
  );
};

export const scriptBodies = () =>
  physicsInstances().map(({ instance, data }) => ({ id: instance.id, name: instance.name || instance.definition.name, ...data }));

export const scriptRemove = (_api: ScriptApi, target: TargetRef) => {
  writeBodyData(resolveTarget(target), undefined);
  usePhysicsState().revision++;
};
