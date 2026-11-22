// The outline ("profile") edges of a group or component as the camera sees it – Move can start from them.
import * as THREE from 'three';
import type { Editor } from '../../engine/editor';
import { isProcedureInput, type Entities } from '../../core/model';
import { closestOnLineToRay } from '../../engine/inference';
import { distPointSegment2D, closestOnSegment } from '../../core/geometry';
import type { BoxFrame } from './boxFrame';

type V3 = THREE.Vector3;

/** An outline ("profile") edge of a group or component as the camera sees it, and the point on it under the cursor. */
export interface ProfileGrip {
  start: V3;
  end: V3;
  point: V3;
}
const PROFILE_EDGE_LIMIT = 20000;
let profileCache: { key: string; segments: [V3, V3][] } | null = null;

/**
 * The outline edges of the box's group or component from where the camera stands: edges between a face turned to the
 * camera and one turned away, or with one face – soft edges too, so round things have an outline as well.
 */
const profileSegments = (editor: Editor, frame: BoxFrame): [V3, V3][] => {
  const instance = editor.entities.instances.get(frame.instance.id);
  if (!instance) {
    return [];
  }
  const rig = editor.viewer.rig;
  const camera = rig.camera;
  const key = [instance.id, editor.ui.revision, ...frame.matrix.elements, ...camera.matrixWorld.elements].join();
  if (profileCache?.key === key) {
    return profileCache.segments;
  }
  const eye = camera.position,
    away = rig.forward().negate();
  const segments: [V3, V3][] = [];
  let count = 0;
  const walk = (ents: Entities, matrix: THREE.Matrix4, depth: number) => {
    for (const edge of ents.edges.values()) {
      if (++count > PROFILE_EDGE_LIMIT) {
        return;
      }
      const faces = ents.facesOfEdge(edge.id);
      if (edge.hidden || !faces.length) {
        continue;
      }
      const start = ents.positionOf(edge.start).clone().applyMatrix4(matrix),
        end = ents.positionOf(edge.end).clone().applyMatrix4(matrix);
      const toEye = rig.isOrtho ? away : eye.clone().sub(start.clone().add(end).multiplyScalar(0.5));
      const facing = faces.slice(0, 2).map((face) => ents.faceNormal(face).transformDirection(matrix).dot(toEye) > 0);
      if (facing.length === 1 || facing[0] !== facing[1]) {
        segments.push([start, end]);
      }
    }
    if (depth < 4) {
      for (const child of ents.instances.values()) {
        if (!isProcedureInput(child)) {
          walk(child.definition.entities, matrix.clone().multiply(child.matrix), depth + 1);
        }
      }
    }
  };
  walk(instance.definition.entities, frame.matrix, 0);
  profileCache = { key, segments };
  return segments;
};

/** the outline edge closest to the cursor on screen (within a few pixels) and the point on it under the cursor */
export const profileUnder = (editor: Editor, pointer: { x: number; y: number }, frame: BoxFrame): ProfileGrip | null => {
  let best: ProfileGrip | null = null;
  let bestDistance = 7;
  const mouse = new THREE.Vector2(pointer.x, pointer.y);
  const ray = editor.viewer.ray(pointer.x, pointer.y);
  for (const [start, end] of profileSegments(editor, frame)) {
    const screenStart = editor.viewer.project(start),
      screenEnd = editor.viewer.project(end);
    if (!screenStart.visible || !screenEnd.visible) {
      continue;
    }
    const distance = distPointSegment2D(
      mouse,
      new THREE.Vector2(screenStart.x, screenStart.y),
      new THREE.Vector2(screenEnd.x, screenEnd.y),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      const point = closestOnSegment(closestOnLineToRay(start, end.clone().sub(start), ray), start, end).point;
      best = { start, end, point };
    }
  }
  return best;
};
