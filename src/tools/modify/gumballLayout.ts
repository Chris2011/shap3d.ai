// Where the gumball's handles sit at the selection and how the cursor's position along a handle is measured.
import * as THREE from 'three';
import type { Editor } from '../../engine/editor';
import { AXES } from '../../engine/inference';

type V3 = THREE.Vector3;
type Pointer = { x: number; y: number };
export type Axis = 'x' | 'y' | 'z';

export interface GumballHandle {
  kind: 'move' | 'scale' | 'rotate' | 'extrude';
  axis: Axis | null;
  direction: V3;
  /** where it is grabbed: the tip, the square, the arc's points or the dot */
  points: V3[];
}
export interface GumballLayout {
  center: V3;
  size: number;
  handles: GumballHandle[];
  /** the one selected face the orange dot pulls */
  face: number | null;
}

const ARROW_PX = 90;

/** the one selected face, if exactly one is selected */
const singleFace = (editor: Editor) => {
  const selection = editor.selected();
  return selection.length === 1 && selection[0].kind === 'face' ? editor.entities.faces.get(selection[0].id) : undefined;
};

/** a quarter circle about `axis`, between the two other axes */
const quarterArc = (center: V3, axis: Axis, radius: number) => {
  const [first, second] = (['x', 'y', 'z'] as const).filter((other) => other !== axis).map((other) => AXES[other]);
  const arc: V3[] = [];
  for (let step = 0; step <= 12; step++) {
    const angle = 0.15 + ((Math.PI / 2 - 0.3) * step) / 12;
    arc.push(
      center
        .clone()
        .addScaledVector(first, Math.cos(angle) * radius)
        .addScaledVector(second, Math.sin(angle) * radius),
    );
  }
  return arc;
};

/** the handles around the selection's centre, sized to stay the same on screen */
export const gumballLayout = (editor: Editor): GumballLayout | null => {
  const refs = editor.selected();
  if (!refs.length) {
    return null;
  }
  const box = editor.entities.refBounds(refs);
  if (box.isEmpty()) {
    return null;
  }
  const center = editor.toWorld(box.getCenter(new THREE.Vector3()));
  const size = editor.viewer.worldPerPixel(center) * ARROW_PX;
  const handles: GumballHandle[] = [];
  for (const axis of ['x', 'y', 'z'] as const) {
    const direction = AXES[axis].clone();
    handles.push({ kind: 'scale', axis, direction, points: [center.clone().addScaledVector(direction, size * 0.6)] });
    handles.push({ kind: 'move', axis, direction, points: [center.clone().addScaledVector(direction, size)] });
    handles.push({ kind: 'rotate', axis, direction, points: quarterArc(center, axis, size * 0.75) });
  }
  const face = singleFace(editor);
  if (face) {
    const normal = editor.entities.faceNormal(face).transformDirection(editor.contextMatrix);
    handles.push({ kind: 'extrude', axis: null, direction: normal, points: [center.clone().addScaledVector(normal, size * 1.3)] });
  }
  return { center, size, handles, face: face?.id ?? null };
};

/** where an arrow's shaft starts – the centre itself stays free */
export const shaftStart = (layout: GumballLayout, handle: GumballHandle) =>
  layout.center.clone().addScaledVector(handle.direction, layout.size * 0.2);

/** pixels from the pointer to the segment between two points on screen */
export const screenDistance = (editor: Editor, pointer: Pointer, start: V3, end: V3) => {
  const from = editor.viewer.project(start),
    to = editor.viewer.project(end);
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  const along = lengthSq > 1e-9 ? Math.max(0, Math.min(1, ((pointer.x - from.x) * dx + (pointer.y - from.y) * dy) / lengthSq)) : 0;
  return Math.hypot(from.x + dx * along - pointer.x, from.y + dy * along - pointer.y);
};

/** how far along the line through `center` in `direction` the cursor's ray passes closest; null when they run parallel */
export const alongLine = (editor: Editor, pointer: Pointer, center: V3, direction: V3) => {
  const ray = editor.viewer.ray(pointer.x, pointer.y);
  const offset = ray.origin.clone().sub(center);
  const cross = direction.dot(ray.direction);
  const den = 1 - cross * cross;
  if (den < 1e-6) {
    return null;
  }
  return (direction.dot(offset) - cross * ray.direction.dot(offset)) / den;
};

/** stretching by `factor` along the unit `direction`: identity + (factor − 1)·d·dᵀ */
export const stretch = (direction: V3, factor: number) => {
  const matrix = new THREE.Matrix4();
  const values = direction.toArray();
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) {
      matrix.elements[column * 4 + row] += (factor - 1) * values[row] * values[column];
    }
  }
  return matrix;
};
