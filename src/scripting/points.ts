import * as THREE from 'three';

/** A point or direction as scripts write it: [x, y, z], {x, y, z} or a THREE.Vector3. */
export type Pt = [number, number, number] | { x: number; y: number; z: number } | THREE.Vector3;
export const toVec = (point: Pt | undefined, def: [number, number, number] = [0, 0, 0]): THREE.Vector3 => {
  if (!point) {
    return new THREE.Vector3(...def);
  }
  if (Array.isArray(point)) {
    return new THREE.Vector3(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0);
  }
  return new THREE.Vector3(point.x, point.y, point.z);
};
/** the unit axes, also by their colours in the view */
export const AXIS_VECTORS: Record<string, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
  red: new THREE.Vector3(1, 0, 0),
  green: new THREE.Vector3(0, 1, 0),
  blue: new THREE.Vector3(0, 0, 1),
};
/** an axis by name (x/y/z, red/green/blue) or a direction, normalised – default: up */
export const axis = (spec: string | Pt | undefined) =>
  typeof spec === 'string'
    ? (AXIS_VECTORS[spec.toLowerCase()] ?? AXIS_VECTORS.z).clone()
    : spec
      ? toVec(spec).normalize()
      : AXIS_VECTORS.z.clone();
