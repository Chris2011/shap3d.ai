import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { Entities, type Face } from './model';

// ------------------------------------------------------------------ statistics
export interface MeshStats { vertices: number; edges: number; faces: number; triangles: number; softEdges: number }
const empty = (): MeshStats => ({ vertices: 0, edges: 0, faces: 0, triangles: 0, softEdges: 0 });
const add = (target: MeshStats, source: MeshStats) => { target.vertices += source.vertices; target.edges += source.edges; target.faces += source.faces; target.triangles += source.triangles; target.softEdges += source.softEdges; return target; };

/** Counts of an entities tree – every placed instance counts (that is what gets rendered). */
export const meshStats = (ents: Entities, recursive = true): MeshStats => {
  const stats = empty();
  stats.vertices = ents.vertices.size; stats.edges = ents.edges.size; stats.faces = ents.faces.size;
  for (const edge of ents.edges.values()) if (edge.soft) stats.softEdges++;
  for (const face of ents.faces.values()) stats.triangles += ents.faceTriangles(face).length / 3;
  if (recursive) for (const instance of ents.instances.values()) add(stats, meshStats(instance.definition.entities, true));
  return stats;
};
export const sumStats = (list: MeshStats[]) => list.reduce((total, stats) => add(total, stats), empty());

// ------------------------------------------------------------------ triangle soup
/** Indexed triangle mesh of one entities level (no instances), keeping front/back material per triangle. */
export interface TriMesh { positions: THREE.Vector3[]; triangles: number[]; materials: (string | undefined)[]; backMaterials: (string | undefined)[] }

export const toTriMesh = (ents: Entities): TriMesh => {
  const index = new Map<number, number>(); const pos: THREE.Vector3[] = [];
  const vertexIndex = (id: number) => { let slot = index.get(id); if (slot == null) { slot = pos.length; index.set(id, slot); pos.push(ents.positionOf(id).clone()); } return slot; };
  const triMesh: TriMesh = { positions: pos, triangles: [], materials: [], backMaterials: [] };
  for (const face of ents.faces.values()) {
    const ids = [...face.outer, ...face.holes.flat()];
    const triangles = ents.faceTriangles(face);
    for (let i = 0; i < triangles.length; i += 3) {
      triMesh.triangles.push(vertexIndex(ids[triangles[i]]), vertexIndex(ids[triangles[i + 1]]), vertexIndex(ids[triangles[i + 2]]));
      triMesh.materials.push(face.material); triMesh.backMaterials.push(face.backMaterial);
    }
  }
  return triMesh;
};

/** Real faces again: coplanar neighbours merged, gentle folds (< smoothDeg) softened so curved surfaces look smooth. */
export const fromTriMesh = (triMesh: TriMesh, smoothDeg = 40, merge = true): Entities => {
  const ents = new Entities();
  const ids = triMesh.positions.map(point => ents.addVertex(point));
  for (let i = 0; i < triMesh.triangles.length; i += 3) {
    const loop = [ids[triMesh.triangles[i]], ids[triMesh.triangles[i + 1]], ids[triMesh.triangles[i + 2]]];
    if (new Set(loop).size < 3) continue;
    const cornerA = triMesh.positions[triMesh.triangles[i]], cornerB = triMesh.positions[triMesh.triangles[i + 1]], cornerC = triMesh.positions[triMesh.triangles[i + 2]];
    if (cornerB.clone().sub(cornerA).cross(cornerC.clone().sub(cornerA)).lengthSq() < 1e-16) continue;
    ents.createFaceRaw(loop, [], { material: triMesh.materials[i / 3], backMaterial: triMesh.backMaterials[i / 3] });
  }
  // without merging, flat areas keep their extra triangles (more polygons, same shape)
  if (merge) ents.mergeCoplanar([...ents.edges.keys()]);
  const cosLimit = Math.cos(THREE.MathUtils.degToRad(smoothDeg));
  for (const edge of ents.edges.values()) {
    const faces = ents.facesOfEdge(edge.id);
    edge.soft = faces.length === 2 && ents.faceNormal(faces[0]).dot(ents.faceNormal(faces[1])) > cosLimit;
  }
  return ents;
};

// ------------------------------------------------------------------ more polygons: Loop subdivision
/**
 * One Loop subdivision step: every triangle becomes four, and all points move towards a smooth surface
 * (cubes get rounded, cylinders and spheres get finer). Open borders are kept in place.
 */
export const loopSubdivide = (triMesh: TriMesh, smooth = true): TriMesh => {
  const vertexCount = triMesh.positions.length;
  const ekey = (first: number, second: number) => (first < second ? first * 1e7 + second : second * 1e7 + first);
  const edgeOpp = new Map<number, number[]>();      // edge → opposite vertices
  const nbr: Set<number>[] = Array.from({ length: vertexCount }, () => new Set());
  for (let i = 0; i < triMesh.triangles.length; i += 3) {
    const triangle = [triMesh.triangles[i], triMesh.triangles[i + 1], triMesh.triangles[i + 2]];
    for (let k = 0; k < 3; k++) {
      const edgeStart = triangle[k], edgeEnd = triangle[(k + 1) % 3], opposite = triangle[(k + 2) % 3];
      const key = ekey(edgeStart, edgeEnd); (edgeOpp.get(key) ?? edgeOpp.set(key, []).get(key)!).push(opposite);
      nbr[edgeStart].add(edgeEnd); nbr[edgeEnd].add(edgeStart);
    }
  }
  const boundary = new Set<number>();
  for (const [key, opp] of edgeOpp) if (opp.length !== 2) { boundary.add(Math.floor(key / 1e7)); boundary.add(key % 1e7); }
  // new positions of the old vertices
  const pos: THREE.Vector3[] = triMesh.positions.map((point, i) => {
    if (!smooth || boundary.has(i)) return point.clone();
    const k = nbr[i].size; if (!k) return point.clone();
    const beta = k > 3 ? 3 / (8 * k) : 3 / 16;
    const sum = new THREE.Vector3(); for (const j of nbr[i]) sum.add(triMesh.positions[j]);
    return point.clone().multiplyScalar(1 - k * beta).addScaledVector(sum, beta);
  });
  // one new vertex per edge
  const mid = new Map<number, number>();
  for (const [key, opp] of edgeOpp) {
    const edgeStart = Math.floor(key / 1e7), edgeEnd = key % 1e7;
    const midpoint = smooth && opp.length === 2
      ? triMesh.positions[edgeStart].clone().add(triMesh.positions[edgeEnd]).multiplyScalar(3 / 8).add(triMesh.positions[opp[0]].clone().add(triMesh.positions[opp[1]]).multiplyScalar(1 / 8))
      : triMesh.positions[edgeStart].clone().add(triMesh.positions[edgeEnd]).multiplyScalar(0.5);
    mid.set(key, pos.length); pos.push(midpoint);
  }
  const out: TriMesh = { positions: pos, triangles: [], materials: [], backMaterials: [] };
  for (let i = 0; i < triMesh.triangles.length; i += 3) {
    const [indexA, indexB, indexC] = [triMesh.triangles[i], triMesh.triangles[i + 1], triMesh.triangles[i + 2]];
    const midAB = mid.get(ekey(indexA, indexB))!, midBC = mid.get(ekey(indexB, indexC))!, midCA = mid.get(ekey(indexC, indexA))!;
    out.triangles.push(indexA, midAB, midCA, midAB, indexB, midBC, midCA, midBC, indexC, midAB, midBC, midCA);
    for (let k = 0; k < 4; k++) { out.materials.push(triMesh.materials[i / 3]); out.backMaterials.push(triMesh.backMaterials[i / 3]); }
  }
  return out;
};

// ------------------------------------------------------------------ fewer polygons: edge collapse
/** Removes polygons until about `keep` (0..1) of the corner points are left; materials follow the nearest old triangle. */
export const simplify = async (triMesh: TriMesh, keep: number): Promise<TriMesh> => {
  const bufferGeometry = new THREE.BufferGeometry();
  bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(triMesh.positions.flatMap(point => [point.x, point.y, point.z]), 3));
  bufferGeometry.setIndex(triMesh.triangles.slice());
  const remove = Math.floor(triMesh.positions.length * (1 - THREE.MathUtils.clamp(keep, 0.02, 1)));
  // async since three r17x (runs in chunks so the page stays responsive)
  const geometry = await new SimplifyModifier().modify(bufferGeometry, remove);
  const positions = geometry.getAttribute('position'); const idx = geometry.getIndex();
  const pos: THREE.Vector3[] = []; for (let i = 0; i < positions.count; i++) pos.push(new THREE.Vector3().fromBufferAttribute(positions, i));
  const tris: number[] = idx ? Array.from(idx.array as ArrayLike<number>) : pos.map((_, i) => i);
  // materials: nearest original triangle centre
  const centres = []; for (let i = 0; i < triMesh.triangles.length; i += 3) centres.push(triMesh.positions[triMesh.triangles[i]].clone().add(triMesh.positions[triMesh.triangles[i + 1]]).add(triMesh.positions[triMesh.triangles[i + 2]]).multiplyScalar(1 / 3));
  const single = new Set(triMesh.materials).size <= 1 && new Set(triMesh.backMaterials).size <= 1;
  const out: TriMesh = { positions: pos, triangles: tris, materials: [], backMaterials: [] };
  for (let i = 0; i < tris.length; i += 3) {
    let best = 0;
    if (!single) {
      const centroid = pos[tris[i]].clone().add(pos[tris[i + 1]]).add(pos[tris[i + 2]]).multiplyScalar(1 / 3);
      let bestDistance = Infinity; centres.forEach((centre, k) => { const distance = centre.distanceToSquared(centroid); if (distance < bestDistance) { bestDistance = distance; best = k; } });
    }
    out.materials.push(triMesh.materials[best]); out.backMaterials.push(triMesh.backMaterials[best]);
  }
  return out;
};

// ------------------------------------------------------------------ circles (regular polygons)
export interface CircleInfo { center: THREE.Vector3; normal: THREE.Vector3; radius: number; segments: number; start: THREE.Vector3 }

/** A loose face that is a regular polygon (drawn with the circle/polygon tool) and not yet extruded. */
export const detectCircle = (ents: Entities, face: Face): CircleInfo | null => {
  if (face.holes.length || face.outer.length < 3) return null;
  const pts = ents.facePoints(face);
  const centroid = pts.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const radii = pts.map(point => point.distanceTo(centroid)); const meanRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  if (meanRadius < 1e-6 || radii.some(x => Math.abs(x - meanRadius) > meanRadius * 0.01)) return null;
  const side = pts[0].distanceTo(pts[1]);
  for (let i = 0; i < pts.length; i++) if (Math.abs(pts[i].distanceTo(pts[(i + 1) % pts.length]) - side) > side * 0.02) return null;
  // only while it is still a flat circle – its edges must not carry other faces
  for (const edge of ents.faceEdges(face)) if (ents.facesOfEdge(edge.id).length !== 1) return null;
  return { center: centroid, normal: ents.faceNormal(face).clone(), radius: meanRadius, segments: pts.length, start: pts[0].clone() };
};

/** Replaces the circle face with one of `segments` sides (same centre, radius, start point and material). */
export const resampleCircle = (ents: Entities, circleFace: Face, segments: number): number | null => {
  const info = detectCircle(ents, circleFace); if (!info) return null;
  const count = Math.max(3, Math.round(segments));
  const basisU = info.start.clone().sub(info.center).normalize();
  const basisV = info.normal.clone().cross(basisU).normalize();
  const props = { material: circleFace.material, backMaterial: circleFace.backMaterial };
  const edges = ents.faceEdges(circleFace);
  ents.removeFace(circleFace.id);
  for (const edge of edges) if (!ents.facesOfEdge(edge.id).length) ents.eraseEdge(edge.id, false);
  ents.removeOrphanVertices();
  const ids: number[] = [];
  for (let i = 0; i < count; i++) { const angle = i / count * Math.PI * 2; ids.push(ents.addVertex(info.center.clone().addScaledVector(basisU, Math.cos(angle) * info.radius).addScaledVector(basisV, Math.sin(angle) * info.radius))); }
  const face = ents.createFaceRaw(ids, [], props);
  if (face && ents.faceNormal(face).dot(info.normal) < 0) ents.reverseFace(face);
  return face?.id ?? null;
};
