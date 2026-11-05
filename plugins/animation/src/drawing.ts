import type { Overlay } from '../../../src/engine/overlay';
import { currentPose, currentScene } from './apply';
import { selectedInstances } from './keying';
import { JOINT_TOOL_ID, POSE_TOOL_ID } from './names';
import { cameraPose, fovOf, pathPoint, poseAt } from './pose';
import { boneSegments } from './rig';
import { pluginContext, THREE } from './runtime';
import { animatedNodes, findInstance, pathLine, pivotOf } from './scene';
import { useAnimationState } from './state';

/**
 * What the 3D view shows besides the model: the way selected animated groups go (their motion path with a dot at
 * each key), the lines things follow, the cameras (a pyramid looking at its target, the shot's one highlighted), the
 * lights and the bones of rigs. Nothing of it goes into a render.
 */

type Vector = InstanceType<typeof THREE.Vector3>;

const PATH_COLOUR = '#e8590c';
const KEY_COLOUR = '#f59f00';
const CAMERA_COLOUR = '#495057';
const ACTIVE_CAMERA_COLOUR = '#1c7ed6';
const LIGHT_COLOUR = '#f08c00';
const BONE_COLOUR = '#5c7cfa';
const HOVER_BONE_COLOUR = '#22b8cf';
const PICKED_BONE_COLOUR = '#f59f00';

/** motion paths are worked out again only when something changed */
let cached: { key: string; paths: { points: Vector[]; keys: Vector[] }[] } | null = null;

const motionPaths = () => {
  const editor = pluginContext().editor;
  const state = useAnimationState();
  const selected = selectedInstances();
  const key = `${state.revision}|${editor.ui.revision}|${selected.map((instance) => instance.id).join(',')}`;
  if (cached?.key === key) {
    return cached.paths;
  }
  const scene = currentScene();
  const nodes = animatedNodes().filter((node) => selected.includes(node.instance));
  const paths = nodes.map(() => ({ points: [] as Vector[], keys: [] as Vector[] }));
  if (nodes.length) {
    const keyFrames = nodes.map(
      (node) => new Set(Object.values(node.animation.tracks).flatMap((track) => track?.keys.map((entry) => entry.frame) ?? [])),
    );
    // at most 300 points along the range
    const step = Math.max(1, (scene.end - scene.start) / 300);
    for (let frame = scene.start; frame <= scene.end + 1e-6; frame += step) {
      const pose = poseAt(scene, frame);
      nodes.forEach((node, index) => {
        const object = pose.objects.find((entry) => entry.instance === node.instance);
        if (!object) {
          return;
        }
        const point = new THREE.Vector3(...pivotOf(node.instance, node.animation)).applyMatrix4(object.world);
        paths[index].points.push(point);
        if ([...keyFrames[index]].some((keyed) => Math.abs(keyed - frame) < step / 2)) {
          paths[index].keys.push(point);
        }
      });
    }
  }
  cached = { key, paths };
  return paths;
};

/** a camera as a small pyramid from its eye towards its target */
const drawCamera = (overlay: Overlay, position: Vector, target: Vector, lens: number, colour: string, label: string) => {
  const forward = target.clone().sub(position).normalize();
  if (forward.lengthSq() < 1e-9) {
    return;
  }
  const up = new THREE.Vector3(0, 0, 1);
  const side = forward.clone().cross(up);
  if (side.lengthSq() < 1e-9) {
    side.set(1, 0, 0);
  }
  side.normalize();
  const top = side.clone().cross(forward).normalize();
  const depth = 0.6;
  const half = Math.tan(THREE.MathUtils.degToRad(fovOf(lens) / 2)) * depth;
  const middle = position.clone().addScaledVector(forward, depth);
  const corners = [
    [-1.5, -1],
    [1.5, -1],
    [1.5, 1],
    [-1.5, 1],
  ].map(([across, high]) =>
    middle
      .clone()
      .addScaledVector(side, across * half)
      .addScaledVector(top, high * half),
  );
  for (const corner of corners) {
    overlay.line(position, corner, colour, 1.5);
  }
  overlay.polyline(corners, colour, 1.5, true);
  // the top of the picture: a small triangle above it
  overlay.polyline(
    [
      middle
        .clone()
        .addScaledVector(side, -0.5 * half)
        .addScaledVector(top, 1.15 * half),
      middle.clone().addScaledVector(top, 1.6 * half),
      middle
        .clone()
        .addScaledVector(side, 0.5 * half)
        .addScaledVector(top, 1.15 * half),
    ],
    colour,
    1.5,
    true,
  );
  overlay.line(middle, target, colour, 1, [4, 4]);
  overlay.text(position, label, { color: '#fff', background: colour, offsetY: -14, font: '11px "Segoe UI", sans-serif' });
};

/** the bones of rigs: a slim diamond from joint to tip with a ring at the joint, the picked one highlighted */
const drawBones = (overlay: Overlay) => {
  const state = useAnimationState();
  const context = overlay.context;
  for (const segment of boneSegments()) {
    const head = overlay.screen(segment.head);
    const tail = overlay.screen(segment.tail);
    if (!head || !tail) {
      continue;
    }
    const along = tail.clone().sub(head);
    const length = along.length();
    if (length < 1) {
      continue;
    }
    const width = Math.min(8, Math.max(3, length * 0.1));
    const across = new THREE.Vector2(-along.y, along.x).multiplyScalar(width / length);
    const shoulder = head.clone().addScaledVector(along, 0.15);
    const picked = state.bone === segment.instance.id;
    const colour = picked ? PICKED_BONE_COLOUR : state.hoverBone === segment.instance.id ? HOVER_BONE_COLOUR : BONE_COLOUR;
    context.setLineDash([]);
    context.lineWidth = picked ? 2 : 1.5;
    context.strokeStyle = colour;
    context.fillStyle = `${colour}40`;
    context.beginPath();
    context.moveTo(head.x, head.y);
    context.lineTo(shoulder.x + across.x, shoulder.y + across.y);
    context.lineTo(tail.x, tail.y);
    context.lineTo(shoulder.x - across.x, shoulder.y - across.y);
    context.closePath();
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(head.x, head.y, 3.5, 0, Math.PI * 2);
    context.fillStyle = colour;
    context.fill();
  }
};

export const drawAnimation = (overlay: Overlay) => {
  const state = useAnimationState();
  if (state.rendering) {
    return;
  }
  const scene = currentScene();
  const pose = currentPose();
  // the skeleton belongs to animating: with the timeline open or a rig tool in hand
  if (state.show.bones && (state.timeline || [JOINT_TOOL_ID, POSE_TOOL_ID].includes(pluginContext().editor.ui.tool))) {
    drawBones(overlay);
  }
  if (state.show.paths) {
    for (const path of motionPaths()) {
      overlay.polyline(path.points, PATH_COLOUR, 1.5, false);
      for (const point of path.keys) {
        const screen = overlay.screen(point);
        if (screen) {
          const context = overlay.context;
          context.fillStyle = KEY_COLOUR;
          context.strokeStyle = '#fff';
          context.beginPath();
          context.moveTo(screen.x, screen.y - 5);
          context.lineTo(screen.x + 5, screen.y);
          context.lineTo(screen.x, screen.y + 5);
          context.lineTo(screen.x - 5, screen.y);
          context.closePath();
          context.fill();
          context.stroke();
        }
      }
    }
    // the lines groups and cameras follow
    const curves = new Set<number>();
    for (const node of animatedNodes()) {
      if (node.animation.path) {
        curves.add(node.animation.path.curve);
      }
    }
    scene.cameras.forEach((camera) => camera.path && curves.add(camera.path.curve));
    for (const id of curves) {
      const found = findInstance(id);
      const line = found && pathLine(found.instance.definition.entities);
      if (!line) {
        continue;
      }
      const points = Array.from({ length: 101 }, (_, index) => pathPoint(id, index / 100)?.point).filter((point) => !!point);
      overlay.polyline(points, PATH_COLOUR, 2, false, [6, 4]);
    }
  }
  if (state.show.cameras && !state.lookThrough) {
    const poses = new Map((pose?.objects ?? []).map((object) => [object.instance, object]));
    for (const camera of scene.cameras) {
      const at = cameraPose(camera, scene, state.frame, poses);
      const active = pose?.camera?.camera.id === camera.id;
      drawCamera(
        overlay,
        new THREE.Vector3(...at.position),
        new THREE.Vector3(...at.target),
        at.lens,
        active ? ACTIVE_CAMERA_COLOUR : CAMERA_COLOUR,
        camera.name,
      );
    }
    for (const light of pose?.lights ?? []) {
      const point = new THREE.Vector3(...light.position);
      overlay.marker(point, 'endpoint');
      overlay.text(point, light.light.name, { color: '#fff', background: LIGHT_COLOUR, offsetY: -14, font: '11px "Segoe UI", sans-serif' });
    }
  }
};
