import * as THREE from 'three';
import type { PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import { PointTool, planeFromInference, planeAxes, onPlane } from './base';
import { parseLengthList } from '../core/units';
import { AXIS_COLOR, MAGENTA } from '../engine/inference';
import type { PlaneRef } from '../core/geometry';

type V3 = THREE.Vector3;

const parseCoords = (text: string): { absolute: boolean; vector: V3 } | null => {
  const match = text.trim().match(/^([\[<])\s*([^\]>]+)[\]>]$/); if (!match) return null;
  const parts = match[2].split(/[;,]/).map(x => parseFloat(x.trim().replace(',', '.')));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return { absolute: match[1] === '[', vector: new THREE.Vector3(parts[0], parts[1], parts[2]) };
};

// ===================================================================== Line
export class LineTool extends PointTool {
  id = 'line'; name = 'Linie'; vcbLabel = 'Länge'; cursor = 'crosshair';
  start: V3 | null = null; chainStart: V3 | null = null; pressed = false;
  status() { return this.start ? 'Klicken, um den Endpunkt festzulegen, oder Länge eingeben. | Pfeiltasten = Ableitungsrichtung fixieren ein/aus. Umschalt = Ableitung fixieren.' : 'Klicken, um den ersten Endpunkt festzulegen. | Pfeiltasten = Ableitungsrichtung fixieren ein/aus.'; }
  busy() { return !!this.start; }
  cancel() { this.start = null; this.chainStart = null; this.resetLocks(); this.editor.setVcb(''); }
  onMove(pointer: PEvt) { const inference = this.pick(pointer, this.start); if (this.start) this.editor.setVcb(this.editor.fmt(this.start.distanceTo(inference.point))); }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    const inference = this.pick(pointer, this.start);
    if (!this.start) { this.start = inference.point.clone(); this.chainStart = this.start.clone(); this.editor.infer.track(this.start); this.pressed = true; return; }
    this.segment(inference.point);
  }
  onUp(pointer: PEvt) { if (this.pressed && this.isDrag(pointer) && this.inference) this.segment(this.inference.point); this.pressed = false; }
  onDblClick() { this.cancel(); }
  segment(point: V3) {
    if (!this.start || point.distanceTo(this.start) < 1e-5) return;
    const editor = this.editor; const ents = editor.entities; const start = this.start.clone(), end = point.clone();
    const before = ents.faces.size;
    editor.commit('Linie', () => ents.addLine(editor.toLocal(start), editor.toLocal(end)));
    const closed = this.chainStart && end.distanceTo(this.chainStart) < 1e-5;
    this.editor.infer.track(end);
    if (ents.faces.size > before || closed) { this.start = null; this.chainStart = null; }
    else this.start = end;
    this.resetLocks(); editor.setVcb('');
  }
  onVcb(text: string) {
    if (!this.start) return false;
    const coords = parseCoords(text);
    if (coords) { this.segment(coords.absolute ? this.editor.toWorld(coords.vector) : this.start.clone().add(coords.vector)); return true; }
    const distance = this.lengthOf(text); if (distance == null) return false;
    let dir = this.inference ? this.inference.point.clone().sub(this.start) : new THREE.Vector3(1, 0, 0);
    if (dir.lengthSq() < 1e-12) dir.set(1, 0, 0);
    this.segment(this.start.clone().addScaledVector(dir.normalize(), distance)); return true;
  }
  draw(overlay: Overlay) {
    if (this.start && this.inference) {
      const kind = this.inference.kind, linear = kind === 'axis' || kind === 'locked' || (kind === 'aligned' && !!this.inference.direction) || kind === 'intersection';
      const col = this.inference.axis && linear ? AXIS_COLOR[this.inference.axis] : kind === 'parallel' || kind === 'perpendicular' || (linear && this.inference.direction) ? MAGENTA : '#000';
      overlay.line(this.start, this.inference.point, col, col === '#000' ? 1 : 1.6);
    }
    this.drawInference(overlay);
  }
}

// ===================================================================== Freehand
export class FreehandTool extends PointTool {
  id = 'freehand'; name = 'Freihand'; cursor = 'crosshair';
  pts: V3[] = []; plane: PlaneRef | null = null; lastScreen = { x: 0, y: 0 };
  status() { return 'Klicken und ziehen Sie, um eine Freihandkurve zu zeichnen.'; }
  busy() { return this.pts.length > 0; }
  cancel() { this.pts = []; this.plane = null; }
  onDown(pointer: PEvt) { const inference = this.pick(pointer, null); const plane = planeFromInference(inference); this.plane = { point: plane.point, normal: plane.normal }; this.pts = [inference.point.clone()]; this.lastScreen = { x: pointer.x, y: pointer.y }; }
  onMove(pointer: PEvt) {
    if (!this.plane) { this.pick(pointer, null); return; }
    if (Math.hypot(pointer.x - this.lastScreen.x, pointer.y - this.lastScreen.y) < 5) return;
    const hit = this.editor.viewer.ray(pointer.x, pointer.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.plane.normal, this.plane.point), new THREE.Vector3());
    if (hit) { this.pts.push(hit); this.lastScreen = { x: pointer.x, y: pointer.y }; }
  }
  onUp() {
    if (this.pts.length < 2) { this.cancel(); return; }
    const pts = this.pts; const first = this.editor.viewer.project(pts[0]), last = this.editor.viewer.project(pts[pts.length - 1]);
    if (Math.hypot(first.x - last.x, first.y - last.y) < 12 && pts.length > 3) pts[pts.length - 1] = pts[0].clone();
    const editor = this.editor;
    editor.commit('Freihand', () => { for (let i = 0; i < pts.length - 1; i++) editor.entities.addLine(editor.toLocal(pts[i]), editor.toLocal(pts[i + 1])); });
    this.cancel();
  }
  draw(overlay: Overlay) { if (this.pts.length) overlay.polyline([...this.pts], '#000', 1.2); else this.drawInference(overlay); }
}

// ===================================================================== Rectangle
export class RectangleTool extends PointTool {
  id = 'rectangle'; name = 'Rechteck'; vcbLabel = 'Abmessungen'; cursor = 'crosshair';
  corner: V3 | null = null; plane: PlaneRef | null = null; basisU = new THREE.Vector3(1, 0, 0); basisV = new THREE.Vector3(0, 1, 0);
  width = 0; height = 0; special = ''; pressed = false;
  last: { corner: V3; normal: V3; basisU: V3; basisV: V3 } | null = null;
  status() { return this.corner ? 'Klicken, um die gegenüberliegende Ecke festzulegen, oder Länge und Breite eingeben (z. B. 2000; 1500).' : 'Klicken, um die erste Ecke festzulegen.'; }
  busy() { return !!this.corner; }
  cancel() { this.corner = null; this.plane = null; this.editor.setVcb(''); }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    if (!this.corner) {
      const inference = this.pick(pointer, null);
      const plane = planeFromInference(inference); this.corner = inference.point.clone(); this.plane = { point: plane.point, normal: plane.normal };
      const axes = planeAxes(plane.normal); this.basisU = axes.basisU; this.basisV = axes.basisV; this.pressed = true; this.width = this.height = 0; return;
    }
    this.finish();
  }
  onUp(pointer: PEvt) { if (this.pressed && this.isDrag(pointer)) this.finish(); this.pressed = false; }
  onMove(pointer: PEvt) {
    if (!this.corner || !this.plane) { this.pick(pointer, null); return; }
    const inference = this.pick(pointer, this.corner, { plane: this.plane });
    const point = onPlane(inference.point, this.plane.point, this.plane.normal);
    const delta = point.sub(this.corner);
    this.width = delta.dot(this.basisU); this.height = delta.dot(this.basisV); this.special = '';
    const absWidth = Math.abs(this.width), absHeight = Math.abs(this.height);
    if (absWidth > 1e-4 && absHeight > 1e-4) {
      if (Math.abs(absWidth - absHeight) / Math.max(absWidth, absHeight) < 0.035) { this.height = Math.sign(this.height) * absWidth; this.special = 'Quadrat'; }
      else { const GOLDEN = 1.618; for (const [longer, shorter] of [[absWidth, absHeight], [absHeight, absWidth]]) if (Math.abs(longer / shorter - GOLDEN) < 0.04) { this.special = 'Goldener Schnitt'; } }
    }
    this.editor.setVcb(`${this.editor.fmt(absWidth)}, ${this.editor.fmt(absHeight)}`);
  }
  corners(corner: V3, basisU: V3, basisV: V3, width: number, height: number) { return [corner.clone(), corner.clone().addScaledVector(basisU, width), corner.clone().addScaledVector(basisU, width).addScaledVector(basisV, height), corner.clone().addScaledVector(basisV, height)]; }
  finish() {
    if (!this.corner || Math.abs(this.width) < 1e-4 || Math.abs(this.height) < 1e-4) return;
    const pts = this.corners(this.corner, this.basisU, this.basisV, this.width, this.height);
    this.create(pts, 'Rechteck');
    this.last = { corner: this.corner.clone(), normal: this.plane!.normal.clone(), basisU: this.basisU.clone(), basisV: this.basisV.clone() };
    this.corner = null; this.plane = null;
  }
  create(pts: V3[], label: string) { const editor = this.editor; editor.commit(label, () => editor.entities.addLoop(pts.map(point => editor.toLocal(point)))); editor.setVcb(''); }
  onVcb(text: string) {
    const lengths = parseLengthList(text, this.editor.model.settings.units);
    if (lengths.length !== 2) return false;
    if (this.corner) {
      const width = lengths[0] ?? Math.abs(this.width), height = lengths[1] ?? Math.abs(this.height);
      this.width = Math.sign(this.width || 1) * width; this.height = Math.sign(this.height || 1) * height; this.finish(); return true;
    }
    if (this.last) { // resize the rectangle that was just drawn
      this.editor.undo();
      const { corner: corner, basisU: basisU, basisV: basisV } = this.last; this.create(this.corners(corner, basisU, basisV, lengths[0] ?? 1, lengths[1] ?? 1), 'Rechteck'); return true;
    }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.corner) {
      const pts = this.corners(this.corner, this.basisU, this.basisV, this.width, this.height);
      overlay.polyline(pts, '#0000ff', 1.4, true);
      if (this.special) { overlay.line(pts[0], pts[2], '#888', 1, [4, 3]); overlay.tooltip(this.editor.mouse.x, this.editor.mouse.y, this.special); }
      else this.drawInference(overlay);
    } else this.drawInference(overlay);
  }
}

// ===================================================================== Rotated rectangle (3 points)
export class RotatedRectangleTool extends PointTool {
  id = 'rotrect'; name = 'Gedrehtes Rechteck'; vcbLabel = 'Länge'; cursor = 'crosshair';
  pts: V3[] = []; current: V3 | null = null;
  status() { return ['Wählen Sie die erste Ecke aus.', 'Wählen Sie die zweite Ecke (Länge und Richtung) aus.', 'Wählen Sie die Breite und den Winkel aus.'][this.pts.length]; }
  busy() { return this.pts.length > 0; }
  cancel() { this.pts = []; this.current = null; }
  onMove(pointer: PEvt) {
    const from = this.pts[this.pts.length - 1] ?? null;
    const inference = this.pick(pointer, from);
    this.current = inference.point.clone();
    if (this.pts.length === 1) this.editor.setVcb(this.editor.fmt(this.pts[0].distanceTo(inference.point)));
    if (this.pts.length === 2) this.editor.setVcb(this.editor.fmt(this.thirdOffset().length()));
  }
  thirdOffset(): V3 {
    const [first, second] = this.pts; const baseDir = second.clone().sub(first).normalize();
    const offset = this.current!.clone().sub(second); return offset.sub(baseDir.multiplyScalar(offset.dot(baseDir)));
  }
  onDown(pointer: PEvt) {
    const from = this.pts[this.pts.length - 1] ?? null; const inference = this.pick(pointer, from);
    this.pts.push(inference.point.clone()); this.current = inference.point.clone();
    if (this.pts.length === 3) this.finish();
  }
  rect(): V3[] { const [first, second] = this.pts; const off = this.thirdOffset(); return [first, second, second.clone().add(off), first.clone().add(off)]; }
  finish() {
    this.pts.pop(); const pts = this.rect();
    if (pts[2].distanceTo(pts[1]) > 1e-4) { const editor = this.editor; editor.commit('Gedrehtes Rechteck', () => editor.entities.addLoop(pts.map(point => editor.toLocal(point)))); }
    this.cancel();
  }
  onVcb(text: string) {
    const distance = this.lengthOf(text); if (distance == null) return false;
    if (this.pts.length === 1 && this.current) { const direction = this.current.clone().sub(this.pts[0]).normalize(); this.pts.push(this.pts[0].clone().addScaledVector(direction, distance)); return true; }
    if (this.pts.length === 2 && this.current) { const off = this.thirdOffset().normalize().multiplyScalar(distance); this.current = this.pts[1].clone().add(off); this.pts.push(this.current.clone()); this.finish(); return true; }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.pts.length === 1 && this.current) overlay.line(this.pts[0], this.current, '#000', 1.2);
    if (this.pts.length === 2 && this.current) { const corners = this.rect(); overlay.fillPolygon(corners, 'rgba(100,140,255,0.12)'); overlay.polyline(corners, '#000', 1.2, true); }
    this.drawInference(overlay);
  }
}

// ===================================================================== Circle / Polygon
export class CircleTool extends PointTool {
  id = 'circle'; name = 'Kreis'; vcbLabel = 'Segmente'; cursor = 'crosshair';
  center: V3 | null = null; plane: PlaneRef | null = null; radius = 0; startDir = new THREE.Vector3(1, 0, 0);
  segments = 24; pressed = false; last: { center: V3; normal: V3; direction: V3; radius: number } | null = null;
  constructor(editor: any, public polygon = false) { super(editor); if (polygon) { this.id = 'polygon'; this.name = 'Vieleck'; this.segments = 6; this.vcbLabel = 'Seiten'; } }
  status() { return this.center ? `Wählen Sie den Radius aus oder geben Sie ihn ein. (${this.segments} ${this.polygon ? 'Seiten' : 'Segmente'}; „12s“ ändert die Anzahl)` : `Wählen Sie den Mittelpunkt aus. Geben Sie z. B. „${this.polygon ? 8 : 48}s“ ein, um die ${this.polygon ? 'Seiten' : 'Segmente'} zu ändern.`; }
  activate() { this.editor.setVcb(String(this.segments)); }
  busy() { return !!this.center; }
  cancel() { this.center = null; this.plane = null; this.editor.setVcb(String(this.segments), this.polygon ? 'Seiten' : 'Segmente'); }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    if (!this.center) { const inference = this.pick(pointer, null); const plane = planeFromInference(inference); this.center = inference.point.clone(); this.plane = { point: plane.point, normal: plane.normal }; this.radius = 0; this.pressed = true; this.editor.ui.vcbLabel = 'Radius'; return; }
    this.finish();
  }
  onUp(pointer: PEvt) { if (this.pressed && this.isDrag(pointer)) this.finish(); this.pressed = false; }
  onMove(pointer: PEvt) {
    if (!this.center || !this.plane) { this.pick(pointer, null); return; }
    const inference = this.pick(pointer, this.center, { plane: this.plane });
    const offset = onPlane(inference.point, this.plane.point, this.plane.normal).sub(this.center);
    this.radius = offset.length(); if (this.radius > 1e-6) this.startDir = offset.normalize();
    this.editor.setVcb(this.editor.fmt(this.radius));
  }
  points(center: V3, normal: V3, direction: V3, radius: number): V3[] {
    const out: V3[] = []; const side = normal.clone().cross(direction).normalize();
    for (let i = 0; i < this.segments; i++) { const angle = i / this.segments * Math.PI * 2; out.push(center.clone().addScaledVector(direction, Math.cos(angle) * radius).addScaledVector(side, Math.sin(angle) * radius)); }
    return out;
  }
  finish() {
    if (!this.center || !this.plane || this.radius < 1e-4) return;
    const pts = this.points(this.center, this.plane.normal, this.startDir, this.radius);
    const editor = this.editor; editor.commit(this.name, () => editor.entities.addLoop(pts.map(point => editor.toLocal(point))));
    this.last = { center: this.center.clone(), normal: this.plane.normal.clone(), direction: this.startDir.clone(), radius: this.radius };
    this.center = null; this.plane = null; this.editor.setVcb(this.editor.fmt(this.last.radius), 'Radius');
  }
  onVcb(text: string) {
    const trimmed = text.trim();
    const seg = trimmed.match(/^(\d+)\s*s$/i) || (!this.center && !this.last ? trimmed.match(/^(\d+)$/) : null);
    if (seg) { this.segments = Math.max(3, Math.min(999, parseInt(seg[1]))); if (!this.center) this.editor.setVcb(String(this.segments)); this.editor.refreshStatus(); return true; }
    const distance = this.lengthOf(text); if (distance == null) return false;
    if (this.center) { this.radius = distance; this.finish(); return true; }
    if (this.last) { this.editor.undo(); this.radius = distance; this.center = this.last.center.clone(); this.plane = { point: this.last.center.clone(), normal: this.last.normal.clone() }; this.startDir = this.last.direction.clone(); this.finish(); return true; }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.center && this.plane && this.radius > 1e-6) {
      const pts = this.points(this.center, this.plane.normal, this.startDir, this.radius);
      overlay.fillPolygon(pts, 'rgba(100,140,255,0.12)'); overlay.polyline(pts, '#000', 1.2, true);
      overlay.line(this.center, this.center.clone().addScaledVector(this.startDir, this.radius), '#555', 1, [3, 3]);
    }
    if (this.center) overlay.marker(this.center, 'center');
    this.drawInference(overlay);
  }
}

// ===================================================================== Arcs
const arcPoints = (center: V3, normal: V3, start: V3, angle: number, segs: number): V3[] => {
  const pts: V3[] = []; const radial = start.clone().sub(center);
  for (let i = 0; i <= segs; i++) pts.push(center.clone().add(radial.clone().applyAxisAngle(normal, angle * i / segs)));
  return pts;
};
const signedAngle = (fromVec: V3, toVec: V3, normal: V3) => { return Math.atan2(fromVec.clone().cross(toVec).dot(normal), fromVec.dot(toVec)); };

/** 2-point arc: start, end, bulge (SketchUp default arc tool). */
export class Arc2Tool extends PointTool {
  id = 'arc2'; name = 'Zweipunktbogen'; vcbLabel = 'Länge'; cursor = 'crosshair';
  start: V3 | null = null; end: V3 | null = null; normal = new THREE.Vector3(0, 0, 1); bulge = 0; segments = 12; current: V3 | null = null; half = false;
  status() { return !this.start ? 'Wählen Sie den Startpunkt des Bogens aus.' : !this.end ? 'Wählen Sie den Endpunkt aus.' : 'Wählen Sie die Wölbung aus oder geben Sie sie ein.'; }
  busy() { return !!this.start; }
  cancel() { this.start = this.end = null; this.current = null; this.editor.setVcb('', 'Länge'); }
  onMove(pointer: PEvt) {
    if (!this.end) { const inference = this.pick(pointer, this.start); this.current = inference.point.clone(); if (this.start) this.editor.setVcb(this.editor.fmt(this.start.distanceTo(inference.point))); return; }
    const mid = this.start!.clone().add(this.end).multiplyScalar(0.5);
    const hit = this.editor.viewer.ray(pointer.x, pointer.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, mid), new THREE.Vector3());
    if (!hit) return;
    const bulgeDir = this.bulgeDir(); this.bulge = hit.sub(mid).dot(bulgeDir);
    const halfChord = this.start!.distanceTo(this.end) / 2; this.half = Math.abs(Math.abs(this.bulge) - halfChord) < halfChord * 0.04;
    if (this.half) this.bulge = Math.sign(this.bulge) * halfChord;
    this.editor.setVcb(this.editor.fmt(Math.abs(this.bulge)));
  }
  bulgeDir() { return this.normal.clone().cross(this.end!.clone().sub(this.start!)).normalize(); }
  onDown(pointer: PEvt) {
    if (!this.start) { const inference = this.pick(pointer, null); this.start = inference.point.clone(); const plane = planeFromInference(inference); this.normal = plane.normal; return; }
    if (!this.end) {
      const inference = this.pick(pointer, this.start); if (inference.point.distanceTo(this.start) < 1e-5) return; this.end = inference.point.clone();
      const chordDir = this.end.clone().sub(this.start).normalize();
      if (Math.abs(chordDir.dot(this.normal)) > 1e-3) { this.normal = chordDir.clone().cross(new THREE.Vector3(0, 0, 1)); if (this.normal.lengthSq() < 1e-6) this.normal.set(1, 0, 0); this.normal.normalize(); }
      this.editor.ui.vcbLabel = 'Wölbung'; return;
    }
    this.finish();
  }
  points(): V3[] {
    const start = this.start!, end = this.end!; const halfChord = start.distanceTo(end) / 2; const bulge = this.bulge;
    if (Math.abs(bulge) < 1e-6) return [start, end];
    const radius = (halfChord * halfChord + bulge * bulge) / (2 * Math.abs(bulge));
    const mid = start.clone().add(end).multiplyScalar(0.5); const bulgeDir = this.bulgeDir().multiplyScalar(Math.sign(bulge));
    const center = mid.clone().addScaledVector(bulgeDir, Math.abs(bulge) - radius);
    const total = 4 * Math.atan(Math.abs(bulge) / halfChord);
    const ang = signedAngle(start.clone().sub(center), end.clone().sub(center), this.normal);
    const dir = Math.sign(ang) || 1;
    // choose rotation direction that passes through the bulge point
    let theta = dir * total; const test = start.clone().sub(center).applyAxisAngle(this.normal, theta / 2).add(center);
    if (test.distanceTo(mid.clone().addScaledVector(bulgeDir, Math.abs(bulge))) > 1e-3 * Math.max(1, radius)) theta = -theta;
    return arcPoints(center, this.normal, start, theta, this.segments);
  }
  finish() {
    const pts = this.points(); const editor = this.editor;
    editor.commit(this.name, () => { for (let i = 0; i < pts.length - 1; i++) editor.entities.addLine(editor.toLocal(pts[i]), editor.toLocal(pts[i + 1])); });
    this.cancel();
  }
  onVcb(text: string) {
    const segMatch = text.trim().match(/^(\d+)\s*s$/i); if (segMatch) { this.segments = Math.max(2, parseInt(segMatch[1])); return true; }
    const distance = this.lengthOf(text); if (distance == null) return false;
    if (this.start && !this.end && this.current) { const direction = this.current.clone().sub(this.start).normalize(); this.end = this.start.clone().addScaledVector(direction, distance); this.editor.ui.vcbLabel = 'Wölbung'; return true; }
    if (this.end) { this.bulge = Math.sign(this.bulge || 1) * distance; this.finish(); return true; }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.start && !this.end && this.current) overlay.line(this.start, this.current, '#000', 1);
    if (this.end) { overlay.polyline(this.points(), this.half ? '#c000c0' : '#000', 1.5); if (this.half) overlay.tooltip(this.editor.mouse.x, this.editor.mouse.y, 'Halbkreis'); }
    if (!this.end) this.drawInference(overlay);
  }
}

/** Center arc / pie: center, start point, end angle. */
export class ArcCenterTool extends PointTool {
  id = 'arc'; name = 'Bogen'; vcbLabel = 'Radius'; cursor = 'crosshair';
  center: V3 | null = null; startPoint: V3 | null = null; normal = new THREE.Vector3(0, 0, 1); angle = 0; segments = 12; current: V3 | null = null;
  constructor(editor: any, public pie = false) { super(editor); if (pie) { this.id = 'pie'; this.name = 'Kuchen'; } }
  status() { return !this.center ? 'Wählen Sie den Mittelpunkt aus.' : !this.startPoint ? 'Wählen Sie den Startpunkt (Radius) aus.' : 'Wählen Sie den Endwinkel aus.'; }
  busy() { return !!this.center; }
  cancel() { this.center = this.startPoint = null; this.angle = 0; this.editor.setVcb('', 'Radius'); }
  onMove(pointer: PEvt) {
    if (!this.startPoint) { const inference = this.pick(pointer, this.center); this.current = inference.point.clone(); if (this.center) this.editor.setVcb(this.editor.fmt(onPlane(inference.point, this.center, this.normal).distanceTo(this.center))); return; }
    const hit = this.editor.viewer.ray(pointer.x, pointer.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.center!), new THREE.Vector3()); if (!hit) return;
    let angle = signedAngle(this.startPoint.clone().sub(this.center!), hit.sub(this.center!), this.normal);
    // continue past 180° smoothly
    if (this.angle > Math.PI / 2 && angle < 0) angle += Math.PI * 2; else if (this.angle < -Math.PI / 2 && angle > 0) angle -= Math.PI * 2;
    this.angle = angle; this.editor.setVcb((angle * 180 / Math.PI).toFixed(1).replace('.', ',') + '°');
  }
  onDown(pointer: PEvt) {
    if (!this.center) { const inference = this.pick(pointer, null); this.center = inference.point.clone(); this.normal = planeFromInference(inference).normal; return; }
    if (!this.startPoint) { const inference = this.pick(pointer, this.center); const point = onPlane(inference.point, this.center, this.normal); if (point.distanceTo(this.center) < 1e-5) return; this.startPoint = point; this.editor.ui.vcbLabel = 'Winkel'; return; }
    this.finish();
  }
  points() { return arcPoints(this.center!, this.normal, this.startPoint!, this.angle, Math.max(2, Math.ceil(this.segments * Math.abs(this.angle) / Math.PI))); }
  finish() {
    if (Math.abs(this.angle) < 1e-4) return;
    const pts = this.points(); const editor = this.editor; const center = this.center!;
    editor.commit(this.name, () => {
      const entities = editor.entities;
      for (let i = 0; i < pts.length - 1; i++) entities.addLine(editor.toLocal(pts[i]), editor.toLocal(pts[i + 1]));
      if (this.pie) { entities.addLine(editor.toLocal(center), editor.toLocal(pts[0])); entities.addLine(editor.toLocal(pts[pts.length - 1]), editor.toLocal(center)); }
    });
    this.cancel();
  }
  onVcb(text: string) {
    const segMatch = text.trim().match(/^(\d+)\s*s$/i); if (segMatch) { this.segments = Math.max(2, parseInt(segMatch[1])); return true; }
    if (this.center && !this.startPoint && this.current) { const distance = this.lengthOf(text); if (distance == null) return false; let direction = onPlane(this.current, this.center, this.normal).sub(this.center); if (direction.lengthSq() < 1e-10) direction = planeAxes(this.normal).basisU; this.startPoint = this.center.clone().addScaledVector(direction.normalize(), distance); this.editor.ui.vcbLabel = 'Winkel'; return true; }
    if (this.startPoint) { const degrees = parseFloat(text.replace(',', '.')); if (isNaN(degrees)) return false; this.angle = degrees * Math.PI / 180; this.finish(); return true; }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.center && !this.startPoint && this.current) { const point = onPlane(this.current, this.center, this.normal); overlay.line(this.center, point, '#555', 1, [3, 3]); overlay.circle3D(this.center, this.normal, point.distanceTo(this.center), '#9aa', 1, 64, [2, 3]); }
    if (this.startPoint) { const pts = this.points(); overlay.polyline(pts, '#000', 1.5); if (this.pie) { overlay.line(this.center!, pts[0], '#000', 1.2); overlay.line(this.center!, pts[pts.length - 1], '#000', 1.2); } else overlay.line(this.center!, this.startPoint, '#888', 1, [3, 3]); }
    if (this.center) overlay.marker(this.center, 'center');
    if (!this.startPoint) this.drawInference(overlay);
  }
}

/** 3-point arc */
export class Arc3Tool extends PointTool {
  id = 'arc3'; name = 'Dreipunktbogen'; cursor = 'crosshair'; vcbLabel = 'Länge';
  pts: V3[] = []; current: V3 | null = null; segments = 12;
  status() { return ['Wählen Sie den Startpunkt aus.', 'Wählen Sie einen zweiten Punkt auf dem Bogen aus.', 'Wählen Sie den Endpunkt aus.'][this.pts.length]; }
  busy() { return this.pts.length > 0; }
  cancel() { this.pts = []; this.current = null; }
  onMove(pointer: PEvt) { const inference = this.pick(pointer, this.pts[this.pts.length - 1] ?? null); this.current = inference.point.clone(); }
  onDown(pointer: PEvt) { const inference = this.pick(pointer, this.pts[this.pts.length - 1] ?? null); this.pts.push(inference.point.clone()); if (this.pts.length === 3) this.finish(); }
  arc(first: V3, second: V3, third: V3): V3[] | null {
    const toSecond = second.clone().sub(first), toThird = third.clone().sub(first); const normal = toSecond.clone().cross(toThird); if (normal.length() < 1e-9) return null;
    const normalSq = normal.lengthSq();
    const center = first.clone().add(toThird.clone().multiplyScalar(toSecond.lengthSq()).cross(normal).add(normal.clone().cross(toSecond).multiplyScalar(toThird.lengthSq())).multiplyScalar(1 / (2 * normalSq)));
    const unitNormal = normal.clone().normalize();
    let ang = signedAngle(first.clone().sub(center), third.clone().sub(center), unitNormal); if (ang < 0) ang += Math.PI * 2;
    return arcPoints(center, unitNormal, first, ang, Math.max(3, Math.ceil(this.segments * ang / Math.PI)));
  }
  finish() {
    const pts = this.arc(this.pts[0], this.pts[1], this.pts[2]); this.pts = [];
    if (!pts) return; const editor = this.editor;
    editor.commit(this.name, () => { for (let i = 0; i < pts.length - 1; i++) editor.entities.addLine(editor.toLocal(pts[i]), editor.toLocal(pts[i + 1])); });
  }
  draw(overlay: Overlay) {
    if (this.pts.length === 1 && this.current) overlay.line(this.pts[0], this.current, '#000', 1);
    if (this.pts.length === 2 && this.current) { const preview = this.arc(this.pts[0], this.pts[1], this.current); if (preview) overlay.polyline(preview, '#000', 1.5); else overlay.polyline([...this.pts, this.current], '#000', 1); }
    this.drawInference(overlay);
  }
}
