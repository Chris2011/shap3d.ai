import * as THREE from 'three';
import { Entities, MESH_POINT_TOLERANCE } from '../core/model';
import { fromTriMesh, loopSubdivide, simplify, type TriMesh } from '../core/meshops';
import { buildMesh } from './mesh';
import { packEntities, preparedBuffers, type PreparedMesh } from './preparedMesh';

/** A polygon mesh in typed arrays. */
export interface FlatMesh {
  /** x, y, z per vertex */
  positions: Float64Array;
  /** vertices of each face */
  faceSizes: Int32Array;
  /** the faces' vertex indices, one after another */
  faceIndices: Int32Array;
  /** index into the job's materialNames per face, -1 = no material */
  faceMaterials: Int32Array;
  scale: number;
  smooth: number;
}

/** Slow work on meshes that needs nothing of the app – it runs in a worker. */
export type MeshJob =
  /** polygon meshes → faces */
  | { kind: 'meshes'; meshes: FlatMesh[]; materialNames: string[] }
  /** imported triangles → faces: per group x, y, z of 3 corners per triangle and a material per triangle */
  | { kind: 'triangles'; groups: { positions: Float64Array; materials: Int32Array }[]; materialNames: string[] }
  /** more or fewer polygons for a triangle mesh */
  | {
      kind: 'reshape';
      operation: { name: 'subdivide'; round: boolean } | { name: 'simplify'; keep: number };
      positions: Float64Array;
      triangles: Int32Array;
      materials: Int32Array;
      backMaterials: Int32Array;
      materialNames: string[];
    };

const buildFlatMesh = (mesh: FlatMesh, materialNames: string[]) => {
  const verts = new Array<THREE.Vector3>(mesh.positions.length / 3);
  for (let i = 0; i < verts.length; i++) {
    verts[i] = new THREE.Vector3().fromArray(mesh.positions, i * 3);
  }
  const faces = new Array<number[]>(mesh.faceSizes.length);
  const materials = new Array<string | null>(faces.length);
  let cursor = 0;
  for (let i = 0; i < faces.length; i++) {
    faces[i] = Array.from(mesh.faceIndices.subarray(cursor, cursor + mesh.faceSizes[i]));
    cursor += mesh.faceSizes[i];
    materials[i] = materialNames[mesh.faceMaterials[i]] ?? null;
  }
  const entities = new Entities();
  buildMesh(entities, { verts, faces, materials }, { fit: false, yUp: false, scale: mesh.scale, smooth: mesh.smooth });
  return packEntities(entities);
};

const buildTriangles = (positions: Float64Array, materials: Int32Array, materialNames: string[]) => {
  const entities = new Entities();
  // faces keyed by their (unordered) vertex set: the second copy of a double-sided face becomes its back side
  const seen = new Map<string, number>();
  const cornerA = new THREE.Vector3(),
    cornerB = new THREE.Vector3(),
    cornerC = new THREE.Vector3(),
    sideA = new THREE.Vector3(),
    sideB = new THREE.Vector3();
  for (let triangle = 0; triangle < materials.length; triangle++) {
    cornerA.fromArray(positions, triangle * 9);
    cornerB.fromArray(positions, triangle * 9 + 3);
    cornerC.fromArray(positions, triangle * 9 + 6);
    if (sideA.subVectors(cornerB, cornerA).cross(sideB.subVectors(cornerC, cornerA)).lengthSq() < 1e-14) {
      continue;
    }
    const ids = [cornerA, cornerB, cornerC].map((corner) => entities.addVertex(corner, MESH_POINT_TOLERANCE));
    if (new Set(ids).size < 3) {
      continue;
    }
    const name = materialNames[materials[triangle]];
    const key = [...ids].sort((left, right) => left - right).join('_');
    const previous = seen.get(key);
    if (previous != null) {
      const existing = entities.faces.get(previous);
      if (existing && name && name !== existing.material) {
        existing.backMaterial = name;
      }
      continue;
    }
    const face = entities.createFaceRaw(ids, [], { material: name });
    if (face) {
      seen.set(key, face.id);
    }
  }
  entities.mergeMeshFaces();
  entities.softenFlatEdges(entities.edges.keys());
  entities.autoSoften([...entities.edges.keys()], 25);
  return packEntities(entities);
};

const reshape = async (job: Extract<MeshJob, { kind: 'reshape' }>) => {
  const positions = new Array<THREE.Vector3>(job.positions.length / 3);
  for (let i = 0; i < positions.length; i++) {
    positions[i] = new THREE.Vector3().fromArray(job.positions, i * 3);
  }
  const triMesh: TriMesh = {
    positions,
    triangles: Array.from(job.triangles),
    materials: Array.from(job.materials, (index) => job.materialNames[index]),
    backMaterials: Array.from(job.backMaterials, (index) => job.materialNames[index]),
  };
  if (job.operation.name === 'subdivide') {
    return [packEntities(fromTriMesh(loopSubdivide(triMesh, job.operation.round), 40, job.operation.round))];
  }
  const simplified = await simplify(triMesh, job.operation.keep);
  return simplified.triangles.length < 3 ? [] : [packEntities(fromTriMesh(simplified))];
};

export const doMeshJob = async (job: MeshJob): Promise<PreparedMesh[]> => {
  switch (job.kind) {
    case 'meshes':
      return job.meshes.map((mesh) => buildFlatMesh(mesh, job.materialNames));
    case 'triangles':
      return job.groups.map((group) => buildTriangles(group.positions, group.materials, job.materialNames));
    case 'reshape':
      return reshape(job);
  }
};

const jobBuffers = (job: MeshJob): ArrayBuffer[] => {
  const arrays: ArrayBufferView[] =
    job.kind === 'meshes'
      ? job.meshes.flatMap((mesh) => [mesh.positions, mesh.faceSizes, mesh.faceIndices, mesh.faceMaterials])
      : job.kind === 'triangles'
        ? job.groups.flatMap((group) => [group.positions, group.materials])
        : [job.positions, job.triangles, job.materials, job.backMaterials];
  return [...new Set(arrays.map((array) => array.buffer as ArrayBuffer))];
};

export type MeshJobAnswer = { ok: true; meshes: PreparedMesh[] } | { ok: false; error: string };

/** the answer of a job as the worker sends it, and what can move instead of being copied */
export const answerOf = async (job: MeshJob): Promise<{ answer: MeshJobAnswer; transfer: ArrayBuffer[] }> => {
  try {
    const meshes = await doMeshJob(job);
    return { answer: { ok: true, meshes }, transfer: meshes.flatMap(preparedBuffers) };
  } catch (error) {
    return { answer: { ok: false, error: (error as Error)?.message ?? String(error) }, transfer: [] };
  }
};

/** Runs a job in a worker of its own, which goes away afterwards. Without workers it happens here. */
export const runMeshJob = async (job: MeshJob): Promise<PreparedMesh[]> => {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return doMeshJob(job);
  }
  try {
    return await new Promise<PreparedMesh[]>((resolve, reject) => {
      worker.onerror = (event) => reject(new Error(event.message));
      worker.onmessage = ({ data }: MessageEvent<MeshJobAnswer>) => (data.ok ? resolve(data.meshes) : reject(new Error(data.error)));
      worker.postMessage(job, jobBuffers(job));
    });
  } finally {
    worker.terminate();
  }
};
