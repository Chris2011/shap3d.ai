import type { Instance } from '../../../src/core/model';
import { sceneAnimation, type SceneAnimation, type Vec } from './data';
import { fovOf, poseAt, type ScenePose } from './pose';
import { pluginContext, THREE } from './runtime';
import { useAnimationState } from './state';

/**
 * Shows the scene at a frame in the 3D view without changing the model – all through the app's display API:
 * groups where the keys put them (display.place, each in its parent as shown), their colour, opacity and visibility
 * (display.look), material colours (display.material), the sun (lighting.sun), the lights (lighting.set) and – while
 * looking through it – the camera. The app keeps them over every new build of the view.
 */

type Matrix = InstanceType<typeof THREE.Matrix4>;

/** places the user has just given groups at this frame (moved without a key) – shown until the frame changes */
export const overrides = new Map<Instance, Matrix>();
/** places of groups a tool is moving right now (before the move is done) */
export const previews = new Map<Instance, Matrix>();

let scene: SceneAnimation | null = null;
let pose: ScenePose | null = null;
/** what was handed to the app last – only changes are passed on */
const placed = new Map<Instance, Matrix>();
const looked = new Map<Instance, string>();
const materials = new Map<string, string>();
let sunShown = 'null';
let lightsSet = false;

/** the scene as stored – read again after a change */
export const currentScene = () => (scene ??= sceneAnimation());
export const forgetScene = () => {
  scene = null;
};
export const currentPose = () => pose;

/** a colour (0 … 1 each) as CSS */
const hex = (color: Vec) =>
  `#${color
    .map((part) =>
      Math.round(Math.min(1, Math.max(0, part)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const applyPlaces = (current: ScenePose) => {
  const context = pluginContext();
  const shown = new Set<Instance>();
  for (const object of current.objects) {
    const instance = object.instance;
    if (object.local.equals(instance.matrix) && !placed.has(instance)) {
      continue;
    }
    shown.add(instance);
    if (!placed.get(instance)?.equals(object.local)) {
      context.display.place(instance, object.local);
      placed.set(instance, object.local.clone());
    }
  }
  for (const instance of [...placed.keys()]) {
    if (!shown.has(instance)) {
      context.display.place(instance, null);
      placed.delete(instance);
    }
  }
};

const applyLooks = (current: ScenePose) => {
  const context = pluginContext();
  const shown = new Set<Instance>();
  for (const object of current.objects) {
    if (object.visible && !object.color && object.opacity >= 0.999) {
      continue;
    }
    const look = { color: object.color ? hex(object.color) : undefined, opacity: object.opacity, hidden: !object.visible };
    const key = JSON.stringify(look);
    shown.add(object.instance);
    if (looked.get(object.instance) !== key) {
      context.display.look(object.instance, look);
      looked.set(object.instance, key);
    }
  }
  for (const instance of [...looked.keys()]) {
    if (!shown.has(instance)) {
      context.display.look(instance, null);
      looked.delete(instance);
    }
  }
  const animated = new Set<string>();
  for (const [name, look] of Object.entries(current.materials)) {
    if (!look.color && look.opacity === null) {
      continue;
    }
    const shownLook = { color: look.color ? hex(look.color) : undefined, opacity: look.opacity ?? undefined };
    const key = JSON.stringify(shownLook);
    animated.add(name);
    if (materials.get(name) !== key) {
      context.display.material(name, shownLook);
      materials.set(name, key);
    }
  }
  for (const name of [...materials.keys()]) {
    if (!animated.has(name)) {
      context.display.material(name, null);
      materials.delete(name);
    }
  }
};

const applySun = (current: ScenePose) => {
  const animated = current.sun.hour !== null || current.sun.daylight !== null;
  const sun = animated ? { hour: current.sun.hour ?? undefined, daylight: current.sun.daylight ?? undefined } : null;
  const key = JSON.stringify(sun);
  if (key !== sunShown) {
    pluginContext().lighting.sun(sun);
    sunShown = key;
  }
};

const applyLights = (current: ScenePose) => {
  if (!current.lights.length && !lightsSet) {
    return;
  }
  pluginContext().lighting.set(
    current.lights.map(({ light, position, target, intensity, color }) => ({
      kind: light.kind,
      position,
      direction: light.kind === 'spot' ? (new THREE.Vector3(...target).sub(new THREE.Vector3(...position)).toArray() as Vec) : undefined,
      color: hex(color),
      intensity,
      range: light.range,
      angle: light.angle,
      shadow: light.shadow,
    })),
  );
  lightsSet = current.lights.length > 0;
};

/** puts the camera of the pose into the view (looking through it) */
const applyCamera = (current: ScenePose) => {
  if (!current.camera) {
    return;
  }
  const rig = pluginContext().editor.viewer.rig;
  rig.applyState(
    { position: current.camera.position, target: current.camera.target, fov: fovOf(current.camera.lens), ortho: false },
    false,
  );
};

/** shows a frame: works the pose out and puts it into the view */
export const showFrame = (frame: number, options: { camera?: boolean } = {}) => {
  const state = useAnimationState();
  pose = poseAt(currentScene(), frame, previews.size ? new Map([...overrides, ...previews]) : overrides);
  applyPlaces(pose);
  applyLooks(pose);
  applySun(pose);
  applyLights(pose);
  if (options.camera ?? state.lookThrough) {
    applyCamera(pose);
  }
  pluginContext().editor.redraw();
  return pose;
};

/** gives the view back to the model: no places, looks, sun or lights of the animation */
export const clearView = () => {
  const context = pluginContext();
  for (const instance of placed.keys()) {
    context.display.place(instance, null);
  }
  placed.clear();
  for (const instance of looked.keys()) {
    context.display.look(instance, null);
  }
  looked.clear();
  for (const name of materials.keys()) {
    context.display.material(name, null);
  }
  materials.clear();
  if (sunShown !== 'null') {
    context.lighting.sun(null);
    sunShown = 'null';
  }
  if (lightsSet) {
    context.lighting.set([]);
    lightsSet = false;
  }
  pose = null;
  context.editor.redraw();
};
