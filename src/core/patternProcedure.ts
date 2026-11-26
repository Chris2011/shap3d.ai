// Pattern as a procedure (like Onshape's linear and circular pattern): copies of the sources in a row or around an
// axis; count, spacing and angle stay editable, and the copies follow the sources.
import * as THREE from 'three';
import { copyInstanceDetails, Entities, type Definition, type Instance } from './model';
import { aboutPoint } from './geometry';
import type { MirrorAxis } from './mirrorProcedure';

/** the most copies a pattern makes */
const MAX_PATTERN = 2000;
const AXES: Record<MirrorAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

export interface PatternParams {
  mode: 'linear' | 'circular';
  count: number;
  axis: MirrorAxis;
  /** linear: m from copy to copy */
  spacing: number;
  /** circular: degrees the copies spread over – 360 closes the circle */
  angle: number;
  /** circular: a point on the axis, as "x;y;z" in m */
  center: string;
  [key: string]: string | number | boolean;
}

/** the box around the sources */
const boundsOf = (sources: Instance[]) => {
  const box = new THREE.Box3();
  for (const source of sources) {
    box.union(source.definition.entities.bounds(new THREE.Box3(), source.matrix));
  }
  return box;
};

/** a row along red where the copies just touch; the circle turns about blue through the origin */
export const patternDefaults = (sources: Instance[]): PatternParams => {
  const box = boundsOf(sources);
  const width = box.isEmpty() ? 1 : box.max.x - box.min.x;
  return { mode: 'linear', count: 3, axis: 'x', spacing: width > 1e-6 ? width : 1, angle: 360, center: '0;0;0' };
};

const centerOf = (text: string) => {
  const [x, y, z] = String(text)
    .split(';')
    .map((part) => Number(part) || 0);
  return new THREE.Vector3(x ?? 0, y ?? 0, z ?? 0);
};

/** where copy `index` goes, in the procedure's coordinates */
const placeOf = (params: PatternParams, index: number) => {
  const axis = AXES[params.axis] ?? AXES.x;
  if (params.mode === 'circular') {
    const closed = Math.abs(Math.abs(params.angle) - 360) < 1e-6;
    const step = THREE.MathUtils.degToRad(params.angle) / Math.max(1, closed ? params.count : params.count - 1);
    return aboutPoint(centerOf(params.center), new THREE.Matrix4().makeRotationAxis(axis, step * index));
  }
  const offset = axis.clone().multiplyScalar(params.spacing * index);
  return new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z);
};

/** the result: the sources and their copies */
export const buildPattern = (definition: Definition, fresh: { entities: Entities }): string | null => {
  const params = definition.procedure!.params as PatternParams;
  const sources = [...definition.entities.instances.values()].filter((instance) => instance.procedureRole === 'source');
  if (!sources.length) {
    return 'procedures.errors.missingInput';
  }
  const count = Math.max(1, Math.round(Number(params.count)));
  if (count * sources.length > MAX_PATTERN) {
    return 'procedures.errors.tooMany';
  }
  const entities = new Entities();
  for (let index = 0; index < count; index++) {
    const place = placeOf({ ...params, count, spacing: Number(params.spacing), angle: Number(params.angle) }, index);
    for (const source of sources) {
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
