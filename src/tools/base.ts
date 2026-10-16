import * as THREE from 'three';
import { Tool, type PEvt } from '../engine/editor';
import { AXES, type Inference, type InferOptions } from '../engine/inference';
import type { Overlay } from '../engine/overlay';
import { parseLength } from '../core/units';

/** Base for tools that pick points with SketchUp inference (arrow-key axis locks, shift lock). */
export abstract class PointTool extends Tool {
  inf: Inference | null = null;
  lockAxis: 'x' | 'y' | 'z' | null = null;
  shiftDir: THREE.Vector3 | null = null;
  shiftAxis: 'x' | 'y' | 'z' | null = null;
  downAt: { x: number; y: number } | null = null;

  pick(e: { x: number; y: number }, from: THREE.Vector3 | null, extra: Partial<InferOptions> = {}): Inference {
    let lock: THREE.Vector3 | null = null; let lockAxis: 'x' | 'y' | 'z' | null = null;
    if (from && this.lockAxis) { lock = AXES[this.lockAxis]; lockAxis = this.lockAxis; }
    else if (from && this.shiftDir) { lock = this.shiftDir; lockAxis = this.shiftAxis; }
    const r = this.ed.infer.infer(e.x, e.y, { from, lock, lockAxis, ...extra });
    if (r.kind === 'endpoint' || r.kind === 'midpoint') this.ed.infer.track(r.point);
    this.inf = r;
    return r;
  }

  /** Default handling for arrow keys and shift inference lock. */
  onKey(e: KeyboardEvent, down: boolean): boolean {
    if (down && ['ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
      const a = e.key === 'ArrowUp' ? 'z' : e.key === 'ArrowRight' ? 'x' : 'y';
      this.lockAxis = this.lockAxis === a ? null : a;
      this.ed.redraw(); return true;
    }
    if (e.key === 'ArrowDown' && down) { this.lockAxis = null; return true; }
    if (e.key === 'Shift') {
      if (down && !this.shiftDir && this.inf) {
        if (this.inf.axis && (this.inf.kind === 'axis' || this.inf.kind === 'aligned')) { this.shiftDir = AXES[this.inf.axis].clone(); this.shiftAxis = this.inf.axis; }
        else if (this.inf.edge && this.inf.kind === 'edge') { this.shiftDir = this.inf.edge.b.clone().sub(this.inf.edge.a).normalize(); this.shiftAxis = null; }
      } else if (!down) { this.shiftDir = null; this.shiftAxis = null; }
      return false;
    }
    return false;
  }

  resetLocks() { this.lockAxis = null; this.shiftDir = null; this.shiftAxis = null; }

  drawInference(o: Overlay, tip = true) { this.ed.infer.draw(o, this.inf, this.ed.mouse, tip); }

  /** Did the mouse move enough between down and up to count as a drag? */
  isDrag(e: PEvt) { return !!this.downAt && Math.hypot(e.x - this.downAt.x, e.y - this.downAt.y) > 6; }

  len(s: string) { return parseLength(s, this.ed.model.settings.units); }
}

/** Plane helpers for drawing tools: face plane under the first point, else horizontal. */
export function planeFromInference(r: Inference): { p: THREE.Vector3; n: THREE.Vector3; fromFace: boolean } {
  if (r.face && (r.kind === 'face')) return { p: r.point.clone(), n: r.face.normal.clone().normalize(), fromFace: true };
  return { p: r.point.clone(), n: new THREE.Vector3(0, 0, 1), fromFace: false };
}

/** In-plane axes aligned with the model axes where possible. */
export function planeAxes(n: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const cands = [AXES.x, AXES.y, AXES.z].map(a => a.clone().sub(n.clone().multiplyScalar(a.dot(n))));
  cands.sort((a, b) => b.length() - a.length());
  const u = cands[0].normalize();
  const v = n.clone().cross(u).normalize();
  return { u, v };
}

export function rayPlane(ed: { viewer: { ray(x: number, y: number): THREE.Ray } }, x: number, y: number, p: THREE.Vector3, n: THREE.Vector3): THREE.Vector3 | null {
  const r = ed.viewer.ray(x, y);
  return r.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, p), new THREE.Vector3());
}

/** Project a point onto a plane. */
export function onPlane(q: THREE.Vector3, p: THREE.Vector3, n: THREE.Vector3) { return q.clone().addScaledVector(n, -q.clone().sub(p).dot(n)); }
