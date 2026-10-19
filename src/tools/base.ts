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
  /** down arrow: parallel / perpendicular to the last hovered edge */
  lockDir: { direction: THREE.Vector3; label: string } | null = null;
  shiftDir: THREE.Vector3 | null = null;
  shiftAxis: 'x' | 'y' | 'z' | null = null;
  shiftLabel = '';
  /** shift held over an edge: points slide along that edge's line */
  shiftOrigin: THREE.Vector3 | null = null;
  /** shift held over a face: points stay in that face's plane */
  shiftPlane: PlaneRef | null = null;
  downAt: { x: number; y: number } | null = null;

  pick(pointer: { x: number; y: number }, from: THREE.Vector3 | null, extra: Partial<InferOptions> = {}): Inference {
    let lock: THREE.Vector3 | null = null; let lockAxis: 'x' | 'y' | 'z' | null = null; let lockLabel: string | undefined;
    if (from && this.lockAxis) { lock = AXES[this.lockAxis]; lockAxis = this.lockAxis; }
    else if (from && this.lockDir) { lock = this.lockDir.direction; lockLabel = this.lockDir.label; }
    else if ((from || this.shiftOrigin) && this.shiftDir) { lock = this.shiftDir; lockAxis = this.shiftAxis; lockLabel = this.shiftAxis ? undefined : this.shiftLabel; }
    const plane = this.shiftPlane && !lock ? { plane: this.shiftPlane } : {};
    const lockOrigin = lock && this.shiftDir === lock ? this.shiftOrigin : null;
    const inference = this.editor.infer.infer(pointer.x, pointer.y, { from, lock, lockAxis, lockLabel, lockOrigin, ...plane, ...extra });
    if (['endpoint', 'midpoint', 'intersection', 'center'].includes(inference.kind)) this.editor.infer.track(inference.point);
    this.inference = inference;
    return inference;
  }

  /** Arrow keys and shift lock like SketchUp: up = blue, right = red, left = green, down = parallel/perpendicular. */
  onKey(keyEvent: KeyboardEvent, down: boolean): boolean {
    if (down && ['ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(keyEvent.key)) {
      const axis = keyEvent.key === 'ArrowUp' ? 'z' : keyEvent.key === 'ArrowRight' ? 'x' : 'y';
      this.lockAxis = this.lockAxis === axis ? null : axis; this.lockDir = null;
      this.editor.redraw(); return true;
    }
    if (keyEvent.key === 'ArrowDown' && down) {
      if (this.lockDir || this.lockAxis) { this.lockDir = null; this.lockAxis = null; }
      else {
        const inference = this.inference; const edge = this.editor.infer.trackedEdge;
        if (inference?.direction && (inference.kind === 'parallel' || inference.kind === 'perpendicular')) this.lockDir = { direction: inference.direction.clone(), label: inference.label };
        else if (edge) this.lockDir = { direction: edge.end.clone().sub(edge.start).normalize(), label: 'Parallel zu Kante' };
      }
      this.editor.redraw(); return true;
    }
    if (keyEvent.key === 'Shift') {
      if (down && !keyEvent.repeat && !this.shiftDir && !this.shiftPlane && this.inference) {
        const inference = this.inference;
        if (inference.axis && inference.direction && (inference.kind === 'axis' || inference.kind === 'aligned')) { this.shiftDir = AXES[inference.axis].clone(); this.shiftAxis = inference.axis; }
        else if (inference.direction && (inference.kind === 'parallel' || inference.kind === 'perpendicular' || inference.kind === 'extension')) { this.shiftDir = inference.direction.clone(); this.shiftAxis = null; this.shiftLabel = inference.label; }
        else if (inference.edge && inference.kind === 'edge') { this.shiftDir = inference.edge.end.clone().sub(inference.edge.start).normalize(); this.shiftOrigin = inference.edge.start.clone(); this.shiftAxis = null; this.shiftLabel = 'Auf Kante'; }
        else if (inference.face && inference.kind === 'face') this.shiftPlane = { point: inference.point.clone(), normal: inference.face.normal.clone().normalize() };
      } else if (!down) { this.shiftDir = null; this.shiftAxis = null; this.shiftPlane = null; this.shiftOrigin = null; }
      return false;
    }
    return false;
  }

  resetLocks() { this.lockAxis = null; this.lockDir = null; this.shiftDir = null; this.shiftAxis = null; this.shiftPlane = null; this.shiftOrigin = null; }

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
