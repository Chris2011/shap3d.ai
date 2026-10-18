import * as THREE from 'three';
import type { Viewer, EdgeRec, VertRec, FaceHit } from './viewer';
import type { Overlay } from './overlay';

import type { PlaneRef } from '../core/geometry';
export type InferKind = 'endpoint' | 'midpoint' | 'edge' | 'face' | 'axis' | 'ground' | 'free' | 'guide' | 'origin' | 'aligned' | 'locked' | 'center' | 'parallel' | 'perpendicular';

export interface Inference {
  point: THREE.Vector3;
  kind: InferKind;
  label: string;
  face?: FaceHit | null;
  edge?: EdgeRec;
  vert?: VertRec;
  axis?: 'x' | 'y' | 'z';
  axisFrom?: THREE.Vector3;
  alignFrom?: THREE.Vector3;
  direction?: THREE.Vector3;
}

export const AXES: Record<'x' | 'y' | 'z', THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
export const AXIS_COLOR = { x: '#e00000', y: '#00a000', z: '#0000e0' } as const;
export const AXIS_LABEL = { x: 'Auf roter Achse', y: 'Auf grüner Achse', z: 'Auf blauer Achse' } as const;

export interface InferOptions {
  from?: THREE.Vector3 | null;
  lock?: THREE.Vector3 | null; // direction lock (arrow keys / shift)
  lockAxis?: 'x' | 'y' | 'z' | null;
  plane?: PlaneRef | null; // constrain to plane (e.g. rectangle on face)
  noGeometry?: boolean;
  filterVert?: (vertex: VertRec) => boolean;
  filterEdge?: (edgeRec: EdgeRec) => boolean;
  filterFace?: (context: FaceHit['context'], faceId: number) => boolean;
}

/** Closest point on infinite line (p,d) to a ray. */
export const closestOnLineToRay = (linePoint: THREE.Vector3, lineDir: THREE.Vector3, ray: THREE.Ray): THREE.Vector3 => {
  const offset = linePoint.clone().sub(ray.origin);
  const lineDot = lineDir.dot(lineDir), crossDot = lineDir.dot(ray.direction), rayDot = ray.direction.dot(ray.direction), lineOffset = lineDir.dot(offset), rayOffset = ray.direction.dot(offset);
  const den = lineDot * rayDot - crossDot * crossDot;
  if (Math.abs(den) < 1e-10) return linePoint.clone();
  const param = (crossDot * rayOffset - rayDot * lineOffset) / den;
  return linePoint.clone().addScaledVector(lineDir, param);
};

export class InferenceEngine {
  tracked: THREE.Vector3[] = [];
  last: Inference | null = null;
  constructor(public viewer: Viewer, public guides: () => { kind: string; point: THREE.Vector3; direction?: THREE.Vector3 }[]) {}

  track(point: THREE.Vector3) {
    if (this.tracked.some(tracked => tracked.distanceTo(point) < 1e-6)) return;
    this.tracked.unshift(point.clone()); this.tracked.length = Math.min(this.tracked.length, 3);
  }
  reset() { this.tracked = []; this.last = null; }

  private screenDistToLine(x: number, y: number, linePoint: THREE.Vector3, lineDir: THREE.Vector3): number {
    const projStart = this.viewer.project(linePoint), projEnd = this.viewer.project(linePoint.clone().addScaledVector(lineDir, 1));
    let screenStart = new THREE.Vector2(projStart.x, projStart.y), screenEnd = new THREE.Vector2(projEnd.x, projEnd.y);
    if (!projStart.visible || !projEnd.visible) { const projBack = this.viewer.project(linePoint.clone().addScaledVector(lineDir, -1)); if (!projStart.visible) return Infinity; screenEnd = new THREE.Vector2(projBack.x, projBack.y); }
    const segment = screenEnd.clone().sub(screenStart); if (segment.lengthSq() < 1e-6) return Infinity;
    const mouse = new THREE.Vector2(x, y);
    const param = mouse.clone().sub(screenStart).dot(segment) / segment.lengthSq();
    return screenStart.clone().add(segment.multiplyScalar(param)).distanceTo(mouse);
  }

  infer(x: number, y: number, opt: InferOptions = {}): Inference {
    const viewer = this.viewer; const ray = viewer.ray(x, y);
    const from = opt.from ?? null;
    // ---- locked direction
    if (from && opt.lock) {
      const direction = opt.lock.clone().normalize();
      let lockedPoint = closestOnLineToRay(from, direction, ray);
      const vertexHit = viewer.pickVertex(x, y, 10, opt.filterVert);
      let kind: InferKind = 'locked';
      if (vertexHit) { lockedPoint = from.clone().addScaledVector(direction, vertexHit.rec.position.clone().sub(from).dot(direction)); kind = 'aligned'; }
      const result: Inference = { point: lockedPoint, kind, label: opt.lockAxis ? AXIS_LABEL[opt.lockAxis] : 'Gesperrt', axis: opt.lockAxis ?? undefined, axisFrom: from, direction: direction, alignFrom: vertexHit?.rec.position };
      return (this.last = result);
    }
    if (!opt.noGeometry) {
      // ---- endpoints
      const vertexHit = viewer.pickVertex(x, y, 10, opt.filterVert);
      if (vertexHit) return (this.last = this.planeClamp({ point: vertexHit.rec.position.clone(), kind: 'endpoint', label: 'Endpunkt', vert: vertexHit.rec }, opt));
      // ---- origin
      const originScreen = viewer.project(new THREE.Vector3()); if (originScreen.visible && Math.hypot(originScreen.x - x, originScreen.y - y) < 8 && viewer.model.settings.axes) return (this.last = { point: new THREE.Vector3(), kind: 'origin', label: 'Ursprung' });
    }
    // ---- edges & midpoints
    const edgeHit = opt.noGeometry ? null : viewer.pickEdge(x, y, 7, opt.filterEdge);
    if (edgeHit) {
      const mid = edgeHit.rec.start.clone().add(edgeHit.rec.end).multiplyScalar(0.5);
      const midScreen = viewer.project(mid);
      if (Math.hypot(midScreen.x - x, midScreen.y - y) < 10) return (this.last = { point: mid, kind: 'midpoint', label: 'Mittelpunkt', edge: edgeHit.rec });
    }
    // ---- axis from the reference point (+ alignment with tracked points)
    if (from) {
      let best: { axis: 'x' | 'y' | 'z'; distance: number } | null = null;
      for (const axis of ['x', 'y', 'z'] as const) {
        const distance = this.screenDistToLine(x, y, from, AXES[axis]);
        if (distance < 9 && (!best || distance < best.distance)) best = { axis: axis, distance: distance };
      }
      if (best && !(edgeHit && edgeHit.dist < 3)) {
        const direction = AXES[best.axis];
        let axisPoint = closestOnLineToRay(from, direction, ray);
        let alignFrom: THREE.Vector3 | undefined;
        for (const tracked of this.tracked) {
          const projected = from.clone().addScaledVector(direction, tracked.clone().sub(from).dot(direction));
          const projectedScreen = viewer.project(projected);
          if (Math.hypot(projectedScreen.x - x, projectedScreen.y - y) < 12 && tracked.distanceTo(projected) > 1e-6) { axisPoint = projected; alignFrom = tracked; break; }
        }
        const result: Inference = { point: axisPoint, kind: alignFrom ? 'aligned' : 'axis', label: AXIS_LABEL[best.axis], axis: best.axis, axisFrom: from, alignFrom };
        return (this.last = result);
      }
    }
    if (edgeHit) return (this.last = this.planeClamp({ point: edgeHit.point, kind: 'edge', label: edgeHit.rec.context.path.length ? 'Auf Kante in Gruppe' : 'Auf Kante', edge: edgeHit.rec }, opt));
    // ---- guides
    if (!opt.noGeometry && viewer.model.settings.guides) {
      for (const guide of this.guides()) {
        if (guide.kind === 'point') { const screenPos = viewer.project(guide.point); if (screenPos.visible && Math.hypot(screenPos.x - x, screenPos.y - y) < 10) return (this.last = { point: guide.point.clone(), kind: 'guide', label: 'Hilfspunkt' }); }
        else if (guide.direction && this.screenDistToLine(x, y, guide.point, guide.direction) < 6) { const guidePoint = closestOnLineToRay(guide.point, guide.direction, ray); return (this.last = this.planeClamp({ point: guidePoint, kind: 'guide', label: 'Auf Hilfslinie' }, opt)); }
      }
    }
    // ---- alignment with tracked points (no reference point)
    // ---- face / plane
    if (opt.plane) {
      const hit = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(opt.plane.normal, opt.plane.point), new THREE.Vector3());
      if (hit) return (this.last = this.alignInPlane(x, y, { point: hit, kind: 'face', label: 'Auf Fläche' }, opt.plane));
    }
    const faceHit = opt.noGeometry ? null : viewer.pickFace(x, y, opt.filterFace);
    if (faceHit) return (this.last = { point: faceHit.point, kind: 'face', label: faceHit.context.path.length ? 'In Gruppe' : 'Auf Fläche', face: faceHit });
    // ---- ground / free
    const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), from ? -from.z : 0);
    const groundPoint = ray.intersectPlane(ground, new THREE.Vector3());
    if (groundPoint && groundPoint.distanceTo(ray.origin) < 5000) return (this.last = this.alignInPlane(x, y, { point: groundPoint, kind: 'ground', label: '' }, { point: groundPoint, normal: new THREE.Vector3(0, 0, 1) }));
    const point = ray.at(from ? from.distanceTo(ray.origin) : 10, new THREE.Vector3());
    return (this.last = { point: point, kind: 'free', label: '' });
  }

  /** Snap to alignment with tracked points inside a plane. */
  private alignInPlane(x: number, y: number, inference: Inference, plane: PlaneRef): Inference {
    for (const tracked of this.tracked) {
      for (const axis of ['x', 'y', 'z'] as const) {
        const direction = AXES[axis]; if (Math.abs(direction.dot(plane.normal)) > 0.01) continue;
        // line through tracked point along axis, intersected with plane-lie
        const trackedOnPlane = tracked.clone().addScaledVector(plane.normal, plane.point.clone().sub(tracked).dot(plane.normal));
        const dist = this.screenDistToLine(x, y, trackedOnPlane, direction);
        if (dist < 7) { const ray = this.viewer.ray(x, y); const point = closestOnLineToRay(trackedOnPlane, direction, ray); return { ...inference, point: point, kind: 'aligned', label: 'Von Punkt', alignFrom: tracked, axis: axis }; }
      }
    }
    return inference;
  }

  private planeClamp(inference: Inference, opt: InferOptions): Inference {
    if (!opt.plane) return inference;
    const distance = inference.point.clone().sub(opt.plane.point).dot(opt.plane.normal);
    if (Math.abs(distance) < 1e-6) return inference;
    // project onto plane along view ray direction so it still lies under the cursor
    return { ...inference, point: inference.point.clone().addScaledVector(opt.plane.normal, -distance) };
  }

  draw(overlay: Overlay, inference: Inference | null, mouse: { x: number; y: number }, showTip = true) {
    if (!inference) return;
    if (inference.axisFrom && inference.axis) {
      overlay.line(inference.axisFrom, inference.point, AXIS_COLOR[inference.axis], 1.5, [4, 3]);
    }
    if (inference.alignFrom) overlay.line(inference.alignFrom, inference.point, inference.axis ? AXIS_COLOR[inference.axis] : '#000', 1, [2, 3]);
    const markers: Record<string, string> = { endpoint: 'endpoint', midpoint: 'midpoint', edge: 'edge', face: 'face', guide: 'guide', origin: 'origin', aligned: 'axis', center: 'center' };
    if (markers[inference.kind]) overlay.marker(inference.point, markers[inference.kind]);
    if (showTip && inference.label) overlay.tooltip(mouse.x, mouse.y, inference.label);
  }
}
