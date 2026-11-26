// Mirror as a procedure (like Onshape's): the sources stay as they are and a mirror image of them follows them.
import * as THREE from 'three';
import { copyInstanceDetails, Entities, type Definition, type Instance } from './model';

export type MirrorAxis = 'x' | 'y' | 'z';
const AXIS_INDEX: Record<MirrorAxis, number> = { x: 0, y: 1, z: 2 };

/** the plane across `axis` at `at` (m along it) as a matrix: everything on one side lands on the other */
export const mirrorMatrix = (axis: MirrorAxis, at: number) => {
  const scale = [1, 1, 1];
  scale[AXIS_INDEX[axis]] = -1;
  const shift = [0, 0, 0];
  shift[AXIS_INDEX[axis]] = 2 * at;
  return new THREE.Matrix4()
    .makeTranslation(shift[0], shift[1], shift[2])
    .multiply(new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]));
};

/** where the plane goes first: at the far side of the sources along the axis, so the image touches them */
export const mirrorPlaneAt = (sources: Instance[], axis: MirrorAxis) => {
  const box = new THREE.Box3();
  for (const source of sources) {
    box.union(source.definition.entities.bounds(new THREE.Box3(), source.matrix));
  }
  return box.isEmpty() ? 0 : box.max.getComponent(AXIS_INDEX[axis]);
};

/** the result: a copy of every source and its mirror image */
export const buildMirror = (definition: Definition, fresh: { entities: Entities }): string | null => {
  const { axis, at } = definition.procedure!.params as { axis: MirrorAxis; at: number };
  const sources = [...definition.entities.instances.values()].filter((instance) => instance.procedureRole === 'source');
  if (!sources.length) {
    return 'procedures.errors.missingInput';
  }
  const mirror = mirrorMatrix(axis in AXIS_INDEX ? axis : 'x', Number(at) || 0);
  const entities = new Entities();
  for (const source of sources) {
    for (const place of [new THREE.Matrix4(), mirror]) {
      const copy = copyInstanceDetails(
        source,
        entities.addInstance(source.definition, source.matrix.clone().premultiply(place), source.name),
      );
      copy.procedureRole = 'result';
      copy.hidden = false;
    }
  }
  fresh.entities = entities;
  return null;
};
