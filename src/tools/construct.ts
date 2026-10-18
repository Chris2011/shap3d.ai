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
  start: V3 | null = null; edgeDir: V3 | null = null; guides = true; current: V3 | null = null; lastMeasure = 0;
  status() { return this.start ? 'Wählen Sie den Endpunkt aus. Strg schaltet das Erstellen von Hilfslinien um.' : `Wählen Sie den Startpunkt (Punkt oder Kante) aus. ${this.guides ? 'Hilfslinien werden erstellt.' : ''}`; }
  busy() { return !!this.start; }
  cancel() { this.start = null; this.edgeDir = null; }
  onKey(keyEvent: KeyboardEvent, isDown: boolean) { if (keyEvent.key === 'Control' && isDown && !keyEvent.repeat) { this.guides = !this.guides; this.editor.refreshStatus(); return true; } return super.onKey(keyEvent, isDown); }
  onMove(pointer: PEvt) {
    const inference = this.pick(pointer, this.start); this.current = inference.point.clone();
    if (this.start) {
      if (this.edgeDir) { const off = this.offsetVec(); this.editor.setVcb(this.editor.fmt(off.length())); }
      else this.editor.setVcb(this.editor.fmt(this.start.distanceTo(inference.point)));
    }
  }
  offsetVec(): V3 { const offset = this.current!.clone().sub(this.start!); return offset.sub(this.edgeDir!.clone().multiplyScalar(offset.dot(this.edgeDir!))); }
  onDown(pointer: PEvt) {
    const inference = this.pick(pointer, this.start);
    if (!this.start) {
      this.start = inference.point.clone();
      this.edgeDir = inference.kind === 'edge' && inference.edge ? inference.edge.end.clone().sub(inference.edge.start).normalize() : null;
      return;
    }
    this.finish(inference.point.clone());
  }
  finish(point: V3) {
    const editor = this.editor; const start = this.start!;
    this.lastMeasure = this.edgeDir ? this.offsetVec().length() : start.distanceTo(point);
    if (this.guides) {
      if (this.edgeDir) { const off = this.offsetVec(); const direction = this.edgeDir.clone(); editor.commit('Hilfslinie', () => editor.model.guides.push({ id: newId(), kind: 'line', point: start.clone().add(off), direction: direction })); }
      else if (start.distanceTo(point) > 1e-6) { const direction = point.clone().sub(start).normalize(); editor.commit('Hilfspunkt', () => { editor.model.guides.push({ id: newId(), kind: 'point', point: point.clone() }); editor.model.guides.push({ id: newId(), kind: 'line', point: start.clone(), direction: direction }); }); }
    }
    editor.setVcb(editor.fmt(this.lastMeasure));
    this.cancel();
  }
  async onVcbAsync(text: string) {
    const editor = this.editor; const distance = this.lengthOf(text); if (distance == null) return false;
    if (this.start && this.current) {
      if (this.edgeDir) { const off = this.offsetVec(); if (off.lengthSq() < 1e-12) return false; this.current = this.start.clone().add(off.normalize().multiplyScalar(distance)); this.finish(this.current); return true; }
      const direction = this.current.clone().sub(this.start).normalize(); this.finish(this.start.clone().addScaledVector(direction, distance)); return true;
    }
    // resize model: new length for the last measured distance
    if (this.lastMeasure > 1e-9) {
      const factor = distance / this.lastMeasure;
      const ok = await editor.confirm(`Möchten Sie die Größe des ${editor.activePath.length ? 'Gruppeninhalts' : 'Modells'} ändern? (Faktor ${factor.toFixed(4)})`);
      if (!ok) return true;
      editor.commit('Größe ändern', () => {
        const matrix = new THREE.Matrix4().makeScale(factor, factor, factor);
        const ents = editor.entities;
        for (const vertex of ents.vertices.values()) vertex.position.applyMatrix4(matrix);
        for (const instance of ents.instances.values()) instance.matrix.premultiply(matrix);
        ents.invalidateHash();
        if (!editor.activePath.length) { for (const guide of editor.model.guides) guide.point.applyMatrix4(matrix); for (const dimension of editor.model.dimensions) { dimension.start.applyMatrix4(matrix); dimension.end.applyMatrix4(matrix); dimension.offset.multiplyScalar(factor); } }
      });
      this.lastMeasure = distance; return true;
    }
    return false;
  }
  onVcb(text: string) { this.onVcbAsync(text); return this.lengthOf(text) != null; }
  draw(overlay: Overlay) {
    if (this.start && this.current) {
      if (this.edgeDir) { const off = this.offsetVec(); overlay.line(this.start, this.start.clone().add(off), '#000', 1, [4, 3]); overlay.line(this.start.clone().add(off).addScaledVector(this.edgeDir, -200), this.start.clone().add(off).addScaledVector(this.edgeDir, 200), '#555', 1, [6, 4]); }
      else overlay.line(this.start, this.current, '#000', 1, [4, 3]);
    }
    this.drawInference(overlay);
  }
}

// ===================================================================== Protractor
export class ProtractorTool extends PointTool {
  id = 'protractor'; name = 'Winkelmesser'; vcbLabel = 'Winkel'; cursor = 'crosshair';
  center: V3 | null = null; ref: V3 | null = null; normal = new THREE.Vector3(0, 0, 1); current: V3 | null = null; angle = 0; hoverN = new THREE.Vector3(0, 0, 1);
  status() { return !this.center ? 'Wählen Sie den Scheitelpunkt aus.' : !this.ref ? 'Wählen Sie den ersten Schenkel aus.' : 'Wählen Sie den Winkel aus (erstellt eine Hilfslinie).'; }
  busy() { return !!this.center; }
  cancel() { this.center = this.ref = null; }
  onMove(pointer: PEvt) {
    const inference = this.pick(pointer, this.center); this.current = inference.point.clone();
    if (!this.center) { this.hoverN = inference.face && inference.kind === 'face' ? inference.face.normal.clone() : new THREE.Vector3(0, 0, 1); return; }
    if (this.ref) {
      const hit = this.editor.viewer.ray(pointer.x, pointer.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.center), new THREE.Vector3()); if (!hit) return;
      const fromRef = this.ref.clone().sub(this.center), toHit = hit.sub(this.center); let ang = Math.atan2(fromRef.clone().cross(toHit).dot(this.normal), fromRef.dot(toHit));
      const snapped = Math.round(ang / (Math.PI / 12)) * Math.PI / 12; if (Math.abs(ang - snapped) < 0.04) ang = snapped; this.angle = ang; this.editor.setVcb(formatAngle(ang));
    }
  }
  onDown(pointer: PEvt) {
    const inference = this.pick(pointer, this.center);
    if (!this.center) { this.center = inference.point.clone(); this.normal = this.hoverN.clone(); return; }
    if (!this.ref) { const point = onPlane(inference.point, this.center, this.normal); if (point.distanceTo(this.center) < 1e-6) return; this.ref = point; return; }
    this.finish();
  }
  finish() {
    const editor = this.editor; const direction = this.ref!.clone().sub(this.center!).normalize().applyAxisAngle(this.normal, this.angle); const center = this.center!.clone();
    editor.commit('Hilfslinie (Winkel)', () => editor.model.guides.push({ id: newId(), kind: 'line', point: center, direction: direction })); this.cancel();
  }
  onVcb(text: string) { if (!this.ref) return false; const degrees = parseFloat(text.replace(',', '.')); if (isNaN(degrees)) return false; this.angle = degrees * Math.PI / 180; this.finish(); return true; }
  draw(overlay: Overlay) {
    const center = this.center ?? this.current; if (!center) return; const normal = this.center ? this.normal : this.hoverN;
    const radius = this.editor.viewer.worldPerPixel(center) * 55; overlay.circle3D(center, normal, radius, '#0000e0', 1.2, 64);
    if (this.center && this.ref) { overlay.line(this.center, this.ref, '#555', 1, [4, 3]); const direction = this.ref.clone().sub(this.center).normalize().applyAxisAngle(this.normal, this.angle); overlay.line(this.center.clone().addScaledVector(direction, -100), this.center.clone().addScaledVector(direction, 100), '#555', 1, [6, 4]); }
    else if (this.center && this.current) overlay.line(this.center, this.current, '#555', 1, [4, 3]);
    this.drawInference(overlay);
  }
}

// ===================================================================== Dimension
export class DimensionTool extends PointTool {
  id = 'dimension'; name = 'Abmessungen'; cursor = 'crosshair';
  start: V3 | null = null; end: V3 | null = null; current: V3 | null = null; offset = new THREE.Vector3();
  status() { return !this.start ? 'Wählen Sie den Startpunkt der Bemaßung oder eine Kante aus.' : !this.end ? 'Wählen Sie den Endpunkt aus.' : 'Ziehen Sie die Bemaßung an ihre Position.'; }
  busy() { return !!this.start; }
  cancel() { this.start = this.end = null; }
  onMove(pointer: PEvt) {
    if (!this.end) { const inference = this.pick(pointer, this.start); this.current = inference.point.clone(); return; }
    // offset in the plane most facing the camera that contains the dimension line
    const direction = this.end.clone().sub(this.start!).normalize(); const view = this.editor.viewer.rig.forward();
    let best: V3 | null = null, bestFacing = -1;
    for (const axis of [AXES.x, AXES.y, AXES.z]) { if (Math.abs(axis.dot(direction)) > 0.99) continue; const facing = Math.abs(axis.dot(view)); if (facing > bestFacing) { bestFacing = facing; best = axis; } }
    const hit = this.editor.viewer.ray(pointer.x, pointer.y).intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(best!, this.start!), new THREE.Vector3()); if (!hit) return;
    const offset = hit.sub(this.start!); this.offset = offset.sub(direction.multiplyScalar(offset.dot(direction)));
  }
  onDown(pointer: PEvt) {
    if (!this.start) {
      const inference = this.pick(pointer, null);
      if (inference.kind === 'edge' && inference.edge) { this.start = inference.edge.start.clone(); this.end = inference.edge.end.clone(); this.offset.set(0, 0, 0); return; }
      this.start = inference.point.clone(); return;
    }
    if (!this.end) { const inference = this.pick(pointer, this.start); if (inference.point.distanceTo(this.start) < 1e-6) return; this.end = inference.point.clone(); return; }
    const editor = this.editor; const dim = { id: newId(), start: this.start.clone(), end: this.end.clone(), offset: this.offset.clone() };
    editor.commit('Bemaßung', () => editor.model.dimensions.push(dim)); this.cancel();
  }
  draw(overlay: Overlay) {
    if (this.start && this.end) this.editor.drawDimension(overlay, this.start, this.end, this.offset);
    else if (this.start && this.current) overlay.line(this.start, this.current, '#000', 1, [4, 3]);
    if (!this.end) this.drawInference(overlay);
  }
}

// ===================================================================== Text (leader)
export class TextTool extends PointTool {
  id = 'text'; name = 'Text'; cursor = 'text';
  anchor: V3 | null = null; current: V3 | null = null; defText = '';
  status() { return this.anchor ? 'Wählen Sie die Position des Textes aus.' : 'Wählen Sie den Punkt aus, auf den der Text zeigen soll.'; }
  busy() { return !!this.anchor; }
  cancel() { this.anchor = null; }
  onMove(pointer: PEvt) { const inference = this.pick(pointer, null); this.current = inference.point.clone(); }
  onDown(pointer: PEvt) {
    const editor = this.editor; const inference = this.pick(pointer, null);
    if (!this.anchor) {
      this.anchor = inference.point.clone();
      if (inference.kind === 'face' && inference.face) { const face = inference.face.context.entities.faces.get(inference.face.faceId); this.defText = face ? editor.fmtArea(inference.face.context.entities.faceArea(face)) : ''; }
      else if ((inference.kind === 'edge' || inference.kind === 'midpoint') && inference.edge) this.defText = editor.fmt(inference.edge.start.distanceTo(inference.edge.end));
      else { const point = inference.point; this.defText = `[${editor.fmt(point.x)}; ${editor.fmt(point.y)}; ${editor.fmt(point.z)}]`; }
      return;
    }
    const anchor = this.anchor, off = inference.point.clone().sub(anchor); this.anchor = null;
    editor.prompt('Text eingeben', this.defText, true).then(text => { if (text) editor.commit('Text', () => editor.model.labels.push({ id: newId(), point: anchor, text: text, offset: off })); });
  }
  draw(overlay: Overlay) { if (this.anchor && this.current) { overlay.line(this.anchor, this.current, '#000', 1); overlay.text(this.current, this.defText, { background: '#ffffffd0', align: 'left', offsetX: 4 }); } this.drawInference(overlay); }
}

// ===================================================================== Section plane
export class SectionTool extends PointTool {
  id = 'section'; name = 'Schnittebene'; cursor = 'crosshair';
  normal = new THREE.Vector3(0, 0, -1); point: V3 | null = null;
  status() { return 'Klicken Sie auf eine Fläche, um eine Schnittebene zu platzieren. Pfeiltasten richten sie an den Achsen aus.'; }
  onKey(keyEvent: KeyboardEvent, isDown: boolean) {
    if (isDown && ['ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(keyEvent.key)) { this.lockAxis = keyEvent.key === 'ArrowUp' ? 'z' : keyEvent.key === 'ArrowRight' ? 'x' : 'y'; return true; }
    return false;
  }
  onMove(pointer: PEvt) {
    const inference = this.pick(pointer, null); this.point = inference.point.clone();
    if (this.lockAxis) this.normal = AXES[this.lockAxis].clone().negate();
    else this.normal = inference.face && inference.kind === 'face' ? inference.face.normal.clone().negate() : new THREE.Vector3(0, 0, -1);
  }
  onDown() {
    if (!this.point) return; const editor = this.editor; const section = { id: newId(), point: this.point.clone(), normal: this.normal.clone(), active: true, name: `Schnitt ${editor.model.sections.length + 1}` };
    editor.commit('Schnittebene', () => { editor.model.sections.forEach(x => (x.active = false)); editor.model.sections.push(section); editor.model.settings.sectionCuts = true; });
    editor.setTool('select');
  }
  draw(overlay: Overlay) { if (this.point) this.editor.drawSection(overlay, this.point, this.normal, true); this.drawInference(overlay, false); }
}

// ===================================================================== Navigation tools
export class OrbitTool extends Tool {
  id = 'orbit'; name = 'Orbit'; cursor = 'grab'; last: { x: number; y: number } | null = null; pivot: V3 | null = null;
  status() { return 'Ziehen Sie, um die Ansicht zu drehen. Umschalt = Schwenken.'; }
  onDown(pointer: PEvt) { this.last = { x: pointer.x, y: pointer.y }; this.pivot = this.editor.viewer.pickFace(pointer.x, pointer.y)?.point ?? null; }
  onMove(pointer: PEvt) { if (!this.last) return; const deltaX = pointer.x - this.last.x, deltaY = pointer.y - this.last.y; this.last = { x: pointer.x, y: pointer.y }; if (pointer.shift) this.editor.viewer.rig.pan(deltaX, deltaY, this.editor.viewer.height, this.pivot ?? undefined); else this.editor.viewer.rig.orbit(deltaX, deltaY, this.pivot ?? undefined); }
  onUp() { this.last = null; }
}
export class PanTool extends Tool {
  id = 'pan'; name = 'Schwenken'; cursor = 'move'; last: { x: number; y: number } | null = null; pivot: V3 | null = null;
  status() { return 'Ziehen Sie, um die Ansicht zu schwenken.'; }
  onDown(pointer: PEvt) { this.last = { x: pointer.x, y: pointer.y }; this.pivot = this.editor.viewer.pickFace(pointer.x, pointer.y)?.point ?? null; }
  onMove(pointer: PEvt) { if (!this.last) return; this.editor.viewer.rig.pan(pointer.x - this.last.x, pointer.y - this.last.y, this.editor.viewer.height, this.pivot ?? undefined); this.last = { x: pointer.x, y: pointer.y }; }
  onUp() { this.last = null; }
}
export class ZoomTool extends Tool {
  id = 'zoom'; name = 'Zoom'; cursor = 'zoom-in'; vcbLabel = 'Sichtfeld'; last: { x: number; y: number } | null = null; pivot: V3 | null = null;
  status() { return 'Ziehen Sie nach oben/unten zum Zoomen. Umschalt = Sichtfeld ändern. Geben Sie einen Sichtfeldwinkel ein (z. B. 35°).'; }
  activate() { this.editor.setVcb(this.editor.viewer.rig.persp.fov.toFixed(1).replace('.', ',') + '°'); }
  onDown(pointer: PEvt) { this.last = { x: pointer.x, y: pointer.y }; this.pivot = this.editor.viewer.pickFace(pointer.x, pointer.y)?.point ?? null; }
  onMove(pointer: PEvt) {
    if (!this.last) return; const deltaY = pointer.y - this.last.y; this.last = { x: pointer.x, y: pointer.y };
    if (pointer.shift) { const rig = this.editor.viewer.rig; rig.setFov(rig.persp.fov + deltaY * 0.2); this.editor.setVcb(rig.persp.fov.toFixed(1).replace('.', ',') + '°'); }
    else this.editor.viewer.rig.zoomAt(this.pivot, Math.pow(1.01, deltaY));
  }
  onUp() { this.last = null; }
  onVcb(text: string) { const fov = parseFloat(text.replace(',', '.')); if (isNaN(fov)) return false; this.editor.viewer.rig.setFov(fov); return true; }
}
export class ZoomWindowTool extends Tool {
  id = 'zoomwindow'; name = 'Zoomfenster'; cursor = 'zoom-in'; rect: { startX: number; startY: number; endX: number; endY: number } | null = null;
  status() { return 'Ziehen Sie ein Rechteck auf, um in diesen Bereich zu zoomen.'; }
  onDown(pointer: PEvt) { this.rect = { startX: pointer.x, startY: pointer.y, endX: pointer.x, endY: pointer.y }; }
  onMove(pointer: PEvt) { if (this.rect) { this.rect.endX = pointer.x; this.rect.endY = pointer.y; } }
  onUp() {
    const rect = this.rect; this.rect = null; if (!rect || Math.abs(rect.endX - rect.startX) < 5) return;
    const viewer = this.editor.viewer; const centerX = (rect.startX + rect.endX) / 2, centerY = (rect.startY + rect.endY) / 2;
    const faceHit = viewer.pickFace(centerX, centerY); const center = faceHit?.point ?? viewer.ray(centerX, centerY).at(viewer.rig.position.distanceTo(viewer.rig.target), new THREE.Vector3());
    const fraction = Math.max(Math.abs(rect.endX - rect.startX) / viewer.width, Math.abs(rect.endY - rect.startY) / viewer.height);
    const rig = viewer.rig; const dir = rig.position.clone().sub(rig.target).normalize(); const dist = center.distanceTo(rig.position) * fraction;
    rig.applyState({ position: center.clone().addScaledVector(dir, dist).toArray(), target: center.toArray(), fov: rig.persp.fov, ortho: rig.isOrtho });
    this.editor.setTool('select');
  }
  draw(overlay: Overlay) { if (this.rect) overlay.rect2D(this.rect.startX, this.rect.startY, this.rect.endX, this.rect.endY, false); }
}

/** Look around: rotate camera about its own position. */
export class LookAroundTool extends Tool {
  id = 'lookaround'; name = 'Umsehen'; cursor = 'grab'; last: { x: number; y: number } | null = null;
  status() { return 'Ziehen Sie, um sich umzusehen (Kamera dreht sich um ihren Standpunkt).'; }
  onDown(pointer: PEvt) { this.last = { x: pointer.x, y: pointer.y }; }
  onMove(pointer: PEvt) { if (!this.last) return; const rig = this.editor.viewer.rig; rig.orbit(-(pointer.x - this.last.x) * 0.5, -(pointer.y - this.last.y) * 0.5, rig.position.clone()); this.last = { x: pointer.x, y: pointer.y }; }
  onUp() { this.last = null; }
}

/** Walk: drag forward/back and turn, eye height kept. */
export class WalkTool extends Tool {
  id = 'walk'; name = 'Gehen'; cursor = 'pointer'; last: { x: number; y: number } | null = null; origin: { x: number; y: number } | null = null; timer = 0;
  status() { return 'Ziehen Sie nach oben/unten zum Gehen, links/rechts zum Drehen. Pfeiltasten funktionieren auch.'; }
  activate() { const rig = this.editor.viewer.rig; if (rig.position.z > 3 || rig.position.z < 1) { const target = rig.target.clone(); target.z = 1.7; const position = rig.position.clone(); position.z = 1.7; rig.applyState({ position: position.toArray(), target: target.toArray(), fov: rig.persp.fov, ortho: false }); } }
  step(fwd: number, turn: number) {
    const rig = this.editor.viewer.rig; const forward = rig.forward(); forward.z = 0; if (forward.lengthSq() < 1e-9) return; forward.normalize();
    const step = forward.multiplyScalar(fwd); rig.position.add(step); rig.target.add(step);
    if (turn) rig.orbit(turn, 0, rig.position.clone()); else { rig.persp.lookAt(rig.target); rig.syncOrtho(); rig.onChange(); }
  }
  onDown(pointer: PEvt) { this.origin = { x: pointer.x, y: pointer.y }; this.last = { x: pointer.x, y: pointer.y }; this.timer = window.setInterval(() => { if (!this.origin || !this.last) return; this.step(-(this.last.y - this.origin.y) * 0.002, -(this.last.x - this.origin.x) * 0.05); }, 30); }
  onMove(pointer: PEvt) { if (this.last) this.last = { x: pointer.x, y: pointer.y }; }
  onUp() { clearInterval(this.timer); this.origin = this.last = null; }
  onKey(keyEvent: KeyboardEvent, isDown: boolean) { if (!isDown) return false; const moves: Record<string, [number, number]> = { ArrowUp: [0.3, 0], ArrowDown: [-0.3, 0], ArrowLeft: [0, -8], ArrowRight: [0, 8] }; const move = moves[keyEvent.key]; if (!move) return false; this.step(move[0], move[1]); return true; }
  deactivate() { clearInterval(this.timer); }
}

/** Position camera: click a point, camera stands there at eye height. */
export class PositionCameraTool extends PointTool {
  id = 'poscam'; name = 'Kamera positionieren'; vcbLabel = 'Augenhöhe';
  eye = 1.676;
  status() { return 'Klicken Sie, um die Kamera dort in Augenhöhe zu positionieren.'; }
  onMove(pointer: PEvt) { this.pick(pointer, null); }
  onDown(pointer: PEvt) {
    const inference = this.pick(pointer, null); const rig = this.editor.viewer.rig;
    const pos = inference.point.clone(); pos.z += this.eye;
    const forward = rig.forward(); forward.z = 0; if (forward.lengthSq() < 1e-9) forward.set(0, 1, 0); forward.normalize();
    rig.isOrtho = false; this.editor.ui.projection = 'persp';
    rig.applyState({ position: pos.toArray(), target: pos.clone().addScaledVector(forward, 5).toArray(), fov: Math.max(rig.persp.fov, 50), ortho: false }, true, () => this.editor.setTool('lookaround'));
  }
  onVcb(text: string) { const eyeHeight = this.lengthOf(text); if (eyeHeight == null) return false; this.eye = eyeHeight; return true; }
  draw(overlay: Overlay) { this.drawInference(overlay); }
}
