// The box of the Scale tool: its grips, which axes a grip scales, and the factors a typed value means.
import * as THREE from 'three';
import { boxPoint, type BoxShape } from './boxFrame';

type V3 = THREE.Vector3;

/** a grip at `fraction` (0, ½ or 1 per axis) of the box */
export interface ScaleGrip {
  fraction: V3;
  world: V3;
}

/** how many axes the box really has (a flat selection has two) */
export const boxAxes = (box: THREE.Box3) =>
  box
    .getSize(new THREE.Vector3())
    .toArray()
    .filter((value) => value > 1e-6).length;

/** how many axes a grip scales: 3 at a corner, 2 at an edge middle, 1 at a face middle */
export const gripAxes = (grip: ScaleGrip) => grip.fraction.toArray().filter((value) => value !== 0.5).length;

/** a corner grip scales all axes evenly – also the corner of a flat box */
export const isCornerGrip = (grip: ScaleGrip, box: THREE.Box3) => gripAxes(grip) === 3 || gripAxes(grip) === boxAxes(box);

/** grips at the corners, edge middles and face middles of the box; a flat box keeps only the grips on its plane */
export const scaleGrips = (frame: BoxShape): ScaleGrip[] => {
  const size = frame.box.getSize(new THREE.Vector3());
  const grips: ScaleGrip[] = [];
  const seen = new Set<string>();
  for (const x of [0, 0.5, 1]) {
    for (const y of [0, 0.5, 1]) {
      for (const z of [0, 0.5, 1]) {
        const fraction = new THREE.Vector3(size.x < 1e-6 ? 0.5 : x, size.y < 1e-6 ? 0.5 : y, size.z < 1e-6 ? 0.5 : z);
        const key = fraction.toArray().join();
        if ((fraction.x === 0.5 && fraction.y === 0.5 && fraction.z === 0.5) || seen.has(key)) {
          continue;
        }
        seen.add(key);
        grips.push({ fraction, world: boxPoint(frame, fraction.toArray()) });
      }
    }
  }
  return grips;
};

/**
 * The factors a typed value means: `2` or `0,5`, a length (`3m` – the new size along the scaled axes), or one value
 * per scaled axis (`2; 3`) or per axis (`2; 3; 1`). `mask` marks the axes the grip scales. Null when it is no number.
 */
export const typedFactors = (
  text: string,
  mask: V3,
  size: V3,
  lengthOf: (text: string) => number | null,
): { uniform: number } | { factors: V3 } | null => {
  const reference = Math.max(size.x * mask.x, size.y * mask.y, size.z * mask.z) || Math.max(size.x, size.y, size.z);
  const numbers = text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/[a-z"']/i.test(part)) {
        const length = lengthOf(part);
        return length == null ? NaN : length / reference;
      }
      return parseFloat(part.replace(',', '.'));
    });
  if (!numbers.length || numbers.some(isNaN)) {
    return null;
  }
  if (numbers.length === 1) {
    return { uniform: numbers[0] };
  }
  if (numbers.length === 3) {
    return { factors: new THREE.Vector3(...numbers) };
  }
  // fewer values: one per scaled axis, in order
  const values = [1, 1, 1];
  let next = 0;
  mask.toArray().forEach((enabled, i) => {
    if (enabled && next < numbers.length) {
      values[i] = numbers[next++];
    }
  });
  return { factors: new THREE.Vector3(...values) };
};
