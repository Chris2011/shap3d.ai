import type { Entities, Instance } from '../../../src/core/model';
import { currentScene } from './apply';
import { setKey } from './curves';
import { newId, type Track, type Tracks } from './data';
import { editObjects, editScene } from './keying';
import { placementAt } from './pose';
import { pluginContext, t, THREE } from './runtime';
import { boxOf, pathLine } from './scene';
import { learn, useAnimationState } from './state';

/**
 * Ready-made movements for the simple view – one click each, made of ordinary keys, so they can be changed in the
 * dope sheet and the graph editor afterwards: spin, bounce, swing, pulse, fade in and out, appear, follow a path,
 * and camera moves around the model or towards it.
 */

export type Recipe = 'spin' | 'bounce' | 'swing' | 'pulse' | 'fadeIn' | 'fadeOut' | 'appear' | 'hide';

export const RECIPES: Recipe[] = ['spin', 'bounce', 'swing', 'pulse', 'fadeIn', 'fadeOut', 'appear', 'hide'];

const track = (tracks: Tracks, channel: string): Track => (tracks[channel] = { keys: [] });

/** applies a ready-made movement to groups, from the frame shown */
export const applyRecipe = (recipe: Recipe, instances: Instance[]) => {
  if (!instances.length) {
    return;
  }
  const scene = currentScene();
  const frame = Math.round(useAnimationState().frame);
  const second = scene.fps;
  editObjects(t(`animation.recipes.${recipe}.name`), instances, (animation, instance) => {
    const place = placementAt(instance, animation, frame);
    const tracks = animation.tracks;
    const size = boxOf(instance.definition.entities).getSize(new THREE.Vector3());
    switch (recipe) {
      case 'spin': {
        const turn = track(tracks, 'rz');
        setKey(turn, scene.start, place.rz, 'rz', 'linear');
        setKey(turn, scene.end, place.rz + 360, 'rz', 'linear');
        break;
      }
      case 'bounce': {
        // up and down once a second: slowing to the top, speeding to the ground
        const height = Math.max(0.3, Math.min(2, size.z || 1));
        const up = track(tracks, 'z');
        setKey(up, frame, place.z, 'z', 'ease-out');
        setKey(up, frame + second / 2, place.z + height, 'z', 'ease-in');
        setKey(up, frame + second, place.z, 'z', 'ease-out');
        up.cycle = true;
        break;
      }
      case 'swing': {
        const swing = track(tracks, 'rx');
        setKey(swing, frame, place.rx - 20, 'rx', 'ease-in-out');
        setKey(swing, frame + second, place.rx + 20, 'rx', 'ease-in-out');
        setKey(swing, frame + 2 * second, place.rx - 20, 'rx', 'ease-in-out');
        swing.cycle = true;
        break;
      }
      case 'pulse': {
        for (const channel of ['sx', 'sy', 'sz'] as const) {
          const scale = track(tracks, channel);
          setKey(scale, frame, place[channel], channel, 'ease-in-out');
          setKey(scale, frame + second / 2, place[channel] * 1.15, channel, 'ease-in-out');
          setKey(scale, frame + second, place[channel], channel, 'ease-in-out');
          scale.cycle = true;
        }
        break;
      }
      case 'fadeIn':
      case 'fadeOut': {
        const opacity = track(tracks, 'opacity');
        setKey(opacity, frame, recipe === 'fadeIn' ? 0 : 1, 'opacity', 'linear');
        setKey(opacity, frame + second, recipe === 'fadeIn' ? 1 : 0, 'opacity', 'linear');
        break;
      }
      case 'appear':
      case 'hide': {
        const visible = track(tracks, 'visible');
        setKey(visible, Math.min(scene.start, frame - 1), recipe === 'appear' ? 0 : 1, 'visible', 'constant');
        setKey(visible, frame, recipe === 'appear' ? 1 : 0, 'visible', 'constant');
        break;
      }
    }
  });
  learn('keyed');
};

/** the groups whose edges can be a path: any group with edges and no faces (a line, an arc, a curve) */
export const pathGroups = () => {
  const found: { instance: Instance; label: string }[] = [];
  const walk = (entities: Entities, prefix: string) => {
    for (const instance of entities.instances.values()) {
      const name = instance.name || instance.definition.name;
      const inner = instance.definition.entities;
      if (inner.edges.size && !inner.faces.size && pathLine(inner)) {
        found.push({ instance, label: prefix + name });
      }
      walk(inner, `${prefix}${name} › `);
    }
  };
  walk(pluginContext().editor.model.root, '');
  return found;
};

/** every group and component, with the groups it lies in in its label – for choosing a target */
export const allGroups = () => {
  const found: { instance: Instance; label: string }[] = [];
  const walk = (entities: Entities, prefix: string) => {
    for (const instance of entities.instances.values()) {
      const name = instance.name || instance.definition.name;
      found.push({ instance, label: prefix + name });
      walk(instance.definition.entities, `${prefix}${name} › `);
    }
  };
  walk(pluginContext().editor.model.root, '');
  return found;
};

/** groups made into a path: they follow the line from the scene's start to its end */
export const followPath = (instances: Instance[], curve: Instance, follow = true) => {
  const scene = currentScene();
  editObjects(t('animation.undo.path'), instances, (animation) => {
    animation.path = { curve: curve.id, follow, axis: animation.path?.axis };
    const amount = track(animation.tracks, 'path');
    setKey(amount, scene.start, 0, 'path', 'ease-in-out');
    setKey(amount, scene.end, 1, 'path', 'ease-in-out');
  });
  learn('keyed');
};

/** the middle and the size of everything visible – what camera moves go around */
const modelBox = () => {
  const box = pluginContext().editor.model.bounds();
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const radius = box.isEmpty() ? 5 : Math.max(2, box.getBoundingSphere(new THREE.Sphere()).radius);
  return { center, radius };
};

/**
 * A new camera that moves: around the model once over the scene's range ('orbit'), or from where the view is now
 * towards the model's middle ('dolly') – with a shot from the start if it is the first camera.
 */
export const cameraMove = (kind: 'orbit' | 'dolly') => {
  const scene = currentScene();
  const { center, radius } = modelBox();
  const view = pluginContext().editor.viewer.rig.getState();
  editScene(t('animation.undo.camera'), (edited) => {
    const id = newId();
    const tracks: Tracks = {};
    const key = (channel: string, frame: number, value: number, interp: 'linear' | 'bezier' | 'ease-in-out' = 'bezier') => {
      setKey((tracks[channel] ??= { keys: [] }), frame, Math.round(value * 1e4) / 1e4, channel, interp);
    };
    if (kind === 'orbit') {
      // twelve points on a circle – smooth keys between them make it round
      const distance = radius * 2.4;
      const height = center.z + radius * 0.9;
      const start = Math.atan2(view.position[1] - center.y, view.position[0] - center.x);
      for (let step = 0; step <= 12; step++) {
        const frame = scene.start + ((scene.end - scene.start) * step) / 12;
        const angle = start + (step / 12) * Math.PI * 2;
        key('x', frame, center.x + Math.cos(angle) * distance);
        key('y', frame, center.y + Math.sin(angle) * distance);
      }
      key('z', scene.start, height);
    } else {
      const from = new THREE.Vector3(...view.position);
      const to = from.clone().lerp(center, 0.55);
      for (const [index, channel] of ['x', 'y', 'z'].entries()) {
        key(channel, scene.start, from.getComponent(index), 'ease-in-out');
        key(channel, scene.end, to.getComponent(index), 'ease-in-out');
      }
    }
    key('tx', scene.start, center.x);
    key('ty', scene.start, center.y);
    key('tz', scene.start, center.z);
    key('lens', scene.start, 35);
    const name = t(kind === 'orbit' ? 'animation.recipes.orbit.camera' : 'animation.recipes.dolly.camera', {
      number: edited.cameras.length + 1,
    });
    edited.cameras.push({ id, name, tracks });
    if (!edited.shots.length) {
      edited.shots.push({ id: newId(), name, frame: edited.start, camera: id });
    }
  });
  learn('camera');
};
