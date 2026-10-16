import * as THREE from 'three';
import type { Viewer, EdgeRec, VertRec, FaceHit } from './viewer';
import type { Overlay } from './overlay';

export type InferKind = 'endpoint' | 'midpoint' | 'edge' | 'face' | 'axis' | 'ground' | 'free' | 'guide' | 'origin' | 'aligned' | 'locked' | 'center' | 'parallel' | 'perpendicular';

export interface Inference {
  point: THREE.Vector3;
  kind: InferKind;
  label: string;
  face?: FaceHit | null;
  edge?: EdgeRec;
  vert?: VertRec;
  axis?: 'x' | 'y' | 'z';
  axisFrom?: THREE.Vector3;
  alignFrom?: THREE.Vector3;
  dir?: THREE.Vector3;
}

export const AXES: Record<'x' | 'y' | 'z', THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
export const AXIS_COLOR = { x: '#e00000', y: '#00a000', z: '#0000e0' } as const;
export const AXIS_LABEL = { x: 'Auf roter Achse', y: 'Auf grüner Achse', z: 'Auf blauer Achse' } as const;

export interface InferOptions {
  from?: THREE.Vector3 | null;
  lock?: THREE.Vector3 | null; // direction lock (arrow keys / shift)
  lockAxis?: 'x' | 'y' | 'z' | null;
  plane?: { p: THREE.Vector3; n: THREE.Vector3 } | null; // constrain to plane (e.g. rectangle on face)
  noGeometry?: boolean;
  filterVert?: (v: VertRec) => boolean;
  filterEdge?: (e: EdgeRec) => boolean;
  filterFace?: (ctx: FaceHit['ctx'], fid: number) => boolean;
}

/** Closest point on infinite line (p,d) to a ray. */
export function closestOnLineToRay(p: THREE.Vector3, d: THREE.Vector3, ray: THREE.Ray): THREE.Vector3 {
  const w0 = p.clone().sub(ray.origin);
  const a = d.dot(d), b = d.dot(ray.direction), c = ray.direction.dot(ray.direction), dd = d.dot(w0), e = ray.direction.dot(w0);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-10) return p.clone();
  const s = (b * e - c * dd) / den;
  return p.clone().addScaledVector(d, s);
}

export class InferenceEngine {
  tracked: THREE.Vector3[] = [];
  last: Inference | null = null;
  constructor(public viewer: Viewer, public guides: () => { kind: string; p: THREE.Vector3; d?: THREE.Vector3 }[]) {}

  track(p: THREE.Vector3) {
    if (this.tracked.some(t => t.distanceTo(p) < 1e-6)) return;
    this.tracked.unshift(p.clone()); this.tracked.length = Math.min(this.tracked.length, 3);
  }
  reset() { this.tracked = []; this.last = null; }

  private screenDistToLine(x: number, y: number, p: THREE.Vector3, d: THREE.Vector3): number {
    const a = this.viewer.project(p), b = this.viewer.project(p.clone().addScaledVector(d, 1));
    let A = new THREE.Vector2(a.x, a.y), B = new THREE.Vector2(b.x, b.y);
    if (!a.visible || !b.visible) { const b2 = this.viewer.project(p.clone().addScaledVector(d, -1)); if (!a.visible) return Infinity; B = new THREE.Vector2(b2.x, b2.y); }
    const ab = B.clone().sub(A); if (ab.lengthSq() < 1e-6) return Infinity;
    const m = new THREE.Vector2(x, y);
    const t = m.clone().sub(A).dot(ab) / ab.lengthSq();
    return A.clone().add(ab.multiplyScalar(t)).distanceTo(m);
  }

  infer(x: number, y: number, opt: InferOptions = {}): Inference {
    const v = this.viewer; const ray = v.ray(x, y);
    const from = opt.from ?? null;
    // ---- locked direction
    if (from && opt.lock) {
      const d = opt.lock.clone().normalize();
      let p = closestOnLineToRay(from, d, ray);
      const vh = v.pickVertex(x, y, 10, opt.filterVert);
      let kind: InferKind = 'locked';
      if (vh) { p = from.clone().addScaledVector(d, vh.rec.p.clone().sub(from).dot(d)); kind = 'aligned'; }
      const r: Inference = { point: p, kind, label: opt.lockAxis ? AXIS_LABEL[opt.lockAxis] : 'Gesperrt', axis: opt.lockAxis ?? undefined, axisFrom: from, dir: d, alignFrom: vh?.rec.p };
      return (this.last = r);
    }
    if (!opt.noGeometry) {
      // ---- endpoints
      const vh = v.pickVertex(x, y, 10, opt.filterVert);
      if (vh) return (this.last = this.planeClamp({ point: vh.rec.p.clone(), kind: 'endpoint', label: 'Endpunkt', vert: vh.rec }, opt));
      // ---- origin
      const o = v.project(new THREE.Vector3()); if (o.visible && Math.hypot(o.x - x, o.y - y) < 8 && v.model.settings.axes) return (this.last = { point: new THREE.Vector3(), kind: 'origin', label: 'Ursprung' });
    }
    // ---- edges & midpoints
    const eh = opt.noGeometry ? null : v.pickEdge(x, y, 7, opt.filterEdge);
    if (eh) {
      const mid = eh.rec.a.clone().add(eh.rec.b).multiplyScalar(0.5);
      const ms = v.project(mid);
      if (Math.hypot(ms.x - x, ms.y - y) < 10) return (this.last = { point: mid, kind: 'midpoint', label: 'Mittelpunkt', edge: eh.rec });
    }
    // ---- axis from the reference point (+ alignment with tracked points)
    if (from) {
      let best: { axis: 'x' | 'y' | 'z'; d: number } | null = null;
      for (const k of ['x', 'y', 'z'] as const) {
        const d = this.screenDistToLine(x, y, from, AXES[k]);
        if (d < 9 && (!best || d < best.d)) best = { axis: k, d };
      }
      if (best && !(eh && eh.dist < 3)) {
        const d = AXES[best.axis];
        let p = closestOnLineToRay(from, d, ray);
        let alignFrom: THREE.Vector3 | undefined;
        for (const t of this.tracked) {
          const q = from.clone().addScaledVector(d, t.clone().sub(from).dot(d));
          const qs = v.project(q);
          if (Math.hypot(qs.x - x, qs.y - y) < 12 && t.distanceTo(q) > 1e-6) { p = q; alignFrom = t; break; }
        }
        const r: Inference = { point: p, kind: alignFrom ? 'aligned' : 'axis', label: AXIS_LABEL[best.axis], axis: best.axis, axisFrom: from, alignFrom };
        return (this.last = r);
      }
    }
    if (eh) return (this.last = this.planeClamp({ point: eh.point, kind: 'edge', label: eh.rec.ctx.path.length ? 'Auf Kante in Gruppe' : 'Auf Kante', edge: eh.rec }, opt));
    // ---- guides
    if (!opt.noGeometry && v.model.settings.guides) {
      for (const g of this.guides()) {
        if (g.kind === 'point') { const s = v.project(g.p); if (s.visible && Math.hypot(s.x - x, s.y - y) < 10) return (this.last = { point: g.p.clone(), kind: 'guide', label: 'Hilfspunkt' }); }
        else if (g.d && this.screenDistToLine(x, y, g.p, g.d) < 6) { const p = closestOnLineToRay(g.p, g.d, ray); return (this.last = this.planeClamp({ point: p, kind: 'guide', label: 'Auf Hilfslinie' }, opt)); }
      }
    }
    // ---- alignment with tracked points (no reference point)
    // ---- face / plane
    if (opt.plane) {
      const hit = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(opt.plane.n, opt.plane.p), new THREE.Vector3());
      if (hit) return (this.last = this.alignInPlane(x, y, { point: hit, kind: 'face', label: 'Auf Fläche' }, opt.plane));
    }
    const fh = opt.noGeometry ? null : v.pickFace(x, y, opt.filterFace);
    if (fh) return (this.last = { point: fh.point, kind: 'face', label: fh.ctx.path.length ? 'In Gruppe' : 'Auf Fläche', face: fh });
    // ---- ground / free
    const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), from ? -from.z : 0);
    const gp = ray.intersectPlane(ground, new THREE.Vector3());
    if (gp && gp.distanceTo(ray.origin) < 5000) return (this.last = this.alignInPlane(x, y, { point: gp, kind: 'ground', label: '' }, { p: gp, n: new THREE.Vector3(0, 0, 1) }));
    const p = ray.at(from ? from.distanceTo(ray.origin) : 10, new THREE.Vector3());
    return (this.last = { point: p, kind: 'free', label: '' });
  }

  /** Snap to alignment with tracked points inside a plane. */
  private alignInPlane(x: number, y: number, r: Inference, plane: { p: THREE.Vector3; n: THREE.Vector3 }): Inference {
    for (const t of this.tracked) {
      for (const k of ['x', 'y', 'z'] as const) {
        const d = AXES[k]; if (Math.abs(d.dot(plane.n)) > 0.01) continue;
        // line through tracked point along axis, intersected with plane-lie
        const tp = t.clone().addScaledVector(plane.n, plane.p.clone().sub(t).dot(plane.n));
        const dist = this.screenDistToLine(x, y, tp, d);
        if (dist < 7) { const ray = this.viewer.ray(x, y); const q = closestOnLineToRay(tp, d, ray); return { ...r, point: q, kind: 'aligned', label: 'Von Punkt', alignFrom: t, axis: k }; }
      }
    }
    return r;
  }

  private planeClamp(r: Inference, opt: InferOptions): Inference {
    if (!opt.plane) return r;
    const d = r.point.clone().sub(opt.plane.p).dot(opt.plane.n);
    if (Math.abs(d) < 1e-6) return r;
    // project onto plane along view ray direction so it still lies under the cursor
    return { ...r, point: r.point.clone().addScaledVector(opt.plane.n, -d) };
  }

  draw(o: Overlay, r: Inference | null, mouse: { x: number; y: number }, showTip = true) {
    if (!r) return;
    if (r.axisFrom && r.axis) {
      o.line(r.axisFrom, r.point, AXIS_COLOR[r.axis], 1.5, [4, 3]);
    }
    if (r.alignFrom) o.line(r.alignFrom, r.point, r.axis ? AXIS_COLOR[r.axis] : '#000', 1, [2, 3]);
    const mk: Record<string, string> = { endpoint: 'endpoint', midpoint: 'midpoint', edge: 'edge', face: 'face', guide: 'guide', origin: 'origin', aligned: 'axis', center: 'center' };
    if (mk[r.kind]) o.marker(r.point, mk[r.kind]);
    if (showTip && r.label) o.tooltip(mouse.x, mouse.y, r.label);
  }
}
