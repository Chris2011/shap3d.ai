import type { Instance } from '../../../src/core/model';
import { forgetScene, overrides } from './apply';
import { evaluate, moveKeys, removeKeyAt, setKey } from './curves';
import {
  newId,
  objectAnimation,
  sceneAnimation,
  writeObject,
  writeScene,
  type CameraAnimation,
  type Interpolation,
  type ObjectAnimation,
  type SceneAnimation,
  type Track,
  type Tracks,
} from './data';
import { activeCamera, lensOf, matrixOf, PLACE_CHANNELS, placementAt, placementOf, type Placement } from './pose';
import { pluginContext, t, type THREE } from './runtime';
import { findInstance, pivotOf } from './scene';
import { learn, useAnimationState, type PickedKey } from './state';

/**
 * Changing the animation: keys from what the view shows (the I key, auto-keying), keys of the camera from the view,
 * moving, deleting and smoothing picked keys. Each change is one undo step. Tracks are named by their owner – an
 * object ("obj:<id>"), a camera ("cam:<id>"), the sun ("sun"), a light ("light:<id>") or a material ("mat:<name>").
 */

type Matrix = InstanceType<typeof THREE.Matrix4>;

/** after a change: the stored scene is read again and the view shows it */
let afterChange: () => void = () => {};
export const onAnimationChange = (listener: () => void) => {
  afterChange = listener;
};

const changed = () => {
  forgetScene();
  useAnimationState().revision++;
  afterChange();
};

/** changes the scene's animation in one undo step */
export const editScene = (label: string, change: (scene: SceneAnimation) => void) => {
  pluginContext().editor.commit(label, () => {
    const scene = sceneAnimation();
    change(scene);
    writeScene(scene);
  });
  changed();
};

const copyObject = (instance: Instance): ObjectAnimation => structuredClone(objectAnimation(instance)) ?? { tracks: {} };

/** changes the animation of groups in one undo step */
export const editObjects = (label: string, instances: Instance[], change: (animation: ObjectAnimation, instance: Instance) => void) => {
  pluginContext().editor.commit(label, () => {
    for (const instance of instances) {
      const animation = copyObject(instance);
      change(animation, instance);
      writeObject(instance, animation);
    }
  });
  changed();
};

const trackOf = (tracks: Tracks, channel: string): Track => (tracks[channel] ??= { keys: [] });

/** a turn keyed close to the curve's value there – so 179° to −179° is 2° on, not 358° back */
const nearestTurn = (track: Track | undefined, frame: number, value: number) => {
  if (!track?.keys.length) {
    return value;
  }
  const now = evaluate(track, frame);
  return value + Math.round((now - value) / 360) * 360;
};

/** keys place channels of an object (all of them, or the ones given) */
const keyPlacement = (animation: ObjectAnimation, frame: number, place: Placement, channels: readonly string[] = PLACE_CHANNELS) => {
  for (const channel of channels) {
    let value = place[channel as keyof Placement];
    if (channel.startsWith('r')) {
      value = nearestTurn(animation.tracks[channel], frame, value);
    }
    setKey(trackOf(animation.tracks, channel), frame, value, channel);
  }
};

/** the selected groups and components (at the level being edited) */
export const selectedInstances = () => {
  const editor = pluginContext().editor;
  return [...editor.selection.values()]
    .filter((ref) => ref.kind === 'instance')
    .map((ref) => findInstance(ref.id)?.instance)
    .filter((instance): instance is Instance => !!instance);
};

export type KeyingSet = 'place' | 'location' | 'rotation' | 'scale' | 'visible';

const KEYING: Record<Exclude<KeyingSet, 'visible'>, readonly string[]> = {
  place: PLACE_CHANNELS,
  location: ['x', 'y', 'z'],
  rotation: ['rx', 'ry', 'rz'],
  scale: ['sx', 'sy', 'sz'],
};

/** the place an object is shown at now – moved by hand at this frame, or as the keys say */
const shownPlacement = (instance: Instance, animation: ObjectAnimation | undefined, frame: number) => {
  const override = overrides.get(instance);
  return override ? placementOf(override, pivotOf(instance, animation)) : placementAt(instance, animation, frame);
};

/** keys the selected groups at the frame shown (the I key) – where they are shown now */
export const keySelected = (set: KeyingSet = 'place', instances = selectedInstances()) => {
  const frame = Math.round(useAnimationState().frame);
  if (!instances.length) {
    return false;
  }
  editObjects(t('animation.undo.key'), instances, (animation, instance) => {
    if (set === 'visible') {
      setKey(trackOf(animation.tracks, 'visible'), frame, instance.hidden ? 0 : 1, 'visible');
      return;
    }
    keyPlacement(animation, frame, shownPlacement(instance, objectAnimation(instance), frame), KEYING[set]);
  });
  for (const instance of instances) {
    overrides.delete(instance);
  }
  learn('keyed');
  return true;
};

/** keys one channel of an object to a value (the panel's fields) */
export const keyObjectChannel = (instance: Instance, channel: string, value: number, frame = Math.round(useAnimationState().frame)) => {
  editObjects(t('animation.undo.key'), [instance], (animation) => {
    setKey(trackOf(animation.tracks, channel), frame, value, channel);
  });
  learn('keyed');
};

/**
 * A group was moved, turned or scaled (by a tool) while it is animated: the change goes onto the place shown at this
 * frame – as keys with auto-keying (inside the same undo step), else shown until the frame changes, to be keyed with I.
 */
export const takeEdit = (instance: Instance, before: Matrix, after: Matrix) => {
  const state = useAnimationState();
  const frame = Math.round(state.frame);
  const animation = objectAnimation(instance);
  const shown = overrides.get(instance)?.clone() ?? null;
  const pivot = pivotOf(instance, animation);
  const delta = after.clone().multiply(before.clone().invert());
  // what the place was shown as, moved by what the tool did
  const base = shown ?? matrixOf(placementAt(instance, animation, frame, before), pivot);
  const moved = delta.multiply(base);
  if (state.autoKey) {
    const copy = structuredClone(animation) ?? { tracks: {} };
    keyPlacement(copy, frame, placementOf(moved, pivot));
    writeObject(instance, copy);
    overrides.delete(instance);
    state.revision++;
    learn('keyed');
  } else {
    overrides.set(instance, moved);
  }
};

/** auto-keying for a new group: keys it where it is, when it is first moved */
export const keyNewObject = (instance: Instance, frame: number) => {
  const animation: ObjectAnimation = { tracks: {} };
  keyPlacement(animation, frame, placementOf(instance.matrix, pivotOf(instance)));
  writeObject(instance, animation);
};

// ------------------------------------------------------------ cameras

/** a camera keyed where the view is now */
const cameraFromView = (camera: CameraAnimation, frame: number) => {
  const rig = pluginContext().editor.viewer.rig;
  const view = rig.getState();
  const values: Record<string, number> = {
    x: view.position[0],
    y: view.position[1],
    z: view.position[2],
    tx: view.target[0],
    ty: view.target[1],
    tz: view.target[2],
    lens: Math.round(lensOf(view.fov) * 10) / 10,
  };
  for (const [channel, value] of Object.entries(values)) {
    // a camera on a path or looking at a group gets only the keys those leave to it
    if ((camera.path && ['x', 'y', 'z'].includes(channel)) || (camera.lookAt !== undefined && channel.startsWith('t'))) {
      continue;
    }
    setKey(trackOf(camera.tracks, channel), frame, Math.round(value * 1e4) / 1e4, channel);
  }
};

/** a new camera where the view is, keyed at the frame – with a shot from that frame on if it is the first */
export const addCamera = (frame = Math.round(useAnimationState().frame)) => {
  let id = '';
  editScene(t('animation.undo.camera'), (scene) => {
    id = newId();
    const camera: CameraAnimation = { id, name: t('animation.camera.name', { number: scene.cameras.length + 1 }), tracks: {} };
    cameraFromView(camera, frame);
    scene.cameras.push(camera);
    scene.shots.push({ id: newId(), name: camera.name, frame: scene.shots.length ? frame : scene.start, camera: id });
  });
  learn('camera');
  return id;
};

/** keys the camera of the shot at this frame where the view is now (I with nothing selected) */
export const keyCamera = (cameraId?: string) => {
  const frame = Math.round(useAnimationState().frame);
  const scene = sceneAnimation();
  const camera = cameraId ? scene.cameras.find((entry) => entry.id === cameraId) : activeCamera(scene, frame);
  if (!camera) {
    addCamera(frame);
    return;
  }
  editScene(t('animation.undo.key'), (edited) => {
    cameraFromView(
      edited.cameras.find((entry) => entry.id === camera.id)!,
      frame,
    );
  });
  learn('camera');
  learn('keyed');
};

// ------------------------------------------------------------ keys by owner

/** the tracks of an owner in a scene copy (and, for objects, the instance's copy) */
const withTracks = (owner: string, label: string, change: (tracks: Tracks) => void) => {
  if (owner.startsWith('obj:')) {
    const instance = findInstance(Number(owner.slice(4)))?.instance;
    if (instance) {
      editObjects(label, [instance], (animation) => change(animation.tracks));
    }
    return;
  }
  editScene(label, (scene) => {
    const tracks = tracksOf(scene, owner);
    if (tracks) {
      change(tracks);
    }
  });
};

/** an owner's tracks in a scene (not objects – theirs are on the instance) */
export const tracksOf = (scene: SceneAnimation, owner: string): Tracks | null => {
  if (owner === 'sun') {
    return scene.sun.tracks;
  }
  if (owner.startsWith('cam:')) {
    return scene.cameras.find((camera) => camera.id === owner.slice(4))?.tracks ?? null;
  }
  if (owner.startsWith('light:')) {
    return scene.lights.find((light) => light.id === owner.slice(6))?.tracks ?? null;
  }
  if (owner.startsWith('mat:')) {
    return (scene.materials[owner.slice(4)] ??= { tracks: {} }).tracks;
  }
  return null;
};

/** an owner's tracks to read (objects from their instance) */
export const readTracks = (scene: SceneAnimation, owner: string): Tracks | null => {
  if (owner.startsWith('obj:')) {
    const instance = findInstance(Number(owner.slice(4)))?.instance;
    return instance ? (objectAnimation(instance)?.tracks ?? null) : null;
  }
  if (owner.startsWith('mat:')) {
    return scene.materials[owner.slice(4)]?.tracks ?? null;
  }
  return tracksOf(scene, owner);
};

/** sets a key of any owner's channel */
export const keyChannel = (owner: string, channel: string, frame: number, value: number) => {
  withTracks(owner, t('animation.undo.key'), (tracks) => setKey(trackOf(tracks, channel), frame, value, channel));
  learn('keyed');
};

/** the picked keys grouped by owner, then by channel */
const byOwner = (picked: PickedKey[]) => {
  const owners = new Map<string, Map<string, number[]>>();
  for (const key of picked) {
    const channels = owners.get(key.owner) ?? new Map<string, number[]>();
    channels.set(key.channel, [...(channels.get(key.channel) ?? []), key.frame]);
    owners.set(key.owner, channels);
  }
  return owners;
};

/** runs a change of the picked keys in one undo step, owner by owner */
const editPicked = (label: string, picked: PickedKey[], change: (track: Track, frames: number[], channel: string) => void) => {
  const owners = byOwner(picked);
  const editor = pluginContext().editor;
  editor.commit(label, () => {
    const scene = sceneAnimation();
    let sceneChanged = false;
    for (const [owner, channels] of owners) {
      if (owner.startsWith('obj:')) {
        const instance = findInstance(Number(owner.slice(4)))?.instance;
        if (!instance) {
          continue;
        }
        const animation = copyObject(instance);
        for (const [channel, frames] of channels) {
          const track = animation.tracks[channel];
          if (track) {
            change(track, frames, channel);
          }
        }
        writeObject(instance, animation);
        continue;
      }
      const tracks = tracksOf(scene, owner);
      for (const [channel, frames] of channels) {
        const track = tracks?.[channel];
        if (track) {
          change(track, frames, channel);
          sceneChanged = true;
        }
      }
    }
    if (sceneChanged) {
      writeScene(scene);
    }
  });
  changed();
};

export const deleteKeys = (picked: PickedKey[]) => {
  if (!picked.length) {
    return;
  }
  editPicked(t('animation.undo.delete'), picked, (track, frames) => {
    for (const frame of frames) {
      removeKeyAt(track, frame);
    }
  });
  useAnimationState().picked = [];
};

/** moves the picked keys by whole frames; the picks move along */
export const shiftKeys = (picked: PickedKey[], delta: number) => {
  if (!picked.length || !delta) {
    return;
  }
  editPicked(t('animation.undo.move'), picked, (track, frames) => moveKeys(track, frames, delta));
  useAnimationState().picked = picked.map((key) => ({ ...key, frame: key.frame + delta }));
};

export const setInterpolation = (picked: PickedKey[], interp: Interpolation) => {
  editPicked(t('animation.undo.interpolation'), picked, (track, frames) => {
    for (const key of track.keys) {
      if (frames.some((frame) => Math.abs(frame - key.frame) < 1e-6)) {
        key.interp = interp;
      }
    }
  });
};

/** smooth (auto) or flat handles, so the curve eases in and out of the key */
export const setHandles = (picked: PickedKey[], kind: 'auto' | 'flat') => {
  editPicked(t('animation.undo.handles'), picked, (track, frames) => {
    track.keys.forEach((key, index) => {
      if (!frames.some((frame) => Math.abs(frame - key.frame) < 1e-6)) {
        return;
      }
      key.interp = 'bezier';
      if (kind === 'auto') {
        key.handle = 'auto';
        delete key.left;
        delete key.right;
        return;
      }
      const before = index > 0 ? (key.frame - track.keys[index - 1].frame) / 3 : 1;
      const after = index < track.keys.length - 1 ? (track.keys[index + 1].frame - key.frame) / 3 : 1;
      key.handle = 'free';
      key.left = [-before, 0];
      key.right = [after, 0];
    });
  });
};

/** a key's value, frame or handles changed in the graph editor */
export const changeKey = (owner: string, channel: string, frame: number, change: (key: Track['keys'][number], track: Track) => void) => {
  withTracks(owner, t('animation.undo.edit'), (tracks) => {
    const track = tracks[channel];
    const key = track?.keys.find((entry) => Math.abs(entry.frame - frame) < 1e-6);
    if (track && key) {
      change(key, track);
      track.keys.sort((a, b) => a.frame - b.frame);
    }
  });
};

/** repeats (or stops repeating) a channel's keys */
export const setCycle = (owner: string, channel: string, cycle: boolean) => {
  withTracks(owner, t('animation.undo.edit'), (tracks) => {
    const track = tracks[channel];
    if (track) {
      track.cycle = cycle || undefined;
    }
  });
};

/** removes all keys of an owner's channel (or all its channels) */
export const clearChannel = (owner: string, channel?: string) => {
  withTracks(owner, t('animation.undo.delete'), (tracks) => {
    for (const name of Object.keys(tracks)) {
      if (!channel || name === channel) {
        delete tracks[name];
      }
    }
  });
};
