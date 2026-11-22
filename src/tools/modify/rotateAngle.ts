// The angle Rotate turns by: from the cursor with its snaps, or typed in degrees.
import * as THREE from 'three';
import type { FaceHit } from '../../engine/viewer';
import { snapping, type Inference } from '../../engine/inference';
import { normalizeNumberInput } from '../../i18n';
import { aboutPoint } from '../../core/geometry';
import type { Editor } from '../../engine/editor';

type V3 = THREE.Vector3;

/**
 * Where the circle the start point `ref` runs on (around `center`, about `normal`) crosses the face – the crossing
 * nearest to `angle`, if it lies inside the face. Null when the circle misses the face.
 */
const leanOnFace = (center: V3, normal: V3, ref: V3, faceHit: FaceHit, angle: number): { angle: number; point: V3 } | null => {
  const radial = ref.clone().sub(center);
  const across = normal.clone().cross(radial);
  const faceNormal = faceHit.normal.clone().normalize();
  // radial·m cos θ + across·m sin θ = -(center - face)·m
  const cosPart = radial.dot(faceNormal),
    sinPart = across.dot(faceNormal),
    offset = center.clone().sub(faceHit.point).dot(faceNormal);
  const amplitude = Math.hypot(cosPart, sinPart);
  if (amplitude < 1e-9 || Math.abs(offset) > amplitude) {
    return null;
  }
  const phase = Math.atan2(sinPart, cosPart),
    spread = Math.acos(-offset / amplitude);
  const wrap = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
  const best = [phase + spread, phase - spread]
    .map(wrap)
    .sort((left, right) => Math.abs(wrap(left - angle)) - Math.abs(wrap(right - angle)))[0];
  const point = center.clone().addScaledVector(radial, Math.cos(best)).addScaledVector(across, Math.sin(best));
  const ents = faceHit.context.entities;
  const face = ents.faces.get(faceHit.faceId);
  const local = point.clone().applyMatrix4(faceHit.context.world.clone().invert());
  if (!face || !ents.pointInFace(face, local, false)) {
    return null;
  }
  return { angle: best, point };
};

/**
 * The angle from the start point `ref` to `target` around `center`: rounded to 15° near a round angle (unless the
 * cursor is on an endpoint), and over a face the angle where the start point's circle meets it (`lean`).
 */
export const pointerAngle = (center: V3, normal: V3, ref: V3, target: V3, inference: Inference) => {
  const fromRef = ref.clone().sub(center),
    toTarget = target.clone().sub(center);
  let angle = Math.atan2(fromRef.clone().cross(toTarget).dot(normal), fromRef.dot(toTarget));
  const step = Math.PI / 12;
  const snap = Math.round(angle / step) * step;
  if (snapping.value && Math.abs(angle - snap) < THREE.MathUtils.degToRad(2.5) && inference.kind !== 'endpoint') {
    angle = snap;
  }
  const lean =
    snapping.value && inference.kind === 'face' && inference.face ? leanOnFace(center, normal, ref, inference.face, angle) : null;
  return { angle: lean?.angle ?? angle, lean };
};

/** degrees typed in the measurements box, as radians; null when it is no number */
export const typedAngle = (text: string) => {
  const degrees = parseFloat(normalizeNumberInput(text).replace(',', '.').replace('°', ''));
  return isNaN(degrees) ? null : (degrees * Math.PI) / 180;
};

/** the turn by `angle` about the axis `normal` through `center` (model coordinates), in the open group's coordinates */
export const rotationMatrix = (editor: Editor, center: V3, normal: V3, angle: number) =>
  editor.contextInverse.multiply(aboutPoint(center, new THREE.Matrix4().makeRotationAxis(normal, angle))).multiply(editor.contextMatrix);
