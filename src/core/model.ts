import * as THREE from 'three';
import {
  LEN_EPS, V3, v3, polygonNormal, planeBasis, to2D, signedArea2D, pointInPolygon2D, triangulate,
  pointOnSegmentInterior, segmentSegmentClosest, polygonArea, isCollinear,
} from './geometry';

let NEXT_ID = 1;
export const newId = () => NEXT_ID++;
export function ensureIdAbove(n: number) { if (n >= NEXT_ID) NEXT_ID = n + 1; }

export interface Vertex { id: number; p: V3 }
export interface Edge { id: number; a: number; b: number; soft?: boolean; hidden?: boolean; tag?: string }
export interface ShapeParams { kind: string; args: unknown[]; opts: Record<string, unknown> }
export interface Face { id: number; outer: number[]; holes: number[][]; material?: string; backMaterial?: string; tag?: string; hidden?: boolean }

export interface Instance {
  id: number; def: Definition; matrix: THREE.Matrix4; name: string;
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

const ekey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
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
  pos(vid: number): V3 { return this.vertices.get(vid)!.p; }
  edgeBetween(a: number, b: number): Edge | undefined { const id = this.keyIndex.get(ekey(a, b)); return id != null ? this.edges.get(id) : undefined; }
  edgesOfVertex(vid: number): Edge[] { return [...(this.vEdges.get(vid) ?? [])].map(id => this.edges.get(id)!).filter(Boolean); }
  facesOfEdge(eid: number): Face[] { return [...(this.eFaces.get(eid) ?? [])].map(id => this.faces.get(id)!).filter(Boolean); }
  facesOfVertex(vid: number): Face[] { const s = new Set<Face>(); for (const e of this.edgesOfVertex(vid)) for (const f of this.facesOfEdge(e.id)) s.add(f); return [...s]; }
  loops(f: Face): number[][] { return [f.outer, ...f.holes]; }
  loopEdges(loop: number[]): Edge[] { const r: Edge[] = []; for (let i = 0; i < loop.length; i++) { const e = this.edgeBetween(loop[i], loop[(i + 1) % loop.length]); if (e) r.push(e); } return r; }
  faceEdges(f: Face): Edge[] { return this.loops(f).flatMap(l => this.loopEdges(l)); }
  facePoints(f: Face): V3[] { return f.outer.map(v => this.pos(v)); }
  faceNormal(f: Face): V3 { return polygonNormal(this.facePoints(f)); }
  faceVertices(f: Face): number[] { return this.loops(f).flat(); }
  faceArea(f: Face): number { return polygonArea(this.facePoints(f)) - f.holes.reduce((s, h) => s + polygonArea(h.map(v => this.pos(v))), 0); }
  faceCenter(f: Face): V3 { const tri = this.faceTriangles(f); if (tri.length) { const c = v3(); const pts = [...f.outer, ...f.holes.flat()].map(v => this.pos(v)); let best = -1; for (let i = 0; i < tri.length; i += 3) { const a = pts[tri[i]], b = pts[tri[i + 1]], d = pts[tri[i + 2]]; const ar = b.clone().sub(a).cross(d.clone().sub(a)).length(); if (ar > best) { best = ar; c.copy(a).add(b).add(d).multiplyScalar(1 / 3); } } return c; } return this.facePoints(f)[0].clone(); }
  faceTriangles(f: Face): number[] { return triangulate(f.outer.map(v => this.pos(v)), f.holes.map(h => h.map(v => this.pos(v))), this.faceNormal(f)); }
  edgeLength(e: Edge) { return this.pos(e.a).distanceTo(this.pos(e.b)); }
  isEmpty() { return this.edges.size === 0 && this.instances.size === 0; }

  pointInFace(f: Face, p: V3, strict = true): boolean {
    const n = this.faceNormal(f); if (n.lengthSq() < 0.5) return false;
    const o = this.pos(f.outer[0]);
    if (Math.abs(p.clone().sub(o).dot(n)) > PLANE_TOL * 10) return false;
    const { u, v } = planeBasis(n);
    const P = to2D([p], o, u, v)[0];
    if (!pointInPolygon2D(P, to2D(this.facePoints(f), o, u, v))) return false;
    for (const h of f.holes) if (pointInPolygon2D(P, to2D(h.map(x => this.pos(x)), o, u, v))) return false;
    if (strict) {
      // reject points on the boundary
      for (const e of this.faceEdges(f)) if (pointOnSegmentInterior(p, this.pos(e.a), this.pos(e.b), 1e-7) ) return false;
    }
    return true;
  }

  // ---------- raw creation ----------
  private vhash: Map<string, number[]> | null = null;
  private static CELL = 0.01;
  private cellKey(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  private hashInsert(id: number, p: V3) {
    if (!this.vhash) return; const C = Entities.CELL;
    const k = this.cellKey(Math.floor(p.x / C), Math.floor(p.y / C), Math.floor(p.z / C));
    const l = this.vhash.get(k); if (l) l.push(id); else this.vhash.set(k, [id]);
  }
  /** Must be called after vertex positions were mutated directly. */
  invalidateHash() { this.vhash = null; }
  findVertex(p: V3, tol = LEN_EPS): number | undefined {
    if (!this.vhash) { this.vhash = new Map(); for (const v of this.vertices.values()) this.hashInsert(v.id, v.p); }
    const C = Entities.CELL; const cx = Math.floor(p.x / C), cy = Math.floor(p.y / C), cz = Math.floor(p.z / C);
    let best: number | undefined, bd = tol * tol;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = this.vhash.get(this.cellKey(cx + dx, cy + dy, cz + dz)); if (!l) continue;
      for (const id of l) { const v = this.vertices.get(id); if (!v) continue; const d = v.p.distanceToSquared(p); if (d < bd) { bd = d; best = id; } }
    }
    return best;
  }
  addVertex(p: V3): number {
    const f = this.findVertex(p); if (f != null) return f;
    const id = newId(); this.vertices.set(id, { id, p: p.clone() }); this.hashInsert(id, p); return id;
  }
  rawVertex(p: V3, id = newId()): number { this.vertices.set(id, { id, p: p.clone() }); this.hashInsert(id, p); return id; }

  createEdgeRaw(a: number, b: number, props: Partial<Edge> = {}, id = newId()): Edge {
    const ex = this.edgeBetween(a, b); if (ex) return ex;
    const e: Edge = { ...props, id, a, b };
    this.edges.set(id, e); this.keyIndex.set(ekey(a, b), id);
    if (!this.vEdges.has(a)) this.vEdges.set(a, new Set());
    if (!this.vEdges.has(b)) this.vEdges.set(b, new Set());
    this.vEdges.get(a)!.add(id); this.vEdges.get(b)!.add(id);
    return e;
  }

  private cleanLoop(loop: number[]): number[] {
    const r: number[] = [];
    for (const v of loop) if (r[r.length - 1] !== v) r.push(v);
    while (r.length > 1 && r[0] === r[r.length - 1]) r.pop();
    return r;
  }
  faceKey(outer: number[]) { return [...outer].sort((a, b) => a - b).join(','); }
  private fkIndex = new Map<string, number>();
  private faceKeys = new Map<number, string>();
  private indexFace(f: Face) { const old = this.faceKeys.get(f.id); if (old && this.fkIndex.get(old) === f.id) this.fkIndex.delete(old); const k = this.faceKey(f.outer); this.faceKeys.set(f.id, k); this.fkIndex.set(k, f.id); }
  private unindexFace(id: number) { const old = this.faceKeys.get(id); if (old && this.fkIndex.get(old) === id) this.fkIndex.delete(old); this.faceKeys.delete(id); }
  findFaceByOuter(outer: number[]): Face | undefined {
    const id = this.fkIndex.get(this.faceKey(outer)); if (id == null) return undefined;
    const f = this.faces.get(id); if (f && f.outer.length === outer.length && this.faceKey(f.outer) === this.faceKey(outer)) return f;
    return undefined;
  }

  createFaceRaw(outer: number[], holes: number[][] = [], props: Partial<Face> = {}, id = newId()): Face | null {
    outer = this.cleanLoop(outer); holes = holes.map(h => this.cleanLoop(h)).filter(h => h.length >= 3);
    if (outer.length < 3) return null;
    if (polygonArea(outer.map(v => this.pos(v))) < 1e-10) return null;
    const ex = this.findFaceByOuter(outer); if (ex) return ex;
    const f: Face = { ...props, id, outer, holes };
    this.faces.set(id, f); this.indexFace(f);
    for (const l of this.loops(f)) for (let i = 0; i < l.length; i++) {
      const e = this.createEdgeRaw(l[i], l[(i + 1) % l.length]);
      if (!this.eFaces.has(e.id)) this.eFaces.set(e.id, new Set());
      this.eFaces.get(e.id)!.add(id);
    }
    return f;
  }

  removeFace(fid: number) {
    const f = this.faces.get(fid); if (!f) return;
    for (const e of this.faceEdges(f)) this.eFaces.get(e.id)?.delete(fid);
    this.faces.delete(fid); this.unindexFace(fid);
  }

  private removeEdgeRaw(eid: number) {
    const e = this.edges.get(eid); if (!e) return;
    for (const f of this.facesOfEdge(eid)) this.removeFace(f.id);
    this.edges.delete(eid); this.keyIndex.delete(ekey(e.a, e.b)); this.eFaces.delete(eid);
    this.vEdges.get(e.a)?.delete(eid); this.vEdges.get(e.b)?.delete(eid);
  }
  removeOrphanVertices(vids?: Iterable<number>) {
    const list = vids ? [...vids] : [...this.vertices.keys()];
    for (const v of list) if (!(this.vEdges.get(v)?.size)) { this.vertices.delete(v); this.vEdges.delete(v); }
  }

  reverseFace(f: Face) { f.outer.reverse(); f.holes.forEach(h => h.reverse()); }

  // ---------- topology edits ----------
  splitEdge(eid: number, vid: number): [Edge, Edge] | null {
    const e = this.edges.get(eid); if (!e || e.a === vid || e.b === vid) return null;
    const faces = this.facesOfEdge(eid);
    const props = { soft: e.soft, hidden: e.hidden, tag: e.tag };
    for (const f of faces) {
      for (const l of this.loops(f)) for (let i = 0; i < l.length; i++) {
        const x = l[i], y = l[(i + 1) % l.length];
        if ((x === e.a && y === e.b) || (x === e.b && y === e.a)) { l.splice(i + 1, 0, vid); break; }
      }
    }
    // detach faces from old edge before removing it
    this.eFaces.set(eid, new Set());
    this.removeEdgeRaw(eid);
    const e1 = this.createEdgeRaw(e.a, vid, props), e2 = this.createEdgeRaw(vid, e.b, props);
    for (const f of faces) for (const ne of [e1, e2]) { if (!this.eFaces.has(ne.id)) this.eFaces.set(ne.id, new Set()); this.eFaces.get(ne.id)!.add(f.id); }
    for (const f of faces) this.indexFace(f);
    return [e1, e2];
  }

  /** Inserts a vertex at p, splitting any edge it lies on. */
  addPointOnEdges(p: V3): number {
    const vid = this.addVertex(p);
    const P = this.pos(vid);
    for (const e of [...this.edges.values()]) {
      if (e.a === vid || e.b === vid) continue;
      if (pointOnSegmentInterior(P, this.pos(e.a), this.pos(e.b))) { this.splitEdge(e.id, vid); break; }
    }
    return vid;
  }

  /**
   * SketchUp-like line insertion: merges vertices, splits crossed edges, and
   * automatically creates or splits faces when closed planar loops appear.
   */
  addLine(p: V3, q: V3, opts: { detectFaces?: boolean } = {}): Edge[] {
    if (p.distanceTo(q) < LEN_EPS) return [];
    const va = this.addPointOnEdges(p), vb = this.addPointOnEdges(q);
    if (va === vb) return [];
    const A = this.pos(va).clone(), B = this.pos(vb).clone();
    const pts: { t: number; vid: number }[] = [{ t: 0, vid: va }, { t: 1, vid: vb }];
    const dir = B.clone().sub(A); const len2 = dir.lengthSq();
    // existing vertices on the segment
    for (const v of this.vertices.values()) {
      if (v.id === va || v.id === vb) continue;
      if (pointOnSegmentInterior(v.p, A, B)) pts.push({ t: v.p.clone().sub(A).dot(dir) / len2, vid: v.id });
    }
    // crossing edges
    for (const e of [...this.edges.values()]) {
      if (!this.edges.has(e.id)) continue;
      const P1 = this.pos(e.a), Q1 = this.pos(e.b);
      if (e.a === va || e.b === va || e.a === vb || e.b === vb) continue;
      const r = segmentSegmentClosest(A, B, P1, Q1);
      if (r.c1.distanceTo(r.c2) > LEN_EPS) continue;
      if (r.s <= 1e-7 || r.s >= 1 - 1e-7 || r.t <= 1e-7 || r.t >= 1 - 1e-7) continue;
      // parallel overlapping edges are handled by vertex insertion
      if (dir.clone().normalize().cross(Q1.clone().sub(P1).normalize()).length() < 1e-6) continue;
      const vid = this.addVertex(r.c1);
      this.splitEdge(e.id, vid);
      pts.push({ t: r.s, vid });
    }
    pts.sort((x, y) => x.t - y.t);
    const created: Edge[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i].vid, b = pts[i + 1].vid; if (a === b) continue;
      if (this.edgeBetween(a, b)) continue;
      created.push(this.createEdgeRaw(a, b));
    }
    if (opts.detectFaces !== false) for (const e of created) if (this.edges.has(e.id)) this.detectFaces(e.id);
    return created;
  }

  /** Adds a closed polyline (e.g. rectangle, circle). */
  addLoop(points: V3[]): Edge[] {
    const out: Edge[] = [];
    for (let i = 0; i < points.length; i++) out.push(...this.addLine(points[i], points[(i + 1) % points.length]));
    return out;
  }

  edgesInPlane(o: V3, n: V3): Edge[] {
    return [...this.edges.values()].filter(e => Math.abs(this.pos(e.a).clone().sub(o).dot(n)) < PLANE_TOL && Math.abs(this.pos(e.b).clone().sub(o).dot(n)) < PLANE_TOL);
  }
  facesInPlane(o: V3, n: V3): Face[] {
    return [...this.faces.values()].filter(f => { const fn = this.faceNormal(f); return Math.abs(Math.abs(fn.dot(n)) - 1) < 1e-6 && Math.abs(this.pos(f.outer[0]).clone().sub(o).dot(n)) < PLANE_TOL; });
  }

  /** Planar half-edge traversal → CCW cycles (faces) and CW cycles (component boundaries). */
  extractCycles(edgeIds: Iterable<number>, n: V3, origin: V3) {
    const adj = new Map<number, Set<number>>();
    for (const id of edgeIds) { const e = this.edges.get(id); if (!e) continue; if (!adj.has(e.a)) adj.set(e.a, new Set()); if (!adj.has(e.b)) adj.set(e.b, new Set()); adj.get(e.a)!.add(e.b); adj.get(e.b)!.add(e.a); }
    // prune dangling
    let changed = true;
    while (changed) { changed = false; for (const [v, s] of adj) if (s.size < 2) { for (const w of s) adj.get(w)?.delete(v); adj.delete(v); changed = true; } }
    const { u, v } = planeBasis(n);
    const p2 = new Map<number, THREE.Vector2>();
    for (const k of adj.keys()) { const d = this.pos(k).clone().sub(origin); p2.set(k, new THREE.Vector2(d.dot(u), d.dot(v))); }
    const sorted = new Map<number, number[]>();
    for (const [k, s] of adj) { const c = p2.get(k)!; sorted.set(k, [...s].sort((x, y) => { const a = p2.get(x)!, b = p2.get(y)!; return Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x); })); }
    const visited = new Set<string>();
    const pos: number[][] = [], neg: number[][] = [];
    for (const [s, ns] of sorted) for (const t of ns) {
      if (visited.has(s + '>' + t)) continue;
      const cyc: number[] = []; let cur = s, nxt = t, guard = 0;
      while (guard++ < 100000) {
        visited.add(cur + '>' + nxt); cyc.push(cur);
        const list = sorted.get(nxt)!; const i = list.indexOf(cur);
        const nn = list[(i - 1 + list.length) % list.length];
        cur = nxt; nxt = nn;
        if (cur === s && nxt === t) break;
      }
      if (new Set(cyc).size !== cyc.length) continue; // non-simple (bridges) – skip
      const area = signedArea2D(cyc.map(k => p2.get(k)!));
      if (Math.abs(area) < 1e-12) continue;
      (area > 0 ? pos : neg).push(cyc);
    }
    // assign holes
    const holesOf = new Map<number, number[][]>();
    const poly = (c: number[]) => c.map(k => p2.get(k)!);
    for (const h of neg) {
      const hs = new Set(h);
      let best = -1, bestA = Infinity;
      pos.forEach((c, i) => {
        if (c.some(k => hs.has(k))) return;
        if (!pointInPolygon2D(p2.get(h[0])!, poly(c))) return;
        const a = signedArea2D(poly(c)); if (a < bestA) { bestA = a; best = i; }
      });
      if (best >= 0) { if (!holesOf.has(best)) holesOf.set(best, []); holesOf.get(best)!.push(h); }
    }
    return pos.map((c, i) => ({ outer: c, holes: holesOf.get(i) ?? [] }));
  }

  private samplePoint(outer: number[], holes: number[][]): V3 | null {
    const pts = [...outer, ...holes.flat()].map(v => this.pos(v));
    const tri = triangulate(outer.map(v => this.pos(v)), holes.map(h => h.map(v => this.pos(v))));
    let best: V3 | null = null, bestA = -1;
    for (let i = 0; i < tri.length; i += 3) { const a = pts[tri[i]], b = pts[tri[i + 1]], c = pts[tri[i + 2]]; const ar = b.clone().sub(a).cross(c.clone().sub(a)).length(); if (ar > bestA) { bestA = ar; best = a.clone().add(b).add(c).multiplyScalar(1 / 3); } }
    return best;
  }

  /** Called for every newly created edge. */
  detectFaces(eid: number) {
    const e = this.edges.get(eid); if (!e) return;
    const A = this.pos(e.a), B = this.pos(e.b), M = A.clone().add(B).multiplyScalar(0.5);
    // Case A: the edge lies inside an existing face → split / punch that face
    for (const f of [...this.faces.values()]) {
      if (!this.faces.has(f.id)) continue;
      const n = this.faceNormal(f), o = this.pos(f.outer[0]);
      if (Math.abs(A.clone().sub(o).dot(n)) > PLANE_TOL || Math.abs(B.clone().sub(o).dot(n)) > PLANE_TOL) continue;
      if (!this.pointInFace(f, M)) continue;
      this.resplitFace(f);
      return;
    }
    // Case B: new faces in planes spanned by this edge and its neighbours
    const dir = B.clone().sub(A).normalize();
    const planes: V3[] = [];
    for (const vid of [e.a, e.b]) for (const o of this.edgesOfVertex(vid)) {
      if (o.id === eid) continue;
      const od = this.pos(o.b).clone().sub(this.pos(o.a)).normalize();
      const n = dir.clone().cross(od); if (n.length() < 1e-6) continue; n.normalize();
      const big = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? n.x : n.z) : (Math.abs(n.y) > Math.abs(n.z) ? n.y : n.z);
      if (big < 0) n.negate();
      if (!planes.some(p => p.distanceTo(n) < 1e-6)) planes.push(n);
    }
    for (const n of planes) {
      if (!this.edges.has(eid)) return;
      const edges = this.edgesInPlane(A, n);
      // only keep the connected component of e plus everything else (needed for holes)
      const regions = this.extractCycles(edges.map(x => x.id), n, A);
      const existing = this.facesInPlane(A, n);
      for (const r of regions) {
        const L = r.outer.length; let has = false;
        for (let i = 0; i < L; i++) { const x = r.outer[i], y = r.outer[(i + 1) % L]; if ((x === e.a && y === e.b) || (x === e.b && y === e.a)) { has = true; break; } }
        if (!has) continue;
        if (this.findFaceByOuter(r.outer)) continue;
        const sp = this.samplePoint(r.outer, r.holes); if (!sp) continue;
        if (existing.some(f => this.faces.has(f.id) && this.pointInFace(f, sp, false))) continue;
        const f = this.createFaceRaw(r.outer, r.holes);
        if (f) this.orientNewFace(f);
      }
    }
  }

  /** Make a new face consistent with its neighbours (or point down on the ground plane, like SketchUp). */
  orientNewFace(f: Face) {
    for (const l of [f.outer]) for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length]; const e = this.edgeBetween(a, b); if (!e) continue;
      for (const g of this.facesOfEdge(e.id)) {
        if (g.id === f.id) continue;
        for (const gl of this.loops(g)) for (let j = 0; j < gl.length; j++) {
          if (gl[j] === a && gl[(j + 1) % gl.length] === b) { this.reverseFace(f); return; }
          if (gl[j] === b && gl[(j + 1) % gl.length] === a) return;
        }
      }
    }
    const n = this.faceNormal(f);
    const z0 = Math.abs(this.pos(f.outer[0]).z) < PLANE_TOL;
    if (Math.abs(n.z) > 0.999) { if (z0 ? n.z > 0 : n.z < 0) this.reverseFace(f); }
  }

  /** Rebuild a face after edges were drawn inside it. */
  resplitFace(f: Face) {
    const n = this.faceNormal(f), o = this.pos(f.outer[0]).clone();
    const own = new Set(this.faceEdges(f).map(e => e.id));
    const inner = this.edgesInPlane(o, n).filter(e => !own.has(e.id) && this.pointInFace(f, this.pos(e.a).clone().add(this.pos(e.b)).multiplyScalar(0.5)));
    const snapshot = { outer: [...f.outer], holes: f.holes.map(h => [...h]) };
    const inside = (p: V3) => this.pointInLoops(snapshot.outer, snapshot.holes, n, p);
    const regions = this.extractCycles([...own, ...inner.map(e => e.id)], n, o);
    const props = { material: f.material, backMaterial: f.backMaterial, tag: f.tag };
    const valid = regions.filter(r => { const sp = this.samplePoint(r.outer, r.holes); return sp && inside(sp); });
    if (valid.length <= 1 && valid[0] && valid[0].outer.length === f.outer.length && valid[0].holes.length === f.holes.length) return;
    this.removeFace(f.id);
    for (const r of valid) this.createFaceRaw(r.outer, r.holes, props);
  }

  pointInLoops(outer: number[], holes: number[][], n: V3, p: V3): boolean {
    const o = this.pos(outer[0]); const { u, v } = planeBasis(n);
    const P = to2D([p], o, u, v)[0];
    if (!pointInPolygon2D(P, to2D(outer.map(x => this.pos(x)), o, u, v))) return false;
    for (const h of holes) if (pointInPolygon2D(P, to2D(h.map(x => this.pos(x)), o, u, v))) return false;
    return true;
  }

  private coplanarSame(f: Face, g: Face) {
    const n1 = this.faceNormal(f), n2 = this.faceNormal(g);
    return n1.dot(n2) > 1 - 1e-6 && Math.abs(this.pos(g.outer[0]).clone().sub(this.pos(f.outer[0])).dot(n1)) < PLANE_TOL;
  }

  /** Erase an edge. Two coplanar faces separated by it are merged (SketchUp "healing"). */
  eraseEdge(eid: number, heal = true) {
    const e = this.edges.get(eid); if (!e) return;
    const fs = this.facesOfEdge(eid);
    if (heal && fs.length === 2 && this.coplanarSame(fs[0], fs[1]) && fs[0].material === fs[1].material) {
      const [f1, f2] = fs; const n = this.faceNormal(f1), o = this.pos(f1.outer[0]).clone();
      const s1 = { outer: [...f1.outer], holes: f1.holes.map(h => [...h]) }, s2 = { outer: [...f2.outer], holes: f2.holes.map(h => [...h]) };
      const edgeIds = new Set([...this.faceEdges(f1), ...this.faceEdges(f2)].map(x => x.id)); edgeIds.delete(eid);
      const props = { material: f1.material, backMaterial: f1.backMaterial, tag: f1.tag };
      const area = this.faceArea(f1) + this.faceArea(f2);
      const keep1 = { ...f1, outer: [...f1.outer], holes: f1.holes.map(h => [...h]) }, keep2 = { ...f2, outer: [...f2.outer], holes: f2.holes.map(h => [...h]) };
      const eprops = { soft: e.soft, hidden: e.hidden, tag: e.tag };
      this.removeEdgeRaw(eid);
      const regions = this.extractCycles(edgeIds, n, o);
      const made: Face[] = [];
      for (const r of regions) {
        const sp = this.samplePoint(r.outer, r.holes); if (!sp) continue;
        if (this.pointInLoops(s1.outer, s1.holes, n, sp) || this.pointInLoops(s2.outer, s2.holes, n, sp)) { const nf = this.createFaceRaw(r.outer, r.holes, props); if (nf) made.push(nf); }
      }
      const got = made.reduce((a, f) => a + this.faceArea(f), 0);
      if (Math.abs(got - area) > Math.max(1e-9, area * 1e-6)) {
        // merge would lose area (non-simple outline) – keep the two faces as they were
        for (const f of made) this.removeFace(f.id);
        this.createEdgeRaw(e.a, e.b, eprops, eid);
        this.createFaceRaw(keep1.outer, keep1.holes, { material: keep1.material, backMaterial: keep1.backMaterial, tag: keep1.tag, hidden: keep1.hidden }, keep1.id);
        this.createFaceRaw(keep2.outer, keep2.holes, { material: keep2.material, backMaterial: keep2.backMaterial, tag: keep2.tag, hidden: keep2.hidden }, keep2.id);
        return;
      }
      this.healCollinear([e.a, e.b]);
    } else {
      this.removeEdgeRaw(eid);
    }
    this.removeOrphanVertices([e.a, e.b]);
  }

  /** Remove vertices that only join two collinear edges with identical faces. */
  healCollinear(vids: Iterable<number>) {
    for (const vid of vids) {
      if (!this.vertices.has(vid)) continue;
      const es = this.edgesOfVertex(vid); if (es.length !== 2) continue;
      const a = es[0].a === vid ? es[0].b : es[0].a, b = es[1].a === vid ? es[1].b : es[1].a;
      if (!isCollinear(this.pos(a), this.pos(vid), this.pos(b))) continue;
      const f1 = new Set(this.facesOfEdge(es[0].id).map(f => f.id)), f2 = this.facesOfEdge(es[1].id).map(f => f.id);
      if (f2.length === 0 || f1.size !== f2.length || !f2.every(x => f1.has(x))) continue;
      if (this.edgeBetween(a, b)) continue;
      const faces = this.facesOfEdge(es[0].id);
      const props = { soft: es[0].soft, hidden: es[0].hidden, tag: es[0].tag };
      for (const f of faces) for (const e of this.faceEdges(f)) this.eFaces.get(e.id)?.delete(f.id);
      for (const f of faces) for (const l of this.loops(f)) { const i = l.indexOf(vid); if (i >= 0) l.splice(i, 1); }
      this.eFaces.set(es[0].id, new Set()); this.eFaces.set(es[1].id, new Set());
      this.removeEdgeRaw(es[0].id); this.removeEdgeRaw(es[1].id);
      this.createEdgeRaw(a, b, props);
      for (const f of faces) for (const e of this.faceEdges(f)) { if (!this.eFaces.has(e.id)) this.eFaces.set(e.id, new Set()); this.eFaces.get(e.id)!.add(f.id); }
      for (const f of faces) this.indexFace(f);
      this.vertices.delete(vid); this.vEdges.delete(vid);
    }
  }

  /** Merge coplanar faces across the given edges. */
  mergeCoplanar(edgeIds: Iterable<number>) {
    for (const id of [...edgeIds]) {
      const e = this.edges.get(id); if (!e) continue;
      const fs = this.facesOfEdge(id);
      if (fs.length === 2 && this.coplanarSame(fs[0], fs[1]) && fs[0].material === fs[1].material) this.eraseEdge(id, true);
    }
  }

  /** Merge vertex src into dst (topology repair after moves). */
  mergeVertexInto(src: number, dst: number) {
    if (src === dst || !this.vertices.has(src) || !this.vertices.has(dst)) return;
    const faces = this.facesOfVertex(src).map(f => ({ ...f, outer: [...f.outer], holes: f.holes.map(h => [...h]) }));
    const edges = this.edgesOfVertex(src).map(e => ({ ...e }));
    for (const f of faces) this.removeFace(f.id);
    for (const e of edges) this.removeEdgeRaw(e.id);
    for (const e of edges) { const o = e.a === src ? e.b : e.a; if (o !== dst) this.createEdgeRaw(dst, o, { soft: e.soft, hidden: e.hidden, tag: e.tag }); }
    this.vertices.delete(src); this.vEdges.delete(src);
    for (const f of faces) {
      const rep = (l: number[]) => this.cleanLoop(l.map(v => (v === src ? dst : v)));
      const outer = rep(f.outer); const holes = f.holes.map(rep).filter(h => h.length >= 3);
      if (new Set(outer).size !== outer.length) continue;
      this.createFaceRaw(outer, holes, { material: f.material, backMaterial: f.backMaterial, tag: f.tag }, f.id);
    }
  }

  /** After moving vertices: weld coincident vertices, drop degenerate faces, merge coplanar. */
  weld(vids: Iterable<number>) {
    const touched = new Set<number>();
    this.invalidateHash();
    for (const v of [...vids]) {
      if (!this.vertices.has(v)) continue;
      const p = this.pos(v);
      let target: number | undefined;
      { const C = Entities.CELL; if (!this.vhash) { this.vhash = new Map(); for (const x of this.vertices.values()) this.hashInsert(x.id, x.p); }
        const cx = Math.floor(p.x / C), cy = Math.floor(p.y / C), cz = Math.floor(p.z / C);
        for (let dx = -1; dx <= 1 && target == null; dx++) for (let dy = -1; dy <= 1 && target == null; dy++) for (let dz = -1; dz <= 1 && target == null; dz++) {
          for (const id of this.vhash.get(this.cellKey(cx + dx, cy + dy, cz + dz)) ?? []) { if (id === v) continue; const w = this.vertices.get(id); if (w && w.p.distanceToSquared(p) < LEN_EPS * LEN_EPS) { target = id; break; } }
        } }
      if (target != null) { this.mergeVertexInto(v, target); touched.add(target); }
    }
    for (const f of [...this.faces.values()]) if (this.faceArea(f) < 1e-10) this.removeFace(f.id);
    const es = new Set<number>(); for (const v of touched) for (const e of this.edgesOfVertex(v)) es.add(e.id);
    this.mergeCoplanar(es);
    this.removeLooseInnerEdges(es);
    this.healCollinear(touched);
  }

  /** Remove edges without faces that lie flat inside a face (left-overs of merges). */
  removeLooseInnerEdges(edgeIds: Iterable<number>) {
    for (const id of [...edgeIds]) {
      const e = this.edges.get(id); if (!e || this.facesOfEdge(id).length) continue;
      const m = this.pos(e.a).clone().add(this.pos(e.b)).multiplyScalar(0.5);
      for (const f of this.faces.values()) if (this.pointInFace(f, m)) { this.eraseEdge(id, false); break; }
    }
  }

  moveVertices(vids: Iterable<number>, m: THREE.Matrix4) { for (const v of vids) this.vertices.get(v)?.p.applyMatrix4(m); this.invalidateHash(); }

  /** SketchUp Push/Pull. Returns the moved/created face id. */
  pushPull(fid: number, d: number): number | null {
    const f = this.faces.get(fid); if (!f || Math.abs(d) < 1e-9) return fid;
    const n = this.faceNormal(f);
    const loops = this.loops(f);
    const edges = this.faceEdges(f);
    const others = edges.map(e => this.facesOfEdge(e.id).filter(g => g.id !== fid));
    // stretch: all adjacent faces are perpendicular → just translate the face
    const stretch = others.every(o => o.length === 1 && Math.abs(this.faceNormal(o[0]).dot(n)) < 1e-6);
    if (stretch) {
      const vids = new Set(this.faceVertices(f));
      const m = new THREE.Matrix4().makeTranslation(n.x * d, n.y * d, n.z * d);
      this.moveVertices(vids, m);
      this.weld(vids);
      return this.faces.has(fid) ? fid : null;
    }
    // the original face disappears when the solid lies behind it: every edge must touch a coplanar
    // neighbour (face drawn on a larger face) or a face behind the extrusion direction (part of a solid)
    const ext = n.clone().multiplyScalar(Math.sign(d));
    const o0 = this.pos(f.outer[0]);
    const embedded = others.every(os => os.some(g => {
      const gn = this.faceNormal(g);
      const coplanar = Math.abs(Math.abs(gn.dot(n)) - 1) < 1e-6 && Math.abs(this.pos(g.outer[0]).clone().sub(o0).dot(n)) < PLANE_TOL;
      return coplanar || this.faceCenter(g).sub(o0).dot(ext) < -1e-6;
    }));
    const props = { material: f.material, backMaterial: f.backMaterial, tag: f.tag };
    const map = new Map<number, number>();
    for (const v of new Set(loops.flat())) map.set(v, this.rawVertex(this.pos(v).clone().addScaledVector(n, d)));
    const reverseSides = !embedded && d < 0;
    for (const l of loops) for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length];
      const q = [a, b, map.get(b)!, map.get(a)!];
      if (reverseSides) q.reverse();
      this.createFaceRaw(q, [], { material: props.material });
    }
    const top = this.createFaceRaw(f.outer.map(v => map.get(v)!), f.holes.map(h => h.map(v => map.get(v)!)), props);
    if (embedded) this.removeFace(fid);
    else { if (d > 0) this.reverseFace(f); else if (top) this.reverseFace(top); }
    // vertical edges of curved profiles (circles, arcs) become soft like in SketchUp
    const sideEdges: number[] = [];
    for (const v of map.keys()) { const e = this.edgeBetween(v, map.get(v)!); if (e) sideEdges.push(e.id); }
    this.autoSoften(sideEdges);
    this.mergeCoplanar(edges.map(e => e.id).filter(id => this.edges.has(id)));
    // when an embedded face is fully removed its loop edges might become orphaned (e.g. on top of a box the hole edges stay)
    return top?.id ?? null;
  }

  /** Split edges at vertices lying on them (T-junctions), making meshes watertight. */
  repairTJunctions() {
    let changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (const e of [...this.edges.values()]) {
        if (!this.edges.has(e.id)) continue;
        const A = this.pos(e.a), B = this.pos(e.b);
        const box = new THREE.Box3().setFromPoints([A, B]).expandByScalar(LEN_EPS);
        for (const v of this.vertices.values()) {
          if (v.id === e.a || v.id === e.b || !box.containsPoint(v.p)) continue;
          if (pointOnSegmentInterior(v.p, A, B)) { this.splitEdge(e.id, v.id); changed = true; break; }
        }
      }
    }
  }

  /** Soften edges between faces that meet at a shallow angle (default 20°). */
  autoSoften(edgeIds: Iterable<number>, maxDeg = 20) {
    const c = Math.cos(maxDeg * Math.PI / 180);
    for (const id of edgeIds) {
      const e = this.edges.get(id); if (!e) continue;
      const fs = this.facesOfEdge(id); if (fs.length !== 2) continue;
      const d = this.faceNormal(fs[0]).dot(this.faceNormal(fs[1]));
      if (d > c && d < 1 - 1e-6) e.soft = true;
    }
  }

  /** Follow Me: sweep a face along a path (polyline in local coordinates). */
  followMe(fid: number, path: V3[], closed: boolean): boolean {
    const f = this.faces.get(fid); if (!f || path.length < 2) return false;
    const n = path.length;
    const segs = closed ? n : n - 1;
    const dirs: V3[] = []; for (let i = 0; i < segs; i++) dirs.push(path[(i + 1) % n].clone().sub(path[i]).normalize());
    const miter = (j: number): V3 => {
      if (!closed && j === 0) return dirs[0].clone();
      if (!closed && j === n - 1) return dirs[segs - 1].clone();
      const a = dirs[(j - 1 + segs) % segs], b = dirs[j % segs];
      const m = a.clone().add(b); return m.lengthSq() < 1e-10 ? b.clone() : m.normalize();
    };
    const project = (x: V3, d: V3, P: V3, m: V3) => { const den = d.dot(m); if (Math.abs(den) < 1e-9) return x.clone(); return x.clone().addScaledVector(d, P.clone().sub(x).dot(m) / den); };
    const loops = this.loops(f).map(l => l.map(v => this.pos(v).clone()));
    // orient profile so its normal points backwards along the path start
    const profN = this.faceNormal(f);
    const rings: V3[][][] = [];
    let first = loops;
    if (closed) first = loops.map(l => l.map(p => project(p, dirs[0], path[0], miter(0))));
    rings.push(first);
    const count = closed ? n : n - 1;
    for (let j = 1; j <= count; j++) {
      const idx = j % n; const d = dirs[j - 1];
      if (closed && j === n) { rings.push(rings[0]); break; }
      rings.push(rings[j - 1].map(l => l.map(p => project(p, d, path[idx], miter(idx)))));
    }
    const vid = rings.map(r => r.map(l => l.map(p => this.addVertex(p))));
    if (closed) vid[vid.length - 1] = vid[0];
    const newFaces: Face[] = [];
    const flip = profN.dot(dirs[0]) > 0; // profile normal should point against the sweep direction
    for (let j = 0; j < vid.length - 1; j++) for (let li = 0; li < vid[j].length; li++) {
      const A = vid[j][li], B = vid[j + 1][li]; const L = A.length;
      for (let k = 0; k < L; k++) {
        let q = [A[k], A[(k + 1) % L], B[(k + 1) % L], B[k]];
        if (!flip) q = q.reverse();
        const nf = this.createFaceRaw(q, [], { material: f.material }); if (nf) newFaces.push(nf);
      }
    }
    if (closed) this.removeFace(fid);
    else {
      if (flip) this.reverseFace(f);
      const last = vid[vid.length - 1];
      const cap = this.createFaceRaw(last[0], last.slice(1), { material: f.material, backMaterial: f.backMaterial });
      if (cap && this.faceNormal(cap).dot(dirs[segs - 1]) < 0) this.reverseFace(cap);
    }
    const es = new Set<number>(); for (const nf of newFaces) for (const e of this.faceEdges(nf)) es.add(e.id);
    this.autoSoften(es);
    return true;
  }

  /** Offset the outer loop of a face (positive = inward). */
  offsetFace(fid: number, d: number, polyOffset: (pts: V3[], n: V3, d: number) => V3[]) {
    const f = this.faces.get(fid); if (!f) return;
    const n = this.faceNormal(f);
    const pts = this.facePoints(f);
    const off = polyOffset(pts, n, d);
    this.addLoop(off);
  }

  // ---------- entity-level operations ----------
  instanceVertices(): number[] { return []; }

  collectVertices(refs: EntityRef[]): Set<number> {
    const s = new Set<number>();
    for (const r of refs) {
      if (r.kind === 'edge') { const e = this.edges.get(r.id); if (e) { s.add(e.a); s.add(e.b); } }
      if (r.kind === 'face') { const f = this.faces.get(r.id); if (f) this.faceVertices(f).forEach(v => s.add(v)); }
    }
    return s;
  }

  transform(refs: EntityRef[], m: THREE.Matrix4) {
    const vids = this.collectVertices(refs);
    this.moveVertices(vids, m);
    for (const r of refs) if (r.kind === 'instance') { const i = this.instances.get(r.id); if (i) i.matrix.premultiply(m); }
    this.weld(vids);
  }

  /** Copy entities with a transform. Returns refs to the copies. */
  copy(refs: EntityRef[], m: THREE.Matrix4, defs: DefinitionRegistry): EntityRef[] {
    const out: EntityRef[] = [];
    const faceIds = new Set(refs.filter(r => r.kind === 'face').map(r => r.id));
    const edgeIds = new Set(refs.filter(r => r.kind === 'edge').map(r => r.id));
    const faces = [...faceIds].map(id => this.faces.get(id)!).filter(Boolean);
    for (const f of faces) for (const e of this.faceEdges(f)) edgeIds.add(e.id);
    const vmap = new Map<number, number>();
    const mv = (v: number) => { if (!vmap.has(v)) vmap.set(v, this.rawVertex(this.pos(v).clone().applyMatrix4(m))); return vmap.get(v)!; };
    const edgesData = [...edgeIds].map(id => this.edges.get(id)!).filter(Boolean).map(e => ({ ...e }));
    const facesData = faces.map(f => ({ ...f, outer: [...f.outer], holes: f.holes.map(h => [...h]) }));
    const flip = m.determinant() < 0;
    for (const e of edgesData) { const ne = this.createEdgeRaw(mv(e.a), mv(e.b), { soft: e.soft, hidden: e.hidden, tag: e.tag }); out.push({ kind: 'edge', id: ne.id }); }
    for (const f of facesData) {
      const nf = this.createFaceRaw(f.outer.map(mv), f.holes.map(h => h.map(mv)), { material: f.material, backMaterial: f.backMaterial, tag: f.tag });
      if (nf) { if (flip) this.reverseFace(nf); out.push({ kind: 'face', id: nf.id }); }
    }
    for (const r of refs) if (r.kind === 'instance') {
      const i = this.instances.get(r.id); if (!i) continue;
      const def = i.def.isComponent ? i.def : defs.cloneDefinition(i.def);
      const ni = this.addInstance(def, i.matrix.clone().premultiply(m), i.name);
      ni.material = i.material; ni.tag = i.tag;
      out.push({ kind: 'instance', id: ni.id });
    }
    return out;
  }

  addInstance(def: Definition, matrix = new THREE.Matrix4(), name = ''): Instance {
    const inst: Instance = { id: newId(), def, matrix, name };
    this.instances.set(inst.id, inst); return inst;
  }

  erase(refs: EntityRef[]) {
    for (const r of refs) if (r.kind === 'instance') this.instances.delete(r.id);
    for (const r of refs) if (r.kind === 'edge') this.eraseEdge(r.id, false);
    for (const r of refs) if (r.kind === 'face') this.removeFace(r.id);
    this.removeOrphanVertices();
  }

  /** Moves the referenced raw geometry into a fresh Entities container. */
  extract(refs: EntityRef[]): { entities: Entities; instances: Instance[] } {
    const ent = new Entities();
    const faceIds = new Set(refs.filter(r => r.kind === 'face').map(r => r.id));
    const edgeIds = new Set(refs.filter(r => r.kind === 'edge').map(r => r.id));
    for (const id of faceIds) { const f = this.faces.get(id); if (f) this.faceEdges(f).forEach(e => edgeIds.add(e.id)); }
    const vmap = new Map<number, number>();
    const mv = (v: number) => { if (!vmap.has(v)) vmap.set(v, ent.rawVertex(this.pos(v))); return vmap.get(v)!; };
    for (const id of edgeIds) { const e = this.edges.get(id); if (e) ent.createEdgeRaw(mv(e.a), mv(e.b), { soft: e.soft, hidden: e.hidden, tag: e.tag }); }
    for (const id of faceIds) { const f = this.faces.get(id); if (f) ent.createFaceRaw(f.outer.map(mv), f.holes.map(h => h.map(mv)), { material: f.material, backMaterial: f.backMaterial, tag: f.tag }); }
    const insts: Instance[] = [];
    for (const r of refs) if (r.kind === 'instance') { const i = this.instances.get(r.id); if (i) { insts.push(i); this.instances.delete(r.id); } }
    for (const i of insts) ent.instances.set(i.id, i);
    // remove from source: faces, then edges no longer used by any remaining face
    for (const id of faceIds) this.removeFace(id);
    for (const id of edgeIds) { if (this.facesOfEdge(id).length === 0) this.eraseEdge(id, false); }
    this.removeOrphanVertices();
    return { entities: ent, instances: insts };
  }

  /** Insert all geometry of another Entities container transformed by m. */
  merge(src: Entities, m: THREE.Matrix4, defs: DefinitionRegistry, materialOverride?: string, raw = false): EntityRef[] {
    const out: EntityRef[] = [];
    const vmap = new Map<number, number>();
    const mv = (v: number) => { if (!vmap.has(v)) { const p = src.pos(v).clone().applyMatrix4(m); vmap.set(v, raw ? this.rawVertex(p) : this.addVertex(p)); } return vmap.get(v)!; };
    for (const e of src.edges.values()) { const ne = this.createEdgeRaw(mv(e.a), mv(e.b), { soft: e.soft, hidden: e.hidden, tag: e.tag }); out.push({ kind: 'edge', id: ne.id }); }
    const flip = m.determinant() < 0;
    for (const f of src.faces.values()) {
      const nf = this.createFaceRaw(f.outer.map(mv), f.holes.map(h => h.map(mv)), { material: f.material ?? materialOverride, backMaterial: f.backMaterial, tag: f.tag });
      if (nf) { if (flip) this.reverseFace(nf); out.push({ kind: 'face', id: nf.id }); }
    }
    for (const i of src.instances.values()) {
      const def = i.def.isComponent ? i.def : defs.cloneDefinition(i.def);
      const ni = this.addInstance(def, i.matrix.clone().premultiply(m), i.name); ni.material = i.material; ni.tag = i.tag;
      out.push({ kind: 'instance', id: ni.id });
    }
    return out;
  }

  clone(defs: DefinitionRegistry): Entities { const e = new Entities(); e.merge(this, new THREE.Matrix4(), defs, undefined, true); return e; }

  /** Bounding box in local coordinates (including nested instances). */
  bounds(box = new THREE.Box3(), m = new THREE.Matrix4(), hiddenTags?: Set<string>): THREE.Box3 {
    for (const v of this.vertices.values()) box.expandByPoint(v.p.clone().applyMatrix4(m));
    for (const i of this.instances.values()) { if (i.hidden || (i.tag && hiddenTags?.has(i.tag))) continue; i.def.entities.bounds(box, m.clone().multiply(i.matrix), hiddenTags); }
    return box;
  }

  refBounds(refs: EntityRef[]): THREE.Box3 {
    const b = new THREE.Box3();
    for (const v of this.collectVertices(refs)) b.expandByPoint(this.pos(v));
    for (const r of refs) if (r.kind === 'instance') { const i = this.instances.get(r.id); if (i) i.def.entities.bounds(b, i.matrix.clone()); }
    return b;
  }

  stats() { let faces = this.faces.size, edges = this.edges.size; for (const i of this.instances.values()) { const s = i.def.entities.stats(); faces += s.faces; edges += s.edges; } return { faces, edges }; }
}

export interface DefinitionRegistry { cloneDefinition(d: Definition): Definition }
