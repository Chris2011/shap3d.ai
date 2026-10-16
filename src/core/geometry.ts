import * as THREE from 'three';

export const EPS = 1e-6;
export const LEN_EPS = 1e-4; // 0.1 mm merge tolerance (model units = meters)

export type V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Newell normal of a polygon (not normalized if degenerate). */
export function polygonNormal(pts: V3[]): V3 {
  const n = v3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  const l = n.length();
  if (l < 1e-12) return v3();
  return n.multiplyScalar(1 / l);
}

export function polygonArea(pts: V3[]): number {
  const n = v3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n.add(a.clone().cross(b));
  }
  return n.length() / 2;
}

/** Orthonormal basis (u, v) on plane with normal n. */
export function planeBasis(n: V3): { u: V3; v: V3 } {
  const ref = Math.abs(n.z) < 0.9 ? v3(0, 0, 1) : v3(1, 0, 0);
  const u = ref.clone().cross(n).normalize();
  const v = n.clone().cross(u).normalize();
  return { u, v };
}

export function to2D(pts: V3[], origin: V3, u: V3, v: V3): THREE.Vector2[] {
  return pts.map(p => { const d = p.clone().sub(origin); return new THREE.Vector2(d.dot(u), d.dot(v)); });
}

export function signedArea2D(pts: THREE.Vector2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}

export function pointInPolygon2D(p: THREE.Vector2, poly: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside;
}

export function distPointSegment2D(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number {
  const ab = b.clone().sub(a); const l2 = ab.lengthSq();
  if (l2 < 1e-12) return p.distanceTo(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / l2));
  return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));
}

/** Closest point on segment ab to p; returns t in [0,1]. */
export function closestOnSegment(p: V3, a: V3, b: V3): { point: V3; t: number } {
  const ab = b.clone().sub(a); const l2 = ab.lengthSq();
  if (l2 < 1e-14) return { point: a.clone(), t: 0 };
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / l2));
  return { point: a.clone().add(ab.multiplyScalar(t)), t };
}

/** Closest points between two segments (p1-q1, p2-q2). */
export function segmentSegmentClosest(p1: V3, q1: V3, p2: V3, q2: V3) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-14 && e <= 1e-14) return { s, t, c1: p1.clone(), c2: p2.clone() };
  if (a <= 1e-14) { t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-14) { s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = d1.dot(d2), denom = a * e - b * b;
      s = denom !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return { s, t, c1: p1.clone().add(d1.multiplyScalar(s)), c2: p2.clone().add(d2.multiplyScalar(t)) };
}

/** Closest points between two infinite lines; null if parallel. */
export function lineLineClosest(p1: V3, d1: V3, p2: V3, d2: V3) {
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1), b = d1.dot(d2), c = d1.dot(r), e = d2.dot(d2), f = d2.dot(r);
  const denom = a * e - b * b;
  if (Math.abs(denom) < 1e-12) return null;
  const s = (b * f - c * e) / denom, t = (a * f - b * c) / denom;
  return { s, t, c1: p1.clone().add(d1.clone().multiplyScalar(s)), c2: p2.clone().add(d2.clone().multiplyScalar(t)) };
}

export function intersectRayPlane(origin: V3, dir: V3, planePoint: V3, n: V3): V3 | null {
  const denom = dir.dot(n);
  if (Math.abs(denom) < 1e-9) return null;
  const t = planePoint.clone().sub(origin).dot(n) / denom;
  if (t < 0) return null;
  return origin.clone().add(dir.clone().multiplyScalar(t));
}

/** Triangulate a planar polygon with holes. Returns flat index triples into [outer..., hole0..., hole1...]. */
export function triangulate(outer: V3[], holes: V3[][], normal?: V3): number[] {
  const n = normal ?? polygonNormal(outer);
  if (n.lengthSq() < 0.5) return [];
  const { u, v } = planeBasis(n);
  const o = outer[0];
  let c = to2D(outer, o, u, v);
  let hs = holes.map(h => to2D(h, o, u, v));
  // ShapeUtils expects outer CCW? It handles orientation internally (removes duplicates, fixes winding)
  const tris = THREE.ShapeUtils.triangulateShape(c, hs);
  const out: number[] = [];
  for (const t of tris) out.push(t[0], t[1], t[2]);
  // ensure winding matches normal
  const all = [...outer, ...holes.flat()];
  if (out.length >= 3) {
    // check first non-degenerate triangle orientation
    for (let i = 0; i < out.length; i += 3) {
      const a = all[out[i]], b = all[out[i + 1]], cc = all[out[i + 2]];
      const tn = b.clone().sub(a).cross(cc.clone().sub(a));
      if (tn.lengthSq() < 1e-16) continue;
      if (tn.dot(n) < 0) { for (let j = 0; j < out.length; j += 3) { const tmp = out[j + 1]; out[j + 1] = out[j + 2]; out[j + 2] = tmp; } }
      break;
    }
  }
  return out;
}

/** Offset a closed planar polygon by distance d (positive = inwards for CCW wrt normal). */
export function offsetPolygon(pts: V3[], normal: V3, d: number): V3[] {
  const n = pts.length; const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
    const e1 = cur.clone().sub(prev).normalize(), e2 = next.clone().sub(cur).normalize();
    const in1 = normal.clone().cross(e1).normalize(); // inward for CCW
    const in2 = normal.clone().cross(e2).normalize();
    const p1 = prev.clone().add(in1.clone().multiplyScalar(d));
    const p2 = cur.clone().add(in2.clone().multiplyScalar(d));
    const hit = lineLineClosest(p1, e1, p2, e2);
    if (!hit) out.push(cur.clone().add(in1.multiplyScalar(d)));
    else out.push(hit.c1);
  }
  return out;
}

export function isCollinear(a: V3, b: V3, c: V3, tol = 1e-6): boolean {
  return b.clone().sub(a).cross(c.clone().sub(a)).length() < tol * Math.max(1, b.distanceTo(a) * c.distanceTo(a));
}

export function pointOnSegmentInterior(p: V3, a: V3, b: V3, tol = LEN_EPS): boolean {
  const { point, t } = closestOnSegment(p, a, b);
  if (t <= 1e-9 || t >= 1 - 1e-9) return false;
  return point.distanceTo(p) < tol && p.distanceTo(a) > tol && p.distanceTo(b) > tol;
}

export function bbox(points: V3[]): THREE.Box3 { const b = new THREE.Box3(); for (const p of points) b.expandByPoint(p); return b; }
