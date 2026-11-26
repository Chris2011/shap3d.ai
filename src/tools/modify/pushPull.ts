import * as THREE from 'three';
import type { VertRec, EdgeRec, FaceHit } from '../../engine/viewer';
import type { PEvt } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import { PointTool } from '../base';
import { t } from '../../i18n';
import { pickContextFace } from './picking';
import { drawPulledFace } from './gumballDraw';

type V3 = THREE.Vector3;

export class PushPullTool extends PointTool {
  id = 'pushpull';
  name = 'tools.pushpull';
  vcbLabel = 'vcb.distance';
  cursor = 'crosshair';
  faceId: number | null = null;
  start: V3 | null = null;
  normal = new THREE.Vector3();
  distance = 0;
  pressed = false;
  /** Ctrl: keep the original face and build a new one (SketchUp "+" mode) */
  newFace = false;
  last: { faceId: number; distance: number; created: number | null; newFace: boolean } | null = null;
  status() {
    const mode = t(this.newFace ? 'tools.status.newFaceOff' : 'tools.status.newFaceOn');
    return this.faceId != null ? t('tools.status.pushpullDistance', { mode }) : t('tools.status.pushpullPick', { mode });
  }
  busy() {
    return this.faceId != null;
  }
  activate() {
    this.newFace = false;
  }
  cancel() {
    this.faceId = null;
    this.start = null;
    this.inference = null;
    this.editor.setHover(null);
    this.editor.setVcb('');
  }
  hoverFace(pointer: { x: number; y: number }) {
    return pickContextFace(this.editor, pointer);
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (this.faceId == null) {
      const faceHit = this.hoverFace(pointer);
      editor.setHover(faceHit ? { kind: 'face', id: faceHit.faceId } : null);
      return;
    }
    const ents = editor.entities;
    const face = ents.faces.get(this.faceId);
    if (!face) {
      return;
    }
    // the height comes from what the cursor snaps to (corner, edge or parallel face), projected onto the push direction
    const ownVertices = new Set(ents.faceVertices(face)),
      ownEdges = new Set(ents.faceEdges(face).map((edge) => edge.id));
    const inference = this.pick(pointer, this.start, {
      lock: this.normal,
      lockAxis: null,
      lockLabel: '',
      lockOrigin: null,
      plane: null,
      filterVert: (vertex: VertRec) => !(vertex.context.entities === ents && ownVertices.has(vertex.vertexId)),
      filterEdge: (edgeRec: EdgeRec) => !(edgeRec.context.entities === ents && ownEdges.has(edgeRec.edgeId)),
      filterFace: (context: FaceHit['context'], faceId: number) => !(context.entities === ents && faceId === this.faceId),
    });
    this.distance = inference.point.clone().sub(this.start!).dot(this.normal);
    editor.setVcb(editor.fmt(Math.abs(this.distance)));
  }
  onDown(pointer: PEvt) {
    const editor = this.editor;
    this.downAt = { x: pointer.x, y: pointer.y };
    if (this.faceId == null) {
      const faceHit = this.hoverFace(pointer);
      if (!faceHit) {
        return;
      }
      this.faceId = faceHit.faceId;
      this.start = faceHit.point.clone();
      this.normal = faceHit.normal.clone().normalize();
      this.distance = 0;
      this.pressed = true;
      editor.setHover({ kind: 'face', id: faceHit.faceId });
      editor.infer.track(this.start);
      return;
    }
    this.finish(this.distance);
  }
  onUp(pointer: PEvt) {
    if (this.pressed && this.isDrag(pointer)) {
      this.finish(this.distance);
    }
    this.pressed = false;
  }
  onDblClick(pointer: PEvt) {
    if (!this.editor.lastPushPull) {
      return;
    }
    const faceHit = this.hoverFace(pointer);
    if (!faceHit) {
      return;
    }
    this.cancel();
    this.faceId = faceHit.faceId;
    this.start = faceHit.point.clone();
    this.normal = faceHit.normal.clone().normalize();
    // use the face's own direction like SketchUp (repeat in the same sense)
    this.finish(this.editor.lastPushPull);
  }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    if (keyEvent.key === 'Control' && down && !keyEvent.repeat) {
      this.newFace = !this.newFace;
      this.editor.refreshStatus();
      return true;
    }
    return false;
  }
  localDistance(distance: number): number {
    const editor = this.editor;
    const face = editor.entities.faces.get(this.faceId!)!;
    const localNormal = editor.entities.faceNormal(face);
    const localStart = editor.toLocal(this.start!),
      localEnd = editor.toLocal(this.start!.clone().addScaledVector(this.normal, distance));
    return localEnd.sub(localStart).dot(localNormal);
  }
  finish(distance: number) {
    const editor = this.editor;
    if (this.faceId == null || Math.abs(distance) < 1e-6) {
      if (this.faceId != null && Math.abs(distance) < 1e-6 && !this.pressed) {
        this.cancel();
      }
      return;
    }
    const faceId = this.faceId;
    const localDist = this.localDistance(distance);
    const newFace = this.newFace;
    const created = editor.commit('tools.pushpull', () => editor.entities.pushPull(faceId, localDist, { keepFace: newFace }));
    editor.lastPushPull = distance;
    this.last = { faceId: faceId, distance: localDist, created, newFace };
    this.cancel();
    editor.setVcb(editor.fmt(Math.abs(distance)));
  }
  onVcb(text: string) {
    const distance = this.lengthOf(text);
    if (distance == null) {
      return false;
    }
    // a negative value pushes the other way
    if (this.faceId != null) {
      this.finish(Math.sign(this.distance || 1) * distance);
      return true;
    }
    if (this.last) {
      // change the last push/pull
      const editor = this.editor;
      const sign = Math.sign(this.last.distance) || 1;
      editor.undo();
      const { faceId, newFace } = this.last;
      if (!editor.entities.faces.has(faceId)) {
        return false;
      }
      const created = editor.commit('tools.pushpull', () => editor.entities.pushPull(faceId, sign * distance, { keepFace: newFace }));
      this.last = { faceId: faceId, distance: sign * distance, created, newFace };
      editor.lastPushPull = distance * sign;
      return true;
    }
    return false;
  }
  draw(overlay: Overlay) {
    const editor = this.editor;
    if (this.faceId != null && this.start) {
      if (!editor.entities.faces.has(this.faceId)) {
        return;
      }
      drawPulledFace(editor, overlay, this.faceId, this.normal.clone().multiplyScalar(this.distance));
      const inference = this.inference;
      if (inference?.target && inference.alignFrom) {
        overlay.line(inference.alignFrom, inference.point, '#000', 1, [2, 3]);
        overlay.marker(inference.alignFrom, inference.target);
      }
      if (inference?.label) {
        overlay.tooltip(editor.mouse.x, editor.mouse.y, inference.label);
      }
    }
  }
}
