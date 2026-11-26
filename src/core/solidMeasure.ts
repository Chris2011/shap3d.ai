// Volume, surface, centre of mass and mass of a solid group with manifold-3d: its parts as one body.
import * as THREE from 'three';
import type { Manifold } from 'manifold-3d/manifold';
import { isProcedureInput, type Entities } from './model';
import { manifoldBody, manifoldLibrary } from './manifold';

export interface SolidMeasure {
  /** m³ – parts that overlap count once */
  volume: number;
  /** outer surface, m² */
  area: number;
  /** centre of the volume (= centre of mass for one material), in the coordinates `matrix` maps to */
  centroid: THREE.Vector3;
  /** kg; undefined when a part's material has no density */
  mass?: number;
}

/** a closed part of the body: the faces of one level, and the material most of its faces show */
interface Part {
  entities: Entities;
  matrix: THREE.Matrix4;
  material: string | undefined;
}

const mostUsedMaterial = (level: Entities, inherit: string | undefined) => {
  const counts = new Map<string | undefined, number>();
  for (const face of level.faces.values()) {
    const material = face.material ?? inherit;
    counts.set(material, (counts.get(material) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0];
};

const partsOf = (entities: Entities, matrix: THREE.Matrix4, inherit: string | undefined) => {
  const parts: Part[] = [];
  const collect = (level: Entities, at: THREE.Matrix4, material: string | undefined) => {
    if (level.faces.size) {
      parts.push({ entities: level, matrix: at, material: mostUsedMaterial(level, material) });
    }
    for (const instance of level.instances.values()) {
      if (!isProcedureInput(instance)) {
        collect(instance.definition.entities, at.clone().multiply(instance.matrix), instance.material ?? material);
      }
    }
  };
  collect(entities, matrix, inherit);
  return parts;
};

/** centre of the volume of a closed mesh: tetrahedra from the origin to each triangle (divergence theorem) */
const centroidOf = (body: Manifold) => {
  const mesh = body.getMesh();
  const corner = (index: number) => {
    const at = mesh.triVerts[index] * mesh.numProp;
    return new THREE.Vector3(mesh.vertProperties[at], mesh.vertProperties[at + 1], mesh.vertProperties[at + 2]);
  };
  const sum = new THREE.Vector3();
  let total = 0;
  for (let i = 0; i < mesh.triVerts.length; i += 3) {
    const [a, b, c] = [corner(i), corner(i + 1), corner(i + 2)];
    const volume = a.dot(b.clone().cross(c)) / 6;
    sum.addScaledVector(a.add(b).add(c), volume / 4);
    total += volume;
  }
  return total ? sum.divideScalar(total) : sum;
};

/**
 * Measures the faces and groups of `entities` (placed by `matrix`) as one body. `density` gives kg/m³ of a material
 * name. Null when the library is not loaded yet or a part is not closed – the caller then keeps its own sum.
 * shortcut: with several materials the mass spreads the body's volume by the parts' share of volume, and the centre
 * of mass is that of the volume – exact for one material; overlapping parts of different materials would need the
 * pieces cut apart.
 */
export const measureSolid = (
  entities: Entities,
  matrix: THREE.Matrix4,
  inherit: string | undefined,
  density: (material: string | undefined) => number | undefined,
): SolidMeasure | null => {
  const library = manifoldLibrary();
  const parts = partsOf(entities, matrix, inherit);
  if (!library || !parts.length) {
    return null;
  }
  const bodies = parts.map((part) => manifoldBody({ entities: part.entities, matrix: part.matrix, nested: false }));
  try {
    if (bodies.some((body) => !body)) {
      return null;
    }
    const whole = library.Manifold.union(bodies as Manifold[]);
    try {
      const volume = Math.abs(whole.volume());
      const shares = parts.map((part, i) => ({ volume: Math.abs(bodies[i]!.volume()), density: density(part.material) }));
      const known = shares.every((share) => share.density !== undefined);
      const partsVolume = shares.reduce((sum, share) => sum + share.volume, 0);
      const weighted = shares.reduce((sum, share) => sum + share.volume * (share.density ?? 0), 0);
      return {
        volume,
        area: whole.surfaceArea(),
        centroid: centroidOf(whole),
        mass: known && partsVolume > 0 ? (volume * weighted) / partsVolume : undefined,
      };
    } finally {
      whole.delete();
    }
  } finally {
    bodies.forEach((body) => body?.delete());
  }
};
