import type { Instance } from '../../../src/core/model';
import { objectAnimation, type BoneData, type ObjectAnimation, type RigPose, type Vec } from './data';
import { editObjects, keyCamera, keyRotations, keySelected, shownPlacementOf } from './keying';
import { limitChannel, placementOf } from './pose';
import { currentScene, overrides } from './apply';
import { pluginContext, t, THREE } from './runtime';
import { animatedNodes, findInstance, pivotOf } from './scene';
import { useAnimationState } from './state';

/**
 * Rigs: figures whose bones are groups inside each other, so the hierarchy of the groups is the skeleton. A bone turns
 * about its joint (its pivot) within its limits; the outermost group keeps the stored poses. Poses become keys on the
 * turn channels. Bones refer to each other by name – instance ids change when a figure is copied, names do not.
 */

type Matrix = InstanceType<typeof THREE.Matrix4>;
type Vector = InstanceType<typeof THREE.Vector3>;

export interface BoneNode {
  instance: Instance;
  ancestors: Instance[];
  bone: BoneData;
  animation: ObjectAnimation;
}

/** where an instance is shown in the model – its parents' and its own places in the view */
export const shownWorld = (instances: Instance[]): Matrix => {
  const viewer = pluginContext().editor.viewer;
  return instances.reduce((matrix, instance) => matrix.multiply(viewer.shownMatrix(instance)), new THREE.Matrix4());
};

/** the bones of a figure: the group itself, if it is one, and those inside it – parents first */
export const bonesOf = (root: Instance): BoneNode[] => {
  const found: BoneNode[] = [];
  const walk = (instance: Instance, ancestors: Instance[]) => {
    const animation = objectAnimation(instance);
    if (animation?.bone) {
      found.push({ instance, ancestors, bone: animation.bone, animation });
    }
    for (const child of instance.definition.entities.instances.values()) {
      walk(child, [...ancestors, instance]);
    }
  };
  walk(root, findInstance(root.id)?.ancestors ?? []);
  return found;
};

/** every bone in the model with where its head and tail are shown */
export const boneSegments = () =>
  animatedNodes()
    .filter((node) => node.animation.bone)
    .map((node) => {
      const world = shownWorld([...node.ancestors, node.instance]);
      return {
        instance: node.instance,
        bone: node.animation.bone!,
        head: new THREE.Vector3(...pivotOf(node.instance, node.animation)).applyMatrix4(world),
        tail: new THREE.Vector3(...node.animation.bone!.tail).applyMatrix4(world),
      };
    });

/** the outermost group of the figure an instance belongs to – null if it is in none */
export const rigRootOf = (instance: Instance): Instance | null => {
  const found = findInstance(instance.id);
  return [...(found?.ancestors ?? []), instance].find((candidate) => objectAnimation(candidate)?.rig) ?? null;
};

/** the deepest bone on a path of groups (the groups a picked face or edge lies in) */
export const boneOnPath = (path: Instance[]) => [...path].reverse().find((instance) => objectAnimation(instance)?.bone) ?? null;

const SIDE_WORDS: Record<string, string> = { l: 'r', r: 'l', left: 'right', right: 'left', links: 'rechts', rechts: 'links' };

/** a name like "arm.L", "arm_right" or "Arm links": its side and the name of its partner on the other side */
export const sideOfName = (name: string): Pick<BoneData, 'side' | 'mirror'> => {
  const match = /^(.*[ ._-])(l|r|left|right|links|rechts)$/i.exec(name);
  if (!match) {
    return {};
  }
  const word = match[2];
  const other = SIDE_WORDS[word.toLowerCase()];
  const cased =
    word === word.toUpperCase() ? other.toUpperCase() : word[0] === word[0].toUpperCase() ? other[0].toUpperCase() + other.slice(1) : other;
  return { side: word[0].toLowerCase() === 'l' ? 'L' : 'R', mirror: match[1] + cased };
};

/** a name not yet used in the figure: the wanted one, or with a number after it */
const uniqueName = (wanted: string, taken: string[]) => {
  let name = wanted;
  for (let number = 2; taken.includes(name); number++) {
    name = `${wanted} ${number}`;
  }
  return name;
};

/** makes a group a bone: head (its joint) and tail in its own coordinates; the outermost group becomes the rig */
export const writeBone = (animation: ObjectAnimation, instance: Instance, head: Vec, tail: Vec, name: string, taken: string[]) => {
  // the keyed places stay where they are: the keys are moved by how far the pivot moves (exact for groups not turned)
  const before = new THREE.Vector3(...pivotOf(instance, animation));
  const shift = new THREE.Vector3(...head).sub(before);
  for (const [index, channel] of ['x', 'y', 'z'].entries()) {
    for (const key of animation.tracks[channel]?.keys ?? []) {
      key.value += shift.getComponent(index);
    }
  }
  animation.pivot = head;
  const finalName = animation.bone?.name ?? uniqueName(name, taken);
  animation.bone = { ...sideOfName(finalName), ...animation.bone, name: finalName, tail };
};

/** puts a joint on a group: head and tail in the model, where it is shown now */
export const setJoint = (instance: Instance, headWorld: Vector, tailWorld: Vector) => {
  const found = findInstance(instance.id);
  const chain = [...(found?.ancestors ?? []), instance];
  const inverse = shownWorld(chain).invert();
  const own = (point: Vector) => point.clone().applyMatrix4(inverse).toArray() as Vec;
  const root = chain.find((candidate) => objectAnimation(candidate)?.rig) ?? chain[0];
  const taken = bonesOf(root)
    .filter((node) => node.instance !== instance)
    .map((node) => node.bone.name);
  const name = instance.name || instance.definition.name || t('animation.rig.boneName');
  editObjects(t('animation.undo.joint'), [...new Set([instance, root])], (animation, target) => {
    if (target === instance) {
      writeBone(animation, instance, own(headWorld), own(tailWorld), name, taken);
    }
    if (target === root) {
      animation.rig ??= { poses: [] };
    }
  });
  useAnimationState().bone = instance.id;
};

/** changes a bone's name, side, partner or limits; a new name goes along into the figure's poses and partners */
export const changeBone = (instance: Instance, change: Partial<BoneData>) => {
  const root = rigRootOf(instance);
  const before = objectAnimation(instance)?.bone?.name;
  const after = change.name;
  const renamed = !!after && after !== before;
  const others = renamed && root ? bonesOf(root).map((node) => node.instance) : [];
  editObjects(t('animation.undo.bone'), [...new Set([instance, ...others, ...(root ? [root] : [])])], (animation, target) => {
    if (target === instance && animation.bone) {
      animation.bone = { ...animation.bone, ...change };
    }
    if (!renamed) {
      return;
    }
    if (animation.bone && animation.bone.mirror === before) {
      animation.bone.mirror = after;
    }
    for (const pose of animation.rig?.poses ?? []) {
      if (pose.bones[before!]) {
        pose.bones[after!] = pose.bones[before!];
        delete pose.bones[before!];
      }
    }
  });
};

/** the group is no bone any more; its keys and its pivot stay */
export const removeBone = (instance: Instance) => {
  editObjects(t('animation.undo.bone'), [instance], (animation) => {
    delete animation.bone;
  });
  const state = useAnimationState();
  if (state.bone === instance.id) {
    state.bone = null;
  }
};

/** the place channels of a bone's rest: the model's place */
const restOf = (node: BoneNode) => placementOf(node.instance.matrix, pivotOf(node.instance, node.animation));

/** stores the pose shown now under a name – a pose of that name is replaced */
export const savePose = (root: Instance, name: string) => {
  const bones: RigPose['bones'] = {};
  for (const node of bonesOf(root)) {
    const { rx, ry, rz } = shownPlacementOf(node.instance);
    bones[node.bone.name] = { rx, ry, rz };
  }
  editObjects(t('animation.undo.pose'), [root], (animation) => {
    animation.rig ??= { poses: [] };
    animation.rig.poses = [...animation.rig.poses.filter((pose) => pose.name !== name), { name, bones }];
  });
};

export const removePose = (root: Instance, name: string) => {
  editObjects(t('animation.undo.pose'), [root], (animation) => {
    if (animation.rig) {
      animation.rig.poses = animation.rig.poses.filter((pose) => pose.name !== name);
    }
  });
};

/** a bone's turn kept within its limits */
const limited = (node: BoneNode, turn: { rx: number; ry: number; rz: number }) => ({
  instance: node.instance,
  rx: limitChannel(node.instance, node.animation, 'rx', turn.rx),
  ry: limitChannel(node.instance, node.animation, 'ry', turn.ry),
  rz: limitChannel(node.instance, node.animation, 'rz', turn.rz),
});

/** keys a stored pose at the frame shown; bones it does not know stay as they are */
export const applyPose = (root: Instance, name: string) => {
  const pose = objectAnimation(root)?.rig?.poses.find((entry) => entry.name === name);
  if (!pose) {
    return;
  }
  const entries = bonesOf(root)
    .filter((node) => pose.bones[node.bone.name])
    .map((node) => limited(node, pose.bones[node.bone.name]));
  keyRotations(entries, t('animation.undo.pose'));
};

/** keys the turns of all the figure's bones as they are shown now */
export const keyPose = (root: Instance) => {
  keyRotations(
    bonesOf(root).map((node) => {
      const { rx, ry, rz } = shownPlacementOf(node.instance);
      return { instance: node.instance, rx, ry, rz };
    }),
  );
};

/** keys every bone back to its rest at the frame shown */
export const restPose = (root: Instance) => {
  keyRotations(
    bonesOf(root).map((node) => {
      const { rx, ry, rz } = restOf(node);
      return { instance: node.instance, rx, ry, rz };
    }),
    t('animation.undo.pose'),
  );
};

/**
 * Keys the pose mirrored at the frame shown: what the left side does the right one does and the other way round, a
 * bone without a side turns the other way about y and z. The mirror is the figure's own plane x = 0 (left and right
 * lie along x): a turn from rest (x, y, z) becomes (x, −y, −z).
 */
export const mirrorPose = (root: Instance) => {
  const nodes = bonesOf(root);
  const turnFromRest = (node: BoneNode) => {
    const rest = restOf(node);
    const shown = shownPlacementOf(node.instance);
    return { rx: shown.rx - rest.rx, ry: shown.ry - rest.ry, rz: shown.rz - rest.rz };
  };
  const entries = nodes.map((node) => {
    const partner = node.bone.mirror ? nodes.find((other) => other.bone.name === node.bone.mirror) : undefined;
    const from = turnFromRest(partner ?? node);
    const rest = restOf(node);
    return limited(node, { rx: rest.rx + from.rx, ry: rest.ry - from.ry, rz: rest.rz - from.rz });
  });
  keyRotations(entries, t('animation.undo.pose'));
};

/**
 * The I key: the selected groups, else the bones just posed, else the camera – only one that is already there: with
 * nothing selected a new camera would appear out of nowhere, so it says what to do instead.
 */
export const keyWhatIsMeant = () => {
  if (keySelected() || keyPosedBones()) {
    return;
  }
  if (currentScene().cameras.length) {
    keyCamera();
  } else {
    pluginContext().ui.toast(t('animation.timeline.keyNeedsSelection'));
  }
};

/** keys the bones that were posed by hand at this frame (the I key with nothing selected) – false if there are none */
export const keyPosedBones = () => {
  const posed = [...overrides.keys()].filter((instance) => objectAnimation(instance)?.bone);
  if (!posed.length) {
    return false;
  }
  keyRotations(
    posed.map((instance) => {
      const { rx, ry, rz } = shownPlacementOf(instance);
      return { instance, rx, ry, rz };
    }),
  );
  return true;
};
