import * as THREE from 'three';
import type { PEvt } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import { PointTool } from '../base';
import { offsetPolygon, polygonNormal, planeBasis, to2D, pointInPolygon2D, distPointSegment2D } from '../../core/geometry';
import { t } from '../../i18n';
import { pickContextFace } from './picking';

type V3 = THREE.Vector3;

export class OffsetTool extends PointTool {
  id = 'offset';
  name = 'tools.offset';
  vcbLabel = 'vcb.distance';
  cursor = 'crosshair';
  faceId: number | null = null;
  /** the other selected faces when one of several is clicked – they get the same border (inset) */
  otherFaceIds: number[] = [];
  distance = 0;
  pressed = false;
  status() {
    return this.faceId != null ? t('tools.status.offsetDistance') : t('tools.status.offsetPick');
  }
  busy() {
    return this.faceId != null;
  }
  cancel() {
    this.faceId = null;
    this.otherFaceIds = [];
    this.editor.setHover(null);
  }
  /** the clicked face; with several faces selected and one of them clicked, all of them */
  takeFaces(clickedId: number) {
    const selected = this.editor
      .selected()
      .filter((entityRef) => entityRef.kind === 'face')
      .map((entityRef) => entityRef.id);
    this.faceId = selected.length === 1 ? selected[0] : clickedId;
    this.otherFaceIds = selected.length > 1 && selected.includes(clickedId) ? selected.filter((id) => id !== clickedId) : [];
  }
  face(pointer: { x: number; y: number }) {
    return pickContextFace(this.editor, pointer);
  }
  worldLoop(faceId = this.faceId!): V3[] {
    const editor = this.editor;
    const face = editor.entities.faces.get(faceId)!;
    return face.outer.map((vertex) => editor.toWorld(editor.entities.positionOf(vertex)));
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (this.faceId == null) {
      const faceHit = this.face(pointer);
      editor.setHover(faceHit ? { kind: 'face', id: faceHit.faceId } : null);
      return;
    }
    const pts = this.worldLoop();
    const normal = polygonNormal(pts);
    const hit = editor.viewer
      .ray(pointer.x, pointer.y)
      .intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pts[0]), new THREE.Vector3());
    if (!hit) {
      return;
    }
    const { basisU, basisV } = planeBasis(normal);
    const hit2D = to2D([hit], pts[0], basisU, basisV)[0];
    const poly = to2D(pts, pts[0], basisU, basisV);
    let dist = Infinity;
    for (let i = 0; i < poly.length; i++) {
      dist = Math.min(dist, distPointSegment2D(hit2D, poly[i], poly[(i + 1) % poly.length]));
    }
    this.distance = pointInPolygon2D(hit2D, poly) ? dist : -dist;
    editor.setVcb(editor.fmt(Math.abs(this.distance)));
  }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    if (this.faceId == null) {
      const faceHit = this.face(pointer);
      if (!faceHit) {
        return;
      }
      this.takeFaces(faceHit.faceId);
      this.distance = 0;
      this.pressed = true;
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
    const faceHit = this.face(pointer);
    if (faceHit && this.editor.lastOffset) {
      this.takeFaces(faceHit.faceId);
      this.finish(this.editor.lastOffset);
    }
  }
  finish(distance: number) {
    if (this.faceId == null || Math.abs(distance) < 1e-5) {
      return;
    }
    const editor = this.editor;
    const faceIds = [this.faceId, ...this.otherFaceIds];
    editor.commit('tools.offset', () => {
      const entities = editor.entities;
      // all borders first, then the loops – adding one splits only its own face
      const loops = faceIds.flatMap((id) => {
        const face = entities.faces.get(id);
        return face ? [offsetPolygon(entities.facePoints(face), entities.faceNormal(face), distance)] : [];
      });
      loops.forEach((loop) => entities.addLoop(loop));
    });
    editor.lastOffset = distance;
    this.cancel();
  }
  onVcb(text: string) {
    const distance = this.lengthOf(text);
    if (distance == null || this.faceId == null) {
      return false;
    }
    this.finish(Math.sign(this.distance || 1) * distance);
    return true;
  }
  draw(overlay: Overlay) {
    if (this.faceId == null) {
      return;
    }
    for (const id of [this.faceId, ...this.otherFaceIds]) {
      const pts = this.worldLoop(id);
      overlay.polyline(offsetPolygon(pts, polygonNormal(pts), this.distance), '#000', 1.3, true);
    }
  }
}
