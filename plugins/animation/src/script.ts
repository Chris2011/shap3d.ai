import type { Entities, Instance } from '../../../src/core/model';
import type { ScriptApi } from '../../../src/scripting/api';
import { forgetScene } from './apply';
import { setKey } from './curves';
import {
  INTERPOLATIONS,
  newId,
  objectAnimation,
  sceneAnimation,
  writeObject,
  writeScene,
  type Axis,
  type CameraAnimation,
  type Interpolation,
  type LightAnimation,
  type ObjectAnimation,
  type SceneAnimation,
  type Track,
  type Tracks,
} from './data';
import { placementAt } from './pose';
import { pluginContext, t, THREE } from './runtime';
import { chain, findInstance } from './scene';
import { useAnimationState } from './state';

/**
 * The script functions – s3d.animate(), s3d.animateKeys(), s3d.animatePath(), s3d.animateLookAt(),
 * s3d.animateCamera(), s3d.animateShot(), s3d.animateSun(), s3d.animateLight(), s3d.animateMaterial(),
 * s3d.animateScene(), s3d.animatePlay(), s3d.animateRender() and s3d.animateClear(). A script runs as one undo step,
 * so they write the animation directly.
 */

/** what a script may name a group by: its handle (s3d.box …), the instance, its id or its name */
export type TargetRef = { inst: Instance } | Instance | number | string;

const findByName = (entities: Entities, name: string): Instance | null => {
  for (const instance of entities.instances.values()) {
    if (instance.name === name || (!instance.name && instance.definition.name === name)) {
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
  let instance: Instance | null = null;
  if (typeof target === 'number') {
    instance = findInstance(target)?.instance ?? null;
  } else if (typeof target === 'string') {
    instance = findByName(pluginContext().editor.model.root, target);
  } else if (target && 'inst' in target) {
    instance = target.inst;
  } else if (target && 'definition' in target) {
    instance = target;
  }
  if (!instance) {
    throw new Error(t('animation.errors.noTarget', { target: String(typeof target === 'object' ? '?' : target) }));
  }
  return instance;
};

const isVec = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number');

const vector = (value: unknown, name: string) => {
  if (!isVec(value)) {
    throw new Error(t('animation.errors.vector', { name }));
  }
  return value;
};

const interpolation = (value: unknown): Interpolation | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!(INTERPOLATIONS as readonly string[]).includes(value as string)) {
    throw new Error(t('animation.errors.interpolation', { value: String(value), values: INTERPOLATIONS.join(', ') }));
  }
  return value as Interpolation;
};

/** "#rrggbb" (or a CSS colour) as three channels 0 … 1 */
const rgb = (color: string) => {
  const parsed = new THREE.Color().setStyle(color, THREE.SRGBColorSpace);
  return parsed.getRGB(new THREE.Color(), THREE.SRGBColorSpace);
};

const trackOf = (tracks: Tracks, channel: string): Track => (tracks[channel] ??= { keys: [] });

const changed = () => {
  forgetScene();
  useAnimationState().revision++;
};

const editObject = (instance: Instance, change: (animation: ObjectAnimation) => void) => {
  const animation = structuredClone(objectAnimation(instance)) ?? { tracks: {} };
  change(animation);
  writeObject(instance, animation);
  changed();
};

const editScene = <T>(change: (scene: SceneAnimation) => T): T => {
  const scene = sceneAnimation();
  const result = change(scene);
  writeScene(scene);
  changed();
  return result;
};

export interface AnimateOptions {
  frame?: number;
  /** where its middle (pivot) is, in its parent's coordinates */
  at?: [number, number, number];
  x?: number;
  y?: number;
  z?: number;
  /** turn in degrees about x, y and z */
  rotate?: [number, number, number];
  rx?: number;
  ry?: number;
  rz?: number;
  scale?: number | [number, number, number];
  sx?: number;
  sy?: number;
  sz?: number;
  visible?: boolean;
  color?: string;
  opacity?: number;
  interp?: Interpolation;
  /** keys where it is now (all place channels) besides what is given */
  here?: boolean;
  /** the point it turns and scales about, in the model where it is now (a hinge, a joint) – before its first keys */
  pivot?: [number, number, number];
}

/** s3d.animate(target, { frame, at, rotate, scale, visible, color, opacity, interp }) – keys at a frame */
export const scriptAnimate = (_api: ScriptApi, target: TargetRef, options: AnimateOptions = {}) => {
  const instance = resolveTarget(target);
  const frame = options.frame ?? Math.round(useAnimationState().frame);
  const interp = interpolation(options.interp);
  if (options.pivot !== undefined) {
    const found = findInstance(instance.id);
    const world = chain([...(found?.ancestors ?? []), instance]);
    const local = new THREE.Vector3(...vector(options.pivot, 'pivot')).applyMatrix4(world.invert());
    editObject(instance, (animation) => {
      animation.pivot = local.toArray().map((value) => Math.round(value * 1e6) / 1e6) as [number, number, number];
    });
  }
  const values: Record<string, number> = {};
  if (options.here) {
    Object.assign(values, placementAt(instance, objectAnimation(instance), frame));
  }
  if (options.at !== undefined) {
    const at = vector(options.at, 'at');
    Object.assign(values, { x: at[0], y: at[1], z: at[2] });
  }
  if (options.rotate !== undefined) {
    const turn = vector(options.rotate, 'rotate');
    Object.assign(values, { rx: turn[0], ry: turn[1], rz: turn[2] });
  }
  if (options.scale !== undefined) {
    const scale = typeof options.scale === 'number' ? [options.scale, options.scale, options.scale] : vector(options.scale, 'scale');
    Object.assign(values, { sx: scale[0], sy: scale[1], sz: scale[2] });
  }
  for (const channel of ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz', 'opacity'] as const) {
    if (typeof options[channel] === 'number') {
      values[channel] = options[channel];
    }
  }
  if (options.visible !== undefined) {
    values.visible = options.visible ? 1 : 0;
  }
  if (options.color !== undefined) {
    const color = rgb(options.color);
    Object.assign(values, { r: color.r, g: color.g, b: color.b });
  }
  editObject(instance, (animation) => {
    for (const [channel, value] of Object.entries(values)) {
      setKey(trackOf(animation.tracks, channel), frame, value, channel, channel === 'visible' ? 'constant' : interp);
    }
  });
  return instance.id;
};

/** s3d.animateKeys(target, channel, [[frame, value, interp?], …], { interp, cycle }) – a whole channel at once */
export const scriptKeys = (
  _api: ScriptApi,
  target: TargetRef | 'sun' | { camera: string } | { light: string } | { material: string },
  channel: string,
  keys: [number, number, Interpolation?][],
  options: { interp?: Interpolation; cycle?: boolean } = {},
) => {
  const interp = interpolation(options.interp);
  const valid = (key: unknown) =>
    Array.isArray(key) && (key.length === 2 || key.length === 3) && typeof key[0] === 'number' && typeof key[1] === 'number';
  if (!Array.isArray(keys) || !keys.every(valid)) {
    throw new Error(t('animation.errors.keys'));
  }
  const fill = (tracks: Tracks) => {
    const track = trackOf(tracks, channel);
    for (const [frame, value, own] of keys) {
      setKey(track, frame, value, channel, interpolation(own) ?? interp);
    }
    track.cycle = options.cycle || undefined;
  };
  // a camera, light or material is named by a plain object with a string – a group's handle has methods of those names
  const named = (key: 'camera' | 'light' | 'material') =>
    !!target && typeof target === 'object' && typeof (target as Record<string, unknown>)[key] === 'string';
  if (target === 'sun' || named('camera') || named('light') || named('material')) {
    editScene((scene) => {
      if (target === 'sun') {
        fill(scene.sun.tracks);
      } else if (named('camera')) {
        fill(cameraNamed(scene, (target as { camera: string }).camera).tracks);
      } else if (named('light')) {
        fill(lightNamed(scene, (target as { light: string }).light).tracks);
      } else {
        fill((scene.materials[(target as { material: string }).material] ??= { tracks: {} }).tracks);
      }
    });
    return;
  }
  editObject(resolveTarget(target as TargetRef), (animation) => fill(animation.tracks));
};

const cameraNamed = (scene: SceneAnimation, name: string) => {
  const camera = scene.cameras.find((entry) => entry.name === name || entry.id === name);
  if (!camera) {
    throw new Error(t('animation.errors.noCamera', { name }));
  }
  return camera;
};

const lightNamed = (scene: SceneAnimation, name: string) => {
  const light = scene.lights.find((entry) => entry.name === name || entry.id === name);
  if (!light) {
    throw new Error(t('animation.errors.noLight', { name }));
  }
  return light;
};

const checkAxis = (axis: unknown): Axis | undefined => {
  if (axis === undefined) {
    return undefined;
  }
  if (!['+x', '-x', '+y', '-y'].includes(axis as string)) {
    throw new Error(t('animation.errors.axis', { value: String(axis) }));
  }
  return axis as Axis;
};

/**
 * s3d.animatePath(target, path, { from, to, follow, axis, interp }) – moves a group along the edges of another group,
 * from the start of the line at frame `from` to its end at `to` (the scene's range by default)
 */
export const scriptPath = (
  _api: ScriptApi,
  target: TargetRef,
  path: TargetRef,
  options: { from?: number; to?: number; follow?: boolean; axis?: Axis; interp?: Interpolation } = {},
) => {
  const instance = resolveTarget(target);
  const curve = resolveTarget(path);
  const scene = sceneAnimation();
  const interp = interpolation(options.interp) ?? 'linear';
  editObject(instance, (animation) => {
    animation.path = { curve: curve.id, follow: options.follow ?? true, axis: checkAxis(options.axis) };
    const track: Track = { keys: [] };
    setKey(track, options.from ?? scene.start, 0, 'path', interp);
    setKey(track, options.to ?? scene.end, 1, 'path', interp);
    animation.tracks.path = track;
  });
};

/** s3d.animateLookAt(target, other, { axis }) – turns a group so its front always points at another one (null: no more) */
export const scriptLookAt = (_api: ScriptApi, target: TargetRef, other: TargetRef | null, options: { axis?: Axis } = {}) => {
  const instance = resolveTarget(target);
  editObject(instance, (animation) => {
    if (other === null) {
      delete animation.lookAt;
    } else {
      animation.lookAt = { target: resolveTarget(other).id, axis: checkAxis(options.axis) };
    }
  });
};

export interface CameraOptions {
  name?: string;
  frame?: number;
  position?: [number, number, number];
  target?: [number, number, number];
  lens?: number;
  interp?: Interpolation;
  /** looks at this group wherever it goes */
  lookAt?: TargetRef;
  /** flies along this group's edges (from the scene's start to its end) */
  path?: TargetRef;
  follow?: boolean;
}

/**
 * s3d.animateCamera({ name, frame, position, target, lens, lookAt, path, follow }) – a camera (made on first use of
 * its name, with a shot if it is the first) keyed at a frame; returns its name
 */
export const scriptCamera = (_api: ScriptApi, options: CameraOptions = {}) => {
  const frame = options.frame ?? Math.round(useAnimationState().frame);
  const interp = interpolation(options.interp);
  return editScene((scene) => {
    let camera = options.name ? scene.cameras.find((entry) => entry.name === options.name) : scene.cameras[0];
    if (!camera) {
      camera = {
        id: newId(),
        name: options.name ?? t('animation.camera.name', { number: scene.cameras.length + 1 }),
        tracks: {},
      } satisfies CameraAnimation;
      scene.cameras.push(camera);
      if (!scene.shots.length) {
        scene.shots.push({ id: newId(), name: camera.name, frame: scene.start, camera: camera.id });
      }
    }
    const key = (channel: string, value: number) => setKey(trackOf(camera.tracks, channel), frame, value, channel, interp);
    if (options.position !== undefined) {
      const [x, y, z] = vector(options.position, 'position');
      key('x', x);
      key('y', y);
      key('z', z);
    }
    if (options.target !== undefined) {
      const [x, y, z] = vector(options.target, 'target');
      key('tx', x);
      key('ty', y);
      key('tz', z);
    }
    if (options.lens !== undefined) {
      key('lens', options.lens);
    }
    if (options.lookAt !== undefined) {
      camera.lookAt = resolveTarget(options.lookAt).id;
    }
    if (options.path !== undefined) {
      camera.path = { curve: resolveTarget(options.path).id, follow: options.follow ?? false };
      if (!camera.tracks.path?.keys.length) {
        const track: Track = { keys: [] };
        setKey(track, scene.start, 0, 'path', 'linear');
        setKey(track, scene.end, 1, 'path', 'linear');
        camera.tracks.path = track;
      }
    }
    return camera.name;
  });
};

/** s3d.animateShot({ frame, camera, name }) – from this frame on the film is seen through that camera */
export const scriptShot = (_api: ScriptApi, options: { frame: number; camera: string; name?: string }) =>
  editScene((scene) => {
    const camera = cameraNamed(scene, options.camera);
    scene.shots = scene.shots.filter((shot) => shot.frame !== options.frame);
    scene.shots.push({ id: newId(), name: options.name ?? camera.name, frame: options.frame, camera: camera.id });
    scene.shots.sort((a, b) => a.frame - b.frame);
  });

/** s3d.animateSun({ frame, hour, daylight, interp }) – the sun's hour (0 … 24) and how much daylight there is (0 … 1) */
export const scriptSun = (_api: ScriptApi, options: { frame?: number; hour?: number; daylight?: number; interp?: Interpolation }) => {
  const frame = options.frame ?? Math.round(useAnimationState().frame);
  const interp = interpolation(options.interp);
  editScene((scene) => {
    if (options.hour !== undefined) {
      setKey(trackOf(scene.sun.tracks, 'hour'), frame, options.hour, 'hour', interp);
    }
    if (options.daylight !== undefined) {
      setKey(trackOf(scene.sun.tracks, 'daylight'), frame, options.daylight, 'daylight', interp);
    }
  });
};

export interface LightOptions {
  name: string;
  kind?: 'point' | 'spot';
  frame?: number;
  position?: [number, number, number];
  /** where a spot shines at */
  target?: [number, number, number];
  intensity?: number;
  color?: string;
  range?: number;
  angle?: number;
  shadow?: boolean;
  interp?: Interpolation;
}

/** s3d.animateLight({ name, kind, frame, position, target, intensity, color, range, angle, shadow }) – a lamp, keyed */
export const scriptLight = (_api: ScriptApi, options: LightOptions) => {
  const frame = options.frame ?? Math.round(useAnimationState().frame);
  const interp = interpolation(options.interp);
  editScene((scene) => {
    let light = scene.lights.find((entry) => entry.name === options.name);
    if (!light) {
      light = {
        id: newId(),
        name: options.name,
        kind: options.kind ?? 'point',
        range: options.range ?? 10,
        angle: options.angle ?? 30,
        shadow: options.shadow ?? false,
        tracks: {},
      } satisfies LightAnimation;
      scene.lights.push(light);
    }
    Object.assign(light, {
      kind: options.kind ?? light.kind,
      range: options.range ?? light.range,
      angle: options.angle ?? light.angle,
      shadow: options.shadow ?? light.shadow,
    });
    const key = (channel: string, value: number) => setKey(trackOf(light.tracks, channel), frame, value, channel, interp);
    if (options.position !== undefined) {
      const [x, y, z] = vector(options.position, 'position');
      key('x', x);
      key('y', y);
      key('z', z);
    }
    if (options.target !== undefined) {
      const [x, y, z] = vector(options.target, 'target');
      key('tx', x);
      key('ty', y);
      key('tz', z);
    }
    if (options.intensity !== undefined) {
      key('intensity', options.intensity);
    }
    if (options.color !== undefined) {
      const color = rgb(options.color);
      key('r', color.r);
      key('g', color.g);
      key('b', color.b);
    }
  });
};

/** s3d.animateMaterial(name, { frame, color, opacity, interp }) – a material's colour and opacity over time */
export const scriptMaterial = (
  _api: ScriptApi,
  name: string,
  options: { frame?: number; color?: string; opacity?: number; interp?: Interpolation } = {},
) => {
  if (!pluginContext().editor.model.materials.some((material) => material.name === name)) {
    throw new Error(t('animation.errors.noMaterial', { name }));
  }
  const frame = options.frame ?? Math.round(useAnimationState().frame);
  const interp = interpolation(options.interp);
  editScene((scene) => {
    const tracks = (scene.materials[name] ??= { tracks: {} }).tracks;
    if (options.color !== undefined) {
      const color = rgb(options.color);
      setKey(trackOf(tracks, 'r'), frame, color.r, 'r', interp);
      setKey(trackOf(tracks, 'g'), frame, color.g, 'g', interp);
      setKey(trackOf(tracks, 'b'), frame, color.b, 'b', interp);
    }
    if (options.opacity !== undefined) {
      setKey(trackOf(tracks, 'opacity'), frame, options.opacity, 'opacity', interp);
    }
  });
};

/** s3d.animateScene({ fps, start, end }) – the frame rate and range; returns them */
export const scriptScene = (_api: ScriptApi, options: { fps?: number; start?: number; end?: number } = {}) =>
  editScene((scene) => {
    scene.fps = Math.max(1, Math.min(120, options.fps ?? scene.fps));
    scene.start = Math.round(options.start ?? scene.start);
    scene.end = Math.max(scene.start + 1, Math.round(options.end ?? scene.end));
    return { fps: scene.fps, start: scene.start, end: scene.end };
  });

/** s3d.animateClear(target?) – removes a group's animation, or (without one) the whole animation */
export const scriptClear = (_api: ScriptApi, target?: TargetRef) => {
  if (target !== undefined) {
    writeObject(resolveTarget(target), undefined);
    changed();
    return;
  }
  const clear = (entities: Entities) => {
    for (const instance of entities.instances.values()) {
      if (objectAnimation(instance)) {
        writeObject(instance, undefined);
      }
      clear(instance.definition.entities);
    }
  };
  clear(pluginContext().editor.model.root);
  pluginContext().data.setModel(undefined);
  changed();
};

/** what a script asked for once it is done: a frame to show, playing, looking through the camera, a render */
let after: { frame?: number; play?: boolean; lookThrough?: boolean; render?: 'video' | 'png'; width?: number; height?: number } = {};
export const takeScriptRequest = () => {
  const request = after;
  after = {};
  return request;
};
let notify: () => void = () => {};
export const onScriptRequest = (listener: () => void) => {
  notify = listener;
};

/** s3d.animatePlay({ frame, play, lookThrough }) – once the script is done: shows a frame, plays, looks through the camera */
export const scriptPlay = (_api: ScriptApi, options: { frame?: number; play?: boolean; lookThrough?: boolean } = {}) => {
  after = { ...after, ...options };
  setTimeout(() => notify());
};

/** s3d.animateRender({ kind, width, height }) – renders the film once the script is done */
export const scriptRender = (_api: ScriptApi, options: { kind?: 'video' | 'png'; width?: number; height?: number } = {}) => {
  after = { ...after, render: options.kind ?? 'video', width: options.width, height: options.height };
  setTimeout(() => notify());
};
