import type { Instance } from '../../../src/core/model';
import { pluginContext } from './runtime';

/**
 * What an animation is made of, saved with the model as plugin data: on each animated group or component its
 * tracks (one per channel: x, rx, sx, visible, r …) and constraints, on the model the scene – frame rate and range,
 * cameras, shots, the sun, lights and material colours. Every track is a list of keyframes over frames.
 */

export type Vec = [number, number, number];

/**
 * how the curve goes from a key to the next: holds, a straight line, a smooth Bézier curve (with handles), or an
 * easing – faster or slower at its ends, overshooting (back), bouncing or springing (elastic) into the next key
 */
export const INTERPOLATIONS = ['constant', 'linear', 'bezier', 'ease-in', 'ease-out', 'ease-in-out', 'back', 'bounce', 'elastic'] as const;
export type Interpolation = (typeof INTERPOLATIONS)[number];
/** a key's handles: set by the curve around it (smooth, flat at peaks), or placed by hand */
export type HandleKind = 'auto' | 'free';

export interface Key {
  frame: number;
  value: number;
  interp: Interpolation;
  handle?: HandleKind;
  /** free handles, relative to the key: [frames, value] – left points back in time, right forward */
  left?: [number, number];
  right?: [number, number];
}

export interface Track {
  keys: Key[];
  /** repeats the keyed part before and after it (like Blender's Cycles modifier) */
  cycle?: boolean;
}

export type Tracks = Partial<Record<string, Track>>;

/** the channels of a group or component */
export const OBJECT_CHANNELS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz', 'visible', 'r', 'g', 'b', 'opacity', 'path'] as const;
export const CAMERA_CHANNELS = ['x', 'y', 'z', 'tx', 'ty', 'tz', 'lens', 'path'] as const;
export const SUN_CHANNELS = ['hour', 'daylight'] as const;
export const LIGHT_CHANNELS = ['x', 'y', 'z', 'tx', 'ty', 'tz', 'intensity', 'r', 'g', 'b'] as const;
export const MATERIAL_CHANNELS = ['r', 'g', 'b', 'opacity'] as const;

/** channels that only hold (on/off) – never a curve between */
export const STEPPED = new Set(['visible']);

/** an object that moves along the edges of another group (a line, an arc, a path drawn with the line tool) */
export interface PathLink {
  /** the instance id of the group whose edges are the path */
  curve: number;
  /** turns the object along the path – its front axis points where it goes */
  follow?: boolean;
  /** the object's front: the axis that points along the path (default +x) */
  axis?: Axis;
}

export type Axis = '+x' | '-x' | '+y' | '-y';

/** turns an object (or a camera) so it always looks at another group */
export interface LookAt {
  target: number;
  /** the object's front axis that points at the target (default +x) */
  axis?: Axis;
}

export interface ObjectAnimation {
  tracks: Tracks;
  /** the point it turns and scales about, in its own coordinates (default: the middle of its box) */
  pivot?: Vec;
  path?: PathLink;
  lookAt?: LookAt;
}

export interface CameraAnimation {
  id: string;
  name: string;
  tracks: Tracks;
  /** looks at this group (its middle) instead of the target channels */
  lookAt?: number;
  path?: PathLink;
}

export interface Shot {
  id: string;
  name: string;
  /** the frame the shot starts at – it lasts until the next one */
  frame: number;
  camera: string;
}

export interface LightAnimation {
  id: string;
  name: string;
  kind: 'point' | 'spot';
  /** metres it reaches, a spot's cone (degrees from its axis) */
  range: number;
  angle: number;
  shadow: boolean;
  tracks: Tracks;
}

export interface SceneAnimation {
  /** frames a second */
  fps: number;
  start: number;
  end: number;
  cameras: CameraAnimation[];
  shots: Shot[];
  sun: { tracks: Tracks };
  lights: LightAnimation[];
  /** material name → its colour and opacity tracks */
  materials: Record<string, { tracks: Tracks }>;
}

export const OBJECT_FORMAT = { id: 'animation.object', key: 'animation', version: 1 };
export const SCENE_FORMAT = { id: 'animation.scene', key: 'animation', version: 1 };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const validKey = (value: unknown) =>
  isRecord(value) &&
  typeof value.frame === 'number' &&
  typeof value.value === 'number' &&
  (INTERPOLATIONS as readonly string[]).includes(value.interp as string);

const validTracks = (value: unknown) =>
  isRecord(value) && Object.values(value).every((track) => isRecord(track) && Array.isArray(track.keys) && track.keys.every(validKey));

export const validObjectAnimation = (value: unknown) => isRecord(value) && validTracks(value.tracks);

export const validSceneAnimation = (value: unknown) =>
  isRecord(value) &&
  typeof value.fps === 'number' &&
  typeof value.start === 'number' &&
  typeof value.end === 'number' &&
  Array.isArray(value.cameras) &&
  Array.isArray(value.shots) &&
  Array.isArray(value.lights) &&
  isRecord(value.materials);

export const emptyScene = (): SceneAnimation => ({
  fps: 24,
  start: 1,
  end: 120,
  cameras: [],
  shots: [],
  sun: { tracks: {} },
  lights: [],
  materials: {},
});

/** the scene's animation – a fresh copy to change, or the defaults */
export const sceneAnimation = (): SceneAnimation => {
  const stored = pluginContext().data.getModel<SceneAnimation>();
  return stored ? { ...emptyScene(), ...structuredClone(stored) } : emptyScene();
};

/** writes the scene's animation (inside editor.commit for undo) */
export const writeScene = (scene: SceneAnimation) => pluginContext().data.setModel(scene);

export const objectAnimation = (instance: Instance) => pluginContext().data.get<ObjectAnimation>(instance);

/** writes an object's animation; without tracks or constraints the data goes away */
export const writeObject = (instance: Instance, animation: ObjectAnimation | undefined) => {
  const empty =
    !animation || (!Object.values(animation.tracks).some((track) => track?.keys.length) && !animation.path && !animation.lookAt);
  pluginContext().data.set(instance, empty ? undefined : animation);
};

/** a short random id for cameras, shots and lights */
export const newId = () => Math.random().toString(36).slice(2, 9);
