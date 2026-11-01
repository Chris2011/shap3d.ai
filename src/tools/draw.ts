import * as THREE from 'three';
import type { Editor, PEvt } from '../engine/editor';
import type { EdgeRec } from '../engine/viewer';
import type { Entities } from '../core/model';
import type { Overlay } from '../engine/overlay';
import { PointTool, planeFromInference, planeAxes, onPlane } from './base';
import { parseLengthList } from '../core/units';
import { AXIS_COLOR, MAGENTA, snapping } from '../engine/inference';
import { type PlaneRef, lineLineClosest } from '../core/geometry';
import { t, formatDecimal } from '../i18n';

type V3 = THREE.Vector3;

const parseCoords = (text: string): { absolute: boolean; vector: V3 } | null => {
  const match = text.trim().match(/^([[<])\s*([^\]>]+)[\]>]$/);
  if (!match) {
    return null;
  }
  const parts = match[2].split(/[;,]/).map((x) => parseFloat(x.trim().replace(',', '.')));
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null;
  }
  return { absolute: match[1] === '[', vector: new THREE.Vector3(parts[0], parts[1], parts[2]) };
};

// ===================================================================== Line
export class LineTool extends PointTool {
  id = 'line';
  name = 'tools.line';
  vcbLabel = 'vcb.length';
  cursor = 'crosshair';
  start: V3 | null = null;
  chainStart: V3 | null = null;
  pressed = false;
  status() {
    return this.start ? t('tools.status.lineEnd') : t('tools.status.lineStart');
  }
  busy() {
    return !!this.start;
  }
  cancel() {
    this.start = null;
    this.chainStart = null;
    this.resetLocks();
    this.editor.setVcb('');
  }
  onMove(pointer: PEvt) {
    const inference = this.pick(pointer, this.start);
    if (this.start) {
      this.editor.setVcb(this.editor.fmt(this.start.distanceTo(inference.point)));
    }
  }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    const inference = this.pick(pointer, this.start);
    if (!this.start) {
      this.start = inference.point.clone();
      this.chainStart = this.start.clone();
      this.editor.infer.track(this.start);
      this.pressed = true;
      return;
    }
    this.segment(inference.point);
  }
  onUp(pointer: PEvt) {
    if (this.pressed && this.isDrag(pointer) && this.inference) {
      this.segment(this.inference.point);
    }
    this.pressed = false;
  }
  onDblClick() {
    this.cancel();
  }
  segment(point: V3) {
    if (!this.start || point.distanceTo(this.start) < 1e-5) {
      return;
    }
    const editor = this.editor;
    const ents = editor.entities;
    const start = this.start.clone(),
      end = point.clone();
    const before = ents.faces.size;
    editor.commit('tools.line', () => ents.addLine(editor.toLocal(start), editor.toLocal(end)));
    const closed = this.chainStart && end.distanceTo(this.chainStart) < 1e-5;
    this.editor.infer.track(end);
    if (ents.faces.size > before || closed) {
      this.start = null;
      this.chainStart = null;
    } else {
      this.start = end;
    }
    this.resetLocks();
    editor.setVcb('');
  }
  onVcb(text: string) {
    if (!this.start) {
      return false;
    }
    const coords = parseCoords(text);
    if (coords) {
      this.segment(coords.absolute ? this.editor.toWorld(coords.vector) : this.start.clone().add(coords.vector));
      return true;
    }
    const distance = this.lengthOf(text);
    if (distance == null) {
      return false;
    }
    const dir = this.inference ? this.inference.point.clone().sub(this.start) : new THREE.Vector3(1, 0, 0);
    if (dir.lengthSq() < 1e-12) {
      dir.set(1, 0, 0);
    }
    this.segment(this.start.clone().addScaledVector(dir.normalize(), distance));
    return true;
  }
  draw(overlay: Overlay) {
    if (this.start && this.inference) {
      const kind = this.inference.kind,
        linear = kind === 'axis' || kind === 'locked' || (kind === 'aligned' && !!this.inference.direction) || kind === 'intersection';
      const col =
        this.inference.axis && linear
          ? AXIS_COLOR[this.inference.axis]
          : kind === 'parallel' || kind === 'perpendicular' || (linear && this.inference.direction)
            ? MAGENTA
            : '#000';
      overlay.line(this.start, this.inference.point, col, col === '#000' ? 1 : 1.6);
    }
    this.drawInference(overlay);
  }
}

// ===================================================================== Freehand
export class FreehandTool extends PointTool {
  id = 'freehand';
  name = 'tools.freehand';
  cursor = 'crosshair';
  pts: V3[] = [];
  plane: PlaneRef | null = null;
  lastScreen = { x: 0, y: 0 };
  status() {
    return t('tools.status.freehand');
  }
  busy() {
    return this.pts.length > 0;
  }
  cancel() {
    this.pts = [];
    this.plane = null;
  }
  onDown(pointer: PEvt) {
    const inference = this.pick(pointer, null);
    const plane = planeFromInference(inference);
    this.plane = { point: plane.point, normal: plane.normal };
    this.pts = [inference.point.clone()];
    this.lastScreen = { x: pointer.x, y: pointer.y };
  }
  onMove(pointer: PEvt) {
    if (!this.plane) {
      this.pick(pointer, null);
      return;
    }
    if (Math.hypot(pointer.x - this.lastScreen.x, pointer.y - this.lastScreen.y) < 5) {
      return;
    }
    const hit = this.editor.viewer
      .ray(pointer.x, pointer.y)
      .intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.plane.normal, this.plane.point), new THREE.Vector3());
    if (hit) {
      this.pts.push(hit);
      this.lastScreen = { x: pointer.x, y: pointer.y };
    }
  }
  onUp() {
    if (this.pts.length < 2) {
      this.cancel();
      return;
    }
    const pts = this.pts;
    const first = this.editor.viewer.project(pts[0]),
      last = this.editor.viewer.project(pts[pts.length - 1]);
    if (Math.hypot(first.x - last.x, first.y - last.y) < 12 && pts.length > 3) {
      pts[pts.length - 1] = pts[0].clone();
    }
    const editor = this.editor;
    editor.commit('tools.freehand', () => {
      for (let i = 0; i < pts.length - 1; i++) {
        editor.entities.addLine(editor.toLocal(pts[i]), editor.toLocal(pts[i + 1]));
      }
    });
    this.cancel();
  }
  draw(overlay: Overlay) {
    if (this.pts.length) {
      overlay.polyline([...this.pts], '#000', 1.2);
    } else {
      this.drawInference(overlay);
    }
  }
}

/** along one of the model axes – aligning to such an edge changes nothing */
const isAxisAligned = (direction: V3) => [direction.x, direction.y, direction.z].some((value) => Math.abs(Math.abs(value) - 1) < 1e-6);

// ===================================================================== Rectangle
export class RectangleTool extends PointTool {
  id = 'rectangle';
  name = 'tools.rectangle';
  vcbLabel = 'vcb.dimensions';
  cursor = 'crosshair';
  corner: V3 | null = null;
  plane: PlaneRef | null = null;
  basisU = new THREE.Vector3(1, 0, 0);
  basisV = new THREE.Vector3(0, 1, 0);
  width = 0;
  height = 0;
  special = '';
  pressed = false;
  last: { corner: V3; normal: V3; basisU: V3; basisV: V3 } | null = null;
  /** the sides follow an edge instead of the model axes */
  aligned = false;
  status() {
    return this.corner ? t('tools.status.rectangleCorner') : t('tools.status.rectangleStart');
  }
  /** sides along `direction` (an edge lying in the plane) – or, without one, along the model axes */
  align(direction: V3 | null) {
    const normal = this.plane!.normal;
    if (direction && Math.abs(direction.clone().normalize().dot(normal)) < 0.01) {
      const along = direction.clone().addScaledVector(normal, -direction.dot(normal)).normalize();
      if (!isAxisAligned(along)) {
        this.basisU = along;
        this.basisV = normal.clone().cross(along).normalize();
        this.aligned = true;
        return true;
      }
    }
    const axes = planeAxes(normal);
    this.basisU = axes.basisU;
    this.basisV = axes.basisV;
    this.aligned = false;
    return false;
  }
  busy() {
    return !!this.corner;
  }
  cancel() {
    this.corner = null;
    this.plane = null;
    this.editor.setVcb('');
  }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    if (!this.corner) {
      const inference = this.pick(pointer, null);
      const plane = planeFromInference(inference);
      // on an edge or corner of a face under the cursor: in that face's plane, not on the ground
      const faceHit = plane.fromFace ? null : this.editor.viewer.pickFace(pointer.x, pointer.y);
      if (faceHit && Math.abs(inference.point.clone().sub(faceHit.point).dot(faceHit.normal)) < 1e-6) {
        plane.normal = faceHit.normal.clone().normalize();
      }
      this.corner = inference.point.clone();
      this.plane = { point: plane.point, normal: plane.normal };
      // started on an edge: the rectangle follows it
      const edge = inference.edge && (inference.kind === 'edge' || inference.kind === 'midpoint') ? inference.edge : null;
      this.align(edge ? edge.end.clone().sub(edge.start) : null);
      this.pressed = true;
      this.width = this.height = 0;
      return;
    }
    this.finish();
  }
  onUp(pointer: PEvt) {
    if (this.pressed && this.isDrag(pointer)) {
      this.finish();
    }
    this.pressed = false;
  }
  onMove(pointer: PEvt) {
    if (!this.corner || !this.plane) {
      this.pick(pointer, null);
      return;
    }
    const inference = this.pick(pointer, this.corner, { plane: this.plane });
    const point = onPlane(inference.point, this.plane.point, this.plane.normal);
    const delta = point.sub(this.corner);
    this.width = delta.dot(this.basisU);
    this.height = delta.dot(this.basisV);
    this.special = '';
    const absWidth = Math.abs(this.width),
      absHeight = Math.abs(this.height);
    if (snapping.value && absWidth > 1e-4 && absHeight > 1e-4) {
      if (Math.abs(absWidth - absHeight) / Math.max(absWidth, absHeight) < 0.035) {
        this.height = Math.sign(this.height) * absWidth;
        this.special = t('tools.hints.square');
      } else {
        const GOLDEN = 1.618;
        for (const [longer, shorter] of [
          [absWidth, absHeight],
          [absHeight, absWidth],
        ]) {
          if (Math.abs(longer / shorter - GOLDEN) < 0.04) {
            this.special = t('tools.hints.goldenRatio');
          }
        }
      }
    }
    this.editor.setVcb(`${this.editor.fmt(absWidth)}, ${this.editor.fmt(absHeight)}`);
  }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    // down arrow while drawing: along the edge hovered last (in the plane), again: back to the axes
    if (keyEvent.key === 'ArrowDown' && down && this.corner && this.plane) {
      const edge = this.editor.infer.trackedEdge;
      if (this.aligned || !edge || !this.align(edge.end.clone().sub(edge.start))) {
        this.align(null);
      }
      this.width = this.height = 0;
      return true;
    }
    return super.onKey(keyEvent, down);
  }
  corners(corner: V3, basisU: V3, basisV: V3, width: number, height: number) {
    return [
      corner.clone(),
      corner.clone().addScaledVector(basisU, width),
      corner.clone().addScaledVector(basisU, width).addScaledVector(basisV, height),
      corner.clone().addScaledVector(basisV, height),
    ];
  }
  finish() {
    if (!this.corner || Math.abs(this.width) < 1e-4 || Math.abs(this.height) < 1e-4) {
      return;
    }
    const pts = this.corners(this.corner, this.basisU, this.basisV, this.width, this.height);
    this.create(pts, 'tools.rectangle');
    this.last = {
      corner: this.corner.clone(),
      normal: this.plane!.normal.clone(),
      basisU: this.basisU.clone(),
      basisV: this.basisV.clone(),
    };
    this.corner = null;
    this.plane = null;
  }
  create(pts: V3[], label: string) {
    const editor = this.editor;
    editor.commit(label, () => editor.entities.addLoop(pts.map((point) => editor.toLocal(point))));
    editor.setVcb('');
  }
  onVcb(text: string) {
    const lengths = parseLengthList(text, this.editor.model.settings.units);
    if (lengths.length !== 2) {
      return false;
    }
    if (this.corner) {
      const width = lengths[0] ?? Math.abs(this.width),
        height = lengths[1] ?? Math.abs(this.height);
      this.width = Math.sign(this.width || 1) * width;
      this.height = Math.sign(this.height || 1) * height;
      this.finish();
      return true;
    }
    if (this.last) {
      // resize the rectangle that was just drawn
      this.editor.undo();
      const { corner, basisU, basisV } = this.last;
      this.create(this.corners(corner, basisU, basisV, lengths[0] ?? 1, lengths[1] ?? 1), 'tools.rectangle');
      return true;
    }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.corner) {
      const pts = this.corners(this.corner, this.basisU, this.basisV, this.width, this.height);
      overlay.polyline(pts, this.aligned ? MAGENTA : '#0000ff', 1.4, true);
      if (this.special) {
        overlay.line(pts[0], pts[2], '#888', 1, [4, 3]);
        overlay.tooltip(this.editor.mouse.x, this.editor.mouse.y, this.special);
      } else {
        this.drawInference(overlay);
      }
    } else {
      this.drawInference(overlay);
    }
  }
}

// ===================================================================== Rotated rectangle (3 points)
export class RotatedRectangleTool extends PointTool {
  id = 'rotrect';
  name = 'tools.rotrect';
  vcbLabel = 'vcb.length';
  cursor = 'crosshair';
  pts: V3[] = [];
  current: V3 | null = null;
  status() {
    return t(['tools.status.rotrect1', 'tools.status.rotrect2', 'tools.status.rotrect3'][this.pts.length]);
  }
  busy() {
    return this.pts.length > 0;
  }
  cancel() {
    this.pts = [];
    this.current = null;
  }
  onMove(pointer: PEvt) {
    const from = this.pts[this.pts.length - 1] ?? null;
    const inference = this.pick(pointer, from);
    this.current = inference.point.clone();
    if (this.pts.length === 1) {
      this.editor.setVcb(this.editor.fmt(this.pts[0].distanceTo(inference.point)));
    }
    if (this.pts.length === 2) {
      this.editor.setVcb(this.editor.fmt(this.thirdOffset().length()));
    }
  }
  thirdOffset(): V3 {
    const [first, second] = this.pts;
    const baseDir = second.clone().sub(first).normalize();
    const offset = this.current!.clone().sub(second);
    return offset.sub(baseDir.multiplyScalar(offset.dot(baseDir)));
  }
  onDown(pointer: PEvt) {
    const from = this.pts[this.pts.length - 1] ?? null;
    const inference = this.pick(pointer, from);
    this.pts.push(inference.point.clone());
    this.current = inference.point.clone();
    if (this.pts.length === 3) {
      this.finish();
    }
  }
  rect(): V3[] {
    const [first, second] = this.pts;
    const off = this.thirdOffset();
    return [first, second, second.clone().add(off), first.clone().add(off)];
  }
  finish() {
    this.pts.pop();
    const pts = this.rect();
    if (pts[2].distanceTo(pts[1]) > 1e-4) {
      const editor = this.editor;
      editor.commit('tools.rotrect', () => editor.entities.addLoop(pts.map((point) => editor.toLocal(point))));
    }
    this.cancel();
  }
  onVcb(text: string) {
    const distance = this.lengthOf(text);
    if (distance == null) {
      return false;
    }
    if (this.pts.length === 1 && this.current) {
      const direction = this.current.clone().sub(this.pts[0]).normalize();
      this.pts.push(this.pts[0].clone().addScaledVector(direction, distance));
      return true;
    }
    if (this.pts.length === 2 && this.current) {
      const off = this.thirdOffset().normalize().multiplyScalar(distance);
      this.current = this.pts[1].clone().add(off);
      this.pts.push(this.current.clone());
      this.finish();
      return true;
    }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.pts.length === 1 && this.current) {
      overlay.line(this.pts[0], this.current, '#000', 1.2);
    }
    if (this.pts.length === 2 && this.current) {
      const corners = this.rect();
      overlay.fillPolygon(corners, 'rgba(100,140,255,0.12)');
      overlay.polyline(corners, '#000', 1.2, true);
    }
    this.drawInference(overlay);
  }
}

// ===================================================================== Circle / Polygon
export class CircleTool extends PointTool {
  id = 'circle';
  name = 'tools.circle';
  vcbLabel = 'vcb.segments';
  cursor = 'crosshair';
  center: V3 | null = null;
  plane: PlaneRef | null = null;
  radius = 0;
  startDir = new THREE.Vector3(1, 0, 0);
  segments = 24;
  pressed = false;
  last: { center: V3; normal: V3; direction: V3; radius: number } | null = null;
  constructor(
    editor: any,
    public polygon = false,
  ) {
    super(editor);
    if (polygon) {
      this.id = 'polygon';
      this.name = 'tools.polygon';
      this.segments = 6;
      this.vcbLabel = 'vcb.sides';
    }
  }
  status() {
    return this.center
      ? t(this.polygon ? 'tools.status.polygonRadius' : 'tools.status.circleRadius', { count: this.segments })
      : t(this.polygon ? 'tools.status.polygonCenter' : 'tools.status.circleCenter');
  }
  activate() {
    this.editor.setVcb(String(this.segments));
  }
  busy() {
    return !!this.center;
  }
  cancel() {
    this.center = null;
    this.plane = null;
    this.editor.setVcb(String(this.segments), this.polygon ? 'vcb.sides' : 'vcb.segments');
  }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    if (!this.center) {
      const inference = this.pick(pointer, null);
      const plane = planeFromInference(inference);
      this.center = inference.point.clone();
      this.plane = { point: plane.point, normal: plane.normal };
      this.radius = 0;
      this.pressed = true;
      this.editor.ui.vcbLabel = 'vcb.radius';
      return;
    }
    this.finish();
  }
  onUp(pointer: PEvt) {
    if (this.pressed && this.isDrag(pointer)) {
      this.finish();
    }
    this.pressed = false;
  }
  onMove(pointer: PEvt) {
    if (!this.center || !this.plane) {
      this.pick(pointer, null);
      return;
    }
    const inference = this.pick(pointer, this.center, { plane: this.plane });
    const offset = onPlane(inference.point, this.plane.point, this.plane.normal).sub(this.center);
    this.radius = offset.length();
    if (this.radius > 1e-6) {
      this.startDir = offset.normalize();
    }
    this.editor.setVcb(this.editor.fmt(this.radius));
  }
  points(center: V3, normal: V3, direction: V3, radius: number): V3[] {
    const out: V3[] = [];
    const side = normal.clone().cross(direction).normalize();
    for (let i = 0; i < this.segments; i++) {
      const angle = (i / this.segments) * Math.PI * 2;
      out.push(
        center
          .clone()
          .addScaledVector(direction, Math.cos(angle) * radius)
          .addScaledVector(side, Math.sin(angle) * radius),
      );
    }
    return out;
  }
  finish() {
    if (!this.center || !this.plane || this.radius < 1e-4) {
      return;
    }
    const pts = this.points(this.center, this.plane.normal, this.startDir, this.radius);
    const editor = this.editor;
    editor.commit(this.name, () => editor.entities.addLoop(pts.map((point) => editor.toLocal(point))));
    this.last = { center: this.center.clone(), normal: this.plane.normal.clone(), direction: this.startDir.clone(), radius: this.radius };
    this.center = null;
    this.plane = null;
    this.editor.setVcb(this.editor.fmt(this.last.radius), 'vcb.radius');
  }
  onVcb(text: string) {
    const trimmed = text.trim();
    const seg = trimmed.match(/^(\d+)\s*s$/i) || (!this.center && !this.last ? trimmed.match(/^(\d+)$/) : null);
    if (seg) {
      this.segments = Math.max(3, Math.min(999, parseInt(seg[1])));
      if (!this.center) {
        this.editor.setVcb(String(this.segments));
      }
      this.editor.refreshStatus();
      return true;
    }
    const distance = this.lengthOf(text);
    if (distance == null) {
      return false;
    }
    if (this.center) {
      this.radius = distance;
      this.finish();
      return true;
    }
    if (this.last) {
      this.editor.undo();
      this.radius = distance;
      this.center = this.last.center.clone();
      this.plane = { point: this.last.center.clone(), normal: this.last.normal.clone() };
      this.startDir = this.last.direction.clone();
      this.finish();
      return true;
    }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.center && this.plane && this.radius > 1e-6) {
      const pts = this.points(this.center, this.plane.normal, this.startDir, this.radius);
      overlay.fillPolygon(pts, 'rgba(100,140,255,0.12)');
      overlay.polyline(pts, '#000', 1.2, true);
      overlay.line(this.center, this.center.clone().addScaledVector(this.startDir, this.radius), '#555', 1, [3, 3]);
    }
    if (this.center) {
      overlay.marker(this.center, 'center');
    }
    this.drawInference(overlay);
  }
}

// ===================================================================== Arcs
const arcPoints = (center: V3, normal: V3, start: V3, angle: number, segs: number): V3[] => {
  const pts: V3[] = [];
  const radial = start.clone().sub(center);
  for (let i = 0; i <= segs; i++) {
    pts.push(center.clone().add(radial.clone().applyAxisAngle(normal, (angle * i) / segs)));
  }
  return pts;
};
const signedAngle = (fromVec: V3, toVec: V3, normal: V3) => {
  return Math.atan2(fromVec.clone().cross(toVec).dot(normal), fromVec.dot(toVec));
};

/** A rounded corner: the arc starts and ends `distance` away from `corner`, along its two edges. */
interface Fillet {
  corner: V3;
  distance: number;
}

/** The vertex two edges of the context being edited share – in model coordinates. */
const sharedCorner = (editor: Editor, first: EdgeRec, second: EdgeRec): V3 | null => {
  const ents = editor.entities;
  if (first.context.entities !== ents || second.context.entities !== ents || first.edgeId === second.edgeId) {
    return null;
  }
  const edgeA = ents.edges.get(first.edgeId),
    edgeB = ents.edges.get(second.edgeId);
  const shared = edgeA && edgeB ? [edgeA.start, edgeA.end].find((vertex) => vertex === edgeB.start || vertex === edgeB.end) : undefined;
  return shared === undefined ? null : editor.toWorld(ents.positionOf(shared));
};

/**
 * The vertices of the arc (or circle segment chain) an edge belongs to, in order: equally long edges turning by the
 * same angle in one plane. Null when the edge is no part of such a chain.
 */
const arcChain = (ents: Entities, edgeId: number): number[] | null => {
  const edge = ents.edges.get(edgeId);
  if (!edge) {
    return null;
  }
  const length = ents.edgeLength(edge);
  const visited = new Set([edge.start, edge.end]);
  const extend = (from: number, to: number) => {
    const out: number[] = [];
    let previous = from,
      at = to;
    for (;;) {
      const next = ents
        .edgesOfVertex(at)
        .filter((other) => other.start !== previous && other.end !== previous)
        .map((other) => (other.start === at ? other.end : other.start));
      if (next.length !== 1 || visited.has(next[0])) {
        return out;
      }
      if (Math.abs(ents.positionOf(at).distanceTo(ents.positionOf(next[0])) - length) > length * 1e-3) {
        return out;
      }
      visited.add(next[0]);
      out.push(next[0]);
      previous = at;
      at = next[0];
    }
  };
  const forward = extend(edge.start, edge.end);
  const chain = [...extend(edge.end, edge.start).reverse(), edge.start, edge.end, ...forward];
  if (chain.length < 3) {
    return null;
  }
  const points = chain.map((vertex) => ents.positionOf(vertex));
  const turn = (i: number) =>
    points[i + 1]
      .clone()
      .sub(points[i])
      .angleTo(points[i + 2].clone().sub(points[i + 1]));
  const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[1])).normalize();
  const firstTurn = turn(0);
  for (let i = 0; i + 2 < points.length; i++) {
    const segmentNormal = points[i + 1]
      .clone()
      .sub(points[i])
      .cross(points[i + 2].clone().sub(points[i + 1]))
      .normalize();
    if (firstTurn < 1e-4 || Math.abs(turn(i) - firstTurn) > 1e-3 || segmentNormal.dot(normal) < 1 - 1e-6) {
      return null;
    }
  }
  return chain;
};

/** 2-point arc: start, end, bulge (SketchUp default arc tool). */
export class Arc2Tool extends PointTool {
  id = 'arc2';
  name = 'tools.arc2';
  vcbLabel = 'vcb.length';
  cursor = 'crosshair';
  start: V3 | null = null;
  end: V3 | null = null;
  normal = new THREE.Vector3(0, 0, 1);
  bulge = 0;
  segments = 12;
  current: V3 | null = null;
  half = false;
  /** the edge the start point lies on – a second point on a neighbouring edge rounds their corner */
  startEdge: EdgeRec | null = null;
  /** end point offered at the start's distance from the corner, along the neighbouring edge */
  filletEnd: { point: V3; fillet: Fillet } | null = null;
  fillet: Fillet | null = null;
  /** the bulge sits where the arc touches both edges: the corner is cut off */
  tangent = false;
  /** distance of the last rounded corner – double-clicking another corner rounds it the same */
  lastFillet: number | null = null;
  status() {
    return !this.start ? t('tools.status.arc2Start') : !this.end ? t('tools.status.pickEnd') : t('tools.status.arc2Bulge');
  }
  busy() {
    return !!this.start;
  }
  cancel() {
    this.start = this.end = null;
    this.current = null;
    this.startEdge = null;
    this.filletEnd = null;
    this.fillet = null;
    this.tangent = false;
    this.editor.setVcb('', 'vcb.length');
  }
  /** the bulge of the arc that touches both edges of the corner */
  tangentBulge(): number {
    const { corner } = this.fillet!;
    const toStart = this.start!.clone().sub(corner).normalize(),
      toEnd = this.end!.clone().sub(corner).normalize();
    const half = toStart.angleTo(toEnd) / 2;
    const distance = this.fillet!.distance;
    const radius = distance * Math.tan(half);
    const center = corner.clone().addScaledVector(toStart.clone().add(toEnd).normalize(), distance / Math.cos(half));
    const mid = this.start!.clone().add(this.end!).multiplyScalar(0.5);
    const sagitta = radius - center.distanceTo(mid);
    return sagitta * Math.sign(this.bulgeDir().dot(corner.clone().sub(mid)) || 1);
  }
  /** the end point sits on the neighbouring edge: the arc lies in the corner's plane */
  setFillet(fillet: Fillet) {
    this.fillet = fillet;
    const normal = this.start!.clone().sub(fillet.corner).cross(this.end!.clone().sub(fillet.corner));
    if (normal.lengthSq() > 1e-18) {
      this.normal = normal.normalize();
    }
  }
  onMove(pointer: PEvt) {
    if (!this.end) {
      const inference = this.pick(pointer, this.start);
      this.current = inference.point.clone();
      this.filletEnd = null;
      // on an edge next to the start's edge: the point as far from the corner as the start snaps
      if (this.start && this.startEdge && inference.edge && snapping.value) {
        const corner = sharedCorner(this.editor, this.startEdge, inference.edge);
        if (corner) {
          const distance = corner.distanceTo(this.start);
          const far = inference.edge.start.distanceTo(corner) < 1e-9 ? inference.edge.end : inference.edge.start;
          const point = corner.clone().addScaledVector(far.clone().sub(corner).normalize(), distance);
          const screenPos = this.editor.viewer.project(point);
          if (
            distance > 1e-6 &&
            distance <= far.distanceTo(corner) + 1e-9 &&
            Math.hypot(screenPos.x - pointer.x, screenPos.y - pointer.y) < 12
          ) {
            this.filletEnd = { point, fillet: { corner, distance } };
            this.current = point.clone();
          }
        }
      }
      if (this.start) {
        this.editor.setVcb(this.editor.fmt(this.start.distanceTo(this.current)));
      }
      return;
    }
    const mid = this.start!.clone().add(this.end).multiplyScalar(0.5);
    const hit = this.editor.viewer
      .ray(pointer.x, pointer.y)
      .intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, mid), new THREE.Vector3());
    if (!hit) {
      return;
    }
    const bulgeDir = this.bulgeDir();
    this.bulge = hit.sub(mid).dot(bulgeDir);
    const halfChord = this.start!.distanceTo(this.end) / 2;
    this.half = snapping.value && Math.abs(Math.abs(this.bulge) - halfChord) < halfChord * 0.04;
    if (this.half) {
      this.bulge = Math.sign(this.bulge) * halfChord;
    }
    this.tangent = false;
    if (this.fillet && snapping.value) {
      const tangent = this.tangentBulge();
      if (Math.abs(this.bulge - tangent) < Math.max(halfChord * 0.06, this.editor.viewer.worldPerPixel(mid) * 10)) {
        this.bulge = tangent;
        this.tangent = true;
        this.half = false;
      }
    }
    this.editor.setVcb(this.editor.fmt(Math.abs(this.bulge)));
  }
  bulgeDir() {
    return this.normal.clone().cross(this.end!.clone().sub(this.start!)).normalize();
  }
  onDown(pointer: PEvt) {
    if (!this.start) {
      const inference = this.pick(pointer, null);
      this.start = inference.point.clone();
      this.startEdge = inference.kind === 'edge' && inference.edge ? inference.edge : null;
      const plane = planeFromInference(inference);
      this.normal = plane.normal;
      return;
    }
    if (!this.end) {
      const filletEnd = this.filletEnd;
      const inference = this.pick(pointer, this.start);
      const point = filletEnd ? filletEnd.point : inference.point;
      if (point.distanceTo(this.start) < 1e-5) {
        return;
      }
      this.end = point.clone();
      if (filletEnd) {
        this.setFillet(filletEnd.fillet);
        this.filletEnd = null;
        this.editor.ui.vcbLabel = 'vcb.bulge';
        return;
      }
      const chordDir = this.end.clone().sub(this.start).normalize();
      if (Math.abs(chordDir.dot(this.normal)) > 1e-3) {
        this.normal = chordDir.clone().cross(new THREE.Vector3(0, 0, 1));
        if (this.normal.lengthSq() < 1e-6) {
          this.normal.set(1, 0, 0);
        }
        this.normal.normalize();
      }
      this.editor.ui.vcbLabel = 'vcb.bulge';
      return;
    }
    this.finish();
  }
  points(): V3[] {
    const start = this.start!,
      end = this.end!;
    const halfChord = start.distanceTo(end) / 2;
    const bulge = this.bulge;
    if (Math.abs(bulge) < 1e-6) {
      return [start, end];
    }
    const radius = (halfChord * halfChord + bulge * bulge) / (2 * Math.abs(bulge));
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const bulgeDir = this.bulgeDir().multiplyScalar(Math.sign(bulge));
    const center = mid.clone().addScaledVector(bulgeDir, Math.abs(bulge) - radius);
    const total = 4 * Math.atan(Math.abs(bulge) / halfChord);
    const ang = signedAngle(start.clone().sub(center), end.clone().sub(center), this.normal);
    const dir = Math.sign(ang) || 1;
    // choose rotation direction that passes through the bulge point
    let theta = dir * total;
    const test = start
      .clone()
      .sub(center)
      .applyAxisAngle(this.normal, theta / 2)
      .add(center);
    if (test.distanceTo(mid.clone().addScaledVector(bulgeDir, Math.abs(bulge))) > 1e-3 * Math.max(1, radius)) {
      theta = -theta;
    }
    return arcPoints(center, this.normal, start, theta, this.segments);
  }
  finish() {
    const pts = this.points();
    const editor = this.editor;
    const fillet = this.fillet && Math.abs(this.bulge - this.tangentBulge()) < 1e-9 ? this.fillet : null;
    const start = this.start!,
      end = this.end!;
    editor.commit(fillet ? 'undo.roundCorner' : this.name, () => {
      for (let i = 0; i < pts.length - 1; i++) {
        editor.entities.addLine(editor.toLocal(pts[i]), editor.toLocal(pts[i + 1]));
      }
      if (fillet) {
        this.cutCorner(editor.toLocal(start), editor.toLocal(end), editor.toLocal(fillet.corner));
      }
    });
    if (fillet) {
      this.lastFillet = fillet.distance;
    }
    this.cancel();
  }
  /** the piece between the arc and the corner goes – only where the corner's edges bound nothing else */
  cutCorner(start: V3, end: V3, corner: V3) {
    const ents = this.editor.entities;
    const startVertex = ents.findVertex(start),
      endVertex = ents.findVertex(end),
      cornerVertex = ents.findVertex(corner);
    if (startVertex === undefined || endVertex === undefined || cornerVertex === undefined) {
      return;
    }
    const legs = [ents.edgeBetween(startVertex, cornerVertex), ents.edgeBetween(cornerVertex, endVertex)];
    if (legs.some((leg) => !leg || ents.facesOfEdge(leg.id).length > 1)) {
      return;
    }
    for (const leg of legs) {
      ents.eraseEdge(leg!.id, false);
    }
  }
  /** double-click: on a corner it is rounded like the last one, on an arc its corner comes back */
  onDblClick(pointer: PEvt) {
    this.cancel();
    const editor = this.editor;
    const ents = editor.entities;
    const vertexHit = editor.viewer.pickVertex(pointer.x, pointer.y, 10, (vertex) => vertex.context.entities === ents);
    if (vertexHit) {
      // a point inside an arc belongs to the arc, not to a corner
      const legs = ents.edgesOfVertex(vertexHit.rec.vertexId);
      const chain = legs.length === 2 ? arcChain(ents, legs[0].id) : null;
      if (chain && chain.indexOf(vertexHit.rec.vertexId) > 0 && chain.indexOf(vertexHit.rec.vertexId) < chain.length - 1) {
        this.unround(legs[0].id);
        return;
      }
      if (this.lastFillet) {
        this.roundCorner(vertexHit.rec.vertexId, this.lastFillet);
      }
      return;
    }
    const edgeHit = editor.viewer.pickEdge(pointer.x, pointer.y, 6, (edge) => edge.context.entities === ents);
    if (edgeHit) {
      this.unround(edgeHit.rec.edgeId);
    }
  }
  /** a corner of exactly two edges, rounded with the arc that leaves both `distance` away from it */
  roundCorner(cornerVertex: number, distance: number) {
    const editor = this.editor;
    const ents = editor.entities;
    const legs = ents.edgesOfVertex(cornerVertex);
    if (legs.length !== 2) {
      editor.toast(t('toast.roundCornerTwoEdges'));
      return;
    }
    const corner = ents.positionOf(cornerVertex);
    const [toStart, toEnd] = legs.map((leg) =>
      ents
        .positionOf(leg.start === cornerVertex ? leg.end : leg.start)
        .clone()
        .sub(corner),
    );
    if (
      toStart.length() < distance + 1e-9 ||
      toEnd.length() < distance + 1e-9 ||
      toStart.clone().normalize().cross(toEnd.clone().normalize()).length() < 1e-6
    ) {
      editor.toast(t('toast.roundCornerTooShort'));
      return;
    }
    this.start = editor.toWorld(corner.clone().addScaledVector(toStart.normalize(), distance));
    this.end = editor.toWorld(corner.clone().addScaledVector(toEnd.normalize(), distance));
    this.setFillet({ corner: editor.toWorld(corner), distance: this.start.distanceTo(editor.toWorld(corner)) });
    this.bulge = this.tangentBulge();
    this.finish();
  }
  /** an arc between two straight edges goes, the edges meet in their corner again */
  unround(edgeId: number) {
    const editor = this.editor;
    const ents = editor.entities;
    const chain = arcChain(ents, edgeId);
    if (!chain) {
      return;
    }
    /** the straight edge before the arc's end: its direction towards the corner */
    const leadIn = (end: number, inner: number) => {
      const others = ents.edgesOfVertex(end).filter((edge) => edge.start !== inner && edge.end !== inner);
      if (others.length !== 1) {
        return null;
      }
      const far = others[0].start === end ? others[0].end : others[0].start;
      return ents.positionOf(end).clone().sub(ents.positionOf(far));
    };
    const first = chain[0],
      last = chain[chain.length - 1];
    const firstDir = leadIn(first, chain[1]),
      lastDir = leadIn(last, chain[chain.length - 2]);
    const firstPos = ents.positionOf(first).clone(),
      lastPos = ents.positionOf(last).clone();
    const crossing = firstDir && lastDir ? lineLineClosest(firstPos, firstDir, lastPos, lastDir) : null;
    const arcEdges = chain.slice(1).map((vertex, i) => ents.edgeBetween(chain[i], vertex)!);
    if (
      !crossing ||
      crossing.s <= 1e-9 ||
      crossing.t <= 1e-9 ||
      crossing.c1.distanceTo(crossing.c2) > 1e-6 * Math.max(1, firstPos.distanceTo(lastPos)) ||
      arcEdges.some((edge) => !edge || ents.facesOfEdge(edge.id).length > 1)
    ) {
      editor.toast(t('toast.unroundNoCorner'));
      return;
    }
    const corner = crossing.c1;
    editor.commit('undo.unroundCorner', () => {
      const face = arcEdges.map((edge) => ents.facesOfEdge(edge.id)[0]).find(Boolean);
      const look = face ? { material: face.material, backMaterial: face.backMaterial, tag: face.tag } : null;
      for (const edge of arcEdges) {
        ents.eraseEdge(edge.id, false);
      }
      ents.addLine(firstPos, corner);
      ents.addLine(corner, lastPos);
      const cornerVertex = ents.findVertex(corner);
      const leg = cornerVertex === undefined ? undefined : ents.edgeBetween(first, cornerVertex);
      if (look && leg) {
        for (const newFace of ents.facesOfEdge(leg.id)) {
          Object.assign(newFace, look);
        }
      }
      ents.healCollinear([first, last]);
    });
  }
  onVcb(text: string) {
    const segMatch = text.trim().match(/^(\d+)\s*s$/i);
    if (segMatch) {
      this.segments = Math.max(2, parseInt(segMatch[1]));
      return true;
    }
    const distance = this.lengthOf(text);
    if (distance == null) {
      return false;
    }
    if (this.start && !this.end && this.current) {
      const direction = this.current.clone().sub(this.start).normalize();
      this.end = this.start.clone().addScaledVector(direction, distance);
      this.editor.ui.vcbLabel = 'vcb.bulge';
      return true;
    }
    if (this.end) {
      this.bulge = Math.sign(this.bulge || 1) * distance;
      this.finish();
      return true;
    }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.start && !this.end && this.current) {
      overlay.line(this.start, this.current, '#000', 1);
    }
    if (this.end) {
      overlay.polyline(this.points(), this.half ? '#c000c0' : this.tangent ? '#00a8c8' : '#000', 1.5);
      if (this.half) {
        overlay.tooltip(this.editor.mouse.x, this.editor.mouse.y, t('tools.hints.halfCircle'));
      } else if (this.tangent) {
        overlay.tooltip(this.editor.mouse.x, this.editor.mouse.y, t('tools.hints.roundCorner'));
      }
    }
    if (!this.end) {
      if (this.filletEnd) {
        overlay.marker(this.filletEnd.point, 'midpoint');
        overlay.tooltip(this.editor.mouse.x, this.editor.mouse.y, t('tools.hints.sameDistance'));
      } else {
        this.drawInference(overlay);
      }
    }
  }
}

/** Center arc / pie: center, start point, end angle. */
export class ArcCenterTool extends PointTool {
  id = 'arc';
  name = 'tools.arc';
  vcbLabel = 'vcb.radius';
  cursor = 'crosshair';
  center: V3 | null = null;
  startPoint: V3 | null = null;
  normal = new THREE.Vector3(0, 0, 1);
  angle = 0;
  segments = 12;
  current: V3 | null = null;
  constructor(
    editor: any,
    public pie = false,
  ) {
    super(editor);
    if (pie) {
      this.id = 'pie';
      this.name = 'tools.pie';
    }
  }
  status() {
    return !this.center ? t('tools.status.pickCenter') : !this.startPoint ? t('tools.status.arcStart') : t('tools.status.arcEnd');
  }
  busy() {
    return !!this.center;
  }
  cancel() {
    this.center = this.startPoint = null;
    this.angle = 0;
    this.editor.setVcb('', 'vcb.radius');
  }
  onMove(pointer: PEvt) {
    if (!this.startPoint) {
      const inference = this.pick(pointer, this.center);
      this.current = inference.point.clone();
      if (this.center) {
        this.editor.setVcb(this.editor.fmt(onPlane(inference.point, this.center, this.normal).distanceTo(this.center)));
      }
      return;
    }
    const hit = this.editor.viewer
      .ray(pointer.x, pointer.y)
      .intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.center!), new THREE.Vector3());
    if (!hit) {
      return;
    }
    let angle = signedAngle(this.startPoint.clone().sub(this.center!), hit.sub(this.center!), this.normal);
    // continue past 180° smoothly
    if (this.angle > Math.PI / 2 && angle < 0) {
      angle += Math.PI * 2;
    } else if (this.angle < -Math.PI / 2 && angle > 0) {
      angle -= Math.PI * 2;
    }
    this.angle = angle;
    this.editor.setVcb(formatDecimal((angle * 180) / Math.PI, 1) + '°');
  }
  onDown(pointer: PEvt) {
    if (!this.center) {
      const inference = this.pick(pointer, null);
      this.center = inference.point.clone();
      this.normal = planeFromInference(inference).normal;
      return;
    }
    if (!this.startPoint) {
      const inference = this.pick(pointer, this.center);
      const point = onPlane(inference.point, this.center, this.normal);
      if (point.distanceTo(this.center) < 1e-5) {
        return;
      }
      this.startPoint = point;
      this.editor.ui.vcbLabel = 'vcb.angle';
      return;
    }
    this.finish();
  }
  points() {
    return arcPoints(
      this.center!,
      this.normal,
      this.startPoint!,
      this.angle,
      Math.max(2, Math.ceil((this.segments * Math.abs(this.angle)) / Math.PI)),
    );
  }
  finish() {
    if (Math.abs(this.angle) < 1e-4) {
      return;
    }
    const pts = this.points();
    const editor = this.editor;
    const center = this.center!;
    editor.commit(this.name, () => {
      const entities = editor.entities;
      for (let i = 0; i < pts.length - 1; i++) {
        entities.addLine(editor.toLocal(pts[i]), editor.toLocal(pts[i + 1]));
      }
      if (this.pie) {
        entities.addLine(editor.toLocal(center), editor.toLocal(pts[0]));
        entities.addLine(editor.toLocal(pts[pts.length - 1]), editor.toLocal(center));
      }
    });
    this.cancel();
  }
  onVcb(text: string) {
    const segMatch = text.trim().match(/^(\d+)\s*s$/i);
    if (segMatch) {
      this.segments = Math.max(2, parseInt(segMatch[1]));
      return true;
    }
    if (this.center && !this.startPoint && this.current) {
      const distance = this.lengthOf(text);
      if (distance == null) {
        return false;
      }
      let direction = onPlane(this.current, this.center, this.normal).sub(this.center);
      if (direction.lengthSq() < 1e-10) {
        direction = planeAxes(this.normal).basisU;
      }
      this.startPoint = this.center.clone().addScaledVector(direction.normalize(), distance);
      this.editor.ui.vcbLabel = 'vcb.angle';
      return true;
    }
    if (this.startPoint) {
      const degrees = parseFloat(text.replace(',', '.'));
      if (isNaN(degrees)) {
        return false;
      }
      this.angle = (degrees * Math.PI) / 180;
      this.finish();
      return true;
    }
    return false;
  }
  draw(overlay: Overlay) {
    if (this.center && !this.startPoint && this.current) {
      const point = onPlane(this.current, this.center, this.normal);
      overlay.line(this.center, point, '#555', 1, [3, 3]);
      overlay.circle3D(this.center, this.normal, point.distanceTo(this.center), '#9aa', 1, 64, [2, 3]);
    }
    if (this.startPoint) {
      const pts = this.points();
      overlay.polyline(pts, '#000', 1.5);
      if (this.pie) {
        overlay.line(this.center!, pts[0], '#000', 1.2);
        overlay.line(this.center!, pts[pts.length - 1], '#000', 1.2);
      } else {
        overlay.line(this.center!, this.startPoint, '#888', 1, [3, 3]);
      }
    }
    if (this.center) {
      overlay.marker(this.center, 'center');
    }
    if (!this.startPoint) {
      this.drawInference(overlay);
    }
  }
}

/** 3-point arc */
export class Arc3Tool extends PointTool {
  id = 'arc3';
  name = 'tools.arc3';
  cursor = 'crosshair';
  vcbLabel = 'vcb.length';
  pts: V3[] = [];
  current: V3 | null = null;
  segments = 12;
  status() {
    return t(['tools.status.pickStart', 'tools.status.arc3Second', 'tools.status.pickEnd'][this.pts.length]);
  }
  busy() {
    return this.pts.length > 0;
  }
  cancel() {
    this.pts = [];
    this.current = null;
  }
  onMove(pointer: PEvt) {
    const inference = this.pick(pointer, this.pts[this.pts.length - 1] ?? null);
    this.current = inference.point.clone();
  }
  onDown(pointer: PEvt) {
    const inference = this.pick(pointer, this.pts[this.pts.length - 1] ?? null);
    this.pts.push(inference.point.clone());
    if (this.pts.length === 3) {
      this.finish();
    }
  }
  arc(first: V3, second: V3, third: V3): V3[] | null {
    const toSecond = second.clone().sub(first),
      toThird = third.clone().sub(first);
    const normal = toSecond.clone().cross(toThird);
    if (normal.length() < 1e-9) {
      return null;
    }
    const normalSq = normal.lengthSq();
    const center = first.clone().add(
      toThird
        .clone()
        .multiplyScalar(toSecond.lengthSq())
        .cross(normal)
        .add(normal.clone().cross(toSecond).multiplyScalar(toThird.lengthSq()))
        .multiplyScalar(1 / (2 * normalSq)),
    );
    const unitNormal = normal.clone().normalize();
    let ang = signedAngle(first.clone().sub(center), third.clone().sub(center), unitNormal);
    if (ang < 0) {
      ang += Math.PI * 2;
    }
    return arcPoints(center, unitNormal, first, ang, Math.max(3, Math.ceil((this.segments * ang) / Math.PI)));
  }
  finish() {
    const pts = this.arc(this.pts[0], this.pts[1], this.pts[2]);
    this.pts = [];
    if (!pts) {
      return;
    }
    const editor = this.editor;
    editor.commit(this.name, () => {
      for (let i = 0; i < pts.length - 1; i++) {
        editor.entities.addLine(editor.toLocal(pts[i]), editor.toLocal(pts[i + 1]));
      }
    });
  }
  draw(overlay: Overlay) {
    if (this.pts.length === 1 && this.current) {
      overlay.line(this.pts[0], this.current, '#000', 1);
    }
    if (this.pts.length === 2 && this.current) {
      const preview = this.arc(this.pts[0], this.pts[1], this.current);
      if (preview) {
        overlay.polyline(preview, '#000', 1.5);
      } else {
        overlay.polyline([...this.pts, this.current], '#000', 1);
      }
    }
    this.drawInference(overlay);
  }
}
