import * as THREE from 'three';
import type { Entities } from '../core/model';

/**
 * A mesh already turned into faces and edges (merged, softened), in typed arrays. It is built off the
 * main thread – merging coplanar faces is the slow part – and only has to be put into a model afterwards.
 */
export interface PreparedMesh {
  prepared: true;
  /** x, y, z per vertex */
  positions: Float64Array;
  /** first vertex, second vertex, 1 when soft – per edge */
  edges: Int32Array;
  /** per face: count of its loops, then per loop its size and vertices; the first loop is the outline */
  loops: Int32Array;
  faceCount: number;
  materialNames: string[];
  /** index into materialNames per face, -1 = no material */
  faceMaterials: Int32Array;
  /** the same for the backs */
  backMaterials: Int32Array;
}

export const isPreparedMesh = (mesh: unknown): mesh is PreparedMesh => (mesh as PreparedMesh | undefined)?.prepared === true;

/** the buffers of a prepared mesh – they move between threads instead of being copied */
export const preparedBuffers = (mesh: PreparedMesh): ArrayBuffer[] =>
  [mesh.positions, mesh.edges, mesh.loops, mesh.faceMaterials, mesh.backMaterials].map((array) => array.buffer as ArrayBuffer);

export const packEntities = (entities: Entities): PreparedMesh => {
  const vertexIndex = new Map<number, number>();
  const positions = new Float64Array(entities.vertices.size * 3);
  for (const vertex of entities.vertices.values()) {
    const index = vertexIndex.size;
    vertexIndex.set(vertex.id, index);
    vertex.position.toArray(positions, index * 3);
  }
  const edges = new Int32Array(entities.edges.size * 3);
  let edgeNumber = 0;
  for (const edge of entities.edges.values()) {
    edges[edgeNumber++] = vertexIndex.get(edge.start)!;
    edges[edgeNumber++] = vertexIndex.get(edge.end)!;
    edges[edgeNumber++] = edge.soft ? 1 : 0;
  }
  const loops: number[] = [];
  const materialNames: string[] = [];
  const materialIndex = new Map<string, number>();
  const faceMaterials = new Int32Array(entities.faces.size);
  const backMaterials = new Int32Array(entities.faces.size);
  const indexOfMaterial = (name: string | undefined) => {
    if (!name) {
      return -1;
    }
    let index = materialIndex.get(name);
    if (index === undefined) {
      index = materialNames.length;
      materialIndex.set(name, index);
      materialNames.push(name);
    }
    return index;
  };
  let faceNumber = 0;
  for (const face of entities.faces.values()) {
    loops.push(1 + face.holes.length);
    for (const loop of [face.outer, ...face.holes]) {
      loops.push(loop.length);
      for (const vertex of loop) {
        loops.push(vertexIndex.get(vertex)!);
      }
    }
    backMaterials[faceNumber] = indexOfMaterial(face.backMaterial);
    faceMaterials[faceNumber++] = indexOfMaterial(face.material);
  }
  return {
    prepared: true,
    positions,
    edges,
    loops: Int32Array.from(loops),
    faceCount: entities.faces.size,
    materialNames,
    faceMaterials,
    backMaterials,
  };
};

/** Puts a prepared mesh into `entities`; returns the number of faces. */
export const unpackInto = (entities: Entities, mesh: PreparedMesh): number => {
  // into a new group nothing can touch – otherwise shared points have to meet
  const addPoint = entities.vertices.size ? entities.addVertex.bind(entities) : entities.rawVertex.bind(entities);
  const point = new THREE.Vector3();
  const vertexIds = new Int32Array(mesh.positions.length / 3);
  for (let i = 0; i < vertexIds.length; i++) {
    vertexIds[i] = addPoint(point.fromArray(mesh.positions, i * 3));
  }
  for (let i = 0; i < mesh.edges.length; i += 3) {
    entities.createEdgeRaw(vertexIds[mesh.edges[i]], vertexIds[mesh.edges[i + 1]], mesh.edges[i + 2] ? { soft: true } : {});
  }
  let made = 0;
  let cursor = 0;
  for (let faceNumber = 0; faceNumber < mesh.faceCount; faceNumber++) {
    const loopCount = mesh.loops[cursor++];
    const loops: number[][] = [];
    for (let loopNumber = 0; loopNumber < loopCount; loopNumber++) {
      const size = mesh.loops[cursor++];
      const loop = new Array<number>(size);
      for (let i = 0; i < size; i++) {
        loop[i] = vertexIds[mesh.loops[cursor++]];
      }
      loops.push(loop);
    }
    const material = mesh.materialNames[mesh.faceMaterials[faceNumber]];
    const backMaterial = mesh.materialNames[mesh.backMaterials[faceNumber]];
    if (entities.createFaceRaw(loops[0], loops.slice(1), { ...(material && { material }), ...(backMaterial && { backMaterial }) })) {
      made++;
    }
  }
  return made;
};
