import type { Instance } from '../../../src/core/model';
import { evaluate } from './curves';
import {
  LIMIT_CHANNELS,
  type Axis,
  type CameraAnimation,
  type LightAnimation,
  type LimitChannel,
  type ObjectAnimation,
  type SceneAnimation,
  type Tracks,
  type Vec,
} from './data';
import { THREE } from './runtime';
import { animatedNodes, centerOf, chain, findInstance, pathLine, pivotOf, pointOnLine, type AnimatedNode } from './scene';

/**
 * The scene at a frame: where every animated group is (its matrix in its parent, as the view shows it), whether it
 * is visible, its colour and opacity; the camera the shot at that frame looks through, the sun, the lights and the
 * material colours. Unkeyed channels keep the model's value; a path and a look-at come after the keys.
 */

type Matrix = InstanceType<typeof THREE.Matrix4>;

/** the place channels of a matrix: where its pivot is, its turn (degrees, XYZ) and its scale */
export interface Placement {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
}

export const PLACE_CHANNELS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'] as const;

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** a matrix as place channels about a pivot (in the object's own coordinates) */
export const placementOf = (matrix: Matrix, pivot: Vec): Placement => {
  const position = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, turn, scale);
  const at = new THREE.Vector3(...pivot).applyMatrix4(matrix);
  const euler = new THREE.Euler().setFromQuaternion(turn, 'XYZ');
  const degrees = THREE.MathUtils.radToDeg;
  return {
    x: round(at.x),
    y: round(at.y),
    z: round(at.z),
    rx: round(degrees(euler.x)),
    ry: round(degrees(euler.y)),
    rz: round(degrees(euler.z)),
    sx: round(scale.x),
    sy: round(scale.y),
    sz: round(scale.z),
  };
};

/** the matrix of place channels: turned and scaled about the pivot, the pivot moved to x, y, z */
export const matrixOf = (place: Placement, pivot: Vec): Matrix => {
  const radians = THREE.MathUtils.degToRad;
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(radians(place.rx), radians(place.ry), radians(place.rz), 'XYZ'));
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(place.x, place.y, place.z),
    turn,
    new THREE.Vector3(place.sx, place.sy, place.sz),
  );
  return matrix.multiply(new THREE.Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
};

/** the tracks' values at a frame over `base` – channels without keys keep theirs */
const keyed = <T extends object>(tracks: Tracks, frame: number, base: T): T => {
  const values = { ...base } as Record<string, number>;
  for (const [channel, track] of Object.entries(tracks)) {
    if (track?.keys.length) {
      values[channel] = evaluate(track, frame, channel);
    }
  }
  return values as T;
};

const AXES: Record<Axis, Vec> = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0] };

/**
 * the turn that makes the object's front axis point along `direction` (model coordinates) and keeps its top up –
 * the turn of a car on a road or a head that looks at something
 */
const facing = (direction: InstanceType<typeof THREE.Vector3>, axis: Axis = '+x') => {
  const forward = direction.clone().normalize();
  if (forward.lengthSq() < 1e-12) {
    return new THREE.Quaternion();
  }
  const up = new THREE.Vector3(0, 0, 1);
  // straight up or down: any side will do
  const side = Math.abs(forward.dot(up)) > 0.999 ? new THREE.Vector3(0, 1, 0) : up.clone().cross(forward).normalize();
  const top = forward.clone().cross(side).normalize();
  const looking = new THREE.Matrix4().makeBasis(forward, side, top);
  // the object's front, its side and its top in its own coordinates
  const front = new THREE.Vector3(...AXES[axis]);
  const ownSide = new THREE.Vector3(0, 0, 1).cross(front).normalize();
  const own = new THREE.Matrix4().makeBasis(front, ownSide, new THREE.Vector3(0, 0, 1));
  return new THREE.Quaternion().setFromRotationMatrix(looking.multiply(own.invert()));
};

export interface ObjectPose {
  instance: Instance;
  /** its matrix in its parent, as shown */
  local: Matrix;
  /** in the model, with the animated parents */
  world: Matrix;
  visible: boolean;
  /** a colour of its own (0 … 1 each) – null keeps its materials */
  color: Vec | null;
  opacity: number;
}

export interface CameraPose {
  camera: CameraAnimation;
  position: Vec;
  target: Vec;
  /** the lens in mm (35 mm film) */
  lens: number;
}

export interface LightPose {
  light: LightAnimation;
  position: Vec;
  target: Vec;
  intensity: number;
  color: Vec;
}

export interface ScenePose {
  frame: number;
  objects: ObjectPose[];
  camera: CameraPose | null;
  sun: { hour: number | null; daylight: number | null };
  lights: LightPose[];
  /** material name → colour and opacity at the frame */
  materials: Record<string, { color: Vec | null; opacity: number | null }>;
}

/** the frame a share of the scene is at, for paths without their own keys: start → 0, end → 1 */
const share = (scene: SceneAnimation, frame: number) => (scene.end > scene.start ? (frame - scene.start) / (scene.end - scene.start) : 0);

/** the lens of a camera's field of view (vertical, degrees) and back – 24 mm tall film */
export const lensOf = (fov: number) => 12 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
export const fovOf = (lens: number) => THREE.MathUtils.radToDeg(2 * Math.atan(12 / Math.max(lens, 1)));

/** where an instance is in the model now: its own path of groups, with the poses found so far */
const worldOf = (instance: Instance, ancestors: Instance[], poses: Map<Instance, ObjectPose>) => {
  const matrix = new THREE.Matrix4();
  for (const ancestor of ancestors) {
    matrix.multiply(poses.get(ancestor)?.local ?? ancestor.matrix);
  }
  return matrix.multiply(poses.get(instance)?.local ?? instance.matrix);
};

/** the point on a path group's line, in the model */
export const pathPoint = (curveId: number, amount: number, poses?: Map<Instance, ObjectPose>) => {
  const found = findInstance(curveId);
  const line = found && pathLine(found.instance.definition.entities);
  if (!found || !line) {
    return null;
  }
  const world = poses ? worldOf(found.instance, found.ancestors, poses) : chain([...found.ancestors, found.instance]);
  const { point, direction } = pointOnLine(line, amount);
  return { point: point.applyMatrix4(world), direction: direction.transformDirection(world) };
};

/** the middle of a group in the model, where it is shown at the frame */
const targetPoint = (id: number, poses: Map<Instance, ObjectPose>) => {
  const found = findInstance(id);
  return found ? centerOf(found.instance, worldOf(found.instance, found.ancestors, poses)) : null;
};

const objectPose = (
  node: AnimatedNode,
  scene: SceneAnimation,
  frame: number,
  poses: Map<Instance, ObjectPose>,
  override: Matrix | undefined,
): ObjectPose => {
  const { instance, animation } = node;
  const pivot = pivotOf(instance, animation);
  const tracks = animation.tracks;
  const place = keyed(tracks, frame, placementOf(instance.matrix, pivot));
  let local = override?.clone() ?? matrixOf(place, pivot);
  const parentWorld = new THREE.Matrix4();
  for (const ancestor of node.ancestors) {
    parentWorld.multiply(poses.get(ancestor)?.local ?? ancestor.matrix);
  }
  // a path and a look-at work in the model: the pivot goes onto the line, the front turns along it or to the target
  if (!override && (animation.path || animation.lookAt)) {
    const world = parentWorld.clone().multiply(local);
    const position = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    world.decompose(position, turn, scale);
    let pivotAt = new THREE.Vector3(...pivot).applyMatrix4(world);
    if (animation.path) {
      const amount = tracks.path?.keys.length ? evaluate(tracks.path, frame) : share(scene, frame);
      const on = pathPoint(animation.path.curve, amount, poses);
      if (on) {
        pivotAt = on.point;
        if (animation.path.follow) {
          turn.copy(facing(on.direction, animation.path.axis));
        }
      }
    }
    if (animation.lookAt) {
      const target = targetPoint(animation.lookAt.target, poses);
      if (target) {
        turn.copy(facing(target.clone().sub(pivotAt), animation.lookAt.axis));
      }
    }
    const turned = new THREE.Matrix4().compose(new THREE.Vector3(), turn, scale);
    const offset = new THREE.Vector3(...pivot).applyMatrix4(turned);
    const placed = turned.setPosition(pivotAt.clone().sub(offset));
    local = parentWorld.clone().invert().multiply(placed);
  }
  const value = (channel: string, fallback: number) =>
    tracks[channel]?.keys.length ? evaluate(tracks[channel]!, frame, channel) : fallback;
  const colored = ['r', 'g', 'b'].some((channel) => tracks[channel]?.keys.length);
  return {
    instance,
    local,
    world: parentWorld.multiply(local),
    visible: value('visible', 1) >= 0.5,
    color: colored ? ([value('r', 1), value('g', 1), value('b', 1)].map((part) => Math.min(1, Math.max(0, part))) as Vec) : null,
    opacity: Math.min(1, Math.max(0, value('opacity', 1))),
  };
};

/** the camera of the shot at a frame: the last shot that has started, else the first camera */
export const activeCamera = (scene: SceneAnimation, frame: number) => {
  const shots = [...scene.shots].sort((a, b) => a.frame - b.frame);
  const shot = shots.filter((entry) => entry.frame <= frame + 1e-6).pop() ?? shots[0];
  return scene.cameras.find((camera) => camera.id === shot?.camera) ?? scene.cameras[0] ?? null;
};

export const cameraPose = (camera: CameraAnimation, scene: SceneAnimation, frame: number, poses: Map<Instance, ObjectPose>): CameraPose => {
  const values = keyed(camera.tracks, frame, { x: -10, y: -10, z: 5, tx: 0, ty: 0, tz: 1, lens: 50 });
  let position = new THREE.Vector3(values.x, values.y, values.z);
  let target = new THREE.Vector3(values.tx, values.ty, values.tz);
  if (camera.path) {
    const amount = camera.tracks.path?.keys.length ? evaluate(camera.tracks.path, frame) : share(scene, frame);
    const on = pathPoint(camera.path.curve, amount, poses);
    if (on) {
      // the target moves along with it, unless something else decides where it looks
      target = on.point.clone().add(target.clone().sub(position));
      position = on.point;
      if (camera.path.follow) {
        target = position.clone().add(on.direction.clone().multiplyScalar(5));
      }
    }
  }
  if (camera.lookAt !== undefined) {
    target = targetPoint(camera.lookAt, poses) ?? target;
  }
  return { camera, position: position.toArray() as Vec, target: target.toArray() as Vec, lens: values.lens };
};

const lightPose = (light: LightAnimation, frame: number): LightPose => {
  const values = keyed(light.tracks, frame, { x: 0, y: 0, z: 3, tx: 0, ty: 0, tz: 0, intensity: 1, r: 1, g: 0.9, b: 0.75 });
  return {
    light,
    position: [values.x, values.y, values.z],
    target: [values.tx, values.ty, values.tz],
    intensity: Math.max(0, values.intensity),
    color: [values.r, values.g, values.b].map((part) => Math.min(1, Math.max(0, part))) as Vec,
  };
};

/**
 * The scene at a frame. `overrides` are places the user has just given groups (moved them at this frame without
 * a key) – they are shown until the frame changes.
 */
export const poseAt = (scene: SceneAnimation, frame: number, overrides: Map<Instance, Matrix> = new Map()): ScenePose => {
  const poses = new Map<Instance, ObjectPose>();
  const nodes = animatedNodes();
  for (const node of nodes) {
    poses.set(node.instance, objectPose(node, scene, frame, poses, overrides.get(node.instance)));
  }
  // a look-at target may come after the one looking at it – once more for those, now that every place is known
  for (const node of nodes.filter((entry) => entry.animation.lookAt && !overrides.has(entry.instance))) {
    poses.set(node.instance, objectPose(node, scene, frame, poses, undefined));
  }
  const camera = activeCamera(scene, frame);
  const materials: ScenePose['materials'] = {};
  for (const [name, entry] of Object.entries(scene.materials)) {
    const tracks = entry.tracks;
    const has = (channel: string) => !!tracks[channel]?.keys.length;
    const value = (channel: string) => Math.min(1, Math.max(0, evaluate(tracks[channel]!, frame, channel)));
    materials[name] = {
      color: has('r') || has('g') || has('b') ? [has('r') ? value('r') : 1, has('g') ? value('g') : 1, has('b') ? value('b') : 1] : null,
      opacity: has('opacity') ? value('opacity') : null,
    };
  }
  const sunTracks = scene.sun.tracks;
  return {
    frame,
    objects: [...poses.values()],
    camera: camera ? cameraPose(camera, scene, frame, poses) : null,
    sun: {
      hour: sunTracks.hour?.keys.length ? evaluate(sunTracks.hour, frame) : null,
      daylight: sunTracks.daylight?.keys.length ? Math.min(1, Math.max(0, evaluate(sunTracks.daylight, frame))) : null,
    },
    lights: scene.lights.map((light) => lightPose(light, frame)),
    materials,
  };
};

/** a turn channel kept within a bone's limits – measured from its rest (the model's place), the shortest way round */
export const limitChannel = (instance: Instance, animation: ObjectAnimation | undefined, channel: string, value: number) => {
  const range = animation?.bone?.limits?.[channel as LimitChannel];
  if (!range) {
    return value;
  }
  const rest = placementOf(instance.matrix, pivotOf(instance, animation))[channel as LimitChannel];
  const wrap = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180;
  const turned = wrap(value - rest);
  if (turned >= range[0] && turned <= range[1]) {
    return value;
  }
  // past a limit it stays at the nearer one, also beyond half a turn – a knee does not jump to its other end
  const nearer = Math.abs(wrap(turned - range[0])) < Math.abs(wrap(turned - range[1])) ? range[0] : range[1];
  return round(rest + nearer);
};

/** place channels with the turns kept within a bone's limits */
export const limitPlacement = (instance: Instance, animation: ObjectAnimation | undefined, place: Placement): Placement => {
  if (!animation?.bone?.limits) {
    return place;
  }
  const limited = { ...place };
  for (const channel of LIMIT_CHANNELS) {
    limited[channel] = limitChannel(instance, animation, channel, place[channel]);
  }
  return limited;
};

/** an object's place channels at a frame as it is shown (keys, or the model's place – `rest` – where it has none) */
export const placementAt = (instance: Instance, animation: ObjectAnimation | undefined, frame: number, rest = instance.matrix) => {
  const pivot = pivotOf(instance, animation);
  return keyed(animation?.tracks ?? {}, frame, placementOf(rest, pivot));
};
