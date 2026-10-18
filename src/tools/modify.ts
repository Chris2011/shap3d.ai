import * as THREE from 'three';
import type { VertRec, EdgeRec, FaceHit } from '../engine/viewer';
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
    for (const vertex of ents.collectVertices(refs)) this.verts.set(vertex, ents.positionOf(vertex).clone());
    for (const entityRef of refs) if (entityRef.kind === 'instance') { const instance = ents.instances.get(entityRef.id); if (instance) this.insts.set(entityRef.id, instance.matrix.clone()); }
  }
  apply(transform: THREE.Matrix4) {
    for (const [vertex, original] of this.verts) this.ents.vertices.get(vertex)?.position.copy(original).applyMatrix4(transform);
    for (const [id, matrix] of this.insts) { const instance = this.ents.instances.get(id); if (instance) instance.matrix.copy(matrix).premultiply(transform); }
    this.ents.invalidateHash();
  }
  finish() { this.ents.weld(this.verts.keys()); }
  has(vertex: number) { return this.verts.has(vertex); }
}

/** Shared selection-or-hover behaviour of Move/Rotate/Scale. */
const hoverPick = (editor: Editor, pointer: { x: number; y: number }): EntityRef | null => {
  const edgeHit = editor.viewer.pickEdge(pointer.x, pointer.y, 6);
  if (edgeHit) { const entityRef = editor.refFromPick(edgeHit.rec.context.path, 'edge', edgeHit.rec.edgeId); if (entityRef) return entityRef; }
  const faceHit = editor.viewer.pickFace(pointer.x, pointer.y);
  if (faceHit) return editor.refFromPick(faceHit.context.path, 'face', faceHit.faceId);
  return null;
};

const contextFilters = (editor: Editor, live: LiveTransform | null) => {
  const ents = editor.entities; const ids = new Set(live ? [...live.insts.keys()] : []);
  const pathHit = (path: any[]) => path.some(step => ids.has(step.id));
  return {
    filterVert: (vertex: VertRec) => !(live && ((vertex.context.entities === ents && live.has(vertex.vertexId)) || pathHit(vertex.context.path))),
    filterEdge: (edgeRec: EdgeRec) => { if (!live) return true; if (pathHit(edgeRec.context.path)) return false; if (edgeRec.context.entities !== ents) return true; const edge = ents.edges.get(edgeRec.edgeId); return !(edge && live.has(edge.start) && live.has(edge.end)); },
    filterFace: (context: FaceHit["context"], faceId: number) => { if (!live) return true; if (pathHit(context.path)) return false; if (context.entities !== ents) return true; const face = ents.faces.get(faceId); return !(face && ents.faceVertices(face).every(vertex => live.has(vertex))); },
  };
};

// ===================================================================== Push/Pull
export class PushPullTool extends PointTool {
  id = 'pushpull'; name = 'Drücken/Ziehen'; vcbLabel = 'Abstand'; cursor = 'crosshair';
  faceId: number | null = null; start: V3 | null = null; normal = new THREE.Vector3(); distance = 0; pressed = false;
  last: { faceId: number; distance: number; created: number | null } | null = null;
  status() { return this.faceId != null ? 'Klicken, um die Distanz festzulegen, oder Abstand eingeben. | Doppelklick = letzte Distanz wiederholen.' : 'Klicken, um die zu drückende oder zu ziehende Fläche auszuwählen. | Doppelklick = letzte Distanz wiederholen.'; }
  busy() { return this.faceId != null; }
  cancel() { this.faceId = null; this.start = null; this.editor.setHover(null); this.editor.setVcb(''); }
  hoverFace(pointer: { x: number; y: number }) {
    const editor = this.editor; const faceHit = editor.viewer.pickFace(pointer.x, pointer.y, (context) => context.path.length === editor.activePath.length && editor.inContext(context.path));
    return faceHit;
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (this.faceId == null) { const faceHit = this.hoverFace(pointer); editor.setHover(faceHit ? { kind: 'face', id: faceHit.faceId } : null); return; }
    const face = editor.entities.faces.get(this.faceId); if (!face) return;
    const own = new Set(editor.entities.faceVertices(face));
    const inference = this.pick(pointer, this.start, { lock: this.normal, filterVert: (vertex: VertRec) => !(vertex.context.entities === editor.entities && own.has(vertex.vertexId)) } as any);
    let point = closestOnLineToRay(this.start!, this.normal, editor.viewer.ray(pointer.x, pointer.y));
    const vertexHit = editor.viewer.pickVertex(pointer.x, pointer.y, 10, vertex => !(vertex.context.entities === editor.entities && own.has(vertex.vertexId)));
    if (vertexHit) point = vertexHit.rec.position.clone(); else { const faceHit = editor.viewer.pickFace(pointer.x, pointer.y, (context, faceId) => !(context.entities === editor.entities && faceId === this.faceId)); if (faceHit && Math.abs(faceHit.normal.dot(this.normal)) > 0.99) point = faceHit.point; }
    this.distance = point.clone().sub(this.start!).dot(this.normal);
    this.inference = { ...inference, label: vertexHit ? 'Endpunkt' : '', point: this.start!.clone().addScaledVector(this.normal, this.distance) };
    editor.setVcb(editor.fmt(Math.abs(this.distance)));
  }
  onDown(pointer: PEvt) {
    const editor = this.editor; this.downAt = { x: pointer.x, y: pointer.y };
    if (this.faceId == null) {
      const faceHit = this.hoverFace(pointer); if (!faceHit) return;
      this.faceId = faceHit.faceId; this.start = faceHit.point.clone(); this.normal = faceHit.normal.clone().normalize(); this.distance = 0; this.pressed = true; editor.setHover({ kind: 'face', id: faceHit.faceId });
      return;
    }
    this.finish(this.distance);
  }
  onUp(pointer: PEvt) { if (this.pressed && this.isDrag(pointer)) this.finish(this.distance); this.pressed = false; }
  onDblClick(pointer: PEvt) {
    if (!this.editor.lastPushPull) return;
    const faceHit = this.hoverFace(pointer); if (!faceHit) return;
    this.cancel(); this.faceId = faceHit.faceId; this.start = faceHit.point.clone(); this.normal = faceHit.normal.clone().normalize();
    // use the face's own direction like SketchUp (repeat in the same sense)
    this.finish(this.editor.lastPushPull);
  }
  localDistance(distance: number): number {
    const editor = this.editor; const face = editor.entities.faces.get(this.faceId!)!;
    const localNormal = editor.entities.faceNormal(face);
    const localStart = editor.toLocal(this.start!), localEnd = editor.toLocal(this.start!.clone().addScaledVector(this.normal, distance));
    return localEnd.sub(localStart).dot(localNormal);
  }
  finish(distance: number) {
    const editor = this.editor; if (this.faceId == null || Math.abs(distance) < 1e-6) { if (this.faceId != null && Math.abs(distance) < 1e-6 && !this.pressed) this.cancel(); return; }
    const faceId = this.faceId; const localDist = this.localDistance(distance);
    const created = editor.commit('Drücken/Ziehen', () => editor.entities.pushPull(faceId, localDist));
    editor.lastPushPull = distance; this.last = { faceId: faceId, distance: localDist, created };
    this.cancel(); editor.setVcb(editor.fmt(Math.abs(distance)));
  }
  onVcb(text: string) {
    const distance = this.lengthOf(text); if (distance == null) return false;
    if (this.faceId != null) { this.finish(Math.sign(this.distance || 1) * distance); return true; }
    if (this.last) { // change the last push/pull
      const editor = this.editor; const sign = Math.sign(this.last.distance) || 1; editor.undo();
      const faceId = this.last.faceId; if (!editor.entities.faces.has(faceId)) return false;
      const created = editor.commit('Drücken/Ziehen', () => editor.entities.pushPull(faceId, sign * distance));
      this.last = { faceId: faceId, distance: sign * distance, created }; editor.lastPushPull = distance * sign; return true;
    }
    return false;
  }
  draw(overlay: Overlay) {
    const editor = this.editor;
    if (this.faceId != null && this.start) {
      const face = editor.entities.faces.get(this.faceId); if (!face) return;
      const off = this.normal.clone().multiplyScalar(this.distance);
      for (const loop of editor.entities.loops(face)) {
        const base = loop.map(vertex => editor.toWorld(editor.entities.positionOf(vertex)));
        const top = base.map(point => point.clone().add(off));
        overlay.fillPolygon(top, 'rgba(90,120,255,0.18)');
        overlay.polyline(top, '#000', 1.2, true);
        for (let i = 0; i < base.length; i++) overlay.line(base[i], top[i], '#000', 1);
      }
      if (this.inference?.label) overlay.tooltip(editor.mouse.x, editor.mouse.y, this.inference.label);
    }
  }
}

// ===================================================================== Offset
export class OffsetTool extends PointTool {
  id = 'offset'; name = 'Versatz'; vcbLabel = 'Abstand'; cursor = 'crosshair';
  faceId: number | null = null; distance = 0; pressed = false;
  status() { return this.faceId != null ? 'Bewegen Sie den Cursor, um den Versatz festzulegen, oder geben Sie eine Distanz ein.' : 'Wählen Sie eine Fläche für den Versatz aus.'; }
  busy() { return this.faceId != null; }
  cancel() { this.faceId = null; this.editor.setHover(null); }
  face(pointer: { x: number; y: number }) { const editor = this.editor; return editor.viewer.pickFace(pointer.x, pointer.y, context => context.path.length === editor.activePath.length && editor.inContext(context.path)); }
  worldLoop(): V3[] { const editor = this.editor; const face = editor.entities.faces.get(this.faceId!)!; return face.outer.map(vertex => editor.toWorld(editor.entities.positionOf(vertex))); }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (this.faceId == null) { const faceHit = this.face(pointer); editor.setHover(faceHit ? { kind: 'face', id: faceHit.faceId } : null); return; }
    const pts = this.worldLoop(); const normal = polygonNormal(pts);
    const hit = editor.viewer.ray(pointer.x, pointer.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pts[0]), new THREE.Vector3()); if (!hit) return;
    const { basisU: basisU, basisV: basisV } = planeBasis(normal); const hit2D = to2D([hit], pts[0], basisU, basisV)[0]; const poly = to2D(pts, pts[0], basisU, basisV);
    let dist = Infinity; for (let i = 0; i < poly.length; i++) dist = Math.min(dist, distPointSegment2D(hit2D, poly[i], poly[(i + 1) % poly.length]));
    this.distance = pointInPolygon2D(hit2D, poly) ? dist : -dist;
    editor.setVcb(editor.fmt(Math.abs(this.distance)));
  }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    if (this.faceId == null) {
      const sel = this.editor.selected().filter(entityRef => entityRef.kind === 'face');
      const faceHit = this.face(pointer); if (!faceHit) return;
      this.faceId = sel.length === 1 ? sel[0].id : faceHit.faceId; this.distance = 0; this.pressed = true; return;
    }
    this.finish(this.distance);
  }
  onUp(pointer: PEvt) { if (this.pressed && this.isDrag(pointer)) this.finish(this.distance); this.pressed = false; }
  onDblClick(pointer: PEvt) { const faceHit = this.face(pointer); if (faceHit && this.editor.lastOffset) { this.faceId = faceHit.faceId; this.finish(this.editor.lastOffset); } }
  finish(distance: number) {
    if (this.faceId == null || Math.abs(distance) < 1e-5) return;
    const editor = this.editor; const faceId = this.faceId;
    editor.commit('Versatz', () => {
      const face = editor.entities.faces.get(faceId)!; const pts = editor.entities.facePoints(face);
      const off = offsetPolygon(pts, editor.entities.faceNormal(face), distance);
      editor.entities.addLoop(off);
    });
    editor.lastOffset = distance; this.cancel();
  }
  onVcb(text: string) { const distance = this.lengthOf(text); if (distance == null || this.faceId == null) return false; this.finish(Math.sign(this.distance || 1) * distance); return true; }
  draw(overlay: Overlay) {
    if (this.faceId == null) return;
    const pts = this.worldLoop(); const normal = polygonNormal(pts);
    overlay.polyline(offsetPolygon(pts, normal, this.distance), '#000', 1.3, true);
  }
}

// ===================================================================== Move
export class MoveTool extends PointTool {
  id = 'move'; name = 'Verschieben'; vcbLabel = 'Abstand'; cursor = 'move';
  start: V3 | null = null; live: LiveTransform | null = null; copy = false; pressed = false; delta = new THREE.Vector3();
  lastCopy: { refs: EntityRef[]; delta: V3; orig: EntityRef[] } | null = null;
  status() { return this.start ? `Klicken, um den Zielpunkt festzulegen, oder Abstand eingeben. ${this.copy ? '(Kopie) ' : ''}| Strg = Kopie ein/aus. Pfeiltasten = Ableitungsrichtung fixieren.` : 'Klicken, um den Startpunkt festzulegen. | Strg = Kopie ein/aus.'; }
  busy() { return !!this.start; }
  cancel() { if (this.start) this.editor.abortOp(); this.start = null; this.live = null; this.resetLocks(); this.editor.setHover(null); }
  activate() { this.copy = false; }
  refs(): EntityRef[] { return this.editor.selected(); }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (!this.start) {
      this.pick(pointer, null);
      if (!editor.selected().length) editor.setHover(hoverPick(editor, pointer));
      return;
    }
    const inference = this.pick(pointer, this.start, contextFilters(editor, this.live));
    this.apply(inference.point.clone().sub(this.start));
  }
  apply(delta: V3) {
    const editor = this.editor; this.delta.copy(delta);
    const localStart = editor.toLocal(this.start!), localEnd = editor.toLocal(this.start!.clone().add(delta));
    const matrix = new THREE.Matrix4().makeTranslation(localEnd.x - localStart.x, localEnd.y - localStart.y, localEnd.z - localStart.z);
    this.live!.apply(matrix); editor.invalidate();
    editor.setVcb(editor.fmt(delta.length()));
  }
  begin(point: V3) {
    const editor = this.editor;
    if (!editor.selected().length && editor.hover) editor.select([editor.hover]);
    if (!editor.selected().length) return;
    editor.setHover(null);
    this.start = point.clone();
    editor.beginOp(this.copy ? 'Kopieren' : 'Verschieben');
    let refs = this.refs();
    const orig = refs;
    if (this.copy) { refs = editor.entities.copy(refs, new THREE.Matrix4(), editor.model); editor.select(refs); }
    this.live = new LiveTransform(editor.entities, refs);
    this.lastCopy = this.copy ? { refs, delta: new THREE.Vector3(), orig } : null;
  }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    if (!this.start) { const inference = this.pick(pointer, null); this.begin(inference.point); this.pressed = true; return; }
    this.finish();
  }
  onUp(pointer: PEvt) { if (this.pressed && this.isDrag(pointer) && this.start) this.finish(); this.pressed = false; }
  finish() {
    if (!this.start || !this.live) return;
    const editor = this.editor;
    if (this.delta.lengthSq() < 1e-12 && !this.copy) { this.cancel(); return; }
    this.live.finish(); editor.endOp();
    if (this.lastCopy) this.lastCopy.delta = this.delta.clone();
    this.start = null; this.live = null; this.resetLocks(); editor.invalidate();
  }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    if (keyEvent.key === 'Control' && down && !keyEvent.repeat) {
      this.copy = !this.copy;
      if (this.start) { const start = this.start, delta = this.delta.clone(); this.editor.abortOp(); this.start = null; this.live = null; this.begin(start); this.apply(delta); }
      this.editor.refreshStatus(); return true;
    }
    return super.onKey(keyEvent, down);
  }
  onVcb(text: string) {
    const editor = this.editor;
    const arr = parseArray(text);
    if (arr && !this.start && this.lastCopy) {
      const { orig, delta } = this.lastCopy; const copies = arr.count; if (copies < 1) return false;
      editor.undo();
      editor.commit(arr.kind === 'multiply' ? 'Kopieren (Reihe)' : 'Kopieren (Teilen)', () => {
        const step = arr.kind === 'multiply' ? delta.clone() : delta.clone().multiplyScalar(1 / copies);
        const all: EntityRef[] = [];
        for (let i = 1; i <= copies; i++) {
          const localStart = editor.toLocal(new THREE.Vector3()), localEnd = editor.toLocal(step.clone().multiplyScalar(i));
          const refs = editor.entities.copy(orig, new THREE.Matrix4().makeTranslation(localEnd.x - localStart.x, localEnd.y - localStart.y, localEnd.z - localStart.z), editor.model);
          editor.entities.weld(editor.entities.collectVertices(refs)); all.push(...refs);
        }
        editor.select(all);
      });
      this.lastCopy = null; return true;
    }
    if (!this.start) return false;
    const lengths = parseLengthList(text, editor.model.settings.units);
    if (lengths.length === 3 && lengths.every(x => x != null)) { this.apply(new THREE.Vector3(lengths[0]!, lengths[1]!, lengths[2]!)); this.finish(); return true; }
    const distance = this.lengthOf(text); if (distance == null) return false;
    const dir = this.delta.lengthSq() > 1e-12 ? this.delta.clone().normalize() : new THREE.Vector3(1, 0, 0);
    this.apply(dir.multiplyScalar(distance)); this.finish(); return true;
  }
  draw(overlay: Overlay) {
    if (this.start && this.inference) { const col = this.inference.axis ? AXIS_COLOR[this.inference.axis] : '#000'; overlay.line(this.start, this.start.clone().add(this.delta), col, 1.2, [4, 3]); }
    this.drawInference(overlay);
    if (this.copy) { const context = overlay.context; context.font = 'bold 14px sans-serif'; context.fillStyle = '#000'; context.fillText('+', this.editor.mouse.x + 12, this.editor.mouse.y - 6); }
  }
}

// ===================================================================== Rotate
export class RotateTool extends PointTool {
  id = 'rotate'; name = 'Drehen'; vcbLabel = 'Winkel'; cursor = 'crosshair';
  center: V3 | null = null; ref: V3 | null = null; normal = new THREE.Vector3(0, 0, 1); angle = 0; live: LiveTransform | null = null; copy = false; normalLock: 'x' | 'y' | 'z' | null = null;
  hoverN = new THREE.Vector3(0, 0, 1); hoverP: V3 | null = null;
  lastCopy: { orig: EntityRef[]; angle: number; center: V3; normal: V3 } | null = null;
  status() { return !this.center ? 'Wählen Sie den Drehpunkt aus. Pfeiltasten richten den Winkelmesser aus.' : !this.ref ? 'Wählen Sie den Startpunkt des Drehwinkels aus.' : 'Wählen Sie den Drehwinkel aus oder geben Sie ihn ein. Strg = Kopie.'; }
  busy() { return !!this.center; }
  cancel() { if (this.live) this.editor.abortOp(); this.center = this.ref = null; this.live = null; this.angle = 0; this.editor.setHover(null); }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    if (down && ['ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(keyEvent.key) && !this.ref) { const axis = keyEvent.key === 'ArrowUp' ? 'z' : keyEvent.key === 'ArrowRight' ? 'x' : 'y'; this.normalLock = this.normalLock === axis ? null : axis; if (this.center) this.normal = AXES[axis].clone(); return true; }
    if (keyEvent.key === 'Control' && down && !keyEvent.repeat) { this.copy = !this.copy; return true; }
    return super.onKey(keyEvent, down);
  }
  planeNormal(): V3 { if (this.normalLock) return AXES[this.normalLock].clone(); return this.hoverN.clone(); }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (!this.center) {
      const hoverInference = this.pick(pointer, null); this.hoverP = hoverInference.point.clone();
      this.hoverN = hoverInference.face && hoverInference.kind === 'face' ? hoverInference.face.normal.clone().normalize() : new THREE.Vector3(0, 0, 1);
      if (!editor.selected().length) editor.setHover(hoverPick(editor, pointer));
      return;
    }
    if (!this.ref) { const refInference = this.pick(pointer, this.center); this.hoverP = onPlane(refInference.point, this.center, this.normal); return; }
    const hit = editor.viewer.ray(pointer.x, pointer.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.center), new THREE.Vector3());
    let target = hit;
    const inference = this.pick(pointer, this.center, contextFilters(editor, this.live));
    if (inference.kind === 'endpoint' || inference.kind === 'midpoint' || inference.kind === 'edge') target = onPlane(inference.point, this.center, this.normal);
    if (!target) return;
    const fromRef = this.ref.clone().sub(this.center), toTarget = target.sub(this.center);
    let ang = Math.atan2(fromRef.clone().cross(toTarget).dot(this.normal), fromRef.dot(toTarget));
    const step = Math.PI / 12; const snap = Math.round(ang / step) * step;
    if (Math.abs(ang - snap) < THREE.MathUtils.degToRad(2.5) && !(inference.kind === 'endpoint')) ang = snap;
    this.applyAngle(ang);
  }
  matrix(angle: number): THREE.Matrix4 {
    const editor = this.editor; const center = this.center!;
    const matrix = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z).multiply(new THREE.Matrix4().makeRotationAxis(this.normal, angle)).multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    return editor.contextInverse.multiply(matrix).multiply(editor.contextMatrix);
  }
  applyAngle(angle: number) { this.angle = angle; this.live?.apply(this.matrix(angle)); this.editor.invalidate(); this.editor.setVcb(formatAngle(angle)); }
  onDown(pointer: PEvt) {
    const editor = this.editor;
    if (!this.center) {
      if (!editor.selected().length && editor.hover) editor.select([editor.hover]);
      if (!editor.selected().length) { editor.toast('Wählen Sie zuerst Objekte aus.'); return; }
      editor.setHover(null);
      const inference = this.pick(pointer, null); this.center = inference.point.clone(); this.normal = this.planeNormal(); return;
    }
    if (!this.ref) {
      const inference = this.pick(pointer, this.center); const point = onPlane(inference.point, this.center, this.normal); if (point.distanceTo(this.center) < 1e-5) return;
      this.ref = point; editor.beginOp(this.copy ? 'Drehen (Kopie)' : 'Drehen');
      let refs = editor.selected(); const orig = refs;
      if (this.copy) { refs = editor.entities.copy(refs, new THREE.Matrix4(), editor.model); editor.select(refs); }
      this.live = new LiveTransform(editor.entities, refs);
      this.lastCopy = this.copy ? { orig, angle: 0, center: this.center.clone(), normal: this.normal.clone() } : null;
      return;
    }
    this.finish();
  }
  finish() {
    const editor = this.editor; if (!this.live) return;
    this.live.finish(); editor.endOp(); if (this.lastCopy) this.lastCopy.angle = this.angle;
    this.center = this.ref = null; this.live = null; editor.invalidate();
  }
  onVcb(text: string) {
    const editor = this.editor; const arr = parseArray(text);
    if (arr && !this.center && this.lastCopy) {
      const { orig, angle, center, normal: normal } = this.lastCopy; editor.undo();
      editor.commit('Drehen (Reihe)', () => {
        const all: EntityRef[] = [];
        for (let i = 1; i <= arr.count; i++) {
          this.center = center; this.normal = normal;
          const matrix = this.matrix(arr.kind === 'multiply' ? angle * i : angle * i / arr.count);
          const refs = editor.entities.copy(orig, matrix, editor.model); editor.entities.weld(editor.entities.collectVertices(refs)); all.push(...refs);
        }
        this.center = null; editor.select(all);
      });
      this.lastCopy = null; return true;
    }
    if (!this.ref) return false;
    const degrees = parseFloat(text.replace(',', '.').replace('°', '')); if (isNaN(degrees)) return false;
    this.applyAngle(degrees * Math.PI / 180); this.finish(); return true;
  }
  draw(overlay: Overlay) {
    const editor = this.editor;
    const center = this.center ?? this.hoverP; if (!center) return;
    const normal = this.center ? this.normal : this.planeNormal();
    const radius = editor.viewer.worldPerPixel(center) * 55;
    const col = Math.abs(normal.z) > 0.99 ? '#0000e0' : Math.abs(normal.x) > 0.99 ? '#e00000' : Math.abs(normal.y) > 0.99 ? '#00a000' : '#555';
    overlay.circle3D(center, normal, radius, col, 1.5, 64);
    // ticks every 15°
    const { basisU: basisU, basisV: basisV } = planeAxes(normal);
    for (let i = 0; i < 24; i++) { const angle = i / 24 * Math.PI * 2; const direction = basisU.clone().multiplyScalar(Math.cos(angle)).addScaledVector(basisV, Math.sin(angle)); overlay.line(center.clone().addScaledVector(direction, radius * (i % 6 === 0 ? 0.78 : 0.88)), center.clone().addScaledVector(direction, radius), col, 1); }
    overlay.marker(center, 'center');
    if (this.center && (this.ref || this.hoverP)) {
      const reference = this.ref ?? this.hoverP!; overlay.line(this.center, reference, '#555', 1, [4, 3]);
      if (this.ref) { const cur = this.ref.clone().sub(this.center).applyAxisAngle(this.normal, this.angle).add(this.center); overlay.line(this.center, cur, '#000', 1.2); }
    }
    if (this.copy) { const context = overlay.context; context.font = 'bold 14px sans-serif'; context.fillStyle = '#000'; context.fillText('+', editor.mouse.x + 12, editor.mouse.y - 6); }
    if (!this.ref) this.drawInference(overlay);
  }
}

// ===================================================================== Scale
interface Grip { fraction: V3; world: V3 }
export class ScaleTool extends PointTool {
  id = 'scale'; name = 'Skalieren'; vcbLabel = 'Skalierung'; cursor = 'crosshair';
  box: THREE.Box3 | null = null; grips: Grip[] = []; hot: Grip | null = null; active: Grip | null = null;
  anchor = new THREE.Vector3(); mask = new THREE.Vector3(); live: LiveTransform | null = null; factor = new THREE.Vector3(1, 1, 1); pressed = false;
  status() { return this.active ? 'Ziehen Sie, um zu skalieren, oder geben Sie einen Faktor ein. Strg = um die Mitte, Umschalt = gleichmäßig.' : this.box ? 'Wählen Sie einen Ziehpunkt aus.' : 'Wählen Sie die zu skalierenden Objekte aus.'; }
  activate() { this.refresh(); }
  busy() { return !!this.active; }
  cancel() { if (this.active) this.editor.abortOp(); this.active = null; this.live = null; this.refresh(); }
  refresh() {
    const editor = this.editor; const refs = editor.selected();
    if (!refs.length) { this.box = null; this.grips = []; return; }
    const box = editor.entities.refBounds(refs); if (box.isEmpty()) { this.box = null; this.grips = []; return; }
    this.box = box; this.grips = [];
    const size = box.getSize(new THREE.Vector3()); const seen = new Set<string>();
    for (const x of [0, 0.5, 1]) for (const y of [0, 0.5, 1]) for (const z of [0, 0.5, 1]) {
      if (x === 0.5 && y === 0.5 && z === 0.5) continue;
      const fraction = new THREE.Vector3(size.x < 1e-6 ? 0.5 : x, size.y < 1e-6 ? 0.5 : y, size.z < 1e-6 ? 0.5 : z);
      if (fraction.x === 0.5 && fraction.y === 0.5 && fraction.z === 0.5) continue;
      const key = fraction.toArray().join(); if (seen.has(key)) continue; seen.add(key);
      const localPos = new THREE.Vector3(box.min.x + size.x * fraction.x, box.min.y + size.y * fraction.y, box.min.z + size.z * fraction.z);
      this.grips.push({ fraction: fraction, world: editor.toWorld(localPos) });
    }
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (!this.box) { this.refresh(); if (!this.box) { editor.setHover(hoverPick(editor, pointer)); return; } }
    if (!this.active) {
      this.hot = null; let best = 10;
      for (const candidate of this.grips) { const screenPos = editor.viewer.project(candidate.world); const distance = Math.hypot(screenPos.x - pointer.x, screenPos.y - pointer.y); if (distance < best) { best = distance; this.hot = candidate; } }
      return;
    }
    const grip = this.active; const anchorWorld = editor.toWorld(this.anchor);
    const dir = grip.world.clone().sub(anchorWorld); const gripDistance = dir.length(); if (gripDistance < 1e-9) return;
    const point = closestOnLineToRay(anchorWorld, dir.clone().normalize(), editor.viewer.ray(pointer.x, pointer.y));
    let factor = point.sub(anchorWorld).dot(dir) / (gripDistance * gripDistance);
    if (Math.abs(factor) < 1e-3) factor = 1e-3 * Math.sign(factor || 1);
    // snap to round factors
    const rounded = Math.round(factor * 10) / 10; if (Math.abs(factor - rounded) < 0.02) factor = rounded;
    this.applyFactor(factor);
  }
  isCorner(grip: Grip) { return [grip.fraction.x, grip.fraction.y, grip.fraction.z].filter(value => value !== 0.5).length === 3 || (this.box && [grip.fraction.x, grip.fraction.y, grip.fraction.z].filter(value => value !== 0.5).length === this.dims()); }
  dims() { const size = this.box!.getSize(new THREE.Vector3()); return [size.x, size.y, size.z].filter(value => value > 1e-6).length; }
  applyFactor(factor: number, explicit?: V3) {
    const editor = this.editor; const mask = this.mask; const uniform = this.isCorner(this.active!) !== (editor.ui as any)._shift;
    const scale = explicit ?? (uniform ? new THREE.Vector3(factor, factor, factor) : new THREE.Vector3(mask.x ? factor : 1, mask.y ? factor : 1, mask.z ? factor : 1));
    const size = this.box!.getSize(new THREE.Vector3());
    if (size.x < 1e-6) scale.x = 1; if (size.y < 1e-6) scale.y = 1; if (size.z < 1e-6) scale.z = 1;
    this.factor.copy(scale);
    const anchor = this.anchor;
    const matrix = new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z).multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z)).multiply(new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z));
    this.live!.apply(matrix); editor.invalidate();
    editor.setVcb([scale.x, scale.y, scale.z].filter((_, i) => (uniform ? i === 0 : [mask.x, mask.y, mask.z][i])).map(value => value.toFixed(2).replace('.', ',')).join('; '));
  }
  onDown(pointer: PEvt) {
    const editor = this.editor; this.downAt = { x: pointer.x, y: pointer.y };
    if (!this.box) { if (editor.hover) { editor.select([editor.hover]); editor.setHover(null); this.refresh(); } return; }
    if (!this.active) {
      if (!this.hot) {
        // clicking elsewhere selects something else
        const entityRef = hoverPick(editor, pointer); if (entityRef) { editor.select([entityRef]); this.refresh(); }
        return;
      }
      const grip = this.hot; this.active = grip; this.pressed = true;
      const box = this.box; const size = box.getSize(new THREE.Vector3());
      const ctrl = pointer.ctrl;
      const anchorFraction = ctrl ? new THREE.Vector3(0.5, 0.5, 0.5) : new THREE.Vector3(1 - grip.fraction.x, 1 - grip.fraction.y, 1 - grip.fraction.z);
      this.anchor = new THREE.Vector3(box.min.x + size.x * anchorFraction.x, box.min.y + size.y * anchorFraction.y, box.min.z + size.z * anchorFraction.z);
      this.mask.set(grip.fraction.x !== 0.5 ? 1 : 0, grip.fraction.y !== 0.5 ? 1 : 0, grip.fraction.z !== 0.5 ? 1 : 0);
      editor.beginOp('Skalieren'); this.live = new LiveTransform(editor.entities, editor.selected());
      return;
    }
    this.finish();
  }
  onUp(pointer: PEvt) { if (this.pressed && this.isDrag(pointer)) this.finish(); this.pressed = false; }
  finish() { if (!this.live) return; this.live.finish(); this.editor.endOp(); this.active = null; this.live = null; this.refresh(); this.editor.invalidate(); }
  onKey(keyEvent: KeyboardEvent, down: boolean) { if (keyEvent.key === 'Shift') { (this.editor.ui as any)._shift = down; return true; } return false; }
  onVcb(text: string) {
    if (!this.active) return false;
    const parts = text.split(/[;]/).map(part => part.trim()).filter(Boolean);
    const nums = parts.map(part => { const unit = /[a-z"']/i.test(part); if (unit) { const distance = this.lengthOf(part); if (distance == null) return NaN; const size = this.box!.getSize(new THREE.Vector3()); const ref = Math.max(size.x * this.mask.x, size.y * this.mask.y, size.z * this.mask.z) || Math.max(size.x, size.y, size.z); return distance / ref; } return parseFloat(part.replace(',', '.')); });
    if (nums.some(isNaN) || !nums.length) return false;
    if (nums.length === 1) this.applyFactor(nums[0]);
    else if (nums.length === 3) this.applyFactor(1, new THREE.Vector3(nums[0], nums[1], nums[2]));
    else { const mask = this.mask; const values = [1, 1, 1]; let k = 0; [mask.x, mask.y, mask.z].forEach((enabled, i) => { if (enabled && k < nums.length) values[i] = nums[k++]; }); this.applyFactor(1, new THREE.Vector3(...values)); }
    this.finish(); return true;
  }
  draw(overlay: Overlay) {
    const editor = this.editor;
    if (!this.box) { this.refresh(); if (!this.box) return; }
    // bounding box (yellow like SketchUp) and grips (green)
    if (!this.active) this.refresh();
    const box = this.box; const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => editor.toWorld(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)));
    const boxEdges = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [i, j] of boxEdges) overlay.line(corners[i], corners[j], '#d4b000', 1.2);
    for (const grip of this.grips) {
      const screenPos = overlay.screen(grip.world); if (!screenPos) continue; const hot = grip === this.hot || grip === this.active;
      overlay.context.fillStyle = hot ? '#e00000' : '#00a000'; overlay.context.fillRect(screenPos.x - 4, screenPos.y - 4, 8, 8);
    }
    if (this.active) { const screenPos = overlay.screen(editor.toWorld(this.anchor)); if (screenPos) { overlay.context.strokeStyle = '#e00000'; overlay.context.lineWidth = 2; overlay.context.strokeRect(screenPos.x - 5, screenPos.y - 5, 10, 10); } }
    if (this.hot && !this.active) {
      const count = [this.hot.fraction.x, this.hot.fraction.y, this.hot.fraction.z].filter(value => value !== 0.5).length;
      overlay.tooltip(editor.mouse.x, editor.mouse.y, count === 3 || count === this.dims() ? 'Gleichmäßig skalieren' : count === 2 ? 'Zwei Achsen skalieren' : 'Eine Achse skalieren');
    }
  }
}

// ===================================================================== Follow Me
export class FollowMeTool extends PointTool {
  id = 'followme'; name = 'Folge mir'; cursor = 'crosshair';
  status() { return this.path() ? 'Klicken Sie auf die Profilfläche, die dem ausgewählten Pfad folgen soll.' : 'Wählen Sie zuerst Kanten als Pfad aus (z. B. Doppelklick auf eine Fläche wählt ihre Kanten), dann dieses Werkzeug.'; }
  path(): { points: V3[]; closed: boolean } | null {
    const editor = this.editor; const ents = editor.entities;
    let edges = editor.selected().filter(entityRef => entityRef.kind === 'edge').map(entityRef => ents.edges.get(entityRef.id)!).filter(Boolean);
    // a selected face (without edges) means "its boundary"
    if (!edges.length) { const entityRef = editor.selected().find(selectedRef => selectedRef.kind === 'face'); if (entityRef) { const face = ents.faces.get(entityRef.id); if (face) edges = ents.loopEdges(face.outer); } }
    if (!edges.length) return null;
    const adj = new Map<number, number[]>();
    for (const edge of edges) { (adj.get(edge.start) ?? adj.set(edge.start, []).get(edge.start)!).push(edge.end); (adj.get(edge.end) ?? adj.set(edge.end, []).get(edge.end)!).push(edge.start); }
    if ([...adj.values()].some(neighbours => neighbours.length > 2)) return null;
    let start = [...adj.keys()].find(k => adj.get(k)!.length === 1);
    const closed = start == null; if (start == null) start = edges[0].start;
    const order = [start]; const seen = new Set([start]); let cur = start;
    while (true) { const next = adj.get(cur)!.find(vertex => !seen.has(vertex)); if (next == null) break; order.push(next); seen.add(next); cur = next; }
    if (order.length !== adj.size) return null;
    return { points: order.map(vertex => ents.positionOf(vertex).clone()), closed };
  }
  onMove(pointer: PEvt) { const editor = this.editor; const faceHit = editor.viewer.pickFace(pointer.x, pointer.y, context => context.path.length === editor.activePath.length && editor.inContext(context.path)); editor.setHover(faceHit ? { kind: 'face', id: faceHit.faceId } : null); }
  onDown(pointer: PEvt) {
    const editor = this.editor; const path = this.path(); if (!path) { editor.toast('Kein gültiger Pfad ausgewählt.'); return; }
    const faceHit = editor.viewer.pickFace(pointer.x, pointer.y, context => context.path.length === editor.activePath.length && editor.inContext(context.path)); if (!faceHit) return;
    // start the path at the end closest to the profile
    const faceCenter = editor.entities.faceCenter(editor.entities.faces.get(faceHit.faceId)!);
    if (!path.closed && path.points[path.points.length - 1].distanceTo(faceCenter) < path.points[0].distanceTo(faceCenter)) path.points.reverse();
    if (path.closed) { let bestIndex = 0, bestDistance = Infinity; path.points.forEach((point, i) => { const distance = point.distanceTo(faceCenter); if (distance < bestDistance) { bestDistance = distance; bestIndex = i; } }); path.points = [...path.points.slice(bestIndex), ...path.points.slice(0, bestIndex)]; }
    editor.commit('Folge mir', () => editor.entities.followMe(faceHit.faceId, path.points, path.closed));
    editor.clearSelection(); editor.setHover(null);
  }
}
