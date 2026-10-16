import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { Entities, type Face } from './model';

// ------------------------------------------------------------------ statistics
export interface MeshStats { vertices: number; edges: number; faces: number; triangles: number; softEdges: number }
const empty = (): MeshStats => ({ vertices: 0, edges: 0, faces: 0, triangles: 0, softEdges: 0 });
const add = (a: MeshStats, b: MeshStats) => { a.vertices += b.vertices; a.edges += b.edges; a.faces += b.faces; a.triangles += b.triangles; a.softEdges += b.softEdges; return a; };

/** Counts of an entities tree – every placed instance counts (that is what gets rendered). */
export function meshStats(ents: Entities, recursive = true): MeshStats {
  const s = empty();
  s.vertices = ents.vertices.size; s.edges = ents.edges.size; s.faces = ents.faces.size;
  for (const e of ents.edges.values()) if (e.soft) s.softEdges++;
  for (const f of ents.faces.values()) s.triangles += ents.faceTriangles(f).length / 3;
  if (recursive) for (const i of ents.instances.values()) add(s, meshStats(i.def.entities, true));
  return s;
}
export const sumStats = (list: MeshStats[]) => list.reduce((a, b) => add(a, b), empty());

// ------------------------------------------------------------------ triangle soup
/** Indexed triangle mesh of one entities level (no instances), keeping front/back material per triangle. */
export interface TriMesh { pos: THREE.Vector3[]; tris: number[]; mat: (string | undefined)[]; back: (string | undefined)[] }

export function toTriMesh(ents: Entities): TriMesh {
  const index = new Map<number, number>(); const pos: THREE.Vector3[] = [];
  const vi = (id: number) => { let k = index.get(id); if (k == null) { k = pos.length; index.set(id, k); pos.push(ents.pos(id).clone()); } return k; };
  const m: TriMesh = { pos, tris: [], mat: [], back: [] };
  for (const f of ents.faces.values()) {
    const ids = [...f.outer, ...f.holes.flat()];
    const t = ents.faceTriangles(f);
    for (let i = 0; i < t.length; i += 3) {
      m.tris.push(vi(ids[t[i]]), vi(ids[t[i + 1]]), vi(ids[t[i + 2]]));
      m.mat.push(f.material); m.back.push(f.backMaterial);
    }
  }
  return m;
}

/** Real faces again: coplanar neighbours merged, gentle folds (< smoothDeg) softened so curved surfaces look smooth. */
export function fromTriMesh(m: TriMesh, smoothDeg = 40, merge = true): Entities {
  const ents = new Entities();
  const ids = m.pos.map(p => ents.addVertex(p));
  for (let i = 0; i < m.tris.length; i += 3) {
    const loop = [ids[m.tris[i]], ids[m.tris[i + 1]], ids[m.tris[i + 2]]];
    if (new Set(loop).size < 3) continue;
    const a = m.pos[m.tris[i]], b = m.pos[m.tris[i + 1]], c = m.pos[m.tris[i + 2]];
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-16) continue;
    ents.createFaceRaw(loop, [], { material: m.mat[i / 3], backMaterial: m.back[i / 3] });
  }
  // without merging, flat areas keep their extra triangles (more polygons, same shape)
  if (merge) ents.mergeCoplanar([...ents.edges.keys()]);
  const c = Math.cos(THREE.MathUtils.degToRad(smoothDeg));
  for (const e of ents.edges.values()) {
    const fs = ents.facesOfEdge(e.id);
    e.soft = fs.length === 2 && ents.faceNormal(fs[0]).dot(ents.faceNormal(fs[1])) > c;
  }
  return ents;
}

// ------------------------------------------------------------------ more polygons: Loop subdivision
/**
 * One Loop subdivision step: every triangle becomes four, and all points move towards a smooth surface
 * (cubes get rounded, cylinders and spheres get finer). Open borders are kept in place.
 */
export function loopSubdivide(m: TriMesh, smooth = true): TriMesh {
  const n = m.pos.length;
  const ekey = (a: number, b: number) => (a < b ? a * 1e7 + b : b * 1e7 + a);
  const edgeOpp = new Map<number, number[]>();      // edge → opposite vertices
  const nbr: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < m.tris.length; i += 3) {
    const t = [m.tris[i], m.tris[i + 1], m.tris[i + 2]];
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3];
      const key = ekey(a, b); (edgeOpp.get(key) ?? edgeOpp.set(key, []).get(key)!).push(c);
      nbr[a].add(b); nbr[b].add(a);
    }
  }
  const boundary = new Set<number>();
  for (const [key, opp] of edgeOpp) if (opp.length !== 2) { boundary.add(Math.floor(key / 1e7)); boundary.add(key % 1e7); }
  // new positions of the old vertices
  const pos: THREE.Vector3[] = m.pos.map((p, i) => {
    if (!smooth || boundary.has(i)) return p.clone();
    const k = nbr[i].size; if (!k) return p.clone();
    const beta = k > 3 ? 3 / (8 * k) : 3 / 16;
    const s = new THREE.Vector3(); for (const j of nbr[i]) s.add(m.pos[j]);
    return p.clone().multiplyScalar(1 - k * beta).addScaledVector(s, beta);
  });
  // one new vertex per edge
  const mid = new Map<number, number>();
  for (const [key, opp] of edgeOpp) {
    const a = Math.floor(key / 1e7), b = key % 1e7;
    const p = smooth && opp.length === 2
      ? m.pos[a].clone().add(m.pos[b]).multiplyScalar(3 / 8).add(m.pos[opp[0]].clone().add(m.pos[opp[1]]).multiplyScalar(1 / 8))
      : m.pos[a].clone().add(m.pos[b]).multiplyScalar(0.5);
    mid.set(key, pos.length); pos.push(p);
  }
  const out: TriMesh = { pos, tris: [], mat: [], back: [] };
  for (let i = 0; i < m.tris.length; i += 3) {
    const [a, b, c] = [m.tris[i], m.tris[i + 1], m.tris[i + 2]];
    const ab = mid.get(ekey(a, b))!, bc = mid.get(ekey(b, c))!, ca = mid.get(ekey(c, a))!;
    out.tris.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    for (let k = 0; k < 4; k++) { out.mat.push(m.mat[i / 3]); out.back.push(m.back[i / 3]); }
  }
  return out;
}

// ------------------------------------------------------------------ fewer polygons: edge collapse
/** Removes polygons until about `keep` (0..1) of the corner points are left; materials follow the nearest old triangle. */
export async function simplify(m: TriMesh, keep: number): Promise<TriMesh> {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos.flatMap(p => [p.x, p.y, p.z]), 3));
  g.setIndex(m.tris.slice());
  const remove = Math.floor(m.pos.length * (1 - THREE.MathUtils.clamp(keep, 0.02, 1)));
  // async since three r17x (runs in chunks so the page stays responsive)
  const r = await new SimplifyModifier().modify(g, remove);
  const pa = r.getAttribute('position'); const idx = r.getIndex();
  const pos: THREE.Vector3[] = []; for (let i = 0; i < pa.count; i++) pos.push(new THREE.Vector3().fromBufferAttribute(pa, i));
  const tris: number[] = idx ? Array.from(idx.array as ArrayLike<number>) : pos.map((_, i) => i);
  // materials: nearest original triangle centre
  const centres = []; for (let i = 0; i < m.tris.length; i += 3) centres.push(m.pos[m.tris[i]].clone().add(m.pos[m.tris[i + 1]]).add(m.pos[m.tris[i + 2]]).multiplyScalar(1 / 3));
  const single = new Set(m.mat).size <= 1 && new Set(m.back).size <= 1;
  const out: TriMesh = { pos, tris, mat: [], back: [] };
  for (let i = 0; i < tris.length; i += 3) {
    let best = 0;
    if (!single) {
      const c = pos[tris[i]].clone().add(pos[tris[i + 1]]).add(pos[tris[i + 2]]).multiplyScalar(1 / 3);
      let bd = Infinity; centres.forEach((q, k) => { const d = q.distanceToSquared(c); if (d < bd) { bd = d; best = k; } });
    }
    out.mat.push(m.mat[best]); out.back.push(m.back[best]);
  }
  return out;
}

// ------------------------------------------------------------------ circles (regular polygons)
export interface CircleInfo { center: THREE.Vector3; normal: THREE.Vector3; radius: number; segments: number; start: THREE.Vector3 }

/** A loose face that is a regular polygon (drawn with the circle/polygon tool) and not yet extruded. */
export function detectCircle(ents: Entities, f: Face): CircleInfo | null {
  if (f.holes.length || f.outer.length < 3) return null;
  const pts = ents.facePoints(f);
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const rs = pts.map(p => p.distanceTo(c)); const r = rs.reduce((a, b) => a + b, 0) / rs.length;
  if (r < 1e-6 || rs.some(x => Math.abs(x - r) > r * 0.01)) return null;
  const side = pts[0].distanceTo(pts[1]);
  for (let i = 0; i < pts.length; i++) if (Math.abs(pts[i].distanceTo(pts[(i + 1) % pts.length]) - side) > side * 0.02) return null;
  // only while it is still a flat circle – its edges must not carry other faces
  for (const e of ents.faceEdges(f)) if (ents.facesOfEdge(e.id).length !== 1) return null;
  return { center: c, normal: ents.faceNormal(f).clone(), radius: r, segments: pts.length, start: pts[0].clone() };
}

/** Replaces the circle face with one of `segments` sides (same centre, radius, start point and material). */
export function resampleCircle(ents: Entities, f: Face, segments: number): number | null {
  const info = detectCircle(ents, f); if (!info) return null;
  const n = Math.max(3, Math.round(segments));
  const u = info.start.clone().sub(info.center).normalize();
  const v = info.normal.clone().cross(u).normalize();
  const props = { material: f.material, backMaterial: f.backMaterial };
  const edges = ents.faceEdges(f);
  ents.removeFace(f.id);
  for (const e of edges) if (!ents.facesOfEdge(e.id).length) ents.eraseEdge(e.id, false);
  ents.removeOrphanVertices();
  const ids: number[] = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ids.push(ents.addVertex(info.center.clone().addScaledVector(u, Math.cos(a) * info.radius).addScaledVector(v, Math.sin(a) * info.radius))); }
  const nf = ents.createFaceRaw(ids, [], props);
  if (nf && ents.faceNormal(nf).dot(info.normal) < 0) ents.reverseFace(nf);
  return nf?.id ?? null;
}
