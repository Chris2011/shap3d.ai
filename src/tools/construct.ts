import * as THREE from 'three';
import { Tool, type PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import { PointTool, onPlane } from './base';
import { AXES } from '../engine/inference';
import { newId } from '../core/model';
import { formatAngle } from '../core/units';

type V3 = THREE.Vector3;

// ===================================================================== Tape measure
export class TapeTool extends PointTool {
  id = 'tape'; name = 'Maßband'; vcbLabel = 'Länge'; cursor = 'crosshair';
  start: V3 | null = null; edgeDir: V3 | null = null; guides = true; cur: V3 | null = null; lastMeasure = 0;
  status() { return this.start ? 'Wählen Sie den Endpunkt aus. Strg schaltet das Erstellen von Hilfslinien um.' : `Wählen Sie den Startpunkt (Punkt oder Kante) aus. ${this.guides ? 'Hilfslinien werden erstellt.' : ''}`; }
  busy() { return !!this.start; }
  cancel() { this.start = null; this.edgeDir = null; }
  onKey(e: KeyboardEvent, d: boolean) { if (e.key === 'Control' && d && !e.repeat) { this.guides = !this.guides; this.ed.refreshStatus(); return true; } return super.onKey(e, d); }
  onMove(e: PEvt) {
    const r = this.pick(e, this.start); this.cur = r.point.clone();
    if (this.start) {
      if (this.edgeDir) { const off = this.offsetVec(); this.ed.setVcb(this.ed.fmt(off.length())); }
      else this.ed.setVcb(this.ed.fmt(this.start.distanceTo(r.point)));
    }
  }
  offsetVec(): V3 { const q = this.cur!.clone().sub(this.start!); return q.sub(this.edgeDir!.clone().multiplyScalar(q.dot(this.edgeDir!))); }
  onDown(e: PEvt) {
    const r = this.pick(e, this.start);
    if (!this.start) {
      this.start = r.point.clone();
      this.edgeDir = r.kind === 'edge' && r.edge ? r.edge.b.clone().sub(r.edge.a).normalize() : null;
      return;
    }
    this.finish(r.point.clone());
  }
  finish(p: V3) {
    const ed = this.ed; const s = this.start!;
    this.lastMeasure = this.edgeDir ? this.offsetVec().length() : s.distanceTo(p);
    if (this.guides) {
      if (this.edgeDir) { const off = this.offsetVec(); const d = this.edgeDir.clone(); ed.commit('Hilfslinie', () => ed.model.guides.push({ id: newId(), kind: 'line', p: s.clone().add(off), d })); }
      else if (s.distanceTo(p) > 1e-6) { const d = p.clone().sub(s).normalize(); ed.commit('Hilfspunkt', () => { ed.model.guides.push({ id: newId(), kind: 'point', p: p.clone() }); ed.model.guides.push({ id: newId(), kind: 'line', p: s.clone(), d }); }); }
    }
    ed.setVcb(ed.fmt(this.lastMeasure));
    this.cancel();
  }
  async onVcbAsync(t: string) {
    const ed = this.ed; const L = this.len(t); if (L == null) return false;
    if (this.start && this.cur) {
      if (this.edgeDir) { const off = this.offsetVec(); if (off.lengthSq() < 1e-12) return false; this.cur = this.start.clone().add(off.normalize().multiplyScalar(L)); this.finish(this.cur); return true; }
      const d = this.cur.clone().sub(this.start).normalize(); this.finish(this.start.clone().addScaledVector(d, L)); return true;
    }
    // resize model: new length for the last measured distance
    if (this.lastMeasure > 1e-9) {
      const f = L / this.lastMeasure;
      const ok = await ed.confirm(`Möchten Sie die Größe des ${ed.activePath.length ? 'Gruppeninhalts' : 'Modells'} ändern? (Faktor ${f.toFixed(4)})`);
      if (!ok) return true;
      ed.commit('Größe ändern', () => {
        const M = new THREE.Matrix4().makeScale(f, f, f);
        const ents = ed.entities;
        for (const v of ents.vertices.values()) v.p.applyMatrix4(M);
        for (const i of ents.instances.values()) i.matrix.premultiply(M);
        ents.invalidateHash();
        if (!ed.activePath.length) { for (const g of ed.model.guides) g.p.applyMatrix4(M); for (const d of ed.model.dimensions) { d.a.applyMatrix4(M); d.b.applyMatrix4(M); d.offset.multiplyScalar(f); } }
      });
      this.lastMeasure = L; return true;
    }
    return false;
  }
  onVcb(t: string) { this.onVcbAsync(t); return this.len(t) != null; }
  draw(o: Overlay) {
    if (this.start && this.cur) {
      if (this.edgeDir) { const off = this.offsetVec(); o.line(this.start, this.start.clone().add(off), '#000', 1, [4, 3]); o.line(this.start.clone().add(off).addScaledVector(this.edgeDir, -200), this.start.clone().add(off).addScaledVector(this.edgeDir, 200), '#555', 1, [6, 4]); }
      else o.line(this.start, this.cur, '#000', 1, [4, 3]);
    }
    this.drawInference(o);
  }
}

// ===================================================================== Protractor
export class ProtractorTool extends PointTool {
  id = 'protractor'; name = 'Winkelmesser'; vcbLabel = 'Winkel'; cursor = 'crosshair';
  c: V3 | null = null; ref: V3 | null = null; n = new THREE.Vector3(0, 0, 1); cur: V3 | null = null; angle = 0; hoverN = new THREE.Vector3(0, 0, 1);
  status() { return !this.c ? 'Wählen Sie den Scheitelpunkt aus.' : !this.ref ? 'Wählen Sie den ersten Schenkel aus.' : 'Wählen Sie den Winkel aus (erstellt eine Hilfslinie).'; }
  busy() { return !!this.c; }
  cancel() { this.c = this.ref = null; }
  onMove(e: PEvt) {
    const r = this.pick(e, this.c); this.cur = r.point.clone();
    if (!this.c) { this.hoverN = r.face && r.kind === 'face' ? r.face.normal.clone() : new THREE.Vector3(0, 0, 1); return; }
    if (this.ref) {
      const hit = this.ed.viewer.ray(e.x, e.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.n, this.c), new THREE.Vector3()); if (!hit) return;
      const a = this.ref.clone().sub(this.c), b = hit.sub(this.c); let ang = Math.atan2(a.clone().cross(b).dot(this.n), a.dot(b));
      const s = Math.round(ang / (Math.PI / 12)) * Math.PI / 12; if (Math.abs(ang - s) < 0.04) ang = s; this.angle = ang; this.ed.setVcb(formatAngle(ang));
    }
  }
  onDown(e: PEvt) {
    const r = this.pick(e, this.c);
    if (!this.c) { this.c = r.point.clone(); this.n = this.hoverN.clone(); return; }
    if (!this.ref) { const p = onPlane(r.point, this.c, this.n); if (p.distanceTo(this.c) < 1e-6) return; this.ref = p; return; }
    this.finish();
  }
  finish() {
    const ed = this.ed; const d = this.ref!.clone().sub(this.c!).normalize().applyAxisAngle(this.n, this.angle); const c = this.c!.clone();
    ed.commit('Hilfslinie (Winkel)', () => ed.model.guides.push({ id: newId(), kind: 'line', p: c, d })); this.cancel();
  }
  onVcb(t: string) { if (!this.ref) return false; const a = parseFloat(t.replace(',', '.')); if (isNaN(a)) return false; this.angle = a * Math.PI / 180; this.finish(); return true; }
  draw(o: Overlay) {
    const c = this.c ?? this.cur; if (!c) return; const n = this.c ? this.n : this.hoverN;
    const R = this.ed.viewer.worldPerPixel(c) * 55; o.circle3D(c, n, R, '#0000e0', 1.2, 64);
    if (this.c && this.ref) { o.line(this.c, this.ref, '#555', 1, [4, 3]); const d = this.ref.clone().sub(this.c).normalize().applyAxisAngle(this.n, this.angle); o.line(this.c.clone().addScaledVector(d, -100), this.c.clone().addScaledVector(d, 100), '#555', 1, [6, 4]); }
    else if (this.c && this.cur) o.line(this.c, this.cur, '#555', 1, [4, 3]);
    this.drawInference(o);
  }
}

// ===================================================================== Dimension
export class DimensionTool extends PointTool {
  id = 'dimension'; name = 'Abmessungen'; cursor = 'crosshair';
  a: V3 | null = null; b: V3 | null = null; cur: V3 | null = null; off = new THREE.Vector3();
  status() { return !this.a ? 'Wählen Sie den Startpunkt der Bemaßung oder eine Kante aus.' : !this.b ? 'Wählen Sie den Endpunkt aus.' : 'Ziehen Sie die Bemaßung an ihre Position.'; }
  busy() { return !!this.a; }
  cancel() { this.a = this.b = null; }
  onMove(e: PEvt) {
    if (!this.b) { const r = this.pick(e, this.a); this.cur = r.point.clone(); return; }
    // offset in the plane most facing the camera that contains the dimension line
    const d = this.b.clone().sub(this.a!).normalize(); const view = this.ed.viewer.rig.forward();
    let best: V3 | null = null, bv = -1;
    for (const ax of [AXES.x, AXES.y, AXES.z]) { if (Math.abs(ax.dot(d)) > 0.99) continue; const v = Math.abs(ax.dot(view)); if (v > bv) { bv = v; best = ax; } }
    const hit = this.ed.viewer.ray(e.x, e.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(best!, this.a!), new THREE.Vector3()); if (!hit) return;
    const q = hit.sub(this.a!); this.off = q.sub(d.multiplyScalar(q.dot(d)));
  }
  onDown(e: PEvt) {
    if (!this.a) {
      const r = this.pick(e, null);
      if (r.kind === 'edge' && r.edge) { this.a = r.edge.a.clone(); this.b = r.edge.b.clone(); this.off.set(0, 0, 0); return; }
      this.a = r.point.clone(); return;
    }
    if (!this.b) { const r = this.pick(e, this.a); if (r.point.distanceTo(this.a) < 1e-6) return; this.b = r.point.clone(); return; }
    const ed = this.ed; const dim = { id: newId(), a: this.a.clone(), b: this.b.clone(), offset: this.off.clone() };
    ed.commit('Bemaßung', () => ed.model.dimensions.push(dim)); this.cancel();
  }
  draw(o: Overlay) {
    if (this.a && this.b) this.ed.drawDimension(o, this.a, this.b, this.off);
    else if (this.a && this.cur) o.line(this.a, this.cur, '#000', 1, [4, 3]);
    if (!this.b) this.drawInference(o);
  }
}

// ===================================================================== Text (leader)
export class TextTool extends PointTool {
  id = 'text'; name = 'Text'; cursor = 'text';
  at: V3 | null = null; cur: V3 | null = null; defText = '';
  status() { return this.at ? 'Wählen Sie die Position des Textes aus.' : 'Wählen Sie den Punkt aus, auf den der Text zeigen soll.'; }
  busy() { return !!this.at; }
  cancel() { this.at = null; }
  onMove(e: PEvt) { const r = this.pick(e, null); this.cur = r.point.clone(); }
  onDown(e: PEvt) {
    const ed = this.ed; const r = this.pick(e, null);
    if (!this.at) {
      this.at = r.point.clone();
      if (r.kind === 'face' && r.face) { const f = r.face.ctx.entities.faces.get(r.face.fid); this.defText = f ? ed.fmtArea(r.face.ctx.entities.faceArea(f)) : ''; }
      else if ((r.kind === 'edge' || r.kind === 'midpoint') && r.edge) this.defText = ed.fmt(r.edge.a.distanceTo(r.edge.b));
      else { const p = r.point; this.defText = `[${ed.fmt(p.x)}; ${ed.fmt(p.y)}; ${ed.fmt(p.z)}]`; }
      return;
    }
    const at = this.at, off = r.point.clone().sub(at); this.at = null;
    ed.prompt('Text eingeben', this.defText, true).then(t => { if (t) ed.commit('Text', () => ed.model.labels.push({ id: newId(), p: at, text: t, offset: off })); });
  }
  draw(o: Overlay) { if (this.at && this.cur) { o.line(this.at, this.cur, '#000', 1); o.text(this.cur, this.defText, { bg: '#ffffffd0', align: 'left', dx: 4 }); } this.drawInference(o); }
}

// ===================================================================== Section plane
export class SectionTool extends PointTool {
  id = 'section'; name = 'Schnittebene'; cursor = 'crosshair';
  n = new THREE.Vector3(0, 0, -1); p: V3 | null = null;
  status() { return 'Klicken Sie auf eine Fläche, um eine Schnittebene zu platzieren. Pfeiltasten richten sie an den Achsen aus.'; }
  onKey(e: KeyboardEvent, d: boolean) {
    if (d && ['ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) { this.lockAxis = e.key === 'ArrowUp' ? 'z' : e.key === 'ArrowRight' ? 'x' : 'y'; return true; }
    return false;
  }
  onMove(e: PEvt) {
    const r = this.pick(e, null); this.p = r.point.clone();
    if (this.lockAxis) this.n = AXES[this.lockAxis].clone().negate();
    else this.n = r.face && r.kind === 'face' ? r.face.normal.clone().negate() : new THREE.Vector3(0, 0, -1);
  }
  onDown() {
    if (!this.p) return; const ed = this.ed; const s = { id: newId(), p: this.p.clone(), n: this.n.clone(), active: true, name: `Schnitt ${ed.model.sections.length + 1}` };
    ed.commit('Schnittebene', () => { ed.model.sections.forEach(x => (x.active = false)); ed.model.sections.push(s); ed.model.settings.sectionCuts = true; });
    ed.setTool('select');
  }
  draw(o: Overlay) { if (this.p) this.ed.drawSection(o, this.p, this.n, true); this.drawInference(o, false); }
}

// ===================================================================== Navigation tools
export class OrbitTool extends Tool {
  id = 'orbit'; name = 'Orbit'; cursor = 'grab'; last: { x: number; y: number } | null = null; pivot: V3 | null = null;
  status() { return 'Ziehen Sie, um die Ansicht zu drehen. Umschalt = Schwenken.'; }
  onDown(e: PEvt) { this.last = { x: e.x, y: e.y }; this.pivot = this.ed.viewer.pickFace(e.x, e.y)?.point ?? null; }
  onMove(e: PEvt) { if (!this.last) return; const dx = e.x - this.last.x, dy = e.y - this.last.y; this.last = { x: e.x, y: e.y }; if (e.shift) this.ed.viewer.rig.pan(dx, dy, this.ed.viewer.height, this.pivot ?? undefined); else this.ed.viewer.rig.orbit(dx, dy, this.pivot ?? undefined); }
  onUp() { this.last = null; }
}
export class PanTool extends Tool {
  id = 'pan'; name = 'Schwenken'; cursor = 'move'; last: { x: number; y: number } | null = null; pivot: V3 | null = null;
  status() { return 'Ziehen Sie, um die Ansicht zu schwenken.'; }
  onDown(e: PEvt) { this.last = { x: e.x, y: e.y }; this.pivot = this.ed.viewer.pickFace(e.x, e.y)?.point ?? null; }
  onMove(e: PEvt) { if (!this.last) return; this.ed.viewer.rig.pan(e.x - this.last.x, e.y - this.last.y, this.ed.viewer.height, this.pivot ?? undefined); this.last = { x: e.x, y: e.y }; }
  onUp() { this.last = null; }
}
export class ZoomTool extends Tool {
  id = 'zoom'; name = 'Zoom'; cursor = 'zoom-in'; vcbLabel = 'Sichtfeld'; last: { x: number; y: number } | null = null; pivot: V3 | null = null;
  status() { return 'Ziehen Sie nach oben/unten zum Zoomen. Umschalt = Sichtfeld ändern. Geben Sie einen Sichtfeldwinkel ein (z. B. 35°).'; }
  activate() { this.ed.setVcb(this.ed.viewer.rig.persp.fov.toFixed(1).replace('.', ',') + '°'); }
  onDown(e: PEvt) { this.last = { x: e.x, y: e.y }; this.pivot = this.ed.viewer.pickFace(e.x, e.y)?.point ?? null; }
  onMove(e: PEvt) {
    if (!this.last) return; const dy = e.y - this.last.y; this.last = { x: e.x, y: e.y };
    if (e.shift) { const r = this.ed.viewer.rig; r.setFov(r.persp.fov + dy * 0.2); this.ed.setVcb(r.persp.fov.toFixed(1).replace('.', ',') + '°'); }
    else this.ed.viewer.rig.zoomAt(this.pivot, Math.pow(1.01, dy));
  }
  onUp() { this.last = null; }
  onVcb(t: string) { const v = parseFloat(t.replace(',', '.')); if (isNaN(v)) return false; this.ed.viewer.rig.setFov(v); return true; }
}
export class ZoomWindowTool extends Tool {
  id = 'zoomwindow'; name = 'Zoomfenster'; cursor = 'zoom-in'; r: { x0: number; y0: number; x1: number; y1: number } | null = null;
  status() { return 'Ziehen Sie ein Rechteck auf, um in diesen Bereich zu zoomen.'; }
  onDown(e: PEvt) { this.r = { x0: e.x, y0: e.y, x1: e.x, y1: e.y }; }
  onMove(e: PEvt) { if (this.r) { this.r.x1 = e.x; this.r.y1 = e.y; } }
  onUp() {
    const r = this.r; this.r = null; if (!r || Math.abs(r.x1 - r.x0) < 5) return;
    const v = this.ed.viewer; const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const fh = v.pickFace(cx, cy); const center = fh?.point ?? v.ray(cx, cy).at(v.rig.position.distanceTo(v.rig.target), new THREE.Vector3());
    const f = Math.max(Math.abs(r.x1 - r.x0) / v.width, Math.abs(r.y1 - r.y0) / v.height);
    const rig = v.rig; const dir = rig.position.clone().sub(rig.target).normalize(); const dist = center.distanceTo(rig.position) * f;
    rig.applyState({ pos: center.clone().addScaledVector(dir, dist).toArray(), target: center.toArray(), fov: rig.persp.fov, ortho: rig.isOrtho });
    this.ed.setTool('select');
  }
  draw(o: Overlay) { if (this.r) o.rect2D(this.r.x0, this.r.y0, this.r.x1, this.r.y1, false); }
}

/** Look around: rotate camera about its own position. */
export class LookAroundTool extends Tool {
  id = 'lookaround'; name = 'Umsehen'; cursor = 'grab'; last: { x: number; y: number } | null = null;
  status() { return 'Ziehen Sie, um sich umzusehen (Kamera dreht sich um ihren Standpunkt).'; }
  onDown(e: PEvt) { this.last = { x: e.x, y: e.y }; }
  onMove(e: PEvt) { if (!this.last) return; const r = this.ed.viewer.rig; r.orbit(-(e.x - this.last.x) * 0.5, -(e.y - this.last.y) * 0.5, r.position.clone()); this.last = { x: e.x, y: e.y }; }
  onUp() { this.last = null; }
}

/** Walk: drag forward/back and turn, eye height kept. */
export class WalkTool extends Tool {
  id = 'walk'; name = 'Gehen'; cursor = 'pointer'; last: { x: number; y: number } | null = null; origin: { x: number; y: number } | null = null; timer = 0;
  status() { return 'Ziehen Sie nach oben/unten zum Gehen, links/rechts zum Drehen. Pfeiltasten funktionieren auch.'; }
  activate() { const r = this.ed.viewer.rig; if (r.position.z > 3 || r.position.z < 1) { const t = r.target.clone(); t.z = 1.7; const p = r.position.clone(); p.z = 1.7; r.applyState({ pos: p.toArray(), target: t.toArray(), fov: r.persp.fov, ortho: false }); } }
  step(fwd: number, turn: number) {
    const r = this.ed.viewer.rig; const f = r.forward(); f.z = 0; if (f.lengthSq() < 1e-9) return; f.normalize();
    const mv = f.multiplyScalar(fwd); r.position.add(mv); r.target.add(mv);
    if (turn) r.orbit(turn, 0, r.position.clone()); else { r.persp.lookAt(r.target); r.syncOrtho(); r.onChange(); }
  }
  onDown(e: PEvt) { this.origin = { x: e.x, y: e.y }; this.last = { x: e.x, y: e.y }; this.timer = window.setInterval(() => { if (!this.origin || !this.last) return; this.step(-(this.last.y - this.origin.y) * 0.002, -(this.last.x - this.origin.x) * 0.05); }, 30); }
  onMove(e: PEvt) { if (this.last) this.last = { x: e.x, y: e.y }; }
  onUp() { clearInterval(this.timer); this.origin = this.last = null; }
  onKey(e: KeyboardEvent, d: boolean) { if (!d) return false; const m: Record<string, [number, number]> = { ArrowUp: [0.3, 0], ArrowDown: [-0.3, 0], ArrowLeft: [0, -8], ArrowRight: [0, 8] }; const s = m[e.key]; if (!s) return false; this.step(s[0], s[1]); return true; }
  deactivate() { clearInterval(this.timer); }
}

/** Position camera: click a point, camera stands there at eye height. */
export class PositionCameraTool extends PointTool {
  id = 'poscam'; name = 'Kamera positionieren'; vcbLabel = 'Augenhöhe';
  eye = 1.676;
  status() { return 'Klicken Sie, um die Kamera dort in Augenhöhe zu positionieren.'; }
  onMove(e: PEvt) { this.pick(e, null); }
  onDown(e: PEvt) {
    const r = this.pick(e, null); const rig = this.ed.viewer.rig;
    const pos = r.point.clone(); pos.z += this.eye;
    const f = rig.forward(); f.z = 0; if (f.lengthSq() < 1e-9) f.set(0, 1, 0); f.normalize();
    rig.isOrtho = false; this.ed.ui.projection = 'persp';
    rig.applyState({ pos: pos.toArray(), target: pos.clone().addScaledVector(f, 5).toArray(), fov: Math.max(rig.persp.fov, 50), ortho: false }, true, () => this.ed.setTool('lookaround'));
  }
  onVcb(t: string) { const L = this.len(t); if (L == null) return false; this.eye = L; return true; }
  draw(o: Overlay) { this.drawInference(o); }
}
