import * as THREE from 'three';
import type { PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import { PointTool, planeFromInference, planeAxes, onPlane } from './base';
import { parseLengthList } from '../core/units';

type V3 = THREE.Vector3;

function parseCoords(s: string): { abs: boolean; v: V3 } | null {
  const m = s.trim().match(/^([\[<])\s*([^\]>]+)[\]>]$/); if (!m) return null;
  const parts = m[2].split(/[;,]/).map(x => parseFloat(x.trim().replace(',', '.')));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return { abs: m[1] === '[', v: new THREE.Vector3(parts[0], parts[1], parts[2]) };
}

// ===================================================================== Line
export class LineTool extends PointTool {
  id = 'line'; name = 'Linie'; vcbLabel = 'Länge'; cursor = 'crosshair';
  start: V3 | null = null; chainStart: V3 | null = null; pressed = false;
  status() { return this.start ? 'Klicken, um den Endpunkt festzulegen, oder Länge eingeben. | Pfeiltasten = Ableitungsrichtung fixieren ein/aus. Umschalt = Ableitung fixieren.' : 'Klicken, um den ersten Endpunkt festzulegen. | Pfeiltasten = Ableitungsrichtung fixieren ein/aus.'; }
  busy() { return !!this.start; }
  cancel() { this.start = null; this.chainStart = null; this.resetLocks(); this.ed.setVcb(''); }
  onMove(e: PEvt) { const r = this.pick(e, this.start); if (this.start) this.ed.setVcb(this.ed.fmt(this.start.distanceTo(r.point))); }
  onDown(e: PEvt) {
    this.downAt = { x: e.x, y: e.y };
    const r = this.pick(e, this.start);
    if (!this.start) { this.start = r.point.clone(); this.chainStart = this.start.clone(); this.ed.infer.track(this.start); this.pressed = true; return; }
    this.segment(r.point);
  }
  onUp(e: PEvt) { if (this.pressed && this.isDrag(e) && this.inf) this.segment(this.inf.point); this.pressed = false; }
  onDblClick() { this.cancel(); }
  segment(p: V3) {
    if (!this.start || p.distanceTo(this.start) < 1e-5) return;
    const ed = this.ed; const ents = ed.entities; const a = this.start.clone(), b = p.clone();
    const before = ents.faces.size;
    ed.commit('Linie', () => ents.addLine(ed.toLocal(a), ed.toLocal(b)));
    const closed = this.chainStart && b.distanceTo(this.chainStart) < 1e-5;
    this.ed.infer.track(b);
    if (ents.faces.size > before || closed) { this.start = null; this.chainStart = null; }
    else this.start = b;
    this.resetLocks(); ed.setVcb('');
  }
  onVcb(t: string) {
    if (!this.start) return false;
    const c = parseCoords(t);
    if (c) { this.segment(c.abs ? this.ed.toWorld(c.v) : this.start.clone().add(c.v)); return true; }
    const L = this.len(t); if (L == null) return false;
    let dir = this.inf ? this.inf.point.clone().sub(this.start) : new THREE.Vector3(1, 0, 0);
    if (dir.lengthSq() < 1e-12) dir.set(1, 0, 0);
    this.segment(this.start.clone().addScaledVector(dir.normalize(), L)); return true;
  }
  draw(o: Overlay) {
    if (this.start && this.inf) {
      const col = this.inf.axis && (this.inf.kind === 'axis' || this.inf.kind === 'locked' || this.inf.kind === 'aligned') ? ({ x: '#e00000', y: '#00a000', z: '#0000e0' } as any)[this.inf.axis] : '#000';
      o.line(this.start, this.inf.point, col, col === '#000' ? 1 : 1.6);
    }
    this.drawInference(o);
  }
}

// ===================================================================== Freehand
export class FreehandTool extends PointTool {
  id = 'freehand'; name = 'Freihand'; cursor = 'crosshair';
  pts: V3[] = []; plane: { p: V3; n: V3 } | null = null; lastScreen = { x: 0, y: 0 };
  status() { return 'Klicken und ziehen Sie, um eine Freihandkurve zu zeichnen.'; }
  busy() { return this.pts.length > 0; }
  cancel() { this.pts = []; this.plane = null; }
  onDown(e: PEvt) { const r = this.pick(e, null); const pl = planeFromInference(r); this.plane = { p: pl.p, n: pl.n }; this.pts = [r.point.clone()]; this.lastScreen = { x: e.x, y: e.y }; }
  onMove(e: PEvt) {
    if (!this.plane) { this.pick(e, null); return; }
    if (Math.hypot(e.x - this.lastScreen.x, e.y - this.lastScreen.y) < 5) return;
    const r = this.ed.viewer.ray(e.x, e.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.plane.n, this.plane.p), new THREE.Vector3());
    if (r) { this.pts.push(r); this.lastScreen = { x: e.x, y: e.y }; }
  }
  onUp() {
    if (this.pts.length < 2) { this.cancel(); return; }
    const pts = this.pts; const first = this.ed.viewer.project(pts[0]), last = this.ed.viewer.project(pts[pts.length - 1]);
    if (Math.hypot(first.x - last.x, first.y - last.y) < 12 && pts.length > 3) pts[pts.length - 1] = pts[0].clone();
    const ed = this.ed;
    ed.commit('Freihand', () => { for (let i = 0; i < pts.length - 1; i++) ed.entities.addLine(ed.toLocal(pts[i]), ed.toLocal(pts[i + 1])); });
    this.cancel();
  }
  draw(o: Overlay) { if (this.pts.length) o.polyline([...this.pts], '#000', 1.2); else this.drawInference(o); }
}

// ===================================================================== Rectangle
export class RectangleTool extends PointTool {
  id = 'rectangle'; name = 'Rechteck'; vcbLabel = 'Abmessungen'; cursor = 'crosshair';
  p0: V3 | null = null; plane: { p: V3; n: V3 } | null = null; u = new THREE.Vector3(1, 0, 0); v = new THREE.Vector3(0, 1, 0);
  w = 0; h = 0; special = ''; pressed = false;
  last: { p0: V3; n: V3; u: V3; v: V3 } | null = null;
  status() { return this.p0 ? 'Klicken, um die gegenüberliegende Ecke festzulegen, oder Länge und Breite eingeben (z. B. 2000; 1500).' : 'Klicken, um die erste Ecke festzulegen.'; }
  busy() { return !!this.p0; }
  cancel() { this.p0 = null; this.plane = null; this.ed.setVcb(''); }
  onDown(e: PEvt) {
    this.downAt = { x: e.x, y: e.y };
    if (!this.p0) {
      const r = this.pick(e, null);
      const pl = planeFromInference(r); this.p0 = r.point.clone(); this.plane = { p: pl.p, n: pl.n };
      const ax = planeAxes(pl.n); this.u = ax.u; this.v = ax.v; this.pressed = true; this.w = this.h = 0; return;
    }
    this.finish();
  }
  onUp(e: PEvt) { if (this.pressed && this.isDrag(e)) this.finish(); this.pressed = false; }
  onMove(e: PEvt) {
    if (!this.p0 || !this.plane) { this.pick(e, null); return; }
    const r = this.pick(e, this.p0, { plane: this.plane });
    const q = onPlane(r.point, this.plane.p, this.plane.n);
    const d = q.sub(this.p0);
    this.w = d.dot(this.u); this.h = d.dot(this.v); this.special = '';
    const aw = Math.abs(this.w), ah = Math.abs(this.h);
    if (aw > 1e-4 && ah > 1e-4) {
      if (Math.abs(aw - ah) / Math.max(aw, ah) < 0.035) { this.h = Math.sign(this.h) * aw; this.special = 'Quadrat'; }
      else { const g = 1.618; for (const [a, b] of [[aw, ah], [ah, aw]]) if (Math.abs(a / b - g) < 0.04) { this.special = 'Goldener Schnitt'; } }
    }
    this.ed.setVcb(`${this.ed.fmt(aw)}, ${this.ed.fmt(ah)}`);
  }
  corners(p0: V3, u: V3, v: V3, w: number, h: number) { return [p0.clone(), p0.clone().addScaledVector(u, w), p0.clone().addScaledVector(u, w).addScaledVector(v, h), p0.clone().addScaledVector(v, h)]; }
  finish() {
    if (!this.p0 || Math.abs(this.w) < 1e-4 || Math.abs(this.h) < 1e-4) return;
    const pts = this.corners(this.p0, this.u, this.v, this.w, this.h);
    this.create(pts, 'Rechteck');
    this.last = { p0: this.p0.clone(), n: this.plane!.n.clone(), u: this.u.clone(), v: this.v.clone() };
    this.p0 = null; this.plane = null;
  }
  create(pts: V3[], label: string) { const ed = this.ed; ed.commit(label, () => ed.entities.addLoop(pts.map(p => ed.toLocal(p)))); ed.setVcb(''); }
  onVcb(t: string) {
    const L = parseLengthList(t, this.ed.model.settings.units);
    if (L.length !== 2) return false;
    if (this.p0) {
      const w = L[0] ?? Math.abs(this.w), h = L[1] ?? Math.abs(this.h);
      this.w = Math.sign(this.w || 1) * w; this.h = Math.sign(this.h || 1) * h; this.finish(); return true;
    }
    if (this.last) { // resize the rectangle that was just drawn
      this.ed.undo();
      const { p0, u, v } = this.last; this.create(this.corners(p0, u, v, L[0] ?? 1, L[1] ?? 1), 'Rechteck'); return true;
    }
    return false;
  }
  draw(o: Overlay) {
    if (this.p0) {
      const pts = this.corners(this.p0, this.u, this.v, this.w, this.h);
      o.polyline(pts, '#0000ff', 1.4, true);
      if (this.special) { o.line(pts[0], pts[2], '#888', 1, [4, 3]); o.tooltip(this.ed.mouse.x, this.ed.mouse.y, this.special); }
      else this.drawInference(o);
    } else this.drawInference(o);
  }
}

// ===================================================================== Rotated rectangle (3 points)
export class RotatedRectangleTool extends PointTool {
  id = 'rotrect'; name = 'Gedrehtes Rechteck'; vcbLabel = 'Länge'; cursor = 'crosshair';
  pts: V3[] = []; cur: V3 | null = null;
  status() { return ['Wählen Sie die erste Ecke aus.', 'Wählen Sie die zweite Ecke (Länge und Richtung) aus.', 'Wählen Sie die Breite und den Winkel aus.'][this.pts.length]; }
  busy() { return this.pts.length > 0; }
  cancel() { this.pts = []; this.cur = null; }
  onMove(e: PEvt) {
    const from = this.pts[this.pts.length - 1] ?? null;
    const r = this.pick(e, from);
    this.cur = r.point.clone();
    if (this.pts.length === 1) this.ed.setVcb(this.ed.fmt(this.pts[0].distanceTo(r.point)));
    if (this.pts.length === 2) this.ed.setVcb(this.ed.fmt(this.thirdOffset().length()));
  }
  thirdOffset(): V3 {
    const [a, b] = this.pts; const ab = b.clone().sub(a).normalize();
    const q = this.cur!.clone().sub(b); return q.sub(ab.multiplyScalar(q.dot(ab)));
  }
  onDown(e: PEvt) {
    const from = this.pts[this.pts.length - 1] ?? null; const r = this.pick(e, from);
    this.pts.push(r.point.clone()); this.cur = r.point.clone();
    if (this.pts.length === 3) this.finish();
  }
  rect(): V3[] { const [a, b] = this.pts; const off = this.thirdOffset(); return [a, b, b.clone().add(off), a.clone().add(off)]; }
  finish() {
    this.pts.pop(); const pts = this.rect();
    if (pts[2].distanceTo(pts[1]) > 1e-4) { const ed = this.ed; ed.commit('Gedrehtes Rechteck', () => ed.entities.addLoop(pts.map(p => ed.toLocal(p)))); }
    this.cancel();
  }
  onVcb(t: string) {
    const L = this.len(t); if (L == null) return false;
    if (this.pts.length === 1 && this.cur) { const d = this.cur.clone().sub(this.pts[0]).normalize(); this.pts.push(this.pts[0].clone().addScaledVector(d, L)); return true; }
    if (this.pts.length === 2 && this.cur) { const off = this.thirdOffset().normalize().multiplyScalar(L); this.cur = this.pts[1].clone().add(off); this.pts.push(this.cur.clone()); this.finish(); return true; }
    return false;
  }
  draw(o: Overlay) {
    if (this.pts.length === 1 && this.cur) o.line(this.pts[0], this.cur, '#000', 1.2);
    if (this.pts.length === 2 && this.cur) { const r = this.rect(); o.fillPolygon(r, 'rgba(100,140,255,0.12)'); o.polyline(r, '#000', 1.2, true); }
    this.drawInference(o);
  }
}

// ===================================================================== Circle / Polygon
export class CircleTool extends PointTool {
  id = 'circle'; name = 'Kreis'; vcbLabel = 'Segmente'; cursor = 'crosshair';
  center: V3 | null = null; plane: { p: V3; n: V3 } | null = null; radius = 0; startDir = new THREE.Vector3(1, 0, 0);
  segments = 24; pressed = false; last: { c: V3; n: V3; d: V3; r: number } | null = null;
  constructor(ed: any, public polygon = false) { super(ed); if (polygon) { this.id = 'polygon'; this.name = 'Vieleck'; this.segments = 6; this.vcbLabel = 'Seiten'; } }
  status() { return this.center ? `Wählen Sie den Radius aus oder geben Sie ihn ein. (${this.segments} ${this.polygon ? 'Seiten' : 'Segmente'}; „12s“ ändert die Anzahl)` : `Wählen Sie den Mittelpunkt aus. Geben Sie z. B. „${this.polygon ? 8 : 48}s“ ein, um die ${this.polygon ? 'Seiten' : 'Segmente'} zu ändern.`; }
  activate() { this.ed.setVcb(String(this.segments)); }
  busy() { return !!this.center; }
  cancel() { this.center = null; this.plane = null; this.ed.setVcb(String(this.segments), this.polygon ? 'Seiten' : 'Segmente'); }
  onDown(e: PEvt) {
    this.downAt = { x: e.x, y: e.y };
    if (!this.center) { const r = this.pick(e, null); const pl = planeFromInference(r); this.center = r.point.clone(); this.plane = { p: pl.p, n: pl.n }; this.radius = 0; this.pressed = true; this.ed.ui.vcbLabel = 'Radius'; return; }
    this.finish();
  }
  onUp(e: PEvt) { if (this.pressed && this.isDrag(e)) this.finish(); this.pressed = false; }
  onMove(e: PEvt) {
    if (!this.center || !this.plane) { this.pick(e, null); return; }
    const r = this.pick(e, this.center, { plane: this.plane });
    const q = onPlane(r.point, this.plane.p, this.plane.n).sub(this.center);
    this.radius = q.length(); if (this.radius > 1e-6) this.startDir = q.normalize();
    this.ed.setVcb(this.ed.fmt(this.radius));
  }
  points(c: V3, n: V3, d: V3, r: number): V3[] {
    const out: V3[] = []; const v = n.clone().cross(d).normalize();
    for (let i = 0; i < this.segments; i++) { const a = i / this.segments * Math.PI * 2; out.push(c.clone().addScaledVector(d, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r)); }
    return out;
  }
  finish() {
    if (!this.center || !this.plane || this.radius < 1e-4) return;
    const pts = this.points(this.center, this.plane.n, this.startDir, this.radius);
    const ed = this.ed; ed.commit(this.name, () => ed.entities.addLoop(pts.map(p => ed.toLocal(p))));
    this.last = { c: this.center.clone(), n: this.plane.n.clone(), d: this.startDir.clone(), r: this.radius };
    this.center = null; this.plane = null; this.ed.setVcb(this.ed.fmt(this.last.r), 'Radius');
  }
  onVcb(t: string) {
    const s = t.trim();
    const seg = s.match(/^(\d+)\s*s$/i) || (!this.center && !this.last ? s.match(/^(\d+)$/) : null);
    if (seg) { this.segments = Math.max(3, Math.min(999, parseInt(seg[1]))); if (!this.center) this.ed.setVcb(String(this.segments)); this.ed.refreshStatus(); return true; }
    const L = this.len(t); if (L == null) return false;
    if (this.center) { this.radius = L; this.finish(); return true; }
    if (this.last) { this.ed.undo(); this.radius = L; this.center = this.last.c.clone(); this.plane = { p: this.last.c.clone(), n: this.last.n.clone() }; this.startDir = this.last.d.clone(); this.finish(); return true; }
    return false;
  }
  draw(o: Overlay) {
    if (this.center && this.plane && this.radius > 1e-6) {
      const pts = this.points(this.center, this.plane.n, this.startDir, this.radius);
      o.fillPolygon(pts, 'rgba(100,140,255,0.12)'); o.polyline(pts, '#000', 1.2, true);
      o.line(this.center, this.center.clone().addScaledVector(this.startDir, this.radius), '#555', 1, [3, 3]);
    }
    if (this.center) o.marker(this.center, 'center');
    this.drawInference(o);
  }
}

// ===================================================================== Arcs
function arcPoints(center: V3, n: V3, start: V3, angle: number, segs: number): V3[] {
  const pts: V3[] = []; const r0 = start.clone().sub(center);
  for (let i = 0; i <= segs; i++) pts.push(center.clone().add(r0.clone().applyAxisAngle(n, angle * i / segs)));
  return pts;
}
function signedAngle(a: V3, b: V3, n: V3) { return Math.atan2(a.clone().cross(b).dot(n), a.dot(b)); }

/** 2-point arc: start, end, bulge (SketchUp default arc tool). */
export class Arc2Tool extends PointTool {
  id = 'arc2'; name = 'Zweipunktbogen'; vcbLabel = 'Länge'; cursor = 'crosshair';
  a: V3 | null = null; b: V3 | null = null; n = new THREE.Vector3(0, 0, 1); bulge = 0; segments = 12; cur: V3 | null = null; half = false;
  status() { return !this.a ? 'Wählen Sie den Startpunkt des Bogens aus.' : !this.b ? 'Wählen Sie den Endpunkt aus.' : 'Wählen Sie die Wölbung aus oder geben Sie sie ein.'; }
  busy() { return !!this.a; }
  cancel() { this.a = this.b = null; this.cur = null; this.ed.setVcb('', 'Länge'); }
  onMove(e: PEvt) {
    if (!this.b) { const r = this.pick(e, this.a); this.cur = r.point.clone(); if (this.a) this.ed.setVcb(this.ed.fmt(this.a.distanceTo(r.point))); return; }
    const mid = this.a!.clone().add(this.b).multiplyScalar(0.5);
    const hit = this.ed.viewer.ray(e.x, e.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.n, mid), new THREE.Vector3());
    if (!hit) return;
    const bd = this.bulgeDir(); this.bulge = hit.sub(mid).dot(bd);
    const c = this.a!.distanceTo(this.b) / 2; this.half = Math.abs(Math.abs(this.bulge) - c) < c * 0.04;
    if (this.half) this.bulge = Math.sign(this.bulge) * c;
    this.ed.setVcb(this.ed.fmt(Math.abs(this.bulge)));
  }
  bulgeDir() { return this.n.clone().cross(this.b!.clone().sub(this.a!)).normalize(); }
  onDown(e: PEvt) {
    if (!this.a) { const r = this.pick(e, null); this.a = r.point.clone(); const pl = planeFromInference(r); this.n = pl.n; return; }
    if (!this.b) {
      const r = this.pick(e, this.a); if (r.point.distanceTo(this.a) < 1e-5) return; this.b = r.point.clone();
      const ch = this.b.clone().sub(this.a).normalize();
      if (Math.abs(ch.dot(this.n)) > 1e-3) { this.n = ch.clone().cross(new THREE.Vector3(0, 0, 1)); if (this.n.lengthSq() < 1e-6) this.n.set(1, 0, 0); this.n.normalize(); }
      this.ed.ui.vcbLabel = 'Wölbung'; return;
    }
    this.finish();
  }
  points(): V3[] {
    const a = this.a!, b = this.b!; const c = a.distanceTo(b) / 2; const s = this.bulge;
    if (Math.abs(s) < 1e-6) return [a, b];
    const R = (c * c + s * s) / (2 * Math.abs(s));
    const mid = a.clone().add(b).multiplyScalar(0.5); const bd = this.bulgeDir().multiplyScalar(Math.sign(s));
    const center = mid.clone().addScaledVector(bd, Math.abs(s) - R);
    const total = 4 * Math.atan(Math.abs(s) / c);
    const ang = signedAngle(a.clone().sub(center), b.clone().sub(center), this.n);
    const dir = Math.sign(ang) || 1;
    // choose rotation direction that passes through the bulge point
    let theta = dir * total; const test = a.clone().sub(center).applyAxisAngle(this.n, theta / 2).add(center);
    if (test.distanceTo(mid.clone().addScaledVector(bd, Math.abs(s))) > 1e-3 * Math.max(1, R)) theta = -theta;
    return arcPoints(center, this.n, a, theta, this.segments);
  }
  finish() {
    const pts = this.points(); const ed = this.ed;
    ed.commit(this.name, () => { for (let i = 0; i < pts.length - 1; i++) ed.entities.addLine(ed.toLocal(pts[i]), ed.toLocal(pts[i + 1])); });
    this.cancel();
  }
  onVcb(t: string) {
    const s = t.trim().match(/^(\d+)\s*s$/i); if (s) { this.segments = Math.max(2, parseInt(s[1])); return true; }
    const L = this.len(t); if (L == null) return false;
    if (this.a && !this.b && this.cur) { const d = this.cur.clone().sub(this.a).normalize(); this.b = this.a.clone().addScaledVector(d, L); this.ed.ui.vcbLabel = 'Wölbung'; return true; }
    if (this.b) { this.bulge = Math.sign(this.bulge || 1) * L; this.finish(); return true; }
    return false;
  }
  draw(o: Overlay) {
    if (this.a && !this.b && this.cur) o.line(this.a, this.cur, '#000', 1);
    if (this.b) { o.polyline(this.points(), this.half ? '#c000c0' : '#000', 1.5); if (this.half) o.tooltip(this.ed.mouse.x, this.ed.mouse.y, 'Halbkreis'); }
    if (!this.b) this.drawInference(o);
  }
}

/** Center arc / pie: center, start point, end angle. */
export class ArcCenterTool extends PointTool {
  id = 'arc'; name = 'Bogen'; vcbLabel = 'Radius'; cursor = 'crosshair';
  c: V3 | null = null; s: V3 | null = null; n = new THREE.Vector3(0, 0, 1); angle = 0; segments = 12; cur: V3 | null = null;
  constructor(ed: any, public pie = false) { super(ed); if (pie) { this.id = 'pie'; this.name = 'Kuchen'; } }
  status() { return !this.c ? 'Wählen Sie den Mittelpunkt aus.' : !this.s ? 'Wählen Sie den Startpunkt (Radius) aus.' : 'Wählen Sie den Endwinkel aus.'; }
  busy() { return !!this.c; }
  cancel() { this.c = this.s = null; this.angle = 0; this.ed.setVcb('', 'Radius'); }
  onMove(e: PEvt) {
    if (!this.s) { const r = this.pick(e, this.c); this.cur = r.point.clone(); if (this.c) this.ed.setVcb(this.ed.fmt(onPlane(r.point, this.c, this.n).distanceTo(this.c))); return; }
    const hit = this.ed.viewer.ray(e.x, e.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.n, this.c!), new THREE.Vector3()); if (!hit) return;
    let a = signedAngle(this.s.clone().sub(this.c!), hit.sub(this.c!), this.n);
    // continue past 180° smoothly
    if (this.angle > Math.PI / 2 && a < 0) a += Math.PI * 2; else if (this.angle < -Math.PI / 2 && a > 0) a -= Math.PI * 2;
    this.angle = a; this.ed.setVcb((a * 180 / Math.PI).toFixed(1).replace('.', ',') + '°');
  }
  onDown(e: PEvt) {
    if (!this.c) { const r = this.pick(e, null); this.c = r.point.clone(); this.n = planeFromInference(r).n; return; }
    if (!this.s) { const r = this.pick(e, this.c); const p = onPlane(r.point, this.c, this.n); if (p.distanceTo(this.c) < 1e-5) return; this.s = p; this.ed.ui.vcbLabel = 'Winkel'; return; }
    this.finish();
  }
  points() { return arcPoints(this.c!, this.n, this.s!, this.angle, Math.max(2, Math.ceil(this.segments * Math.abs(this.angle) / Math.PI))); }
  finish() {
    if (Math.abs(this.angle) < 1e-4) return;
    const pts = this.points(); const ed = this.ed; const c = this.c!;
    ed.commit(this.name, () => {
      const E = ed.entities;
      for (let i = 0; i < pts.length - 1; i++) E.addLine(ed.toLocal(pts[i]), ed.toLocal(pts[i + 1]));
      if (this.pie) { E.addLine(ed.toLocal(c), ed.toLocal(pts[0])); E.addLine(ed.toLocal(pts[pts.length - 1]), ed.toLocal(c)); }
    });
    this.cancel();
  }
  onVcb(t: string) {
    const sg = t.trim().match(/^(\d+)\s*s$/i); if (sg) { this.segments = Math.max(2, parseInt(sg[1])); return true; }
    if (this.c && !this.s && this.cur) { const L = this.len(t); if (L == null) return false; let d = onPlane(this.cur, this.c, this.n).sub(this.c); if (d.lengthSq() < 1e-10) d = planeAxes(this.n).u; this.s = this.c.clone().addScaledVector(d.normalize(), L); this.ed.ui.vcbLabel = 'Winkel'; return true; }
    if (this.s) { const a = parseFloat(t.replace(',', '.')); if (isNaN(a)) return false; this.angle = a * Math.PI / 180; this.finish(); return true; }
    return false;
  }
  draw(o: Overlay) {
    if (this.c && !this.s && this.cur) { const p = onPlane(this.cur, this.c, this.n); o.line(this.c, p, '#555', 1, [3, 3]); o.circle3D(this.c, this.n, p.distanceTo(this.c), '#9aa', 1, 64, [2, 3]); }
    if (this.s) { const pts = this.points(); o.polyline(pts, '#000', 1.5); if (this.pie) { o.line(this.c!, pts[0], '#000', 1.2); o.line(this.c!, pts[pts.length - 1], '#000', 1.2); } else o.line(this.c!, this.s, '#888', 1, [3, 3]); }
    if (this.c) o.marker(this.c, 'center');
    if (!this.s) this.drawInference(o);
  }
}

/** 3-point arc */
export class Arc3Tool extends PointTool {
  id = 'arc3'; name = 'Dreipunktbogen'; cursor = 'crosshair'; vcbLabel = 'Länge';
  pts: V3[] = []; cur: V3 | null = null; segments = 12;
  status() { return ['Wählen Sie den Startpunkt aus.', 'Wählen Sie einen zweiten Punkt auf dem Bogen aus.', 'Wählen Sie den Endpunkt aus.'][this.pts.length]; }
  busy() { return this.pts.length > 0; }
  cancel() { this.pts = []; this.cur = null; }
  onMove(e: PEvt) { const r = this.pick(e, this.pts[this.pts.length - 1] ?? null); this.cur = r.point.clone(); }
  onDown(e: PEvt) { const r = this.pick(e, this.pts[this.pts.length - 1] ?? null); this.pts.push(r.point.clone()); if (this.pts.length === 3) this.finish(); }
  arc(p1: V3, p2: V3, p3: V3): V3[] | null {
    const a = p2.clone().sub(p1), b = p3.clone().sub(p1); const n = a.clone().cross(b); if (n.length() < 1e-9) return null;
    const n2 = n.lengthSq();
    const c = p1.clone().add(b.clone().multiplyScalar(a.lengthSq()).cross(n).add(n.clone().cross(a).multiplyScalar(b.lengthSq())).multiplyScalar(1 / (2 * n2)));
    const nn = n.clone().normalize();
    let ang = signedAngle(p1.clone().sub(c), p3.clone().sub(c), nn); if (ang < 0) ang += Math.PI * 2;
    return arcPoints(c, nn, p1, ang, Math.max(3, Math.ceil(this.segments * ang / Math.PI)));
  }
  finish() {
    const pts = this.arc(this.pts[0], this.pts[1], this.pts[2]); this.pts = [];
    if (!pts) return; const ed = this.ed;
    ed.commit(this.name, () => { for (let i = 0; i < pts.length - 1; i++) ed.entities.addLine(ed.toLocal(pts[i]), ed.toLocal(pts[i + 1])); });
  }
  draw(o: Overlay) {
    if (this.pts.length === 1 && this.cur) o.line(this.pts[0], this.cur, '#000', 1);
    if (this.pts.length === 2 && this.cur) { const a = this.arc(this.pts[0], this.pts[1], this.cur); if (a) o.polyline(a, '#000', 1.5); else o.polyline([...this.pts, this.cur], '#000', 1); }
    this.drawInference(o);
  }
}
