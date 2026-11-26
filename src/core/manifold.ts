/**
 * Booleans with manifold-3d (Apache-2.0): for closed bodies they are exact and their result is always closed again,
 * where three-bvh-csg can leave slivers – e.g. where two cuts meet at a corner. The WASM (≈ 540 KB) is loaded once
 * in the background at the start; until it is there, or for geometry that is not closed, the callers keep using
 * three-bvh-csg.
 */
import * as THREE from 'three';
import type { Manifold, ManifoldToplevel } from 'manifold-3d/manifold';
import { isProcedureInput, type Entities } from './model';
import { fromTriMesh } from './meshops';

let wasm: ManifoldToplevel | null = null;
let loading: Promise<ManifoldToplevel | null> | null = null;

/** Starts loading the library; resolves to null when it cannot be loaded (the app then works without it). */
export const loadManifold = () =>
  (loading ??= (async () => {
    const [{ default: Module }, { default: wasmUrl }] = await Promise.all([
      import('manifold-3d/manifold'),
      import('manifold-3d/manifold.wasm?url'),
    ]);
    const module = await Module({ locateFile: () => wasmUrl });
    module.setup();
    wasm = module;
    return module;
  })().catch((error) => {
    console.warn('manifold-3d nicht geladen – Booleans mit three-bvh-csg', error);
    return null;
  }));

/** a body for a boolean: its faces (and those of its groups when `nested`), placed by `matrix`, `inherit` the material for faces without one */
export interface BooleanInput {
  entities: Entities;
  matrix?: THREE.Matrix4;
  inherit?: string;
  nested?: boolean;
}

/** The faces as one manifold; null when they are not a closed body. `materials` collects the face materials (faceID = index). */
const toManifold = (module: ManifoldToplevel, input: BooleanInput, materials: (string | undefined)[]): Manifold | null => {
  const positions: number[] = [];
  const triangles: number[] = [];
  const faceIds: number[] = [];
  const walk = (entities: Entities, matrix: THREE.Matrix4, inherit: string | undefined) => {
    const flip = matrix.determinant() < 0;
    const index = new Map<number, number>();
    const indexOf = (vertex: number) => {
      let at = index.get(vertex);
      if (at === undefined) {
        at = positions.length / 3;
        positions.push(...entities.positionOf(vertex).clone().applyMatrix4(matrix).toArray());
        index.set(vertex, at);
      }
      return at;
    };
    for (const face of entities.faces.values()) {
      const corners = [...face.outer, ...face.holes.flat()];
      const material = face.material ?? inherit;
      let materialId = materials.indexOf(material);
      if (materialId < 0) {
        materialId = materials.push(material) - 1;
      }
      const tri = entities.faceTriangles(face);
      for (let i = 0; i < tri.length; i += 3) {
        triangles.push(indexOf(corners[tri[i]]), indexOf(corners[tri[flip ? i + 2 : i + 1]]), indexOf(corners[tri[flip ? i + 1 : i + 2]]));
        faceIds.push(materialId);
      }
    }
    for (const instance of input.nested === false ? [] : entities.instances.values()) {
      if (!isProcedureInput(instance)) {
        walk(instance.definition.entities, matrix.clone().multiply(instance.matrix), instance.material ?? inherit);
      }
    }
  };
  walk(input.entities, input.matrix ?? new THREE.Matrix4(), input.inherit);
  if (!triangles.length) {
    return null;
  }
  const mesh = new module.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(positions),
    triVerts: new Uint32Array(triangles),
    faceID: new Uint32Array(faceIds),
  });
  mesh.merge();
  try {
    const body = new module.Manifold(mesh);
    if (body.status() === 'NoError') {
      return body;
    }
    body.delete();
  } catch {
    // not closed
  }
  return null;
};

/** The manifold as faces again (coplanar triangles merged, gentle folds of curved surfaces softened). */
const fromManifold = (body: Manifold, materials: (string | undefined)[]): Entities => {
  const mesh = body.getMesh();
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    positions.push(new THREE.Vector3(mesh.vertProperties[i], mesh.vertProperties[i + 1], mesh.vertProperties[i + 2]));
  }
  const triangleMaterials = [...mesh.faceID].map((id) => materials[id]);
  return fromTriMesh(
    { positions, triangles: [...mesh.triVerts], materials: triangleMaterials, backMaterials: triangleMaterials.map(() => undefined) },
    20,
  );
};

/** the manifold library once it has loaded, else null */
export const manifoldLibrary = () => wasm;

/** one closed body of faces (see BooleanInput); null without the library or when it is not closed – the caller deletes it */
export const manifoldBody = (input: BooleanInput, materials: (string | undefined)[] = []) =>
  wasm ? toManifold(wasm, input, materials) : null;

export type ManifoldOperation = 'union' | 'subtract' | 'intersect';

/**
 * `first` combined with each of `others` in turn (subtract: all of them taken away) – null when the library is not
 * loaded yet or one of the bodies is not closed, so the caller falls back to three-bvh-csg.
 */
export const manifoldBoolean = (operation: ManifoldOperation, first: BooleanInput, others: BooleanInput[]): Entities | null => {
  if (!wasm) {
    return null;
  }
  const materials: (string | undefined)[] = [];
  const bodies = [first, ...others].map((input) => toManifold(wasm!, input, materials));
  try {
    if (bodies.some((body) => !body)) {
      return null;
    }
    const all = bodies as Manifold[];
    const result =
      operation === 'subtract'
        ? wasm.Manifold.difference(all)
        : operation === 'union'
          ? wasm.Manifold.union(all)
          : wasm.Manifold.intersection(all);
    try {
      return fromManifold(result, materials);
    } finally {
      result.delete();
    }
  } finally {
    bodies.forEach((body) => body?.delete());
  }
};
