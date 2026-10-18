import * as THREE from 'three';
import {
  LEN_EPS, V3, vec3, polygonNormal, planeBasis, to2D, signedArea2D, pointInPolygon2D, triangulate,
  pointOnSegmentInterior, segmentSegmentClosest, polygonArea, isCollinear,
} from './geometry';

let NEXT_ID = 1;
export const newId = () => NEXT_ID++;
export const ensureIdAbove = (usedId: number) => { if (usedId >= NEXT_ID) NEXT_ID = usedId + 1; };

export interface Vertex { id: number; position: V3 }
export interface Edge { id: number; start: number; end: number; soft?: boolean; hidden?: boolean; tag?: string }
export interface ShapeParams { kind: string; args: unknown[]; opts: Record<string, unknown> }
export interface Face { id: number; outer: number[]; holes: number[][]; material?: string; backMaterial?: string; tag?: string; hidden?: boolean }

export interface Instance {
  id: number; definition: Definition; matrix: THREE.Matrix4; name: string;
  material?: string; tag?: string; hidden?: boolean; locked?: boolean;
}

export class Definition {
  id = newId();
  /** SketchUp "always face camera": the instance turns around its Z axis towards the viewer. */
  faceMe = false;
  /** height grid of a sculptable terrain (see core/terrain.ts) – lets the terrain be edited again */
  terrain?: import('./terrain').TerrainData;
  /** how a parametric shape was made (su/s3d API call) – lets it be rebuilt with more or fewer segments */
  shape?: ShapeParams;
  constructor(public name: string, public isComponent: boolean, public entities = new Entities()) {}
}

const ekey = (vertexA: number, vertexB: number) => (vertexA < vertexB ? `${vertexA}_${vertexB}` : `${vertexB}_${vertexA}`);
const PLANE_TOL = 1e-5;

export type EntityRef = { kind: 'edge' | 'face' | 'instance'; id: number };

/** A collection of raw geometry (SketchUp "Entities"): vertices, edges, faces and instances. */
export class Entities {
  vertices = new Map<number, Vertex>();
  edges = new Map<number, Edge>();
  faces = new Map<number, Face>();
  instances = new Map<number, Instance>();
  private keyIndex = new Map<string, number>();
  private vEdges = new Map<number, Set<number>>();
  private eFaces = new Map<number, Set<number>>();

  // ---------- basic queries ----------
  positionOf(vertexId: number): V3 { return this.vertices.get(vertexId)!.position; }
  edgeBetween(vertexA: number, vertexB: number): Edge | undefined { const id = this.keyIndex.get(ekey(vertexA, vertexB)); return id != null ? this.edges.get(id) : undefined; }
  edgesOfVertex(vertexId: number): Edge[] { return [...(this.vEdges.get(vertexId) ?? [])].map(id => this.edges.get(id)!).filter(Boolean); }
  facesOfEdge(edgeId: number): Face[] { return [...(this.eFaces.get(edgeId) ?? [])].map(id => this.faces.get(id)!).filter(Boolean); }
  facesOfVertex(vertexId: number): Face[] { const found = new Set<Face>(); for (const edge of this.edgesOfVertex(vertexId)) for (const face of this.facesOfEdge(edge.id)) found.add(face); return [...found]; }
  loops(face: Face): number[][] { return [face.outer, ...face.holes]; }
  loopEdges(loop: number[]): Edge[] { const edges: Edge[] = []; for (let i = 0; i < loop.length; i++) { const edge = this.edgeBetween(loop[i], loop[(i + 1) % loop.length]); if (edge) edges.push(edge); } return edges; }
  faceEdges(face: Face): Edge[] { return this.loops(face).flatMap(loop => this.loopEdges(loop)); }
  facePoints(face: Face): V3[] { return face.outer.map(vertex => this.positionOf(vertex)); }
  faceNormal(face: Face): V3 { return polygonNormal(this.facePoints(face)); }
  faceVertices(face: Face): number[] { return this.loops(face).flat(); }
  faceArea(face: Face): number { return polygonArea(this.facePoints(face)) - face.holes.reduce((sum, hole) => sum + polygonArea(hole.map(vertex => this.positionOf(vertex))), 0); }
  faceCenter(face: Face): V3 { const tri = this.faceTriangles(face); if (tri.length) { const centroid = vec3(); const pts = [...face.outer, ...face.holes.flat()].map(vertex => this.positionOf(vertex)); let best = -1; for (let i = 0; i < tri.length; i += 3) { const cornerA = pts[tri[i]], cornerB = pts[tri[i + 1]], cornerC = pts[tri[i + 2]]; const triArea = cornerB.clone().sub(cornerA).cross(cornerC.clone().sub(cornerA)).length(); if (triArea > best) { best = triArea; centroid.copy(cornerA).add(cornerB).add(cornerC).multiplyScalar(1 / 3); } } return centroid; } return this.facePoints(face)[0].clone(); }
  faceTriangles(face: Face): number[] { return triangulate(face.outer.map(vertex => this.positionOf(vertex)), face.holes.map(hole => hole.map(vertex => this.positionOf(vertex))), this.faceNormal(face)); }
  edgeLength(edge: Edge) { return this.positionOf(edge.start).distanceTo(this.positionOf(edge.end)); }
  isEmpty() { return this.edges.size === 0 && this.instances.size === 0; }

  pointInFace(face: Face, point: V3, strict = true): boolean {
    const normal = this.faceNormal(face); if (normal.lengthSq() < 0.5) return false;
    const anchor = this.positionOf(face.outer[0]);
    if (Math.abs(point.clone().sub(anchor).dot(normal)) > PLANE_TOL * 10) return false;
    const { basisU: basisU, basisV: basisV } = planeBasis(normal);
    const point2D = to2D([point], anchor, basisU, basisV)[0];
    if (!pointInPolygon2D(point2D, to2D(this.facePoints(face), anchor, basisU, basisV))) return false;
    for (const hole of face.holes) if (pointInPolygon2D(point2D, to2D(hole.map(x => this.positionOf(x)), anchor, basisU, basisV))) return false;
    if (strict) {
      // reject points on the boundary
      for (const edge of this.faceEdges(face)) if (pointOnSegmentInterior(point, this.positionOf(edge.start), this.positionOf(edge.end), 1e-7) ) return false;
    }
    return true;
  }

  // ---------- raw creation ----------
  private vhash: Map<string, number[]> | null = null;
  private static CELL = 0.01;
  private cellKey(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  private hashInsert(id: number, point: V3) {
    if (!this.vhash) return; const cell = Entities.CELL;
    const key = this.cellKey(Math.floor(point.x / cell), Math.floor(point.y / cell), Math.floor(point.z / cell));
    const bucket = this.vhash.get(key); if (bucket) bucket.push(id); else this.vhash.set(key, [id]);
  }
  /** Must be called after vertex positions were mutated directly. */
  invalidateHash() { this.vhash = null; }
  findVertex(point: V3, tol = LEN_EPS): number | undefined {
    if (!this.vhash) { this.vhash = new Map(); for (const vertex of this.vertices.values()) this.hashInsert(vertex.id, vertex.position); }
    const cell = Entities.CELL; const cellX = Math.floor(point.x / cell), cellY = Math.floor(point.y / cell), cellZ = Math.floor(point.z / cell);
    let best: number | undefined, bestDistSq = tol * tol;
    for (let offsetX = -1; offsetX <= 1; offsetX++) for (let offsetY = -1; offsetY <= 1; offsetY++) for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      const bucket = this.vhash.get(this.cellKey(cellX + offsetX, cellY + offsetY, cellZ + offsetZ)); if (!bucket) continue;
      for (const id of bucket) { const vertex = this.vertices.get(id); if (!vertex) continue; const distSq = vertex.position.distanceToSquared(point); if (distSq < bestDistSq) { bestDistSq = distSq; best = id; } }
    }
    return best;
  }
  addVertex(point: V3): number {
    const found = this.findVertex(point); if (found != null) return found;
    const id = newId(); this.vertices.set(id, { id, position: point.clone() }); this.hashInsert(id, point); return id;
  }
  rawVertex(point: V3, id = newId()): number { this.vertices.set(id, { id, position: point.clone() }); this.hashInsert(id, point); return id; }

  createEdgeRaw(vertexA: number, vertexB: number, props: Partial<Edge> = {}, id = newId()): Edge {
    const existing = this.edgeBetween(vertexA, vertexB); if (existing) return existing;
    const edge: Edge = { ...props, id, start: vertexA, end: vertexB };
    this.edges.set(id, edge); this.keyIndex.set(ekey(vertexA, vertexB), id);
    if (!this.vEdges.has(vertexA)) this.vEdges.set(vertexA, new Set());
    if (!this.vEdges.has(vertexB)) this.vEdges.set(vertexB, new Set());
    this.vEdges.get(vertexA)!.add(id); this.vEdges.get(vertexB)!.add(id);
    return edge;
  }

  private cleanLoop(loop: number[]): number[] {
    const cleaned: number[] = [];
    for (const vertex of loop) if (cleaned[cleaned.length - 1] !== vertex) cleaned.push(vertex);
    while (cleaned.length > 1 && cleaned[0] === cleaned[cleaned.length - 1]) cleaned.pop();
    return cleaned;
  }
  faceKey(outer: number[]) { return [...outer].sort((left, right) => left - right).join(','); }
  private fkIndex = new Map<string, number>();
  private faceKeys = new Map<number, string>();
  private indexFace(face: Face) { const old = this.faceKeys.get(face.id); if (old && this.fkIndex.get(old) === face.id) this.fkIndex.delete(old); const key = this.faceKey(face.outer); this.faceKeys.set(face.id, key); this.fkIndex.set(key, face.id); }
  private unindexFace(id: number) { const old = this.faceKeys.get(id); if (old && this.fkIndex.get(old) === id) this.fkIndex.delete(old); this.faceKeys.delete(id); }
  findFaceByOuter(outer: number[]): Face | undefined {
    const id = this.fkIndex.get(this.faceKey(outer)); if (id == null) return undefined;
    const face = this.faces.get(id); if (face && face.outer.length === outer.length && this.faceKey(face.outer) === this.faceKey(outer)) return face;
    return undefined;
  }

  createFaceRaw(outer: number[], holes: number[][] = [], props: Partial<Face> = {}, id = newId()): Face | null {
    outer = this.cleanLoop(outer); holes = holes.map(hole => this.cleanLoop(hole)).filter(hole => hole.length >= 3);
    if (outer.length < 3) return null;
    if (polygonArea(outer.map(vertex => this.positionOf(vertex))) < 1e-10) return null;
    const existing = this.findFaceByOuter(outer); if (existing) return existing;
    const face: Face = { ...props, id, outer, holes };
    this.faces.set(id, face); this.indexFace(face);
    for (const loop of this.loops(face)) for (let i = 0; i < loop.length; i++) {
      const edge = this.createEdgeRaw(loop[i], loop[(i + 1) % loop.length]);
      if (!this.eFaces.has(edge.id)) this.eFaces.set(edge.id, new Set());
      this.eFaces.get(edge.id)!.add(id);
    }
    return face;
  }

  removeFace(faceId: number) {
    const face = this.faces.get(faceId); if (!face) return;
    for (const edge of this.faceEdges(face)) this.eFaces.get(edge.id)?.delete(faceId);
    this.faces.delete(faceId); this.unindexFace(faceId);
  }

  private removeEdgeRaw(edgeId: number) {
    const edge = this.edges.get(edgeId); if (!edge) return;
    for (const face of this.facesOfEdge(edgeId)) this.removeFace(face.id);
    this.edges.delete(edgeId); this.keyIndex.delete(ekey(edge.start, edge.end)); this.eFaces.delete(edgeId);
    this.vEdges.get(edge.start)?.delete(edgeId); this.vEdges.get(edge.end)?.delete(edgeId);
  }
  removeOrphanVertices(vertexIds?: Iterable<number>) {
    const list = vertexIds ? [...vertexIds] : [...this.vertices.keys()];
    for (const vertex of list) if (!(this.vEdges.get(vertex)?.size)) { this.vertices.delete(vertex); this.vEdges.delete(vertex); }
  }

  reverseFace(face: Face) { face.outer.reverse(); face.holes.forEach(hole => hole.reverse()); }

  // ---------- topology edits ----------
  splitEdge(edgeId: number, vertexId: number): [Edge, Edge] | null {
    const targetEdge = this.edges.get(edgeId); if (!targetEdge || targetEdge.start === vertexId || targetEdge.end === vertexId) return null;
    const faces = this.facesOfEdge(edgeId);
    const props = { soft: targetEdge.soft, hidden: targetEdge.hidden, tag: targetEdge.tag };
    for (const face of faces) {
      for (const loop of this.loops(face)) for (let i = 0; i < loop.length; i++) {
        const x = loop[i], y = loop[(i + 1) % loop.length];
        if ((x === targetEdge.start && y === targetEdge.end) || (x === targetEdge.end && y === targetEdge.start)) { loop.splice(i + 1, 0, vertexId); break; }
      }
    }
    // detach faces from old edge before removing it
    this.eFaces.set(edgeId, new Set());
    this.removeEdgeRaw(edgeId);
    const firstEdge = this.createEdgeRaw(targetEdge.start, vertexId, props), secondEdge = this.createEdgeRaw(vertexId, targetEdge.end, props);
    for (const face of faces) for (const edge of [firstEdge, secondEdge]) { if (!this.eFaces.has(edge.id)) this.eFaces.set(edge.id, new Set()); this.eFaces.get(edge.id)!.add(face.id); }
    for (const face of faces) this.indexFace(face);
    return [firstEdge, secondEdge];
  }

  /** Inserts a vertex at p, splitting any edge it lies on. */
  addPointOnEdges(position: V3): number {
    const vertexId = this.addVertex(position);
    const point = this.positionOf(vertexId);
    for (const edge of [...this.edges.values()]) {
      if (edge.start === vertexId || edge.end === vertexId) continue;
      if (pointOnSegmentInterior(point, this.positionOf(edge.start), this.positionOf(edge.end))) { this.splitEdge(edge.id, vertexId); break; }
    }
    return vertexId;
  }

  /**
   * SketchUp-like line insertion: merges vertices, splits crossed edges, and
   * automatically creates or splits faces when closed planar loops appear.
   */
  addLine(start: V3, end: V3, opts: { detectFaces?: boolean } = {}): Edge[] {
    if (start.distanceTo(end) < LEN_EPS) return [];
    const startVertex = this.addPointOnEdges(start), endVertex = this.addPointOnEdges(end);
    if (startVertex === endVertex) return [];
    const startPos = this.positionOf(startVertex).clone(), endPos = this.positionOf(endVertex).clone();
    const pts: { param: number; vertexId: number }[] = [{ param: 0, vertexId: startVertex }, { param: 1, vertexId: endVertex }];
    const dir = endPos.clone().sub(startPos); const len2 = dir.lengthSq();
    // existing vertices on the segment
    for (const vertex of this.vertices.values()) {
      if (vertex.id === startVertex || vertex.id === endVertex) continue;
      if (pointOnSegmentInterior(vertex.position, startPos, endPos)) pts.push({ param: vertex.position.clone().sub(startPos).dot(dir) / len2, vertexId: vertex.id });
    }
    // crossing edges
    for (const edge of [...this.edges.values()]) {
      if (!this.edges.has(edge.id)) continue;
      const edgeStart = this.positionOf(edge.start), edgeEnd = this.positionOf(edge.end);
      if (edge.start === startVertex || edge.end === startVertex || edge.start === endVertex || edge.end === endVertex) continue;
      const closest = segmentSegmentClosest(startPos, endPos, edgeStart, edgeEnd);
      if (closest.c1.distanceTo(closest.c2) > LEN_EPS) continue;
      if (closest.s <= 1e-7 || closest.s >= 1 - 1e-7 || closest.t <= 1e-7 || closest.t >= 1 - 1e-7) continue;
      // parallel overlapping edges are handled by vertex insertion
      if (dir.clone().normalize().cross(edgeEnd.clone().sub(edgeStart).normalize()).length() < 1e-6) continue;
      const vertexId = this.addVertex(closest.c1);
      this.splitEdge(edge.id, vertexId);
      pts.push({ param: closest.s, vertexId: vertexId });
    }
    pts.sort((x, y) => x.param - y.param);
    const created: Edge[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const vertexA = pts[i].vertexId, vertexB = pts[i + 1].vertexId; if (vertexA === vertexB) continue;
      if (this.edgeBetween(vertexA, vertexB)) continue;
      created.push(this.createEdgeRaw(vertexA, vertexB));
    }
    if (opts.detectFaces !== false) for (const edge of created) if (this.edges.has(edge.id)) this.detectFaces(edge.id);
    return created;
  }

  /** Adds a closed polyline (e.g. rectangle, circle). */
  addLoop(points: V3[]): Edge[] {
    const out: Edge[] = [];
    for (let i = 0; i < points.length; i++) out.push(...this.addLine(points[i], points[(i + 1) % points.length]));
    return out;
  }

  edgesInPlane(planePoint: V3, planeNormal: V3): Edge[] {
    return [...this.edges.values()].filter(edge => Math.abs(this.positionOf(edge.start).clone().sub(planePoint).dot(planeNormal)) < PLANE_TOL && Math.abs(this.positionOf(edge.end).clone().sub(planePoint).dot(planeNormal)) < PLANE_TOL);
  }
  facesInPlane(planePoint: V3, planeNormal: V3): Face[] {
    return [...this.faces.values()].filter(face => { const faceNormal = this.faceNormal(face); return Math.abs(Math.abs(faceNormal.dot(planeNormal)) - 1) < 1e-6 && Math.abs(this.positionOf(face.outer[0]).clone().sub(planePoint).dot(planeNormal)) < PLANE_TOL; });
  }

  /** Planar half-edge traversal → CCW cycles (faces) and CW cycles (component boundaries). */
  extractCycles(edgeIds: Iterable<number>, normal: V3, origin: V3) {
    const adj = new Map<number, Set<number>>();
    for (const id of edgeIds) { const edge = this.edges.get(id); if (!edge) continue; if (!adj.has(edge.start)) adj.set(edge.start, new Set()); if (!adj.has(edge.end)) adj.set(edge.end, new Set()); adj.get(edge.start)!.add(edge.end); adj.get(edge.end)!.add(edge.start); }
    // prune dangling
    let changed = true;
    while (changed) { changed = false; for (const [vertex, neighbours] of adj) if (neighbours.size < 2) { for (const neighbour of neighbours) adj.get(neighbour)?.delete(vertex); adj.delete(vertex); changed = true; } }
    const { basisU: basisU, basisV: basisV } = planeBasis(normal);
    const planar = new Map<number, THREE.Vector2>();
    for (const k of adj.keys()) { const offset = this.positionOf(k).clone().sub(origin); planar.set(k, new THREE.Vector2(offset.dot(basisU), offset.dot(basisV))); }
    const sorted = new Map<number, number[]>();
    for (const [k, neighbours] of adj) { const centre = planar.get(k)!; sorted.set(k, [...neighbours].sort((x, y) => { const pointA = planar.get(x)!, pointB = planar.get(y)!; return Math.atan2(pointA.y - centre.y, pointA.x - centre.x) - Math.atan2(pointB.y - centre.y, pointB.x - centre.x); })); }
    const visited = new Set<string>();
    const pos: number[][] = [], neg: number[][] = [];
    for (const [startVertex, neighbours] of sorted) for (const targetVertex of neighbours) {
      if (visited.has(startVertex + '>' + targetVertex)) continue;
      const cyc: number[] = []; let cur = startVertex, nxt = targetVertex, guard = 0;
      while (guard++ < 100000) {
        visited.add(cur + '>' + nxt); cyc.push(cur);
        const list = sorted.get(nxt)!; const i = list.indexOf(cur);
        const nextVertex = list[(i - 1 + list.length) % list.length];
        cur = nxt; nxt = nextVertex;
        if (cur === startVertex && nxt === targetVertex) break;
      }
      if (new Set(cyc).size !== cyc.length) continue; // non-simple (bridges) – skip
      const area = signedArea2D(cyc.map(k => planar.get(k)!));
      if (Math.abs(area) < 1e-12) continue;
      (area > 0 ? pos : neg).push(cyc);
    }
    // assign holes
    const holesOf = new Map<number, number[][]>();
    const poly = (cycle: number[]) => cycle.map(k => planar.get(k)!);
    for (const hole of neg) {
      const holeSet = new Set(hole);
      let best = -1, bestA = Infinity;
      pos.forEach((cycle, i) => {
        if (cycle.some(k => holeSet.has(k))) return;
        if (!pointInPolygon2D(planar.get(hole[0])!, poly(cycle))) return;
        const area = signedArea2D(poly(cycle)); if (area < bestA) { bestA = area; best = i; }
      });
      if (best >= 0) { if (!holesOf.has(best)) holesOf.set(best, []); holesOf.get(best)!.push(hole); }
    }
    return pos.map((cycle, i) => ({ outer: cycle, holes: holesOf.get(i) ?? [] }));
  }

  private samplePoint(outer: number[], holes: number[][]): V3 | null {
    const pts = [...outer, ...holes.flat()].map(vertex => this.positionOf(vertex));
    const tri = triangulate(outer.map(vertex => this.positionOf(vertex)), holes.map(hole => hole.map(vertex => this.positionOf(vertex))));
    let best: V3 | null = null, bestA = -1;
    for (let i = 0; i < tri.length; i += 3) { const cornerA = pts[tri[i]], cornerB = pts[tri[i + 1]], cornerC = pts[tri[i + 2]]; const triArea = cornerB.clone().sub(cornerA).cross(cornerC.clone().sub(cornerA)).length(); if (triArea > bestA) { bestA = triArea; best = cornerA.clone().add(cornerB).add(cornerC).multiplyScalar(1 / 3); } }
    return best;
  }

  /** Called for every newly created edge. */
  detectFaces(edgeId: number) {
    const splitEdge = this.edges.get(edgeId); if (!splitEdge) return;
    const start = this.positionOf(splitEdge.start), end = this.positionOf(splitEdge.end), middle = start.clone().add(end).multiplyScalar(0.5);
    // Case A: the edge lies inside an existing face → split / punch that face
    for (const face of [...this.faces.values()]) {
      if (!this.faces.has(face.id)) continue;
      const normal = this.faceNormal(face), anchor = this.positionOf(face.outer[0]);
      if (Math.abs(start.clone().sub(anchor).dot(normal)) > PLANE_TOL || Math.abs(end.clone().sub(anchor).dot(normal)) > PLANE_TOL) continue;
      if (!this.pointInFace(face, middle)) continue;
      this.resplitFace(face);
      return;
    }
    // Case B: new faces in planes spanned by this edge and its neighbours
    const dir = end.clone().sub(start).normalize();
    const planes: V3[] = [];
    for (const vertexId of [splitEdge.start, splitEdge.end]) for (const edge of this.edgesOfVertex(vertexId)) {
      if (edge.id === edgeId) continue;
      const otherDir = this.positionOf(edge.end).clone().sub(this.positionOf(edge.start)).normalize();
      const normal = dir.clone().cross(otherDir); if (normal.length() < 1e-6) continue; normal.normalize();
      const big = Math.abs(normal.x) > Math.abs(normal.y) ? (Math.abs(normal.x) > Math.abs(normal.z) ? normal.x : normal.z) : (Math.abs(normal.y) > Math.abs(normal.z) ? normal.y : normal.z);
      if (big < 0) normal.negate();
      if (!planes.some(plane => plane.distanceTo(normal) < 1e-6)) planes.push(normal);
    }
    for (const normal of planes) {
      if (!this.edges.has(edgeId)) return;
      const edges = this.edgesInPlane(start, normal);
      // only keep the connected component of e plus everything else (needed for holes)
      const regions = this.extractCycles(edges.map(x => x.id), normal, start);
      const existing = this.facesInPlane(start, normal);
      for (const region of regions) {
        const count = region.outer.length; let has = false;
        for (let i = 0; i < count; i++) { const x = region.outer[i], y = region.outer[(i + 1) % count]; if ((x === splitEdge.start && y === splitEdge.end) || (x === splitEdge.end && y === splitEdge.start)) { has = true; break; } }
        if (!has) continue;
        if (this.findFaceByOuter(region.outer)) continue;
        const sample = this.samplePoint(region.outer, region.holes); if (!sample) continue;
        if (existing.some(existingFace => this.faces.has(existingFace.id) && this.pointInFace(existingFace, sample, false))) continue;
        const face = this.createFaceRaw(region.outer, region.holes);
        if (face) this.orientNewFace(face);
      }
    }
  }

  /** Make a new face consistent with its neighbours (or point down on the ground plane, like SketchUp). */
  orientNewFace(newFace: Face) {
    for (const loop of [newFace.outer]) for (let i = 0; i < loop.length; i++) {
      const vertexA = loop[i], vertexB = loop[(i + 1) % loop.length]; const edge = this.edgeBetween(vertexA, vertexB); if (!edge) continue;
      for (const face of this.facesOfEdge(edge.id)) {
        if (face.id === newFace.id) continue;
        for (const gl of this.loops(face)) for (let j = 0; j < gl.length; j++) {
          if (gl[j] === vertexA && gl[(j + 1) % gl.length] === vertexB) { this.reverseFace(newFace); return; }
          if (gl[j] === vertexB && gl[(j + 1) % gl.length] === vertexA) return;
        }
      }
    }
    const normal = this.faceNormal(newFace);
    const onGround = Math.abs(this.positionOf(newFace.outer[0]).z) < PLANE_TOL;
    if (Math.abs(normal.z) > 0.999) { if (onGround ? normal.z > 0 : normal.z < 0) this.reverseFace(newFace); }
  }

  /** Rebuild a face after edges were drawn inside it. */
  resplitFace(face: Face) {
    const normal = this.faceNormal(face), anchor = this.positionOf(face.outer[0]).clone();
    const own = new Set(this.faceEdges(face).map(edge => edge.id));
    const inner = this.edgesInPlane(anchor, normal).filter(edge => !own.has(edge.id) && this.pointInFace(face, this.positionOf(edge.start).clone().add(this.positionOf(edge.end)).multiplyScalar(0.5)));
    const snapshot = { outer: [...face.outer], holes: face.holes.map(hole => [...hole]) };
    const inside = (point: V3) => this.pointInLoops(snapshot.outer, snapshot.holes, normal, point);
    const regions = this.extractCycles([...own, ...inner.map(edge => edge.id)], normal, anchor);
    const props = { material: face.material, backMaterial: face.backMaterial, tag: face.tag };
    const valid = regions.filter(region => { const sample = this.samplePoint(region.outer, region.holes); return sample && inside(sample); });
    if (valid.length <= 1 && valid[0] && valid[0].outer.length === face.outer.length && valid[0].holes.length === face.holes.length) return;
    this.removeFace(face.id);
    for (const region of valid) this.createFaceRaw(region.outer, region.holes, props);
  }

  pointInLoops(outer: number[], holes: number[][], normal: V3, point: V3): boolean {
    const anchor = this.positionOf(outer[0]); const { basisU: basisU, basisV: basisV } = planeBasis(normal);
    const point2D = to2D([point], anchor, basisU, basisV)[0];
    if (!pointInPolygon2D(point2D, to2D(outer.map(x => this.positionOf(x)), anchor, basisU, basisV))) return false;
    for (const hole of holes) if (pointInPolygon2D(point2D, to2D(hole.map(x => this.positionOf(x)), anchor, basisU, basisV))) return false;
    return true;
  }

  private coplanarSame(face: Face, other: Face) {
    const normalA = this.faceNormal(face), normalB = this.faceNormal(other);
    return normalA.dot(normalB) > 1 - 1e-6 && Math.abs(this.positionOf(other.outer[0]).clone().sub(this.positionOf(face.outer[0])).dot(normalA)) < PLANE_TOL;
  }

  /** Erase an edge. Two coplanar faces separated by it are merged (SketchUp "healing"). */
  eraseEdge(edgeId: number, heal = true) {
    const edge = this.edges.get(edgeId); if (!edge) return;
    const faces = this.facesOfEdge(edgeId);
    if (heal && faces.length === 2 && this.coplanarSame(faces[0], faces[1]) && faces[0].material === faces[1].material) {
      const [faceA, faceB] = faces; const normal = this.faceNormal(faceA), anchor = this.positionOf(faceA.outer[0]).clone();
      const shapeA = { outer: [...faceA.outer], holes: faceA.holes.map(hole => [...hole]) }, shapeB = { outer: [...faceB.outer], holes: faceB.holes.map(hole => [...hole]) };
      const edgeIds = new Set([...this.faceEdges(faceA), ...this.faceEdges(faceB)].map(x => x.id)); edgeIds.delete(edgeId);
      const props = { material: faceA.material, backMaterial: faceA.backMaterial, tag: faceA.tag };
      const area = this.faceArea(faceA) + this.faceArea(faceB);
      const keep1 = { ...faceA, outer: [...faceA.outer], holes: faceA.holes.map(hole => [...hole]) }, keep2 = { ...faceB, outer: [...faceB.outer], holes: faceB.holes.map(hole => [...hole]) };
      const eprops = { soft: edge.soft, hidden: edge.hidden, tag: edge.tag };
      this.removeEdgeRaw(edgeId);
      const regions = this.extractCycles(edgeIds, normal, anchor);
      const made: Face[] = [];
      for (const region of regions) {
        const sample = this.samplePoint(region.outer, region.holes); if (!sample) continue;
        if (this.pointInLoops(shapeA.outer, shapeA.holes, normal, sample) || this.pointInLoops(shapeB.outer, shapeB.holes, normal, sample)) { const face = this.createFaceRaw(region.outer, region.holes, props); if (face) made.push(face); }
      }
      const got = made.reduce((sum, face) => sum + this.faceArea(face), 0);
      if (Math.abs(got - area) > Math.max(1e-9, area * 1e-6)) {
        // merge would lose area (non-simple outline) – keep the two faces as they were
        for (const face of made) this.removeFace(face.id);
        this.createEdgeRaw(edge.start, edge.end, eprops, edgeId);
        this.createFaceRaw(keep1.outer, keep1.holes, { material: keep1.material, backMaterial: keep1.backMaterial, tag: keep1.tag, hidden: keep1.hidden }, keep1.id);
        this.createFaceRaw(keep2.outer, keep2.holes, { material: keep2.material, backMaterial: keep2.backMaterial, tag: keep2.tag, hidden: keep2.hidden }, keep2.id);
        return;
      }
      this.healCollinear([edge.start, edge.end]);
    } else {
      this.removeEdgeRaw(edgeId);
    }
    this.removeOrphanVertices([edge.start, edge.end]);
  }

  /** Remove vertices that only join two collinear edges with identical faces. */
  healCollinear(vertexIds: Iterable<number>) {
    for (const vertexId of vertexIds) {
      if (!this.vertices.has(vertexId)) continue;
      const edges = this.edgesOfVertex(vertexId); if (edges.length !== 2) continue;
      const vertexA = edges[0].start === vertexId ? edges[0].end : edges[0].start, vertexB = edges[1].start === vertexId ? edges[1].end : edges[1].start;
      if (!isCollinear(this.positionOf(vertexA), this.positionOf(vertexId), this.positionOf(vertexB))) continue;
      const facesA = new Set(this.facesOfEdge(edges[0].id).map(face => face.id)), facesB = this.facesOfEdge(edges[1].id).map(face => face.id);
      if (facesB.length === 0 || facesA.size !== facesB.length || !facesB.every(x => facesA.has(x))) continue;
      if (this.edgeBetween(vertexA, vertexB)) continue;
      const faces = this.facesOfEdge(edges[0].id);
      const props = { soft: edges[0].soft, hidden: edges[0].hidden, tag: edges[0].tag };
      for (const face of faces) for (const edge of this.faceEdges(face)) this.eFaces.get(edge.id)?.delete(face.id);
      for (const face of faces) for (const loop of this.loops(face)) { const i = loop.indexOf(vertexId); if (i >= 0) loop.splice(i, 1); }
      this.eFaces.set(edges[0].id, new Set()); this.eFaces.set(edges[1].id, new Set());
      this.removeEdgeRaw(edges[0].id); this.removeEdgeRaw(edges[1].id);
      this.createEdgeRaw(vertexA, vertexB, props);
      for (const face of faces) for (const edge of this.faceEdges(face)) { if (!this.eFaces.has(edge.id)) this.eFaces.set(edge.id, new Set()); this.eFaces.get(edge.id)!.add(face.id); }
      for (const face of faces) this.indexFace(face);
      this.vertices.delete(vertexId); this.vEdges.delete(vertexId);
    }
  }

  /** Merge coplanar faces across the given edges. */
  mergeCoplanar(edgeIds: Iterable<number>) {
    for (const id of [...edgeIds]) {
      const edge = this.edges.get(id); if (!edge) continue;
      const faces = this.facesOfEdge(id);
      if (faces.length === 2 && this.coplanarSame(faces[0], faces[1]) && faces[0].material === faces[1].material) this.eraseEdge(id, true);
    }
  }

  /** Merge vertex src into dst (topology repair after moves). */
  mergeVertexInto(src: number, dst: number) {
    if (src === dst || !this.vertices.has(src) || !this.vertices.has(dst)) return;
    const faces = this.facesOfVertex(src).map(face => ({ ...face, outer: [...face.outer], holes: face.holes.map(hole => [...hole]) }));
    const edges = this.edgesOfVertex(src).map(edge => ({ ...edge }));
    for (const face of faces) this.removeFace(face.id);
    for (const edge of edges) this.removeEdgeRaw(edge.id);
    for (const edge of edges) { const other = edge.start === src ? edge.end : edge.start; if (other !== dst) this.createEdgeRaw(dst, other, { soft: edge.soft, hidden: edge.hidden, tag: edge.tag }); }
    this.vertices.delete(src); this.vEdges.delete(src);
    for (const face of faces) {
      const rep = (loop: number[]) => this.cleanLoop(loop.map(vertex => (vertex === src ? dst : vertex)));
      const outer = rep(face.outer); const holes = face.holes.map(rep).filter(hole => hole.length >= 3);
      if (new Set(outer).size !== outer.length) continue;
      this.createFaceRaw(outer, holes, { material: face.material, backMaterial: face.backMaterial, tag: face.tag }, face.id);
    }
  }

  /** After moving vertices: weld coincident vertices, drop degenerate faces, merge coplanar. */
  weld(vertexIds: Iterable<number>) {
    const touched = new Set<number>();
    this.invalidateHash();
    for (const vertexId of [...vertexIds]) {
      if (!this.vertices.has(vertexId)) continue;
      const point = this.positionOf(vertexId);
      let target: number | undefined;
      { const cell = Entities.CELL; if (!this.vhash) { this.vhash = new Map(); for (const x of this.vertices.values()) this.hashInsert(x.id, x.position); }
        const cellX = Math.floor(point.x / cell), cellY = Math.floor(point.y / cell), cellZ = Math.floor(point.z / cell);
        for (let offsetX = -1; offsetX <= 1 && target == null; offsetX++) for (let offsetY = -1; offsetY <= 1 && target == null; offsetY++) for (let offsetZ = -1; offsetZ <= 1 && target == null; offsetZ++) {
          for (const id of this.vhash.get(this.cellKey(cellX + offsetX, cellY + offsetY, cellZ + offsetZ)) ?? []) { if (id === vertexId) continue; const vertex = this.vertices.get(id); if (vertex && vertex.position.distanceToSquared(point) < LEN_EPS * LEN_EPS) { target = id; break; } }
        } }
      if (target != null) { this.mergeVertexInto(vertexId, target); touched.add(target); }
    }
    for (const face of [...this.faces.values()]) if (this.faceArea(face) < 1e-10) this.removeFace(face.id);
    const edgeIds = new Set<number>(); for (const vertex of touched) for (const edge of this.edgesOfVertex(vertex)) edgeIds.add(edge.id);
    this.mergeCoplanar(edgeIds);
    this.removeLooseInnerEdges(edgeIds);
    this.healCollinear(touched);
  }

  /** Remove edges without faces that lie flat inside a face (left-overs of merges). */
  removeLooseInnerEdges(edgeIds: Iterable<number>) {
    for (const id of [...edgeIds]) {
      const edge = this.edges.get(id); if (!edge || this.facesOfEdge(id).length) continue;
      const middle = this.positionOf(edge.start).clone().add(this.positionOf(edge.end)).multiplyScalar(0.5);
      for (const face of this.faces.values()) if (this.pointInFace(face, middle)) { this.eraseEdge(id, false); break; }
    }
  }

  moveVertices(vertexIds: Iterable<number>, matrix: THREE.Matrix4) { for (const vertex of vertexIds) this.vertices.get(vertex)?.position.applyMatrix4(matrix); this.invalidateHash(); }

  /** SketchUp Push/Pull. Returns the moved/created face id. */
  pushPull(faceId: number, distance: number): number | null {
    const sourceFace = this.faces.get(faceId); if (!sourceFace || Math.abs(distance) < 1e-9) return faceId;
    const normal = this.faceNormal(sourceFace);
    const loops = this.loops(sourceFace);
    const edges = this.faceEdges(sourceFace);
    const others = edges.map(edge => this.facesOfEdge(edge.id).filter(face => face.id !== faceId));
    // stretch: all adjacent faces are perpendicular → just translate the face
    const stretch = others.every(faces => faces.length === 1 && Math.abs(this.faceNormal(faces[0]).dot(normal)) < 1e-6);
    if (stretch) {
      const vertexIds = new Set(this.faceVertices(sourceFace));
      const matrix = new THREE.Matrix4().makeTranslation(normal.x * distance, normal.y * distance, normal.z * distance);
      this.moveVertices(vertexIds, matrix);
      this.weld(vertexIds);
      return this.faces.has(faceId) ? faceId : null;
    }
    // the original face disappears when the solid lies behind it: every edge must touch a coplanar
    // neighbour (face drawn on a larger face) or a face behind the extrusion direction (part of a solid)
    const ext = normal.clone().multiplyScalar(Math.sign(distance));
    const anchor = this.positionOf(sourceFace.outer[0]);
    const embedded = others.every(faces => faces.some(face => {
      const otherNormal = this.faceNormal(face);
      const coplanar = Math.abs(Math.abs(otherNormal.dot(normal)) - 1) < 1e-6 && Math.abs(this.positionOf(face.outer[0]).clone().sub(anchor).dot(normal)) < PLANE_TOL;
      return coplanar || this.faceCenter(face).sub(anchor).dot(ext) < -1e-6;
    }));
    const props = { material: sourceFace.material, backMaterial: sourceFace.backMaterial, tag: sourceFace.tag };
    const map = new Map<number, number>();
    for (const vertex of new Set(loops.flat())) map.set(vertex, this.rawVertex(this.positionOf(vertex).clone().addScaledVector(normal, distance)));
    const reverseSides = !embedded && distance < 0;
    for (const loop of loops) for (let i = 0; i < loop.length; i++) {
      const vertexA = loop[i], vertexB = loop[(i + 1) % loop.length];
      const quad = [vertexA, vertexB, map.get(vertexB)!, map.get(vertexA)!];
      if (reverseSides) quad.reverse();
      this.createFaceRaw(quad, [], { material: props.material });
    }
    const top = this.createFaceRaw(sourceFace.outer.map(vertex => map.get(vertex)!), sourceFace.holes.map(hole => hole.map(vertex => map.get(vertex)!)), props);
    if (embedded) this.removeFace(faceId);
    else { if (distance > 0) this.reverseFace(sourceFace); else if (top) this.reverseFace(top); }
    // vertical edges of curved profiles (circles, arcs) become soft like in SketchUp
    const sideEdges: number[] = [];
    for (const vertex of map.keys()) { const edge = this.edgeBetween(vertex, map.get(vertex)!); if (edge) sideEdges.push(edge.id); }
    this.autoSoften(sideEdges);
    this.mergeCoplanar(edges.map(edge => edge.id).filter(id => this.edges.has(id)));
    // when an embedded face is fully removed its loop edges might become orphaned (e.g. on top of a box the hole edges stay)
    return top?.id ?? null;
  }

  /** Split edges at vertices lying on them (T-junctions), making meshes watertight. */
  repairTJunctions() {
    let changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (const edge of [...this.edges.values()]) {
        if (!this.edges.has(edge.id)) continue;
        const start = this.positionOf(edge.start), end = this.positionOf(edge.end);
        const box = new THREE.Box3().setFromPoints([start, end]).expandByScalar(LEN_EPS);
        for (const vertex of this.vertices.values()) {
          if (vertex.id === edge.start || vertex.id === edge.end || !box.containsPoint(vertex.position)) continue;
          if (pointOnSegmentInterior(vertex.position, start, end)) { this.splitEdge(edge.id, vertex.id); changed = true; break; }
        }
      }
    }
  }

  /** Soften edges between faces that meet at a shallow angle (default 20°). */
  autoSoften(edgeIds: Iterable<number>, maxDeg = 20) {
    const cosLimit = Math.cos(maxDeg * Math.PI / 180);
    for (const id of edgeIds) {
      const edge = this.edges.get(id); if (!edge) continue;
      const faces = this.facesOfEdge(id); if (faces.length !== 2) continue;
      const cosAngle = this.faceNormal(faces[0]).dot(this.faceNormal(faces[1]));
      if (cosAngle > cosLimit && cosAngle < 1 - 1e-6) edge.soft = true;
    }
  }

  /** Follow Me: sweep a face along a path (polyline in local coordinates). */
  followMe(faceId: number, path: V3[], closed: boolean): boolean {
    const profileFace = this.faces.get(faceId); if (!profileFace || path.length < 2) return false;
    const pathLength = path.length;
    const segs = closed ? pathLength : pathLength - 1;
    const dirs: V3[] = []; for (let i = 0; i < segs; i++) dirs.push(path[(i + 1) % pathLength].clone().sub(path[i]).normalize());
    const miter = (j: number): V3 => {
      if (!closed && j === 0) return dirs[0].clone();
      if (!closed && j === pathLength - 1) return dirs[segs - 1].clone();
      const incoming = dirs[(j - 1 + segs) % segs], outgoing = dirs[j % segs];
      const bisector = incoming.clone().add(outgoing); return bisector.lengthSq() < 1e-10 ? outgoing.clone() : bisector.normalize();
    };
    const project = (x: V3, direction: V3, planePoint: V3, planeNormal: V3) => { const den = direction.dot(planeNormal); if (Math.abs(den) < 1e-9) return x.clone(); return x.clone().addScaledVector(direction, planePoint.clone().sub(x).dot(planeNormal) / den); };
    const loops = this.loops(profileFace).map(loop => loop.map(vertex => this.positionOf(vertex).clone()));
    // orient profile so its normal points backwards along the path start
    const profN = this.faceNormal(profileFace);
    const rings: V3[][][] = [];
    let first = loops;
    if (closed) first = loops.map(loop => loop.map(point => project(point, dirs[0], path[0], miter(0))));
    rings.push(first);
    const count = closed ? pathLength : pathLength - 1;
    for (let j = 1; j <= count; j++) {
      const idx = j % pathLength; const direction = dirs[j - 1];
      if (closed && j === pathLength) { rings.push(rings[0]); break; }
      rings.push(rings[j - 1].map(loop => loop.map(point => project(point, direction, path[idx], miter(idx)))));
    }
    const vertexId = rings.map(ring => ring.map(loop => loop.map(point => this.addVertex(point))));
    if (closed) vertexId[vertexId.length - 1] = vertexId[0];
    const newFaces: Face[] = [];
    const flip = profN.dot(dirs[0]) > 0; // profile normal should point against the sweep direction
    for (let j = 0; j < vertexId.length - 1; j++) for (let loopIndex = 0; loopIndex < vertexId[j].length; loopIndex++) {
      const loopA = vertexId[j][loopIndex], loopB = vertexId[j + 1][loopIndex]; const loopLength = loopA.length;
      for (let k = 0; k < loopLength; k++) {
        let quad = [loopA[k], loopA[(k + 1) % loopLength], loopB[(k + 1) % loopLength], loopB[k]];
        if (!flip) quad = quad.reverse();
        const face = this.createFaceRaw(quad, [], { material: profileFace.material }); if (face) newFaces.push(face);
      }
    }
    if (closed) this.removeFace(faceId);
    else {
      if (flip) this.reverseFace(profileFace);
      const last = vertexId[vertexId.length - 1];
      const cap = this.createFaceRaw(last[0], last.slice(1), { material: profileFace.material, backMaterial: profileFace.backMaterial });
      if (cap && this.faceNormal(cap).dot(dirs[segs - 1]) < 0) this.reverseFace(cap);
    }
    const edgeIds = new Set<number>(); for (const face of newFaces) for (const edge of this.faceEdges(face)) edgeIds.add(edge.id);
    this.autoSoften(edgeIds);
    return true;
  }

  /** Offset the outer loop of a face (positive = inward). */
  offsetFace(faceId: number, offsetDistance: number, polyOffset: (pts: V3[], planeNormal: V3, distance: number) => V3[]) {
    const face = this.faces.get(faceId); if (!face) return;
    const normal = this.faceNormal(face);
    const pts = this.facePoints(face);
    const off = polyOffset(pts, normal, offsetDistance);
    this.addLoop(off);
  }

  // ---------- entity-level operations ----------
  instanceVertices(): number[] { return []; }

  collectVertices(refs: EntityRef[]): Set<number> {
    const vertexIds = new Set<number>();
    for (const entityRef of refs) {
      if (entityRef.kind === 'edge') { const edge = this.edges.get(entityRef.id); if (edge) { vertexIds.add(edge.start); vertexIds.add(edge.end); } }
      if (entityRef.kind === 'face') { const face = this.faces.get(entityRef.id); if (face) this.faceVertices(face).forEach(vertex => vertexIds.add(vertex)); }
    }
    return vertexIds;
  }

  transform(refs: EntityRef[], matrix: THREE.Matrix4) {
    const vertexIds = this.collectVertices(refs);
    this.moveVertices(vertexIds, matrix);
    for (const entityRef of refs) if (entityRef.kind === 'instance') { const instance = this.instances.get(entityRef.id); if (instance) instance.matrix.premultiply(matrix); }
    this.weld(vertexIds);
  }

  /** Copy entities with a transform. Returns refs to the copies. */
  copy(refs: EntityRef[], matrix: THREE.Matrix4, defs: DefinitionRegistry): EntityRef[] {
    const out: EntityRef[] = [];
    const faceIds = new Set(refs.filter(entityRef => entityRef.kind === 'face').map(entityRef => entityRef.id));
    const edgeIds = new Set(refs.filter(entityRef => entityRef.kind === 'edge').map(entityRef => entityRef.id));
    const faces = [...faceIds].map(id => this.faces.get(id)!).filter(Boolean);
    for (const face of faces) for (const edge of this.faceEdges(face)) edgeIds.add(edge.id);
    const vmap = new Map<number, number>();
    const mapVertex = (vertex: number) => { if (!vmap.has(vertex)) vmap.set(vertex, this.rawVertex(this.positionOf(vertex).clone().applyMatrix4(matrix))); return vmap.get(vertex)!; };
    const edgesData = [...edgeIds].map(id => this.edges.get(id)!).filter(Boolean).map(edge => ({ ...edge }));
    const facesData = faces.map(face => ({ ...face, outer: [...face.outer], holes: face.holes.map(hole => [...hole]) }));
    const flip = matrix.determinant() < 0;
    for (const edgeData of edgesData) { const edge = this.createEdgeRaw(mapVertex(edgeData.start), mapVertex(edgeData.end), { soft: edgeData.soft, hidden: edgeData.hidden, tag: edgeData.tag }); out.push({ kind: 'edge', id: edge.id }); }
    for (const faceData of facesData) {
      const face = this.createFaceRaw(faceData.outer.map(mapVertex), faceData.holes.map(hole => hole.map(mapVertex)), { material: faceData.material, backMaterial: faceData.backMaterial, tag: faceData.tag });
      if (face) { if (flip) this.reverseFace(face); out.push({ kind: 'face', id: face.id }); }
    }
    for (const entityRef of refs) if (entityRef.kind === 'instance') {
      const sourceInstance = this.instances.get(entityRef.id); if (!sourceInstance) continue;
      const def = sourceInstance.definition.isComponent ? sourceInstance.definition : defs.cloneDefinition(sourceInstance.definition);
      const instance = this.addInstance(def, sourceInstance.matrix.clone().premultiply(matrix), sourceInstance.name);
      instance.material = sourceInstance.material; instance.tag = sourceInstance.tag;
      out.push({ kind: 'instance', id: instance.id });
    }
    return out;
  }

  addInstance(def: Definition, matrix = new THREE.Matrix4(), name = ''): Instance {
    const inst: Instance = { id: newId(), definition: def, matrix, name };
    this.instances.set(inst.id, inst); return inst;
  }

  erase(refs: EntityRef[]) {
    for (const entityRef of refs) if (entityRef.kind === 'instance') this.instances.delete(entityRef.id);
    for (const entityRef of refs) if (entityRef.kind === 'edge') this.eraseEdge(entityRef.id, false);
    for (const entityRef of refs) if (entityRef.kind === 'face') this.removeFace(entityRef.id);
    this.removeOrphanVertices();
  }

  /** Moves the referenced raw geometry into a fresh Entities container. */
  extract(refs: EntityRef[]): { entities: Entities; instances: Instance[] } {
    const ent = new Entities();
    const faceIds = new Set(refs.filter(entityRef => entityRef.kind === 'face').map(entityRef => entityRef.id));
    const edgeIds = new Set(refs.filter(entityRef => entityRef.kind === 'edge').map(entityRef => entityRef.id));
    for (const id of faceIds) { const face = this.faces.get(id); if (face) this.faceEdges(face).forEach(edge => edgeIds.add(edge.id)); }
    const vmap = new Map<number, number>();
    const mapVertex = (vertex: number) => { if (!vmap.has(vertex)) vmap.set(vertex, ent.rawVertex(this.positionOf(vertex))); return vmap.get(vertex)!; };
    for (const id of edgeIds) { const edge = this.edges.get(id); if (edge) ent.createEdgeRaw(mapVertex(edge.start), mapVertex(edge.end), { soft: edge.soft, hidden: edge.hidden, tag: edge.tag }); }
    for (const id of faceIds) { const face = this.faces.get(id); if (face) ent.createFaceRaw(face.outer.map(mapVertex), face.holes.map(hole => hole.map(mapVertex)), { material: face.material, backMaterial: face.backMaterial, tag: face.tag }); }
    const insts: Instance[] = [];
    for (const entityRef of refs) if (entityRef.kind === 'instance') { const instance = this.instances.get(entityRef.id); if (instance) { insts.push(instance); this.instances.delete(entityRef.id); } }
    for (const instance of insts) ent.instances.set(instance.id, instance);
    // remove from source: faces, then edges no longer used by any remaining face
    for (const id of faceIds) this.removeFace(id);
    for (const id of edgeIds) { if (this.facesOfEdge(id).length === 0) this.eraseEdge(id, false); }
    this.removeOrphanVertices();
    return { entities: ent, instances: insts };
  }

  /** Insert all geometry of another Entities container transformed by m. */
  merge(src: Entities, matrix: THREE.Matrix4, defs: DefinitionRegistry, materialOverride?: string, raw = false): EntityRef[] {
    const out: EntityRef[] = [];
    const vmap = new Map<number, number>();
    const mapVertex = (vertex: number) => { if (!vmap.has(vertex)) { const point = src.positionOf(vertex).clone().applyMatrix4(matrix); vmap.set(vertex, raw ? this.rawVertex(point) : this.addVertex(point)); } return vmap.get(vertex)!; };
    for (const edge of src.edges.values()) { const newEdge = this.createEdgeRaw(mapVertex(edge.start), mapVertex(edge.end), { soft: edge.soft, hidden: edge.hidden, tag: edge.tag }); out.push({ kind: 'edge', id: newEdge.id }); }
    const flip = matrix.determinant() < 0;
    for (const sourceFace of src.faces.values()) {
      const face = this.createFaceRaw(sourceFace.outer.map(mapVertex), sourceFace.holes.map(hole => hole.map(mapVertex)), { material: sourceFace.material ?? materialOverride, backMaterial: sourceFace.backMaterial, tag: sourceFace.tag });
      if (face) { if (flip) this.reverseFace(face); out.push({ kind: 'face', id: face.id }); }
    }
    for (const childInstance of src.instances.values()) {
      const def = childInstance.definition.isComponent ? childInstance.definition : defs.cloneDefinition(childInstance.definition);
      const instance = this.addInstance(def, childInstance.matrix.clone().premultiply(matrix), childInstance.name); instance.material = childInstance.material; instance.tag = childInstance.tag;
      out.push({ kind: 'instance', id: instance.id });
    }
    return out;
  }

  clone(defs: DefinitionRegistry): Entities { const entities = new Entities(); entities.merge(this, new THREE.Matrix4(), defs, undefined, true); return entities; }

  /** Bounding box in local coordinates (including nested instances). */
  bounds(box = new THREE.Box3(), matrix = new THREE.Matrix4(), hiddenTags?: Set<string>): THREE.Box3 {
    for (const vertex of this.vertices.values()) box.expandByPoint(vertex.position.clone().applyMatrix4(matrix));
    for (const instance of this.instances.values()) { if (instance.hidden || (instance.tag && hiddenTags?.has(instance.tag))) continue; instance.definition.entities.bounds(box, matrix.clone().multiply(instance.matrix), hiddenTags); }
    return box;
  }

  refBounds(refs: EntityRef[]): THREE.Box3 {
    const box = new THREE.Box3();
    for (const vertex of this.collectVertices(refs)) box.expandByPoint(this.positionOf(vertex));
    for (const entityRef of refs) if (entityRef.kind === 'instance') { const instance = this.instances.get(entityRef.id); if (instance) instance.definition.entities.bounds(box, instance.matrix.clone()); }
    return box;
  }

  stats() { let faces = this.faces.size, edges = this.edges.size; for (const instance of this.instances.values()) { const childStats = instance.definition.entities.stats(); faces += childStats.faces; edges += childStats.edges; } return { faces, edges }; }
}

export interface DefinitionRegistry { cloneDefinition(definition: Definition): Definition }
