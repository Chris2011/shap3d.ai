import * as THREE from 'three';
import type { Editor, PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import type { EntityRef, Entities } from '../core/model';
import { PointTool, onPlane, planeAxes } from './base';
import { AXES, AXIS_COLOR, closestOnLineToRay } from '../engine/inference';
import { parseArray, parseLengthList, formatAngle } from '../core/units';
import { offsetPolygon, polygonNormal, planeBasis, to2D, pointInPolygon2D, distPointSegment2D } from '../core/geometry';

type V3 = THREE.Vector3;

/** Applies a transform live to selected entities, starting from their original state. */
export class LiveTransform {
  verts = new Map<number, V3>();
  insts = new Map<number, THREE.Matrix4>();
  constructor(public ents: Entities, public refs: EntityRef[]) {
    for (const v of ents.collectVertices(refs)) this.verts.set(v, ents.pos(v).clone());
    for (const r of refs) if (r.kind === 'instance') { const i = ents.instances.get(r.id); if (i) this.insts.set(r.id, i.matrix.clone()); }
  }
  apply(m: THREE.Matrix4) {
    for (const [v, p] of this.verts) this.ents.vertices.get(v)?.p.copy(p).applyMatrix4(m);
    for (const [id, mm] of this.insts) { const i = this.ents.instances.get(id); if (i) i.matrix.copy(mm).premultiply(m); }
    this.ents.invalidateHash();
  }
  finish() { this.ents.weld(this.verts.keys()); }
  has(v: number) { return this.verts.has(v); }
}

/** Shared selection-or-hover behaviour of Move/Rotate/Scale. */
function hoverPick(ed: Editor, e: { x: number; y: number }): EntityRef | null {
  const eh = ed.viewer.pickEdge(e.x, e.y, 6);
  if (eh) { const r = ed.refFromPick(eh.rec.ctx.path, 'edge', eh.rec.eid); if (r) return r; }
  const fh = ed.viewer.pickFace(e.x, e.y);
  if (fh) return ed.refFromPick(fh.ctx.path, 'face', fh.fid);
  return null;
}

function contextFilters(ed: Editor, lt: LiveTransform | null) {
  const ents = ed.entities; const ids = new Set(lt ? [...lt.insts.keys()] : []);
  const pathHit = (path: any[]) => path.some(p => ids.has(p.id));
  return {
    filterVert: (v: any) => !(lt && ((v.ctx.entities === ents && lt.has(v.vid)) || pathHit(v.ctx.path))),
    filterEdge: (r: any) => { if (!lt) return true; if (pathHit(r.ctx.path)) return false; if (r.ctx.entities !== ents) return true; const e = ents.edges.get(r.eid); return !(e && lt.has(e.a) && lt.has(e.b)); },
    filterFace: (ctx: any, fid: number) => { if (!lt) return true; if (pathHit(ctx.path)) return false; if (ctx.entities !== ents) return true; const f = ents.faces.get(fid); return !(f && ents.faceVertices(f).every(v => lt.has(v))); },
  };
}

// ===================================================================== Push/Pull
export class PushPullTool extends PointTool {
  id = 'pushpull'; name = 'Drücken/Ziehen'; vcbLabel = 'Abstand'; cursor = 'crosshair';
  fid: number | null = null; start: V3 | null = null; n = new THREE.Vector3(); d = 0; pressed = false;
  last: { fid: number; d: number; created: number | null } | null = null;
  status() { return this.fid != null ? 'Klicken, um die Distanz festzulegen, oder Abstand eingeben. | Doppelklick = letzte Distanz wiederholen.' : 'Klicken, um die zu drückende oder zu ziehende Fläche auszuwählen. | Doppelklick = letzte Distanz wiederholen.'; }
  busy() { return this.fid != null; }
  cancel() { this.fid = null; this.start = null; this.ed.setHover(null); this.ed.setVcb(''); }
  hoverFace(e: { x: number; y: number }) {
    const ed = this.ed; const fh = ed.viewer.pickFace(e.x, e.y, (ctx) => ctx.path.length === ed.activePath.length && ed.inContext(ctx.path));
    return fh;
  }
  onMove(e: PEvt) {
    const ed = this.ed;
    if (this.fid == null) { const fh = this.hoverFace(e); ed.setHover(fh ? { kind: 'face', id: fh.fid } : null); return; }
    const f = ed.entities.faces.get(this.fid); if (!f) return;
    const own = new Set(ed.entities.faceVertices(f));
    const r = this.pick(e, this.start, { lock: this.n, filterVert: (v: any) => !(v.ctx.entities === ed.entities && own.has(v.vid)) } as any);
    let p = closestOnLineToRay(this.start!, this.n, ed.viewer.ray(e.x, e.y));
    const vh = ed.viewer.pickVertex(e.x, e.y, 10, v => !(v.ctx.entities === ed.entities && own.has(v.vid)));
    if (vh) p = vh.rec.p.clone(); else { const fh = ed.viewer.pickFace(e.x, e.y, (ctx, fid) => !(ctx.entities === ed.entities && fid === this.fid)); if (fh && Math.abs(fh.normal.dot(this.n)) > 0.99) p = fh.point; }
    this.d = p.clone().sub(this.start!).dot(this.n);
    this.inf = { ...r, label: vh ? 'Endpunkt' : '', point: this.start!.clone().addScaledVector(this.n, this.d) };
    ed.setVcb(ed.fmt(Math.abs(this.d)));
  }
  onDown(e: PEvt) {
    const ed = this.ed; this.downAt = { x: e.x, y: e.y };
    if (this.fid == null) {
      const fh = this.hoverFace(e); if (!fh) return;
      this.fid = fh.fid; this.start = fh.point.clone(); this.n = fh.normal.clone().normalize(); this.d = 0; this.pressed = true; ed.setHover({ kind: 'face', id: fh.fid });
      return;
    }
    this.finish(this.d);
  }
  onUp(e: PEvt) { if (this.pressed && this.isDrag(e)) this.finish(this.d); this.pressed = false; }
  onDblClick(e: PEvt) {
    if (!this.ed.lastPushPull) return;
    const fh = this.hoverFace(e); if (!fh) return;
    this.cancel(); this.fid = fh.fid; this.start = fh.point.clone(); this.n = fh.normal.clone().normalize();
    // use the face's own direction like SketchUp (repeat in the same sense)
    this.finish(this.ed.lastPushPull);
  }
  localDistance(d: number): number {
    const ed = this.ed; const f = ed.entities.faces.get(this.fid!)!;
    const nl = ed.entities.faceNormal(f);
    const a = ed.toLocal(this.start!), b = ed.toLocal(this.start!.clone().addScaledVector(this.n, d));
    return b.sub(a).dot(nl);
  }
  finish(d: number) {
    const ed = this.ed; if (this.fid == null || Math.abs(d) < 1e-6) { if (this.fid != null && Math.abs(d) < 1e-6 && !this.pressed) this.cancel(); return; }
    const fid = this.fid; const dl = this.localDistance(d);
    const created = ed.commit('Drücken/Ziehen', () => ed.entities.pushPull(fid, dl));
    ed.lastPushPull = d; this.last = { fid, d: dl, created };
    this.cancel(); ed.setVcb(ed.fmt(Math.abs(d)));
  }
  onVcb(t: string) {
    const L = this.len(t); if (L == null) return false;
    if (this.fid != null) { this.finish(Math.sign(this.d || 1) * L); return true; }
    if (this.last) { // change the last push/pull
      const ed = this.ed; const sign = Math.sign(this.last.d) || 1; ed.undo();
      const fid = this.last.fid; if (!ed.entities.faces.has(fid)) return false;
      const created = ed.commit('Drücken/Ziehen', () => ed.entities.pushPull(fid, sign * L));
      this.last = { fid, d: sign * L, created }; ed.lastPushPull = L * sign; return true;
    }
    return false;
  }
  draw(o: Overlay) {
    const ed = this.ed;
    if (this.fid != null && this.start) {
      const f = ed.entities.faces.get(this.fid); if (!f) return;
      const off = this.n.clone().multiplyScalar(this.d);
      for (const l of ed.entities.loops(f)) {
        const base = l.map(v => ed.toWorld(ed.entities.pos(v)));
        const top = base.map(p => p.clone().add(off));
        o.fillPolygon(top, 'rgba(90,120,255,0.18)');
        o.polyline(top, '#000', 1.2, true);
        for (let i = 0; i < base.length; i++) o.line(base[i], top[i], '#000', 1);
      }
      if (this.inf?.label) o.tooltip(ed.mouse.x, ed.mouse.y, this.inf.label);
    }
  }
}

// ===================================================================== Offset
export class OffsetTool extends PointTool {
  id = 'offset'; name = 'Versatz'; vcbLabel = 'Abstand'; cursor = 'crosshair';
  fid: number | null = null; d = 0; pressed = false;
  status() { return this.fid != null ? 'Bewegen Sie den Cursor, um den Versatz festzulegen, oder geben Sie eine Distanz ein.' : 'Wählen Sie eine Fläche für den Versatz aus.'; }
  busy() { return this.fid != null; }
  cancel() { this.fid = null; this.ed.setHover(null); }
  face(e: { x: number; y: number }) { const ed = this.ed; return ed.viewer.pickFace(e.x, e.y, ctx => ctx.path.length === ed.activePath.length && ed.inContext(ctx.path)); }
  worldLoop(): V3[] { const ed = this.ed; const f = ed.entities.faces.get(this.fid!)!; return f.outer.map(v => ed.toWorld(ed.entities.pos(v))); }
  onMove(e: PEvt) {
    const ed = this.ed;
    if (this.fid == null) { const fh = this.face(e); ed.setHover(fh ? { kind: 'face', id: fh.fid } : null); return; }
    const pts = this.worldLoop(); const n = polygonNormal(pts);
    const hit = ed.viewer.ray(e.x, e.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, pts[0]), new THREE.Vector3()); if (!hit) return;
    const { u, v } = planeBasis(n); const P = to2D([hit], pts[0], u, v)[0]; const poly = to2D(pts, pts[0], u, v);
    let dist = Infinity; for (let i = 0; i < poly.length; i++) dist = Math.min(dist, distPointSegment2D(P, poly[i], poly[(i + 1) % poly.length]));
    this.d = pointInPolygon2D(P, poly) ? dist : -dist;
    ed.setVcb(ed.fmt(Math.abs(this.d)));
  }
  onDown(e: PEvt) {
    this.downAt = { x: e.x, y: e.y };
    if (this.fid == null) {
      const sel = this.ed.selected().filter(r => r.kind === 'face');
      const fh = this.face(e); if (!fh) return;
      this.fid = sel.length === 1 ? sel[0].id : fh.fid; this.d = 0; this.pressed = true; return;
    }
    this.finish(this.d);
  }
  onUp(e: PEvt) { if (this.pressed && this.isDrag(e)) this.finish(this.d); this.pressed = false; }
  onDblClick(e: PEvt) { const fh = this.face(e); if (fh && this.ed.lastOffset) { this.fid = fh.fid; this.finish(this.ed.lastOffset); } }
  finish(d: number) {
    if (this.fid == null || Math.abs(d) < 1e-5) return;
    const ed = this.ed; const fid = this.fid;
    ed.commit('Versatz', () => {
      const f = ed.entities.faces.get(fid)!; const pts = ed.entities.facePoints(f);
      const off = offsetPolygon(pts, ed.entities.faceNormal(f), d);
      ed.entities.addLoop(off);
    });
    ed.lastOffset = d; this.cancel();
  }
  onVcb(t: string) { const L = this.len(t); if (L == null || this.fid == null) return false; this.finish(Math.sign(this.d || 1) * L); return true; }
  draw(o: Overlay) {
    if (this.fid == null) return;
    const pts = this.worldLoop(); const n = polygonNormal(pts);
    o.polyline(offsetPolygon(pts, n, this.d), '#000', 1.3, true);
  }
}

// ===================================================================== Move
export class MoveTool extends PointTool {
  id = 'move'; name = 'Verschieben'; vcbLabel = 'Abstand'; cursor = 'move';
  start: V3 | null = null; lt: LiveTransform | null = null; copy = false; pressed = false; delta = new THREE.Vector3();
  lastCopy: { refs: EntityRef[]; delta: V3; orig: EntityRef[] } | null = null;
  status() { return this.start ? `Klicken, um den Zielpunkt festzulegen, oder Abstand eingeben. ${this.copy ? '(Kopie) ' : ''}| Strg = Kopie ein/aus. Pfeiltasten = Ableitungsrichtung fixieren.` : 'Klicken, um den Startpunkt festzulegen. | Strg = Kopie ein/aus.'; }
  busy() { return !!this.start; }
  cancel() { if (this.start) this.ed.abortOp(); this.start = null; this.lt = null; this.resetLocks(); this.ed.setHover(null); }
  activate() { this.copy = false; }
  refs(): EntityRef[] { return this.ed.selected(); }
  onMove(e: PEvt) {
    const ed = this.ed;
    if (!this.start) {
      this.pick(e, null);
      if (!ed.selected().length) ed.setHover(hoverPick(ed, e));
      return;
    }
    const r = this.pick(e, this.start, contextFilters(ed, this.lt));
    this.apply(r.point.clone().sub(this.start));
  }
  apply(delta: V3) {
    const ed = this.ed; this.delta.copy(delta);
    const a = ed.toLocal(this.start!), b = ed.toLocal(this.start!.clone().add(delta));
    const m = new THREE.Matrix4().makeTranslation(b.x - a.x, b.y - a.y, b.z - a.z);
    this.lt!.apply(m); ed.invalidate();
    ed.setVcb(ed.fmt(delta.length()));
  }
  begin(p: V3) {
    const ed = this.ed;
    if (!ed.selected().length && ed.hover) ed.select([ed.hover]);
    if (!ed.selected().length) return;
    ed.setHover(null);
    this.start = p.clone();
    ed.beginOp(this.copy ? 'Kopieren' : 'Verschieben');
    let refs = this.refs();
    const orig = refs;
    if (this.copy) { refs = ed.entities.copy(refs, new THREE.Matrix4(), ed.model); ed.select(refs); }
    this.lt = new LiveTransform(ed.entities, refs);
    this.lastCopy = this.copy ? { refs, delta: new THREE.Vector3(), orig } : null;
  }
  onDown(e: PEvt) {
    this.downAt = { x: e.x, y: e.y };
    if (!this.start) { const r = this.pick(e, null); this.begin(r.point); this.pressed = true; return; }
    this.finish();
  }
  onUp(e: PEvt) { if (this.pressed && this.isDrag(e) && this.start) this.finish(); this.pressed = false; }
  finish() {
    if (!this.start || !this.lt) return;
    const ed = this.ed;
    if (this.delta.lengthSq() < 1e-12 && !this.copy) { this.cancel(); return; }
    this.lt.finish(); ed.endOp();
    if (this.lastCopy) this.lastCopy.delta = this.delta.clone();
    this.start = null; this.lt = null; this.resetLocks(); ed.invalidate();
  }
  onKey(e: KeyboardEvent, down: boolean) {
    if (e.key === 'Control' && down && !e.repeat) {
      this.copy = !this.copy;
      if (this.start) { const s = this.start, d = this.delta.clone(); this.ed.abortOp(); this.start = null; this.lt = null; this.begin(s); this.apply(d); }
      this.ed.refreshStatus(); return true;
    }
    return super.onKey(e, down);
  }
  onVcb(t: string) {
    const ed = this.ed;
    const arr = parseArray(t);
    if (arr && !this.start && this.lastCopy) {
      const { orig, delta } = this.lastCopy; const n = arr.n; if (n < 1) return false;
      ed.undo();
      ed.commit(arr.kind === 'multiply' ? 'Kopieren (Reihe)' : 'Kopieren (Teilen)', () => {
        const step = arr.kind === 'multiply' ? delta.clone() : delta.clone().multiplyScalar(1 / n);
        const all: EntityRef[] = [];
        for (let i = 1; i <= n; i++) {
          const a = ed.toLocal(new THREE.Vector3()), b = ed.toLocal(step.clone().multiplyScalar(i));
          const refs = ed.entities.copy(orig, new THREE.Matrix4().makeTranslation(b.x - a.x, b.y - a.y, b.z - a.z), ed.model);
          ed.entities.weld(ed.entities.collectVertices(refs)); all.push(...refs);
        }
        ed.select(all);
      });
      this.lastCopy = null; return true;
    }
    if (!this.start) return false;
    const L = parseLengthList(t, ed.model.settings.units);
    if (L.length === 3 && L.every(x => x != null)) { this.apply(new THREE.Vector3(L[0]!, L[1]!, L[2]!)); this.finish(); return true; }
    const d = this.len(t); if (d == null) return false;
    const dir = this.delta.lengthSq() > 1e-12 ? this.delta.clone().normalize() : new THREE.Vector3(1, 0, 0);
    this.apply(dir.multiplyScalar(d)); this.finish(); return true;
  }
  draw(o: Overlay) {
    if (this.start && this.inf) { const col = this.inf.axis ? AXIS_COLOR[this.inf.axis] : '#000'; o.line(this.start, this.start.clone().add(this.delta), col, 1.2, [4, 3]); }
    this.drawInference(o);
    if (this.copy) { const c = o.ctx; c.font = 'bold 14px sans-serif'; c.fillStyle = '#000'; c.fillText('+', this.ed.mouse.x + 12, this.ed.mouse.y - 6); }
  }
}

// ===================================================================== Rotate
export class RotateTool extends PointTool {
  id = 'rotate'; name = 'Drehen'; vcbLabel = 'Winkel'; cursor = 'crosshair';
  center: V3 | null = null; ref: V3 | null = null; n = new THREE.Vector3(0, 0, 1); angle = 0; lt: LiveTransform | null = null; copy = false; normalLock: 'x' | 'y' | 'z' | null = null;
  hoverN = new THREE.Vector3(0, 0, 1); hoverP: V3 | null = null;
  lastCopy: { orig: EntityRef[]; angle: number; center: V3; n: V3 } | null = null;
  status() { return !this.center ? 'Wählen Sie den Drehpunkt aus. Pfeiltasten richten den Winkelmesser aus.' : !this.ref ? 'Wählen Sie den Startpunkt des Drehwinkels aus.' : 'Wählen Sie den Drehwinkel aus oder geben Sie ihn ein. Strg = Kopie.'; }
  busy() { return !!this.center; }
  cancel() { if (this.lt) this.ed.abortOp(); this.center = this.ref = null; this.lt = null; this.angle = 0; this.ed.setHover(null); }
  onKey(e: KeyboardEvent, down: boolean) {
    if (down && ['ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key) && !this.ref) { const a = e.key === 'ArrowUp' ? 'z' : e.key === 'ArrowRight' ? 'x' : 'y'; this.normalLock = this.normalLock === a ? null : a; if (this.center) this.n = AXES[a].clone(); return true; }
    if (e.key === 'Control' && down && !e.repeat) { this.copy = !this.copy; return true; }
    return super.onKey(e, down);
  }
  planeNormal(): V3 { if (this.normalLock) return AXES[this.normalLock].clone(); return this.hoverN.clone(); }
  onMove(e: PEvt) {
    const ed = this.ed;
    if (!this.center) {
      const r = this.pick(e, null); this.hoverP = r.point.clone();
      this.hoverN = r.face && r.kind === 'face' ? r.face.normal.clone().normalize() : new THREE.Vector3(0, 0, 1);
      if (!ed.selected().length) ed.setHover(hoverPick(ed, e));
      return;
    }
    if (!this.ref) { const r = this.pick(e, this.center); this.hoverP = onPlane(r.point, this.center, this.n); return; }
    const hit = ed.viewer.ray(e.x, e.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.n, this.center), new THREE.Vector3());
    let target = hit;
    const r = this.pick(e, this.center, contextFilters(ed, this.lt));
    if (r.kind === 'endpoint' || r.kind === 'midpoint' || r.kind === 'edge') target = onPlane(r.point, this.center, this.n);
    if (!target) return;
    const a = this.ref.clone().sub(this.center), b = target.sub(this.center);
    let ang = Math.atan2(a.clone().cross(b).dot(this.n), a.dot(b));
    const step = Math.PI / 12; const snap = Math.round(ang / step) * step;
    if (Math.abs(ang - snap) < THREE.MathUtils.degToRad(2.5) && !(r.kind === 'endpoint')) ang = snap;
    this.applyAngle(ang);
  }
  matrix(angle: number): THREE.Matrix4 {
    const ed = this.ed; const c = this.center!;
    const w = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationAxis(this.n, angle)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    return ed.contextInverse.multiply(w).multiply(ed.contextMatrix);
  }
  applyAngle(a: number) { this.angle = a; this.lt?.apply(this.matrix(a)); this.ed.invalidate(); this.ed.setVcb(formatAngle(a)); }
  onDown(e: PEvt) {
    const ed = this.ed;
    if (!this.center) {
      if (!ed.selected().length && ed.hover) ed.select([ed.hover]);
      if (!ed.selected().length) { ed.toast('Wählen Sie zuerst Objekte aus.'); return; }
      ed.setHover(null);
      const r = this.pick(e, null); this.center = r.point.clone(); this.n = this.planeNormal(); return;
    }
    if (!this.ref) {
      const r = this.pick(e, this.center); const p = onPlane(r.point, this.center, this.n); if (p.distanceTo(this.center) < 1e-5) return;
      this.ref = p; ed.beginOp(this.copy ? 'Drehen (Kopie)' : 'Drehen');
      let refs = ed.selected(); const orig = refs;
      if (this.copy) { refs = ed.entities.copy(refs, new THREE.Matrix4(), ed.model); ed.select(refs); }
      this.lt = new LiveTransform(ed.entities, refs);
      this.lastCopy = this.copy ? { orig, angle: 0, center: this.center.clone(), n: this.n.clone() } : null;
      return;
    }
    this.finish();
  }
  finish() {
    const ed = this.ed; if (!this.lt) return;
    this.lt.finish(); ed.endOp(); if (this.lastCopy) this.lastCopy.angle = this.angle;
    this.center = this.ref = null; this.lt = null; ed.invalidate();
  }
  onVcb(t: string) {
    const ed = this.ed; const arr = parseArray(t);
    if (arr && !this.center && this.lastCopy) {
      const { orig, angle, center, n } = this.lastCopy; ed.undo();
      ed.commit('Drehen (Reihe)', () => {
        const all: EntityRef[] = [];
        for (let i = 1; i <= arr.n; i++) {
          this.center = center; this.n = n;
          const m = this.matrix(arr.kind === 'multiply' ? angle * i : angle * i / arr.n);
          const refs = ed.entities.copy(orig, m, ed.model); ed.entities.weld(ed.entities.collectVertices(refs)); all.push(...refs);
        }
        this.center = null; ed.select(all);
      });
      this.lastCopy = null; return true;
    }
    if (!this.ref) return false;
    const a = parseFloat(t.replace(',', '.').replace('°', '')); if (isNaN(a)) return false;
    this.applyAngle(a * Math.PI / 180); this.finish(); return true;
  }
  draw(o: Overlay) {
    const ed = this.ed;
    const c = this.center ?? this.hoverP; if (!c) return;
    const n = this.center ? this.n : this.planeNormal();
    const R = ed.viewer.worldPerPixel(c) * 55;
    const col = Math.abs(n.z) > 0.99 ? '#0000e0' : Math.abs(n.x) > 0.99 ? '#e00000' : Math.abs(n.y) > 0.99 ? '#00a000' : '#555';
    o.circle3D(c, n, R, col, 1.5, 64);
    // ticks every 15°
    const { u, v } = planeAxes(n);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const d = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a)); o.line(c.clone().addScaledVector(d, R * (i % 6 === 0 ? 0.78 : 0.88)), c.clone().addScaledVector(d, R), col, 1); }
    o.marker(c, 'center');
    if (this.center && (this.ref || this.hoverP)) {
      const r = this.ref ?? this.hoverP!; o.line(this.center, r, '#555', 1, [4, 3]);
      if (this.ref) { const cur = this.ref.clone().sub(this.center).applyAxisAngle(this.n, this.angle).add(this.center); o.line(this.center, cur, '#000', 1.2); }
    }
    if (this.copy) { const cx = o.ctx; cx.font = 'bold 14px sans-serif'; cx.fillStyle = '#000'; cx.fillText('+', ed.mouse.x + 12, ed.mouse.y - 6); }
    if (!this.ref) this.drawInference(o);
  }
}

// ===================================================================== Scale
interface Grip { t: V3; world: V3 }
export class ScaleTool extends PointTool {
  id = 'scale'; name = 'Skalieren'; vcbLabel = 'Skalierung'; cursor = 'crosshair';
  box: THREE.Box3 | null = null; grips: Grip[] = []; hot: Grip | null = null; active: Grip | null = null;
  anchor = new THREE.Vector3(); mask = new THREE.Vector3(); lt: LiveTransform | null = null; factor = new THREE.Vector3(1, 1, 1); pressed = false;
  status() { return this.active ? 'Ziehen Sie, um zu skalieren, oder geben Sie einen Faktor ein. Strg = um die Mitte, Umschalt = gleichmäßig.' : this.box ? 'Wählen Sie einen Ziehpunkt aus.' : 'Wählen Sie die zu skalierenden Objekte aus.'; }
  activate() { this.refresh(); }
  busy() { return !!this.active; }
  cancel() { if (this.active) this.ed.abortOp(); this.active = null; this.lt = null; this.refresh(); }
  refresh() {
    const ed = this.ed; const refs = ed.selected();
    if (!refs.length) { this.box = null; this.grips = []; return; }
    const b = ed.entities.refBounds(refs); if (b.isEmpty()) { this.box = null; this.grips = []; return; }
    this.box = b; this.grips = [];
    const size = b.getSize(new THREE.Vector3()); const seen = new Set<string>();
    for (const x of [0, 0.5, 1]) for (const y of [0, 0.5, 1]) for (const z of [0, 0.5, 1]) {
      if (x === 0.5 && y === 0.5 && z === 0.5) continue;
      const t = new THREE.Vector3(size.x < 1e-6 ? 0.5 : x, size.y < 1e-6 ? 0.5 : y, size.z < 1e-6 ? 0.5 : z);
      if (t.x === 0.5 && t.y === 0.5 && t.z === 0.5) continue;
      const k = t.toArray().join(); if (seen.has(k)) continue; seen.add(k);
      const lp = new THREE.Vector3(b.min.x + size.x * t.x, b.min.y + size.y * t.y, b.min.z + size.z * t.z);
      this.grips.push({ t, world: ed.toWorld(lp) });
    }
  }
  onMove(e: PEvt) {
    const ed = this.ed;
    if (!this.box) { this.refresh(); if (!this.box) { ed.setHover(hoverPick(ed, e)); return; } }
    if (!this.active) {
      this.hot = null; let best = 10;
      for (const g of this.grips) { const s = ed.viewer.project(g.world); const d = Math.hypot(s.x - e.x, s.y - e.y); if (d < best) { best = d; this.hot = g; } }
      return;
    }
    const g = this.active; const A = ed.toWorld(this.anchor);
    const dir = g.world.clone().sub(A); const L = dir.length(); if (L < 1e-9) return;
    const p = closestOnLineToRay(A, dir.clone().normalize(), ed.viewer.ray(e.x, e.y));
    let f = p.sub(A).dot(dir) / (L * L);
    if (Math.abs(f) < 1e-3) f = 1e-3 * Math.sign(f || 1);
    // snap to round factors
    const r = Math.round(f * 10) / 10; if (Math.abs(f - r) < 0.02) f = r;
    this.applyFactor(f);
  }
  isCorner(g: Grip) { return [g.t.x, g.t.y, g.t.z].filter(v => v !== 0.5).length === 3 || (this.box && [g.t.x, g.t.y, g.t.z].filter(v => v !== 0.5).length === this.dims()); }
  dims() { const s = this.box!.getSize(new THREE.Vector3()); return [s.x, s.y, s.z].filter(v => v > 1e-6).length; }
  applyFactor(f: number, explicit?: V3) {
    const ed = this.ed; const m = this.mask; const uniform = this.isCorner(this.active!) !== (ed.ui as any)._shift;
    const s = explicit ?? (uniform ? new THREE.Vector3(f, f, f) : new THREE.Vector3(m.x ? f : 1, m.y ? f : 1, m.z ? f : 1));
    const sz = this.box!.getSize(new THREE.Vector3());
    if (sz.x < 1e-6) s.x = 1; if (sz.y < 1e-6) s.y = 1; if (sz.z < 1e-6) s.z = 1;
    this.factor.copy(s);
    const a = this.anchor;
    const M = new THREE.Matrix4().makeTranslation(a.x, a.y, a.z).multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z)).multiply(new THREE.Matrix4().makeTranslation(-a.x, -a.y, -a.z));
    this.lt!.apply(M); ed.invalidate();
    ed.setVcb([s.x, s.y, s.z].filter((_, i) => (uniform ? i === 0 : [m.x, m.y, m.z][i])).map(v => v.toFixed(2).replace('.', ',')).join('; '));
  }
  onDown(e: PEvt) {
    const ed = this.ed; this.downAt = { x: e.x, y: e.y };
    if (!this.box) { if (ed.hover) { ed.select([ed.hover]); ed.setHover(null); this.refresh(); } return; }
    if (!this.active) {
      if (!this.hot) {
        // clicking elsewhere selects something else
        const h = hoverPick(ed, e); if (h) { ed.select([h]); this.refresh(); }
        return;
      }
      const g = this.hot; this.active = g; this.pressed = true;
      const b = this.box; const size = b.getSize(new THREE.Vector3());
      const ctrl = e.ctrl;
      const at = ctrl ? new THREE.Vector3(0.5, 0.5, 0.5) : new THREE.Vector3(1 - g.t.x, 1 - g.t.y, 1 - g.t.z);
      this.anchor = new THREE.Vector3(b.min.x + size.x * at.x, b.min.y + size.y * at.y, b.min.z + size.z * at.z);
      this.mask.set(g.t.x !== 0.5 ? 1 : 0, g.t.y !== 0.5 ? 1 : 0, g.t.z !== 0.5 ? 1 : 0);
      ed.beginOp('Skalieren'); this.lt = new LiveTransform(ed.entities, ed.selected());
      return;
    }
    this.finish();
  }
  onUp(e: PEvt) { if (this.pressed && this.isDrag(e)) this.finish(); this.pressed = false; }
  finish() { if (!this.lt) return; this.lt.finish(); this.ed.endOp(); this.active = null; this.lt = null; this.refresh(); this.ed.invalidate(); }
  onKey(e: KeyboardEvent, down: boolean) { if (e.key === 'Shift') { (this.ed.ui as any)._shift = down; return true; } return false; }
  onVcb(t: string) {
    if (!this.active) return false;
    const parts = t.split(/[;]/).map(s => s.trim()).filter(Boolean);
    const nums = parts.map(p => { const unit = /[a-z"']/i.test(p); if (unit) { const L = this.len(p); if (L == null) return NaN; const sz = this.box!.getSize(new THREE.Vector3()); const ref = Math.max(sz.x * this.mask.x, sz.y * this.mask.y, sz.z * this.mask.z) || Math.max(sz.x, sz.y, sz.z); return L / ref; } return parseFloat(p.replace(',', '.')); });
    if (nums.some(isNaN) || !nums.length) return false;
    if (nums.length === 1) this.applyFactor(nums[0]);
    else if (nums.length === 3) this.applyFactor(1, new THREE.Vector3(nums[0], nums[1], nums[2]));
    else { const m = this.mask; const v = [1, 1, 1]; let k = 0; [m.x, m.y, m.z].forEach((on, i) => { if (on && k < nums.length) v[i] = nums[k++]; }); this.applyFactor(1, new THREE.Vector3(...v)); }
    this.finish(); return true;
  }
  draw(o: Overlay) {
    const ed = this.ed;
    if (!this.box) { this.refresh(); if (!this.box) return; }
    // bounding box (yellow like SketchUp) and grips (green)
    if (!this.active) this.refresh();
    const b = this.box; const c = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ed.toWorld(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)));
    const E = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [i, j] of E) o.line(c[i], c[j], '#d4b000', 1.2);
    for (const g of this.grips) {
      const s = o.screen(g.world); if (!s) continue; const hot = g === this.hot || g === this.active;
      o.ctx.fillStyle = hot ? '#e00000' : '#00a000'; o.ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
    }
    if (this.active) { const s = o.screen(ed.toWorld(this.anchor)); if (s) { o.ctx.strokeStyle = '#e00000'; o.ctx.lineWidth = 2; o.ctx.strokeRect(s.x - 5, s.y - 5, 10, 10); } }
    if (this.hot && !this.active) {
      const n = [this.hot.t.x, this.hot.t.y, this.hot.t.z].filter(v => v !== 0.5).length;
      o.tooltip(ed.mouse.x, ed.mouse.y, n === 3 || n === this.dims() ? 'Gleichmäßig skalieren' : n === 2 ? 'Zwei Achsen skalieren' : 'Eine Achse skalieren');
    }
  }
}

// ===================================================================== Follow Me
export class FollowMeTool extends PointTool {
  id = 'followme'; name = 'Folge mir'; cursor = 'crosshair';
  status() { return this.path() ? 'Klicken Sie auf die Profilfläche, die dem ausgewählten Pfad folgen soll.' : 'Wählen Sie zuerst Kanten als Pfad aus (z. B. Doppelklick auf eine Fläche wählt ihre Kanten), dann dieses Werkzeug.'; }
  path(): { pts: V3[]; closed: boolean } | null {
    const ed = this.ed; const ents = ed.entities;
    let edges = ed.selected().filter(r => r.kind === 'edge').map(r => ents.edges.get(r.id)!).filter(Boolean);
    // a selected face (without edges) means "its boundary"
    if (!edges.length) { const f = ed.selected().find(r => r.kind === 'face'); if (f) { const face = ents.faces.get(f.id); if (face) edges = ents.loopEdges(face.outer); } }
    if (!edges.length) return null;
    const adj = new Map<number, number[]>();
    for (const e of edges) { (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b); (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a); }
    if ([...adj.values()].some(l => l.length > 2)) return null;
    let start = [...adj.keys()].find(k => adj.get(k)!.length === 1);
    const closed = start == null; if (start == null) start = edges[0].a;
    const order = [start]; const seen = new Set([start]); let cur = start;
    while (true) { const nx = adj.get(cur)!.find(v => !seen.has(v)); if (nx == null) break; order.push(nx); seen.add(nx); cur = nx; }
    if (order.length !== adj.size) return null;
    return { pts: order.map(v => ents.pos(v).clone()), closed };
  }
  onMove(e: PEvt) { const ed = this.ed; const fh = ed.viewer.pickFace(e.x, e.y, ctx => ctx.path.length === ed.activePath.length && ed.inContext(ctx.path)); ed.setHover(fh ? { kind: 'face', id: fh.fid } : null); }
  onDown(e: PEvt) {
    const ed = this.ed; const p = this.path(); if (!p) { ed.toast('Kein gültiger Pfad ausgewählt.'); return; }
    const fh = ed.viewer.pickFace(e.x, e.y, ctx => ctx.path.length === ed.activePath.length && ed.inContext(ctx.path)); if (!fh) return;
    // start the path at the end closest to the profile
    const fc = ed.entities.faceCenter(ed.entities.faces.get(fh.fid)!);
    if (!p.closed && p.pts[p.pts.length - 1].distanceTo(fc) < p.pts[0].distanceTo(fc)) p.pts.reverse();
    if (p.closed) { let bi = 0, bd = Infinity; p.pts.forEach((q, i) => { const d = q.distanceTo(fc); if (d < bd) { bd = d; bi = i; } }); p.pts = [...p.pts.slice(bi), ...p.pts.slice(0, bi)]; }
    ed.commit('Folge mir', () => ed.entities.followMe(fh.fid, p.pts, p.closed));
    ed.clearSelection(); ed.setHover(null);
  }
}
