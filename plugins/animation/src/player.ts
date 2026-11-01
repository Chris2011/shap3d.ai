import type { Instance } from '../../../src/core/model';
import { clearView, currentScene, forgetScene, overrides, previews, showFrame } from './apply';
import { objectAnimation } from './data';
import { keyNewObject, onAnimationChange, selectedInstances, takeEdit } from './keying';
import { matrixOf, placementAt } from './pose';
import { pluginContext, type THREE } from './runtime';
import { animatedNodes, modelFingerprint, pivotOf } from './scene';
import { learn, useAnimationState } from './state';

/**
 * Playing and showing frames: the frame shown, playback in real time (frames are skipped when the view is slower),
 * jumping to the start, the end and from key to key; and the hooks into the editor – a change of the model read
 * again, and a group moved by a tool shown while it moves and taken onto its animation at the end of the undo step.
 */

type Matrix = InstanceType<typeof THREE.Matrix4>;

let raf = 0;
/** the matrices of the animated groups as the model had them after the last change – to see what a tool did */
const seen = new Map<Instance, Matrix>();
let fingerprint = 0;

const remember = () => {
  seen.clear();
  for (const node of animatedNodes()) {
    seen.set(node.instance, node.instance.matrix.clone());
  }
  // selected groups too: auto-keying keys them once they are moved
  for (const instance of selectedInstances()) {
    seen.set(instance, instance.matrix.clone());
  }
};

/** is there anything animated (keys on a group, a camera, the sun, a light or a material)? */
export const hasAnimation = () => {
  const scene = currentScene();
  return (
    animatedNodes().length > 0 ||
    scene.cameras.length > 0 ||
    scene.lights.length > 0 ||
    Object.values(scene.sun.tracks).some((track) => track?.keys.length) ||
    Object.values(scene.materials).some((entry) => Object.values(entry.tracks).some((track) => track?.keys.length))
  );
};

/** shows the frame; a new whole frame drops the places moved by hand there */
export const setFrame = (frame: number, options: { camera?: boolean } = {}) => {
  const state = useAnimationState();
  if (Math.round(frame) !== Math.round(state.frame)) {
    overrides.clear();
  }
  state.frame = frame;
  if (hasAnimation() || overrides.size) {
    showFrame(frame, options);
  } else {
    clearView();
  }
};

/** shows the frame again – after a change of the animation or the model */
export const refresh = () => {
  const state = useAnimationState();
  if (hasAnimation() || overrides.size) {
    showFrame(state.frame, { camera: state.playing && state.lookThrough });
  } else {
    clearView();
  }
  remember();
};

export const play = () => {
  const state = useAnimationState();
  if (state.playing) {
    return;
  }
  const scene = currentScene();
  if (state.frame >= scene.end) {
    setFrame(scene.start);
  }
  state.playing = true;
  learn('played');
  let started = performance.now();
  let from = state.frame;
  const step = (now: number) => {
    if (!state.playing) {
      return;
    }
    const current = currentScene();
    let frame = from + ((now - started) / 1000) * current.fps;
    if (frame > current.end) {
      if (!state.loop) {
        setFrame(current.end, { camera: state.lookThrough });
        pause();
        return;
      }
      started = now;
      from = current.start;
      frame = current.start;
    }
    // whole frames, as a film shows them
    setFrame(Math.floor(frame), { camera: state.lookThrough });
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
};

export const pause = () => {
  const state = useAnimationState();
  state.playing = false;
  cancelAnimationFrame(raf);
  state.frame = Math.round(state.frame);
};

export const togglePlay = () => (useAnimationState().playing ? pause() : play());

export const jumpTo = (where: 'start' | 'end') => {
  pause();
  const scene = currentScene();
  setFrame(where === 'start' ? scene.start : scene.end, { camera: useAnimationState().lookThrough });
};

/** every frame something has a key at, sorted */
export const keyFrames = () => {
  const frames = new Set<number>();
  const add = (tracks: Record<string, { keys: { frame: number }[] } | undefined>) => {
    for (const track of Object.values(tracks)) {
      track?.keys.forEach((key) => frames.add(key.frame));
    }
  };
  const scene = currentScene();
  animatedNodes().forEach((node) => add(node.animation.tracks));
  scene.cameras.forEach((camera) => add(camera.tracks));
  scene.lights.forEach((light) => add(light.tracks));
  add(scene.sun.tracks);
  Object.values(scene.materials).forEach((entry) => add(entry.tracks));
  return [...frames].sort((a, b) => a - b);
};

/** to the next or the previous frame with a key */
export const jumpKey = (direction: 1 | -1) => {
  pause();
  const frame = useAnimationState().frame;
  const frames = keyFrames();
  const target = direction > 0 ? frames.find((entry) => entry > frame + 1e-6) : frames.filter((entry) => entry < frame - 1e-6).pop();
  if (target !== undefined) {
    setFrame(target, { camera: useAnimationState().lookThrough });
  }
};

export const stepFrame = (direction: 1 | -1) => {
  pause();
  const scene = currentScene();
  const frame = Math.min(scene.end, Math.max(scene.start, Math.round(useAnimationState().frame) + direction));
  setFrame(frame, { camera: useAnimationState().lookThrough });
};

/** looks through the camera of the shot now (or gives the view back) */
export const setLookThrough = (on: boolean) => {
  const state = useAnimationState();
  state.lookThrough = on;
  if (on) {
    learn('camera');
    showFrame(state.frame, { camera: true });
  }
};

/** while a tool moves an animated group: it is shown moved from where the animation has it, not from the model */
const previewEdits = () => {
  const frame = Math.round(useAnimationState().frame);
  let any = previews.size > 0;
  previews.clear();
  for (const [instance, before] of seen) {
    const animation = objectAnimation(instance);
    if (!animation || instance.matrix.equals(before)) {
      continue;
    }
    const base = overrides.get(instance) ?? matrixOf(placementAt(instance, animation, frame, before), pivotOf(instance, animation));
    previews.set(instance, instance.matrix.clone().multiply(before.clone().invert()).multiply(base));
    any = true;
  }
  if (any) {
    showFrame(useAnimationState().frame);
  }
};

/**
 * At the end of every undo step (still inside it): groups a tool moved, turned or scaled while they are animated
 * take the change onto their animation at this frame; with auto-keying a selected group that is not animated yet
 * gets its first keys.
 */
const onSettle = () => {
  previews.clear();
  const state = useAnimationState();
  const frame = Math.round(state.frame);
  for (const [instance, before] of seen) {
    if (instance.matrix.equals(before)) {
      continue;
    }
    if (objectAnimation(instance)) {
      takeEdit(instance, before, instance.matrix.clone());
    } else if (state.autoKey) {
      keyNewObject(instance, frame);
    }
    // taken: an undo later puts the model back to `before`, which then drops the place shown by hand
    seen.set(instance, instance.matrix.clone());
  }
  forgetScene();
};

/** hooks the animation into the editor; returns what takes it out again */
export const connect = () => {
  const context = pluginContext();
  const editor = context.editor;
  onAnimationChange(refresh);
  const stopStep = context.events.onUndoStep(onSettle);
  const stopWatch = context.vue.watch(
    () => [editor.ui.revision, editor.ui.selRev],
    () => {
      // a tool is moving something: shown from where the animation has it; the places before are kept until it is done
      if (editor.inOp()) {
        previewEdits();
        return;
      }
      if (previews.size) {
        // the tool gave up (Esc): back to where the animation has it
        previews.clear();
        showFrame(useAnimationState().frame);
      }
      const now = modelFingerprint();
      if (now !== fingerprint) {
        fingerprint = now;
        forgetScene();
        // undo or another model: places moved by hand belong to what was there before
        if (!editor.changing()) {
          for (const instance of [...overrides.keys()]) {
            if (!seen.has(instance) || !instance.matrix.equals(seen.get(instance)!)) {
              overrides.delete(instance);
            }
          }
        }
        refresh();
      } else {
        remember();
      }
    },
  );
  const stopNew = context.events.onNewModel(() => {
    pause();
    overrides.clear();
    forgetScene();
    useAnimationState().frame = currentScene().start;
    refresh();
  });
  fingerprint = modelFingerprint();
  useAnimationState().frame = currentScene().start;
  refresh();
  return () => {
    pause();
    stopWatch();
    stopNew();
    stopStep();
    overrides.clear();
    clearView();
  };
};
