import * as THREE from 'three';
import { Tool, type PEvt } from '../engine/editor';
import { AXES, type Inference, type InferOptions } from '../engine/inference';
import type { Overlay } from '../engine/overlay';
import { parseLength } from '../core/units';
import type { PlaneRef, PlaneAxes } from '../core/geometry';

/** Base for tools that pick points with SketchUp inference (arrow-key axis locks, shift lock). */
export abstract class PointTool extends Tool {
  inference: Inference | null = null;
  lockAxis: 'x' | 'y' | 'z' | null = null;
  shiftDir: THREE.Vector3 | null = null;
  shiftAxis: 'x' | 'y' | 'z' | null = null;
  downAt: { x: number; y: number } | null = null;

  pick(pointer: { x: number; y: number }, from: THREE.Vector3 | null, extra: Partial<InferOptions> = {}): Inference {
    let lock: THREE.Vector3 | null = null; let lockAxis: 'x' | 'y' | 'z' | null = null;
    if (from && this.lockAxis) { lock = AXES[this.lockAxis]; lockAxis = this.lockAxis; }
    else if (from && this.shiftDir) { lock = this.shiftDir; lockAxis = this.shiftAxis; }
    const inference = this.editor.infer.infer(pointer.x, pointer.y, { from, lock, lockAxis, ...extra });
    if (inference.kind === 'endpoint' || inference.kind === 'midpoint') this.editor.infer.track(inference.point);
    this.inference = inference;
    return inference;
  }

  /** Default handling for arrow keys and shift inference lock. */
  onKey(keyEvent: KeyboardEvent, down: boolean): boolean {
    if (down && ['ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(keyEvent.key)) {
      const axis = keyEvent.key === 'ArrowUp' ? 'z' : keyEvent.key === 'ArrowRight' ? 'x' : 'y';
      this.lockAxis = this.lockAxis === axis ? null : axis;
      this.editor.redraw(); return true;
    }
    if (keyEvent.key === 'ArrowDown' && down) { this.lockAxis = null; return true; }
    if (keyEvent.key === 'Shift') {
      if (down && !this.shiftDir && this.inference) {
        if (this.inference.axis && (this.inference.kind === 'axis' || this.inference.kind === 'aligned')) { this.shiftDir = AXES[this.inference.axis].clone(); this.shiftAxis = this.inference.axis; }
        else if (this.inference.edge && this.inference.kind === 'edge') { this.shiftDir = this.inference.edge.end.clone().sub(this.inference.edge.start).normalize(); this.shiftAxis = null; }
      } else if (!down) { this.shiftDir = null; this.shiftAxis = null; }
      return false;
    }
    return false;
  }

  resetLocks() { this.lockAxis = null; this.shiftDir = null; this.shiftAxis = null; }

  drawInference(overlay: Overlay, tip = true) { this.editor.infer.draw(overlay, this.inference, this.editor.mouse, tip); }

  /** Did the mouse move enough between down and up to count as a drag? */
  isDrag(pointer: PEvt) { return !!this.downAt && Math.hypot(pointer.x - this.downAt.x, pointer.y - this.downAt.y) > 6; }

  lengthOf(text: string) { return parseLength(text, this.editor.model.settings.units); }
}

/** Plane helpers for drawing tools: face plane under the first point, else horizontal. */
export const planeFromInference = (inference: Inference): PlaneRef & { fromFace: boolean } => {
  if (inference.face && (inference.kind === 'face')) return { point: inference.point.clone(), normal: inference.face.normal.clone().normalize(), fromFace: true };
  return { point: inference.point.clone(), normal: new THREE.Vector3(0, 0, 1), fromFace: false };
};

/** In-plane axes aligned with the model axes where possible. */
export const planeAxes = (normal: THREE.Vector3): PlaneAxes => {
  const cands = [AXES.x, AXES.y, AXES.z].map(axis => axis.clone().sub(normal.clone().multiplyScalar(axis.dot(normal))));
  cands.sort((left, right) => right.length() - left.length());
  const basisU = cands[0].normalize();
  const basisV = normal.clone().cross(basisU).normalize();
  return { basisU: basisU, basisV: basisV };
};

export const rayPlane = (editor: { viewer: { ray(x: number, y: number): THREE.Ray } }, x: number, y: number, planePoint: THREE.Vector3, planeNormal: THREE.Vector3): THREE.Vector3 | null => {
  const ray = editor.viewer.ray(x, y);
  return ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint), new THREE.Vector3());
};

/** Project a point onto a plane. */
export const onPlane = (point: THREE.Vector3, planePoint: THREE.Vector3, planeNormal: THREE.Vector3) => { return point.clone().addScaledVector(planeNormal, -point.clone().sub(planePoint).dot(planeNormal)); };
