import * as THREE from 'three';
import type { Viewer, EdgeRec, VertRec, FaceHit, PickContext } from './viewer';
import type { Overlay } from './overlay';
import type { Entities } from '../core/model';

import { type PlaneRef, segmentSegmentClosest, lineLineClosest, closestOnSegment } from '../core/geometry';
import { t } from '../i18n';
export type InferKind =
  | 'endpoint'
  | 'midpoint'
  | 'intersection'
  | 'edge'
  | 'face'
  | 'axis'
  | 'ground'
  | 'free'
  | 'guide'
  | 'origin'
  | 'aligned'
  | 'locked'
  | 'center'
  | 'parallel'
  | 'perpendicular'
  | 'extension';

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
  /** what the cursor snapped to while a direction was locked (drawn at alignFrom) */
  target?: InferKind;
  /** edge a parallel / perpendicular / extension inference refers to (highlighted in magenta) */
  refEdge?: { start: THREE.Vector3; end: THREE.Vector3 };
}

export const AXES: Record<'x' | 'y' | 'z', THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
export const AXIS_COLOR = { x: '#e00000', y: '#00a000', z: '#0000e0' } as const;
export const AXIS_LABEL = {
  get x() {
    return t('inference.onRedAxis');
  },
  get y() {
    return t('inference.onGreenAxis');
  },
  get z() {
    return t('inference.onBlueAxis');
  },
};
export const MAGENTA = '#e000e0';

/** Snap radii in screen pixels – independent of zoom like in SketchUp. */
const POINT_RADIUS = 10,
  EDGE_RADIUS = 7,
  AXIS_RADIUS = 9,
  LINE_RADIUS = 7,
  ALIGN_RADIUS = 7,
  ORIGIN_RADIUS = 8;
/** A point that is already snapped stays snapped until a rival is clearly closer (no flicker between neighbours). */
const STICKY_PX = 3;
/** directions within this angle of a model axis count as that axis (sin of ~0.6°) */
const AXIS_ALIGNED = 0.01;

export interface InferOptions {
  from?: THREE.Vector3 | null;
  lock?: THREE.Vector3 | null; // direction lock (arrow keys / shift)
  lockAxis?: 'x' | 'y' | 'z' | null;
  /** the locked line runs through this point instead of `from` (shift on an edge) */
  lockOrigin?: THREE.Vector3 | null;
  /** tooltip while locked; '' shows what the cursor snapped to (push/pull) */
  lockLabel?: string;
  plane?: PlaneRef | null; // constrain to plane (e.g. rectangle on face)
  noGeometry?: boolean;
  filterVert?: (vertex: VertRec) => boolean;
  filterEdge?: (edgeRec: EdgeRec) => boolean;
  filterFace?: (context: FaceHit['context'], faceId: number) => boolean;
}

/** Closest point on infinite line (p,d) to a ray. */
export const closestOnLineToRay = (linePoint: THREE.Vector3, lineDir: THREE.Vector3, ray: THREE.Ray): THREE.Vector3 => {
  const offset = linePoint.clone().sub(ray.origin);
  const lineDot = lineDir.dot(lineDir),
    crossDot = lineDir.dot(ray.direction),
    rayDot = ray.direction.dot(ray.direction),
    lineOffset = lineDir.dot(offset),
    rayOffset = ray.direction.dot(offset);
  const den = lineDot * rayDot - crossDot * crossDot;
  if (Math.abs(den) < 1e-10) {
    return linePoint.clone();
  }
  const param = (crossDot * rayOffset - rayDot * lineOffset) / den;
  return linePoint.clone().addScaledVector(lineDir, param);
};

const isAxisDirection = (direction: THREE.Vector3) =>
  (['x', 'y', 'z'] as const).some((axis) => AXES[axis].clone().cross(direction).length() < AXIS_ALIGNED * direction.length());

/** Centre of the circle or arc an edge belongs to: a chain of at least three equally long edges turning by the same angle in one plane. */
export const curveCenter = (entities: Entities, edgeId: number): THREE.Vector3 | null => {
  const edge = entities.edges.get(edgeId);
  if (!edge) {
    return null;
  }
  const length = entities.edgeLength(edge);
  if (length < 1e-9) {
    return null;
  }
  const similar = (other: number) => Math.abs(other - length) < length * 1e-3;
  /** walks from vertex `at` away from `previous` along edges of the same length */
  const walk = (previous: number, at: number, steps: number): number[] => {
    const chain: number[] = [];
    for (let i = 0; i < steps; i++) {
      const next = entities
        .edgesOfVertex(at)
        .map((candidate) => (candidate.start === at ? candidate.end : candidate.start))
        .filter((other) => other !== previous && similar(entities.positionOf(at).distanceTo(entities.positionOf(other))));
      if (next.length !== 1) {
        break;
      }
      chain.push(next[0]);
      previous = at;
      at = next[0];
    }
    return chain;
  };
  const points = [...walk(edge.end, edge.start, 3).reverse(), edge.start, edge.end, ...walk(edge.start, edge.end, 3)].map((vertex) =>
    entities.positionOf(vertex),
  );
  if (points.length < 4) {
    return null;
  }
  // constant turning angle in a common plane
  const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[1]));
  if (normal.lengthSq() < 1e-18) {
    return null;
  }
  normal.normalize();
  const turn = (i: number) =>
    points[i + 1]
      .clone()
      .sub(points[i])
      .angleTo(points[i + 2].clone().sub(points[i + 1]));
  const firstTurn = turn(0);
  if (firstTurn < 1e-3 || firstTurn > Math.PI / 3) {
    return null;
  }
  for (let i = 1; i + 2 < points.length; i++) {
    if (Math.abs(turn(i) - firstTurn) > 1e-3) {
      return null;
    }
    const segmentNormal = points[i + 1]
      .clone()
      .sub(points[i])
      .cross(points[i + 2].clone().sub(points[i + 1]))
      .normalize();
    if (segmentNormal.dot(normal) < 1 - 1e-6) {
      return null;
    }
  }
  // circumcentre of the first three points
  const pointA = points[0],
    toB = points[1].clone().sub(pointA),
    toC = points[2].clone().sub(pointA);
  const cross = toB.clone().cross(toC);
  const denominator = 2 * cross.lengthSq();
  if (denominator < 1e-18) {
    return null;
  }
  const center = toC
    .clone()
    .cross(cross)
    .multiplyScalar(toB.lengthSq())
    .add(cross.clone().cross(toB).multiplyScalar(toC.lengthSq()))
    .divideScalar(denominator);
  return center.add(pointA);
};

interface PointCandidate {
  inference: Inference;
  dist: number;
}

export class InferenceEngine {
  /** points the cursor rested on – source of "from point" alignments */
  tracked: THREE.Vector3[] = [];
  /** last edge hovered – source of parallel / perpendicular / extension inferences */
  trackedEdge: { start: THREE.Vector3; end: THREE.Vector3 } | null = null;
  /** centres of circles and arcs whose edges were hovered */
  centers: THREE.Vector3[] = [];
  last: Inference | null = null;
  constructor(
    public viewer: Viewer,
    public guides: () => { kind: string; point: THREE.Vector3; direction?: THREE.Vector3 }[],
    public activeEntities: () => Entities | null = () => null,
  ) {}

  track(point: THREE.Vector3) {
    if (this.tracked.some((tracked) => tracked.distanceTo(point) < 1e-6)) {
      return;
    }
    this.tracked.unshift(point.clone());
    this.tracked.length = Math.min(this.tracked.length, 3);
  }
  private trackEdge(edgeRec: EdgeRec) {
    this.trackedEdge = { start: edgeRec.start.clone(), end: edgeRec.end.clone() };
    const center = curveCenter(edgeRec.context.entities, edgeRec.edgeId);
    if (center) {
      const worldCenter = center.applyMatrix4(edgeRec.context.world);
      if (!this.centers.some((known) => known.distanceTo(worldCenter) < 1e-6)) {
        this.centers.unshift(worldCenter);
        this.centers.length = Math.min(this.centers.length, 3);
      }
    }
  }
  reset() {
    this.tracked = [];
    this.trackedEdge = null;
    this.centers = [];
    this.last = null;
  }

  /** " in group" / " in component" for geometry outside the context being edited */
  private where(context: PickContext): string {
    const active = this.activeEntities();
    if (!context.path.length || context.entities === active) {
      return '';
    }
    return context.path[context.path.length - 1].definition.isComponent ? ` ${t('inference.inComponent')}` : ` ${t('inference.inGroup')}`;
  }

  private screenDist(point: THREE.Vector3, x: number, y: number): number {
    const projected = this.viewer.project(point);
    if (!projected.visible) {
      return Infinity;
    }
    return Math.hypot(projected.x - x, projected.y - y);
  }

  /** Screen distance from the cursor to an infinite 3D line (works in perspective and parallel projection). */
  private screenDistToLine(x: number, y: number, linePoint: THREE.Vector3, lineDir: THREE.Vector3): number {
    const projStart = this.viewer.project(linePoint),
      projEnd = this.viewer.project(linePoint.clone().addScaledVector(lineDir, 1));
    const screenStart = new THREE.Vector2(projStart.x, projStart.y);
    let screenEnd = new THREE.Vector2(projEnd.x, projEnd.y);
    if (!projStart.visible || !projEnd.visible) {
      const projBack = this.viewer.project(linePoint.clone().addScaledVector(lineDir, -1));
      if (!projStart.visible) {
        return Infinity;
      }
      screenEnd = new THREE.Vector2(projBack.x, projBack.y);
    }
    const segment = screenEnd.clone().sub(screenStart);
    if (segment.lengthSq() < 1e-6) {
      return Infinity;
    }
    const mouse = new THREE.Vector2(x, y);
    const param = mouse.clone().sub(screenStart).dot(segment) / segment.lengthSq();
    return screenStart.clone().add(segment.multiplyScalar(param)).distanceTo(mouse);
  }

  /** Point inferences in SketchUp order: endpoint, midpoint, intersection, centre, guide point, origin. */
  private pickPoint(x: number, y: number, opt: InferOptions): Inference | null {
    const viewer = this.viewer;
    const candidates: PointCandidate[] = [];
    const vertexHit = viewer.pickVertex(x, y, POINT_RADIUS, opt.filterVert);
    if (vertexHit) {
      candidates.push({
        dist: vertexHit.dist,
        inference: {
          point: vertexHit.rec.position.clone(),
          kind: 'endpoint',
          label: t('inference.endpoint') + this.where(vertexHit.rec.context),
          vert: vertexHit.rec,
        },
      });
    }
    const near = this.edgesNear(x, y, POINT_RADIUS, opt.filterEdge);
    for (const { rec } of near) {
      const mid = rec.start.clone().add(rec.end).multiplyScalar(0.5);
      const dist = this.screenDist(mid, x, y);
      if (dist < POINT_RADIUS && !viewer.isHidden(mid)) {
        candidates.push({
          dist: dist + 0.5,
          inference: { point: mid, kind: 'midpoint', label: t('inference.midpoint') + this.where(rec.context), edge: rec },
        });
      }
    }
    // crossing edges
    for (let i = 0; i < near.length && i < 8; i++) {
      for (let j = i + 1; j < near.length && j < 8; j++) {
        const first = near[i].rec,
          second = near[j].rec;
        const closest = segmentSegmentClosest(first.start, first.end, second.start, second.end);
        if (closest.s <= 1e-6 || closest.s >= 1 - 1e-6 || closest.t <= 1e-6 || closest.t >= 1 - 1e-6) {
          continue;
        }
        const tolerance = Math.max(1e-6, viewer.worldPerPixel(closest.c1) * 0.5);
        if (closest.c1.distanceTo(closest.c2) > tolerance) {
          continue;
        }
        const dist = this.screenDist(closest.c1, x, y);
        if (dist < POINT_RADIUS && !viewer.isHidden(closest.c1)) {
          candidates.push({
            dist: dist + 1,
            inference: { point: closest.c1.clone(), kind: 'intersection', label: t('inference.intersection'), edge: first },
          });
        }
      }
    }
    for (const center of this.centers) {
      const dist = this.screenDist(center, x, y);
      if (dist < POINT_RADIUS) {
        candidates.push({ dist, inference: { point: center.clone(), kind: 'center', label: t('inference.center') } });
      }
    }
    if (viewer.model.settings.guides) {
      for (const guide of this.guides()) {
        if (guide.kind !== 'point') {
          continue;
        }
        const dist = this.screenDist(guide.point, x, y);
        if (dist < POINT_RADIUS) {
          candidates.push({ dist: dist + 0.5, inference: { point: guide.point.clone(), kind: 'guide', label: t('inference.guidePoint') } });
        }
      }
    }
    if (viewer.model.settings.axes) {
      const dist = this.screenDist(new THREE.Vector3(), x, y);
      if (dist < ORIGIN_RADIUS) {
        candidates.push({ dist: dist + 1, inference: { point: new THREE.Vector3(), kind: 'origin', label: t('inference.origin') } });
      }
    }
    if (!candidates.length) {
      return null;
    }
    candidates.sort((left, right) => left.dist - right.dist);
    let best = candidates[0];
    // hysteresis: keep the point that was snapped before unless another one is clearly closer
    const previous =
      this.last &&
      candidates.find(
        (candidate) => candidate.inference.kind === this.last!.kind && candidate.inference.point.distanceTo(this.last!.point) < 1e-9,
      );
    if (previous && previous.dist < best.dist + STICKY_PX) {
      best = previous;
    }
    return best.inference;
  }

  /** Edges within tol pixels of the cursor, closest first (occluded ones skipped). */
  private edgesNear(x: number, y: number, tolPx: number, filter?: (edgeRec: EdgeRec) => boolean): { rec: EdgeRec; dist: number }[] {
    const viewer = this.viewer;
    const found: { rec: EdgeRec; dist: number }[] = [];
    const mouse = new THREE.Vector2(x, y);
    for (const edgeRec of viewer.edges) {
      if (filter && !filter(edgeRec)) {
        continue;
      }
      const projStart = viewer.project(edgeRec.start),
        projEnd = viewer.project(edgeRec.end);
      if (!projStart.visible && !projEnd.visible) {
        continue;
      }
      const screenStart = new THREE.Vector2(projStart.x, projStart.y),
        screenEnd = new THREE.Vector2(projEnd.x, projEnd.y);
      const segment = screenEnd.clone().sub(screenStart);
      const lengthSq = segment.lengthSq();
      const param = lengthSq > 1e-9 ? Math.max(0, Math.min(1, mouse.clone().sub(screenStart).dot(segment) / lengthSq)) : 0;
      const dist = screenStart.clone().add(segment.multiplyScalar(param)).distanceTo(mouse);
      if (dist <= tolPx) {
        found.push({ rec: edgeRec, dist });
      }
    }
    found.sort((left, right) => left.dist - right.dist);
    const ray = viewer.ray(x, y);
    return found
      .slice(0, 12)
      .filter(
        ({ rec }) =>
          !viewer.isHidden(closestOnSegment(closestOnLineToRay(rec.start, rec.end.clone().sub(rec.start), ray), rec.start, rec.end).point),
      );
  }

  infer(x: number, y: number, opt: InferOptions = {}): Inference {
    const viewer = this.viewer;
    const ray = viewer.ray(x, y);
    const from = opt.from ?? null;
    const geometry = !opt.noGeometry;
    // ---- locked direction: whatever the cursor snaps to is projected onto the locked line
    const lockOrigin = opt.lockOrigin ?? from;
    if (lockOrigin && opt.lock) {
      return (this.last = this.inferLocked(x, y, lockOrigin, opt));
    }
    // ---- points
    const point = geometry ? this.pickPoint(x, y, opt) : null;
    if (point) {
      if (point.edge && point.kind === 'midpoint') {
        this.trackEdge(point.edge);
      }
      return (this.last = this.planeClamp(point, opt));
    }
    // ---- edge under the cursor (teaches parallel / perpendicular / extension and circle centres)
    const edgeHit = geometry ? viewer.pickEdge(x, y, EDGE_RADIUS, opt.filterEdge) : null;
    if (edgeHit) {
      this.trackEdge(edgeHit.rec);
    }
    // ---- linear inferences from the reference point: axes, parallel and perpendicular
    if (from) {
      const linear = this.inferLinear(x, y, from, opt, edgeHit);
      if (linear) {
        return (this.last = linear);
      }
    }
    if (edgeHit) {
      return (this.last = this.planeClamp(
        { point: edgeHit.point, kind: 'edge', label: t('inference.onEdge') + this.where(edgeHit.rec.context), edge: edgeHit.rec },
        opt,
      ));
    }
    // ---- guide lines
    if (geometry && viewer.model.settings.guides) {
      let bestGuide: { point: THREE.Vector3; dist: number } | null = null;
      for (const guide of this.guides()) {
        if (guide.kind === 'point' || !guide.direction) {
          continue;
        }
        const dist = this.screenDistToLine(x, y, guide.point, guide.direction);
        if (dist < LINE_RADIUS && (!bestGuide || dist < bestGuide.dist)) {
          bestGuide = { point: closestOnLineToRay(guide.point, guide.direction, ray), dist };
        }
      }
      if (bestGuide) {
        return (this.last = this.planeClamp({ point: bestGuide.point, kind: 'guide', label: t('inference.onGuide') }, opt));
      }
    }
    // ---- extension of the last hovered edge
    const extension = geometry ? this.inferExtension(x, y, opt) : null;
    if (extension) {
      return (this.last = extension);
    }
    // ---- face / plane
    if (opt.plane) {
      const hit = ray.intersectPlane(
        new THREE.Plane().setFromNormalAndCoplanarPoint(opt.plane.normal, opt.plane.point),
        new THREE.Vector3(),
      );
      if (hit) {
        return (this.last = this.alignInPlane(x, y, { point: hit, kind: 'face', label: t('inference.onFace') }, opt.plane));
      }
    }
    const faceHit = geometry ? viewer.pickFace(x, y, opt.filterFace) : null;
    if (faceHit) {
      return (this.last = this.alignInPlane(
        x,
        y,
        { point: faceHit.point, kind: 'face', label: t('inference.onFace') + this.where(faceHit.context), face: faceHit },
        { point: faceHit.point, normal: faceHit.normal },
      ));
    }
    // ---- ground / free
    const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), from ? -from.z : 0);
    const groundPoint = ray.intersectPlane(ground, new THREE.Vector3());
    if (groundPoint && groundPoint.distanceTo(ray.origin) < 5000) {
      return (this.last = this.alignInPlane(
        x,
        y,
        { point: groundPoint, kind: 'ground', label: '' },
        { point: groundPoint, normal: new THREE.Vector3(0, 0, 1) },
      ));
    }
    const freePoint = ray.at(from ? from.distanceTo(ray.origin) : 10, new THREE.Vector3());
    return (this.last = { point: freePoint, kind: 'free', label: '' });
  }

  /** Locked to a line through `from`: points project onto it, edges meet it, parallel faces cut it. */
  private inferLocked(x: number, y: number, from: THREE.Vector3, opt: InferOptions): Inference {
    const viewer = this.viewer;
    const ray = viewer.ray(x, y);
    const direction = opt.lock!.clone().normalize();
    const lockLabel = opt.lockLabel ?? (opt.lockAxis ? AXIS_LABEL[opt.lockAxis] : t('inference.locked'));
    const base: Inference = {
      point: closestOnLineToRay(from, direction, ray),
      kind: 'locked',
      label: lockLabel,
      axis: opt.lockAxis ?? undefined,
      axisFrom: from,
      direction,
    };
    if (opt.noGeometry) {
      return base;
    }
    const onLine = (point: THREE.Vector3) => from.clone().addScaledVector(direction, point.clone().sub(from).dot(direction));
    const snapped = (target: Inference, point: THREE.Vector3): Inference => ({
      ...base,
      point,
      kind: 'aligned',
      label: lockLabel || target.label,
      alignFrom: target.point,
      target: target.kind,
      edge: target.edge,
      vert: target.vert,
      face: target.face,
    });
    const point = this.pickPoint(x, y, opt);
    if (point) {
      return snapped(point, onLine(point.point));
    }
    const edgeHit = viewer.pickEdge(x, y, EDGE_RADIUS, opt.filterEdge);
    if (edgeHit) {
      const edgeDir = edgeHit.rec.end.clone().sub(edgeHit.rec.start);
      const closest = lineLineClosest(from, direction, edgeHit.rec.start, edgeDir);
      // an edge crossing the locked line gives the crossing; otherwise the point under the cursor is projected
      const onEdge = closest && closest.t >= -1e-9 && closest.t <= 1 + 1e-9 ? closest.c2 : edgeHit.point;
      return snapped(
        { point: onEdge, kind: 'edge', label: t('inference.onEdge') + this.where(edgeHit.rec.context), edge: edgeHit.rec },
        onLine(onEdge),
      );
    }
    const faceHit = viewer.pickFace(x, y, opt.filterFace);
    if (faceHit && Math.abs(faceHit.normal.dot(direction)) > 0.999) {
      return snapped(
        { point: faceHit.point, kind: 'face', label: t('inference.onFace') + this.where(faceHit.context), face: faceHit },
        onLine(faceHit.point),
      );
    }
    return base;
  }

  /** Axis, parallel and perpendicular inferences from the reference point (the closest line on screen wins, axes on ties). */
  private inferLinear(
    x: number,
    y: number,
    from: THREE.Vector3,
    opt: InferOptions,
    edgeHit: { rec: EdgeRec; point: THREE.Vector3; dist: number } | null,
  ): Inference | null {
    const viewer = this.viewer;
    const ray = viewer.ray(x, y);
    type Line = { direction: THREE.Vector3; dist: number; kind: 'axis' | 'parallel' | 'perpendicular'; axis?: 'x' | 'y' | 'z' };
    const lines: Line[] = [];
    const inPlane = (direction: THREE.Vector3) => !opt.plane || Math.abs(direction.dot(opt.plane.normal)) < AXIS_ALIGNED;
    for (const axis of ['x', 'y', 'z'] as const) {
      if (!inPlane(AXES[axis])) {
        continue;
      }
      const dist = this.screenDistToLine(x, y, from, AXES[axis]);
      if (dist < AXIS_RADIUS) {
        lines.push({ direction: AXES[axis].clone(), dist: dist - 1, kind: 'axis', axis });
      }
    }
    const reference = this.trackedEdge;
    if (reference) {
      const edgeDir = reference.end.clone().sub(reference.start).normalize();
      const perpendiculars: THREE.Vector3[] = [];
      if (opt.plane) {
        perpendiculars.push(opt.plane.normal.clone().cross(edgeDir));
      } else {
        perpendiculars.push(edgeDir.clone().cross(AXES.z));
        // towards the edge: the foot of the perpendicular from the reference point
        const foot = reference.start.clone().addScaledVector(edgeDir, from.clone().sub(reference.start).dot(edgeDir));
        perpendiculars.push(foot.sub(from));
      }
      const candidates: [THREE.Vector3, 'parallel' | 'perpendicular'][] = [
        [edgeDir, 'parallel'],
        ...perpendiculars.map((direction) => [direction, 'perpendicular'] as [THREE.Vector3, 'perpendicular']),
      ];
      for (const [direction, kind] of candidates) {
        if (direction.lengthSq() < 1e-12) {
          continue;
        }
        direction.normalize();
        if (isAxisDirection(direction) || !inPlane(direction)) {
          continue;
        }
        const dist = this.screenDistToLine(x, y, from, direction);
        if (dist < LINE_RADIUS) {
          lines.push({ direction, dist, kind });
        }
      }
    }
    if (!lines.length) {
      return null;
    }
    lines.sort((left, right) => left.dist - right.dist);
    const line = lines[0];
    // an edge right under the cursor beats the inference line – unless they cross there
    if (edgeHit && edgeHit.dist < 3) {
      const crossing = lineLineClosest(from, line.direction, edgeHit.rec.start, edgeHit.rec.end.clone().sub(edgeHit.rec.start));
      if (
        crossing &&
        crossing.t > 1e-6 &&
        crossing.t < 1 - 1e-6 &&
        crossing.c1.distanceTo(crossing.c2) < viewer.worldPerPixel(crossing.c1) &&
        this.screenDist(crossing.c1, x, y) < POINT_RADIUS
      ) {
        return {
          point: crossing.c1,
          kind: 'intersection',
          label: t('inference.intersection'),
          axis: line.axis,
          axisFrom: from,
          direction: line.direction,
          edge: edgeHit.rec,
          refEdge: line.kind === 'axis' ? undefined : (this.trackedEdge ?? undefined),
        };
      }
      return null;
    }
    let linePoint = closestOnLineToRay(from, line.direction, ray);
    let alignFrom: THREE.Vector3 | undefined;
    for (const tracked of this.tracked) {
      const projected = from.clone().addScaledVector(line.direction, tracked.clone().sub(from).dot(line.direction));
      if (tracked.distanceTo(projected) > 1e-6 && this.screenDist(projected, x, y) < ALIGN_RADIUS + 5) {
        linePoint = projected;
        alignFrom = tracked;
        break;
      }
    }
    if (line.kind === 'axis') {
      return {
        point: linePoint,
        kind: alignFrom ? 'aligned' : 'axis',
        label: AXIS_LABEL[line.axis!],
        axis: line.axis,
        axisFrom: from,
        alignFrom,
        direction: line.direction,
      };
    }
    return {
      point: linePoint,
      kind: line.kind,
      label: line.kind === 'parallel' ? t('inference.parallel') : t('inference.perpendicular'),
      axisFrom: from,
      alignFrom,
      direction: line.direction,
      refEdge: this.trackedEdge ?? undefined,
    };
  }

  /** Along the infinite line through the last hovered edge, beyond its ends. */
  private inferExtension(x: number, y: number, opt: InferOptions): Inference | null {
    const reference = this.trackedEdge;
    if (!reference) {
      return null;
    }
    const direction = reference.end.clone().sub(reference.start);
    if (direction.lengthSq() < 1e-12) {
      return null;
    }
    if (this.screenDistToLine(x, y, reference.start, direction) >= LINE_RADIUS) {
      return null;
    }
    const point = closestOnLineToRay(reference.start, direction, this.viewer.ray(x, y));
    const param = point.clone().sub(reference.start).dot(direction) / direction.lengthSq();
    if (param > -1e-6 && param < 1 + 1e-6) {
      return null;
    }
    if (Math.min(this.screenDist(reference.start, x, y), this.screenDist(reference.end, x, y)) < POINT_RADIUS) {
      return null;
    }
    const inference: Inference = {
      point,
      kind: 'extension',
      label: t('inference.extension'),
      alignFrom: param < 0 ? reference.start.clone() : reference.end.clone(),
      refEdge: reference,
      direction: direction.normalize(),
    };
    return this.planeClamp(inference, opt);
  }

  /** Snap to alignment with tracked points inside a plane ("Von Punkt"); two alignments meet in their crossing. */
  private alignInPlane(x: number, y: number, inference: Inference, plane: PlaneRef): Inference {
    const ray = this.viewer.ray(x, y);
    const near: { origin: THREE.Vector3; tracked: THREE.Vector3; direction: THREE.Vector3; axis: 'x' | 'y' | 'z'; dist: number }[] = [];
    for (const tracked of this.tracked) {
      for (const axis of ['x', 'y', 'z'] as const) {
        const direction = AXES[axis];
        if (Math.abs(direction.dot(plane.normal)) > AXIS_ALIGNED) {
          continue;
        }
        // line through the tracked point along the axis, moved into the plane
        const origin = tracked.clone().addScaledVector(plane.normal, plane.point.clone().sub(tracked).dot(plane.normal));
        const dist = this.screenDistToLine(x, y, origin, direction);
        if (dist < ALIGN_RADIUS) {
          near.push({ origin, tracked, direction, axis, dist });
        }
      }
    }
    if (!near.length) {
      return inference;
    }
    near.sort((left, right) => left.dist - right.dist);
    const first = near[0];
    const second = near.find(
      (candidate) => candidate.tracked !== first.tracked && Math.abs(candidate.direction.dot(first.direction)) < 0.5,
    );
    if (second) {
      const crossing = lineLineClosest(first.origin, first.direction, second.origin, second.direction);
      if (crossing) {
        return {
          ...inference,
          point: crossing.c1,
          kind: 'aligned',
          label: t('inference.fromPoint'),
          alignFrom: first.tracked,
          axis: first.axis,
          axisFrom: second.tracked,
          target: undefined,
        };
      }
    }
    return {
      ...inference,
      point: closestOnLineToRay(first.origin, first.direction, ray),
      kind: 'aligned',
      label: t('inference.fromPoint'),
      alignFrom: first.tracked,
      axis: first.axis,
    };
  }

  private planeClamp(inference: Inference, opt: InferOptions): Inference {
    if (!opt.plane) {
      return inference;
    }
    const distance = inference.point.clone().sub(opt.plane.point).dot(opt.plane.normal);
    if (Math.abs(distance) < 1e-6) {
      return inference;
    }
    return { ...inference, point: inference.point.clone().addScaledVector(opt.plane.normal, -distance) };
  }

  draw(overlay: Overlay, inference: Inference | null, mouse: { x: number; y: number }, showTip = true) {
    if (!inference) {
      return;
    }
    const lineColor = inference.axis ? AXIS_COLOR[inference.axis] : MAGENTA;
    if (inference.refEdge && inference.kind !== 'locked' && inference.kind !== 'aligned') {
      overlay.line(inference.refEdge.start, inference.refEdge.end, MAGENTA, 2.5);
    }
    if (
      inference.axisFrom &&
      (inference.kind === 'axis' ||
        inference.kind === 'parallel' ||
        inference.kind === 'perpendicular' ||
        inference.kind === 'locked' ||
        inference.kind === 'intersection' ||
        (inference.kind === 'aligned' && inference.direction))
    ) {
      overlay.line(inference.axisFrom, inference.point, lineColor, 1.5, [4, 3]);
    }
    if (inference.kind === 'aligned' && !inference.direction && inference.axisFrom && inference.axis) {
      // crossing of two "from point" alignments
      overlay.line(inference.axisFrom, inference.point, '#000', 1, [2, 3]);
    }
    if (inference.alignFrom) {
      overlay.line(
        inference.alignFrom,
        inference.point,
        inference.kind === 'extension' ? MAGENTA : inference.axis ? AXIS_COLOR[inference.axis] : '#000',
        1,
        [2, 3],
      );
    }
    if (inference.target && inference.alignFrom) {
      overlay.marker(inference.alignFrom, inference.target);
    }
    const markers: Partial<Record<InferKind, string>> = {
      endpoint: 'endpoint',
      midpoint: 'midpoint',
      intersection: 'intersection',
      edge: 'edge',
      face: 'face',
      guide: 'guide',
      origin: 'origin',
      aligned: 'axis',
      center: 'center',
      extension: 'axis',
    };
    const marker = markers[inference.kind];
    if (marker) {
      overlay.marker(inference.point, marker);
    }
    if (showTip && inference.label) {
      overlay.tooltip(mouse.x, mouse.y, inference.label);
    }
  }
}
