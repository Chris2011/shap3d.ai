// The box of a selected group or component in its own axes: its points, edges, rotation grips and grip points.
import * as THREE from 'three';
import type { Editor } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import type { EntityRef } from '../../core/model';

type V3 = THREE.Vector3;

/** A group's or component's bounding box in its own axes; `matrix` maps box coordinates to the model. */
export interface BoxFrame {
  box: THREE.Box3;
  matrix: THREE.Matrix4;
  instance: EntityRef;
}
/** Red cross on a face of the box: rotates about the face's normal through its centre (Move and Rotate). */
export interface RotateGrip {
  world: V3;
  center: V3;
  axis: V3;
}

/** The single selected group/component – or the hovered one when nothing is selected. */
export const boxFrame = (editor: Editor): BoxFrame | null => {
  const selected = editor.selected();
  const entityRef = selected.length === 1 ? selected[0] : selected.length ? null : editor.hover;
  if (entityRef?.kind !== 'instance') {
    return null;
  }
  const instance = editor.entities.instances.get(entityRef.id);
  if (!instance) {
    return null;
  }
  const box = instance.definition.entities.bounds();
  if (box.isEmpty()) {
    return null;
  }
  return { box, matrix: editor.contextMatrix.multiply(editor.viewer.shownMatrix(instance)), instance: entityRef };
};

/** a box and the matrix to the model – a frame, or the selection's box in the open group */
export type BoxShape = Pick<BoxFrame, 'box' | 'matrix'>;

/** the point at a fraction (0…1 per axis) of the box, in the model */
export const boxPoint = (frame: BoxShape, fraction: number[]) => {
  const { min, max } = frame.box;
  return new THREE.Vector3(
    min.x + (max.x - min.x) * fraction[0],
    min.y + (max.y - min.y) * fraction[1],
    min.z + (max.z - min.z) * fraction[2],
  ).applyMatrix4(frame.matrix);
};

const boxCorners = (frame: BoxShape) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => boxPoint(frame, [i & 1, (i >> 1) & 1, (i >> 2) & 1]));

const BOX_EDGES = [
  [0, 1],
  [1, 3],
  [3, 2],
  [2, 0],
  [4, 5],
  [5, 7],
  [7, 6],
  [6, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/** Four crosses on every face of the box that faces the camera – SketchUp's rotation grips. */
export const rotateGrips = (editor: Editor, frame: BoxFrame): RotateGrip[] => {
  const size = frame.box.getSize(new THREE.Vector3()).toArray();
  const eye = editor.viewer.rig.camera.position;
  const grips: RotateGrip[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const [first, second] = [0, 1, 2].filter((other) => other !== axis);
    if (size[first] < 1e-6 || size[second] < 1e-6) {
      continue;
    }
    const direction = new THREE.Vector3().setFromMatrixColumn(frame.matrix, axis).normalize();
    for (const side of size[axis] < 1e-6 ? [1] : [0, 1]) {
      const fraction = [0.5, 0.5, 0.5];
      fraction[axis] = side;
      const center = boxPoint(frame, fraction);
      const normal = direction.clone().multiplyScalar(side ? 1 : -1);
      if (normal.dot(eye.clone().sub(center)) <= 0) {
        continue;
      }
      for (const [along, value] of [
        [first, 0.2],
        [first, 0.8],
        [second, 0.2],
        [second, 0.8],
      ]) {
        const at = [...fraction];
        at[along] = value;
        grips.push({ world: boxPoint(frame, at), center, axis: normal });
      }
    }
  }
  return grips;
};

/** Corners and edge midpoints of the box – Move can start from them like from geometry. */
export const boxGripPoints = (frame: BoxFrame): V3[] => {
  const points: V3[] = [];
  for (const x of [0, 0.5, 1]) {
    for (const y of [0, 0.5, 1]) {
      for (const z of [0, 0.5, 1]) {
        if ([x, y, z].filter((value) => value === 0.5).length <= 1) {
          points.push(boxPoint(frame, [x, y, z]));
        }
      }
    }
  }
  return points;
};

/** the twelve edges of the box, yellow like SketchUp's */
export const drawBoxEdges = (overlay: Overlay, frame: BoxShape, width = 1) => {
  const corners = boxCorners(frame);
  for (const [i, j] of BOX_EDGES) {
    overlay.line(corners[i], corners[j], '#d4b000', width);
  }
};

/** The box with its rotation grips; the hot grip shows the protractor it rotates in. */
export const drawBoxFrame = (overlay: Overlay, frame: BoxFrame, grips: RotateGrip[], hot: RotateGrip | null) => {
  drawBoxEdges(overlay, frame);
  const context = overlay.context;
  for (const grip of grips) {
    const screenPos = overlay.screen(grip.world);
    if (!screenPos) {
      continue;
    }
    const half = grip === hot ? 6 : 4;
    context.strokeStyle = '#e00000';
    context.lineWidth = grip === hot ? 2.5 : 1.5;
    context.beginPath();
    context.moveTo(screenPos.x - half, screenPos.y);
    context.lineTo(screenPos.x + half, screenPos.y);
    context.moveTo(screenPos.x, screenPos.y - half);
    context.lineTo(screenPos.x, screenPos.y + half);
    context.stroke();
  }
  if (hot) {
    const radius = hot.world.distanceTo(hot.center);
    overlay.circle3D(hot.center, hot.axis, radius, '#555', 1, 48, [4, 3]);
    overlay.line(hot.center, hot.world, '#555', 1, [4, 3]);
  }
};
