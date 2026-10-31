import type { Instance } from '../../../src/core/model';
import { pluginContext } from './runtime';

/**
 * What the plugin keeps in the model: physics data on group and component instances (`instance.pluginData.physics`)
 * – what kind of body it is, its material, shape, start motion, forces and joints – and the simulation's settings
 * on the model (gravity, wind, air, ground). Plain JSON, saved with the model, copied with the instances.
 */

export type Vec = [number, number, number];

/** bodies take part in collisions; the regions (water, liquid, tunnel) are volumes the simulation uses */
export const BODY_TYPES = ['dynamic', 'static', 'kinematic', 'off'] as const;
export const REGION_TYPES = ['water', 'liquid', 'tunnel'] as const;
export type BodyType = (typeof BODY_TYPES)[number] | (typeof REGION_TYPES)[number];

export const isRegion = (type: BodyType) => (REGION_TYPES as readonly string[]).includes(type);

export const SHAPES = ['auto', 'hull', 'box', 'sphere', 'cylinder', 'mesh'] as const;
export type ShapeKind = (typeof SHAPES)[number];

/** materials: density (kg/m³), friction (0 … 1+) and bounce (restitution, 0 … 1) */
export const MATERIALS = {
  wood: { density: 600, friction: 0.5, bounce: 0.3, colour: '#c08a4a' },
  steel: { density: 7850, friction: 0.4, bounce: 0.2, colour: '#8d99a6' },
  stone: { density: 2500, friction: 0.7, bounce: 0.1, colour: '#9a9182' },
  rubber: { density: 1100, friction: 0.9, bounce: 0.8, colour: '#d6336c' },
  ice: { density: 900, friction: 0.02, bounce: 0.05, colour: '#99e9f2' },
  plastic: { density: 950, friction: 0.35, bounce: 0.5, colour: '#4dabf7' },
  foam: { density: 40, friction: 0.6, bounce: 0.2, colour: '#ffe066' },
} as const;
export type MaterialName = keyof typeof MATERIALS;
export const isMaterial = (name: unknown): name is MaterialName => typeof name === 'string' && name in MATERIALS;

export const JOINT_KINDS = ['hinge', 'slider', 'ball', 'fixed', 'rope', 'spring'] as const;
export type JointKind = (typeof JOINT_KINDS)[number];

/** a motor on a hinge (degrees) or a slider (metres): to a position, or turning/moving at a speed */
export interface MotorData {
  mode: 'position' | 'speed';
  /** degrees or metres (position), degrees or metres per second (speed) */
  value: number;
  /** how hard it pulls: 1 = normal, more for heavy arms */
  strength?: number;
}

/** a joint from this body to another one, to the body it sits in (parent) or to the world */
export interface JointData {
  kind: JointKind;
  /** 'parent': the body this one lies in (or the world when there is none); 'world'; or another instance's id */
  to?: 'parent' | 'world' | number;
  /** the anchor in this instance's own coordinates (metres) */
  at: Vec;
  /** hinge and slider: the axis in this instance's own coordinates */
  axis?: Vec;
  /** rope and spring: the other end – in the other body's own coordinates, or in model coordinates for the world */
  toAt?: Vec;
  /** rope: the longest it gets; spring: the length it rests at – default the distance at the start */
  length?: number;
  /** hinge (degrees) and slider (metres): how far it may turn or move from where it starts */
  min?: number;
  max?: number;
  motor?: MotorData;
  /** the motor's target over time: [seconds, value] pairs, repeated – a robot arm's program */
  program?: [number, number][];
  /** spring: N/m and N·s/m */
  stiffness?: number;
  damping?: number;
}

export interface BodyData {
  type: BodyType;
  material?: MaterialName | 'custom';
  /** kg/m³ – custom material, water and liquid */
  density?: number;
  /** kg – overrides the density */
  mass?: number;
  friction?: number;
  bounce?: number;
  shape?: ShapeKind;
  /**
   * dynamic: the speed it starts with (m/s); kinematic: the speed it keeps; water: the current;
   * tunnel: the wind blowing in (m/s)
   */
  velocity?: Vec;
  /** dynamic: the turn it starts with, kinematic: the turn it keeps (degrees per second around x, y, z) */
  spin?: Vec;
  /** kinematic: back and forth – the seconds for one way there and back (0 = on and on) */
  period?: number;
  /** a force on it all the time, in model coordinates (N) – e.g. a push or a magnet */
  force?: Vec;
  /** a force in its own coordinates (N) – thrust of a rocket or a drone, turning with it */
  thrust?: Vec;
  /** lift of a wing: N per (m/s)² of speed along its own x, upwards along its own z */
  lift?: number;
  /** air drag: N per (m/s)² of speed through the air (wind counts) – unset: from its size when the air is on */
  drag?: number;
  joints?: JointData[];
  /** liquid: the size of a drop (m) */
  spacing?: number;
  /** liquid: how thick it is, 0 (water) … 1 (honey) */
  viscosity?: number;
  /** tunnel: cells along its longest side */
  resolution?: number;
}

/** the data format of physics bodies, so other plugins can read and write them without this one */
export const BODY_FORMAT = { id: 'physics.body', key: 'physics', version: 1 };

export const validBodyData = (value: unknown) => {
  const data = value as Partial<BodyData> | undefined;
  return (
    !!data &&
    typeof data.type === 'string' &&
    ([...BODY_TYPES, ...REGION_TYPES] as string[]).includes(data.type) &&
    (data.joints === undefined || Array.isArray(data.joints))
  );
};

export const bodyData = (instance: Instance) => {
  const data = pluginContext().data.get<BodyData>(instance);
  return data && validBodyData(data) ? data : undefined;
};

/** writes an instance's physics data (undefined removes it) – inside an undo step */
export const writeBodyData = (instance: Instance, data: BodyData | undefined) => pluginContext().data.set(instance, data);

/** density, friction and bounce of a body – its material's, overridden by its own values */
export const surfaceOf = (data: BodyData) => {
  const material = isMaterial(data.material) ? MATERIALS[data.material] : MATERIALS.wood;
  return {
    density: data.density ?? material.density,
    friction: data.friction ?? material.friction,
    bounce: data.bounce ?? material.bounce,
  };
};

// ------------------------------------------------------------ settings (on the model)

export interface PhysicsSettings {
  /** m/s² downwards (along -z) */
  gravity: number;
  /** the wind everywhere (m/s) – it pushes bodies with air drag */
  wind: Vec;
  /** air drag on every dynamic body (from its size) */
  air: boolean;
  /** a ground at z = 0 everything lands on */
  ground: boolean;
  /** 1 = real time, 0.25 = slow motion */
  speed: number;
}

export const DEFAULT_SETTINGS: PhysicsSettings = { gravity: 9.81, wind: [0, 0, 0], air: false, ground: true, speed: 1 };

export const settingsOf = (): PhysicsSettings => {
  const stored = pluginContext().data.getModel<Partial<PhysicsSettings>>() ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
};

/** changes settings – inside an undo step */
export const writeSettings = (change: Partial<PhysicsSettings>) => {
  const next = { ...settingsOf(), ...change };
  pluginContext().data.setModel(next);
  return next;
};
