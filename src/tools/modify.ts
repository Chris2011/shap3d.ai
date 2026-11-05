import * as THREE from 'three';
import type { VertRec, EdgeRec, FaceHit } from '../engine/viewer';
import type { Editor, PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import { isProcedureInput, type EntityRef, type Entities, type Instance } from '../core/model';
import { PointTool, onPlane, planeAxes } from './base';
import { AXES, AXIS_COLOR, closestOnLineToRay, snapping } from '../engine/inference';
import { parseArray, parseLengthList, formatAngle } from '../core/units';
import { offsetPolygon, polygonNormal, planeBasis, to2D, pointInPolygon2D, distPointSegment2D, closestOnSegment } from '../core/geometry';
import { createFollowMeProcedure } from '../core/procedures';
import { t, formatDecimal, normalizeNumberInput } from '../i18n';
import { gridLevels } from '../engine/gridView';

type V3 = THREE.Vector3;

/** Applies a transform live to selected entities, starting from their original state. */
export class LiveTransform {
  verts = new Map<number, V3>();
  insts = new Map<number, THREE.Matrix4>();
  constructor(
    public ents: Entities,
    public refs: EntityRef[],
  ) {
    for (const vertex of ents.collectVertices(refs)) {
      this.verts.set(vertex, ents.positionOf(vertex).clone());
    }
    for (const entityRef of refs) {
      if (entityRef.kind === 'instance') {
        const instance = ents.instances.get(entityRef.id);
        if (instance) {
          this.insts.set(entityRef.id, instance.matrix.clone());
        }
      }
    }
  }
  apply(transform: THREE.Matrix4) {
    for (const [vertex, original] of this.verts) {
      this.ents.vertices.get(vertex)?.position.copy(original).applyMatrix4(transform);
    }
    for (const [id, matrix] of this.insts) {
      const instance = this.ents.instances.get(id);
      if (instance) {
        instance.matrix.copy(matrix).premultiply(transform);
      }
    }
    this.ents.invalidateHash();
  }
  finish() {
    this.ents.weld(this.verts.keys());
  }
  has(vertex: number) {
    return this.verts.has(vertex);
  }
}

/**
 * Arrow keys move the selection by one step of the ground grid as it shows at the selection (Alt: a tenth of it):
 * left/right and up/down along the red or green axis that runs most that way on screen, Shift + up/down along blue.
 */
export const nudgeSelection = (editor: Editor, key: string, shift: boolean, alt: boolean): boolean => {
  const refs = editor.selected();
  if (!refs.length || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
    return false;
  }
  const center = editor.toWorld(editor.entities.refBounds(refs).getCenter(new THREE.Vector3()));
  const pixel = editor.viewer.worldPerPixel(center);
  const levels = gridLevels(editor.model.settings.units);
  let step = levels.find((level) => level / pixel >= 20) ?? levels[levels.length - 1];
  if (alt) {
    step /= 10;
  }
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const sign = key === 'ArrowRight' || key === 'ArrowUp' ? 1 : -1;
  let direction: V3;
  if (shift && !horizontal) {
    direction = AXES.z.clone();
  } else {
    // the screen direction of each horizontal axis; "up" on screen is negative y
    const origin = editor.viewer.project(center);
    const onScreen = (['x', 'y'] as const).map((axis) => {
      const tip = editor.viewer.project(center.clone().addScaledVector(AXES[axis], pixel * 50));
      return { axis, along: horizontal ? tip.x - origin.x : origin.y - tip.y };
    });
    onScreen.sort((left, right) => Math.abs(right.along) - Math.abs(left.along));
    const best = onScreen[0];
    direction = AXES[best.axis].clone().multiplyScalar(Math.sign(best.along) || 1);
  }
  const delta = direction.multiplyScalar(step * sign);
  editor.commit('undo.nudge', () => {
    const live = new LiveTransform(editor.entities, refs);
    const local = editor.toLocal(center.clone().add(delta)).sub(editor.toLocal(center));
    live.apply(new THREE.Matrix4().makeTranslation(local.x, local.y, local.z));
    live.finish();
  });
  editor.setVcb(editor.fmt(step));
  editor.invalidate();
  return true;
};

/** Shared selection-or-hover behaviour of Move/Rotate/Scale. */
const hoverPick = (editor: Editor, pointer: { x: number; y: number }): EntityRef | null => {
  const edgeHit = editor.viewer.pickEdge(pointer.x, pointer.y, 6);
  if (edgeHit) {
    const entityRef = editor.refFromPick(edgeHit.rec.context.path, 'edge', edgeHit.rec.edgeId);
    if (entityRef) {
      return entityRef;
    }
  }
  const faceHit = editor.viewer.pickFace(pointer.x, pointer.y);
  if (faceHit) {
    return editor.refFromPick(faceHit.context.path, 'face', faceHit.faceId);
  }
  return null;
};

const contextFilters = (editor: Editor, live: LiveTransform | null) => {
  const ents = editor.entities;
  const ids = new Set(live ? [...live.insts.keys()] : []);
  const pathHit = (path: any[]) => path.some((step) => ids.has(step.id));
  return {
    filterVert: (vertex: VertRec) =>
      !(live && ((vertex.context.entities === ents && live.has(vertex.vertexId)) || pathHit(vertex.context.path))),
    filterEdge: (edgeRec: EdgeRec) => {
      if (!live) {
        return true;
      }
      if (pathHit(edgeRec.context.path)) {
        return false;
      }
      if (edgeRec.context.entities !== ents) {
        return true;
      }
      const edge = ents.edges.get(edgeRec.edgeId);
      return !(edge && live.has(edge.start) && live.has(edge.end));
    },
    filterFace: (context: FaceHit['context'], faceId: number) => {
      if (!live) {
        return true;
      }
      if (pathHit(context.path)) {
        return false;
      }
      if (context.entities !== ents) {
        return true;
      }
      const face = ents.faces.get(faceId);
      return !(face && ents.faceVertices(face).every((vertex) => live.has(vertex)));
    },
  };
};

/** A group's or component's bounding box in its own axes; `matrix` maps box coordinates to the model. */
interface BoxFrame {
  box: THREE.Box3;
  matrix: THREE.Matrix4;
  instance: EntityRef;
}
/** Red cross on a face of the box: rotates about the face's normal through its centre (Move and Rotate). */
interface RotateGrip {
  world: V3;
  center: V3;
  axis: V3;
}

/** The single selected group/component – or the hovered one when nothing is selected. */
const boxFrame = (editor: Editor): BoxFrame | null => {
  const selected = editor.selected();
  const entityRef = selected.length === 1 ? selected[0] : selected.length ? null : editor.hover;
  if (entityRef?.kind !== 'instance') {
    return null;
  }
  const instance = editor.entities.instances.get(entityRef.id);
  if (!instance) {
    return null;
  }
  const box = instance.definition.entities.bounds();
  if (box.isEmpty()) {
    return null;
  }
  return { box, matrix: editor.contextMatrix.multiply(editor.viewer.shownMatrix(instance)), instance: entityRef };
};

const boxPoint = (frame: BoxFrame, fraction: number[]) => {
  const { min, max } = frame.box;
  return new THREE.Vector3(
    min.x + (max.x - min.x) * fraction[0],
    min.y + (max.y - min.y) * fraction[1],
    min.z + (max.z - min.z) * fraction[2],
  ).applyMatrix4(frame.matrix);
};

const boxCorners = (frame: BoxFrame) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => boxPoint(frame, [i & 1, (i >> 1) & 1, (i >> 2) & 1]));

const BOX_EDGES = [
  [0, 1],
  [1, 3],
  [3, 2],
  [2, 0],
  [4, 5],
  [5, 7],
  [7, 6],
  [6, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/** Four crosses on every face of the box that faces the camera – SketchUp's rotation grips. */
const rotateGrips = (editor: Editor, frame: BoxFrame): RotateGrip[] => {
  const size = frame.box.getSize(new THREE.Vector3()).toArray();
  const eye = editor.viewer.rig.camera.position;
  const grips: RotateGrip[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const [first, second] = [0, 1, 2].filter((other) => other !== axis);
    if (size[first] < 1e-6 || size[second] < 1e-6) {
      continue;
    }
    const direction = new THREE.Vector3().setFromMatrixColumn(frame.matrix, axis).normalize();
    for (const side of size[axis] < 1e-6 ? [1] : [0, 1]) {
      const fraction = [0.5, 0.5, 0.5];
      fraction[axis] = side;
      const center = boxPoint(frame, fraction);
      const normal = direction.clone().multiplyScalar(side ? 1 : -1);
      if (normal.dot(eye.clone().sub(center)) <= 0) {
        continue;
      }
      for (const [along, value] of [
        [first, 0.2],
        [first, 0.8],
        [second, 0.2],
        [second, 0.8],
      ]) {
        const at = [...fraction];
        at[along] = value;
        grips.push({ world: boxPoint(frame, at), center, axis: normal });
      }
    }
  }
  return grips;
};

/** An outline ("profile") edge of a group or component as the camera sees it, and the point on it under the cursor. */
interface ProfileGrip {
  start: V3;
  end: V3;
  point: V3;
}
const PROFILE_EDGE_LIMIT = 20000;
let profileCache: { key: string; segments: [V3, V3][] } | null = null;

/**
 * The outline edges of the box's group or component from where the camera stands: edges between a face turned to the
 * camera and one turned away, or with one face – soft edges too, so round things have an outline as well.
 */
const profileSegments = (editor: Editor, frame: BoxFrame): [V3, V3][] => {
  const instance = editor.entities.instances.get(frame.instance.id);
  if (!instance) {
    return [];
  }
  const rig = editor.viewer.rig;
  const camera = rig.camera;
  const key = [instance.id, editor.ui.revision, ...frame.matrix.elements, ...camera.matrixWorld.elements].join();
  if (profileCache?.key === key) {
    return profileCache.segments;
  }
  const eye = camera.position,
    away = rig.forward().negate();
  const segments: [V3, V3][] = [];
  let count = 0;
  const walk = (ents: Entities, matrix: THREE.Matrix4, depth: number) => {
    for (const edge of ents.edges.values()) {
      if (++count > PROFILE_EDGE_LIMIT) {
        return;
      }
      const faces = ents.facesOfEdge(edge.id);
      if (edge.hidden || !faces.length) {
        continue;
      }
      const start = ents.positionOf(edge.start).clone().applyMatrix4(matrix),
        end = ents.positionOf(edge.end).clone().applyMatrix4(matrix);
      const toEye = rig.isOrtho ? away : eye.clone().sub(start.clone().add(end).multiplyScalar(0.5));
      const facing = faces.slice(0, 2).map((face) => ents.faceNormal(face).transformDirection(matrix).dot(toEye) > 0);
      if (facing.length === 1 || facing[0] !== facing[1]) {
        segments.push([start, end]);
      }
    }
    if (depth < 4) {
      for (const child of ents.instances.values()) {
        if (!isProcedureInput(child)) {
          walk(child.definition.entities, matrix.clone().multiply(child.matrix), depth + 1);
        }
      }
    }
  };
  walk(instance.definition.entities, frame.matrix, 0);
  profileCache = { key, segments };
  return segments;
};

/** the outline edge closest to the cursor on screen (within a few pixels) and the point on it under the cursor */
const profileUnder = (editor: Editor, pointer: { x: number; y: number }, frame: BoxFrame): ProfileGrip | null => {
  let best: ProfileGrip | null = null;
  let bestDistance = 7;
  const mouse = new THREE.Vector2(pointer.x, pointer.y);
  const ray = editor.viewer.ray(pointer.x, pointer.y);
  for (const [start, end] of profileSegments(editor, frame)) {
    const screenStart = editor.viewer.project(start),
      screenEnd = editor.viewer.project(end);
    if (!screenStart.visible || !screenEnd.visible) {
      continue;
    }
    const distance = distPointSegment2D(
      mouse,
      new THREE.Vector2(screenStart.x, screenStart.y),
      new THREE.Vector2(screenEnd.x, screenEnd.y),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      const point = closestOnSegment(closestOnLineToRay(start, end.clone().sub(start), ray), start, end).point;
      best = { start, end, point };
    }
  }
  return best;
};

/** Corners and edge midpoints of the box – Move can start from them like from geometry. */
const boxGripPoints = (frame: BoxFrame): V3[] => {
  const points: V3[] = [];
  for (const x of [0, 0.5, 1]) {
    for (const y of [0, 0.5, 1]) {
      for (const z of [0, 0.5, 1]) {
        if ([x, y, z].filter((value) => value === 0.5).length <= 1) {
          points.push(boxPoint(frame, [x, y, z]));
        }
      }
    }
  }
  return points;
};

const nearestOnScreen = <T>(editor: Editor, pointer: { x: number; y: number }, items: T[], at: (item: T) => V3, radius = 8) => {
  let best: T | null = null;
  let bestDistance = radius;
  for (const item of items) {
    const screenPos = editor.viewer.project(at(item));
    if (!screenPos.visible) {
      continue;
    }
    const distance = Math.hypot(screenPos.x - pointer.x, screenPos.y - pointer.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best;
};

/** The box with its rotation grips; the hot grip shows the protractor it rotates in. */
const drawBoxFrame = (editor: Editor, overlay: Overlay, frame: BoxFrame, grips: RotateGrip[], hot: RotateGrip | null) => {
  const corners = boxCorners(frame);
  for (const [i, j] of BOX_EDGES) {
    overlay.line(corners[i], corners[j], '#d4b000', 1);
  }
  const context = overlay.context;
  for (const grip of grips) {
    const screenPos = overlay.screen(grip.world);
    if (!screenPos) {
      continue;
    }
    const half = grip === hot ? 6 : 4;
    context.strokeStyle = '#e00000';
    context.lineWidth = grip === hot ? 2.5 : 1.5;
    context.beginPath();
    context.moveTo(screenPos.x - half, screenPos.y);
    context.lineTo(screenPos.x + half, screenPos.y);
    context.moveTo(screenPos.x, screenPos.y - half);
    context.lineTo(screenPos.x, screenPos.y + half);
    context.stroke();
  }
  if (hot) {
    const radius = hot.world.distanceTo(hot.center);
    overlay.circle3D(hot.center, hot.axis, radius, '#555', 1, 48, [4, 3]);
    overlay.line(hot.center, hot.world, '#555', 1, [4, 3]);
  }
};

// ===================================================================== Push/Pull
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
    const editor = this.editor;
    const faceHit = editor.viewer.pickFace(
      pointer.x,
      pointer.y,
      (context) => context.path.length === editor.activePath.length && editor.inContext(context.path),
    );
    return faceHit;
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
      const face = editor.entities.faces.get(this.faceId);
      if (!face) {
        return;
      }
      const off = this.normal.clone().multiplyScalar(this.distance);
      for (const loop of editor.entities.loops(face)) {
        const base = loop.map((vertex) => editor.toWorld(editor.entities.positionOf(vertex)));
        const top = base.map((point) => point.clone().add(off));
        overlay.fillPolygon(top, 'rgba(90,120,255,0.18)');
        overlay.polyline(top, '#000', 1.2, true);
        for (let i = 0; i < base.length; i++) {
          overlay.line(base[i], top[i], '#000', 1);
        }
      }
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

// ===================================================================== Offset
export class OffsetTool extends PointTool {
  id = 'offset';
  name = 'tools.offset';
  vcbLabel = 'vcb.distance';
  cursor = 'crosshair';
  faceId: number | null = null;
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
    this.editor.setHover(null);
  }
  face(pointer: { x: number; y: number }) {
    const editor = this.editor;
    return editor.viewer.pickFace(
      pointer.x,
      pointer.y,
      (context) => context.path.length === editor.activePath.length && editor.inContext(context.path),
    );
  }
  worldLoop(): V3[] {
    const editor = this.editor;
    const face = editor.entities.faces.get(this.faceId!)!;
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
      const sel = this.editor.selected().filter((entityRef) => entityRef.kind === 'face');
      const faceHit = this.face(pointer);
      if (!faceHit) {
        return;
      }
      this.faceId = sel.length === 1 ? sel[0].id : faceHit.faceId;
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
      this.faceId = faceHit.faceId;
      this.finish(this.editor.lastOffset);
    }
  }
  finish(distance: number) {
    if (this.faceId == null || Math.abs(distance) < 1e-5) {
      return;
    }
    const editor = this.editor;
    const faceId = this.faceId;
    editor.commit('tools.offset', () => {
      const face = editor.entities.faces.get(faceId)!;
      const pts = editor.entities.facePoints(face);
      const off = offsetPolygon(pts, editor.entities.faceNormal(face), distance);
      editor.entities.addLoop(off);
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
    const pts = this.worldLoop();
    const normal = polygonNormal(pts);
    overlay.polyline(offsetPolygon(pts, normal, this.distance), '#000', 1.3, true);
  }
}

// ===================================================================== Move
export class MoveTool extends PointTool {
  id = 'move';
  name = 'tools.move';
  vcbLabel = 'vcb.distance';
  cursor = 'move';
  start: V3 | null = null;
  live: LiveTransform | null = null;
  copy = false;
  pressed = false;
  delta = new THREE.Vector3();
  lastCopy: { refs: EntityRef[]; delta: V3; orig: EntityRef[] } | null = null;
  /** what was selected when the move began – a copy is selected while it moves */
  moved: EntityRef[] = [];
  frame: BoxFrame | null = null;
  rotateGrips: RotateGrip[] = [];
  hotRotate: RotateGrip | null = null;
  hotPoint: V3 | null = null;
  hotProfile: ProfileGrip | null = null;
  /** moving from an outline edge: the moved groups are see-through, with the look they had before */
  fromProfile = false;
  seeThrough: { instance: Instance; look: ReturnType<Editor['viewer']['shownLook']> }[] = [];
  status() {
    return this.start ? t(this.copy ? 'tools.status.moveTargetCopy' : 'tools.status.moveTarget') : t('tools.status.moveStart');
  }
  busy() {
    return !!this.start;
  }
  cancel() {
    this.clearSeeThrough();
    if (this.start) {
      this.editor.abortOp();
    }
    this.start = null;
    this.live = null;
    this.fromProfile = false;
    this.resetLocks();
    this.clearGrips();
    this.editor.setHover(null);
  }
  activate() {
    this.copy = false;
  }
  clearGrips() {
    this.frame = null;
    this.rotateGrips = [];
    this.hotRotate = null;
    this.hotPoint = null;
    this.hotProfile = null;
  }
  /** the moved groups and components see-through, so what lies behind them can be seen and picked */
  applySeeThrough() {
    const viewer = this.editor.viewer;
    for (const id of this.live?.insts.keys() ?? []) {
      const instance = this.editor.entities.instances.get(id);
      if (instance) {
        const look = viewer.shownLook(instance);
        this.seeThrough.push({ instance, look });
        viewer.lookForDisplay(instance, { ...look, opacity: (look?.opacity ?? 1) * 0.35 });
      }
    }
  }
  clearSeeThrough() {
    for (const { instance, look } of this.seeThrough) {
      this.editor.viewer.lookForDisplay(instance, look);
    }
    this.seeThrough = [];
  }
  refs(): EntityRef[] {
    return this.editor.selected();
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (!this.start) {
      this.pick(pointer, null);
      if (!editor.selected().length) {
        editor.setHover(hoverPick(editor, pointer));
      }
      // a group or component shows its box: crosses rotate it, corners and midpoints are start points
      this.frame = boxFrame(editor);
      this.rotateGrips = this.frame ? rotateGrips(editor, this.frame) : [];
      this.hotRotate = nearestOnScreen(editor, pointer, this.rotateGrips, (grip) => grip.world);
      this.hotPoint =
        this.frame && snapping.value && !this.hotRotate && !['endpoint', 'midpoint'].includes(this.inference?.kind ?? '')
          ? nearestOnScreen(editor, pointer, boxGripPoints(this.frame), (point) => point)
          : null;
      // an outline edge of it – also of round things, whose outline is no real edge
      this.hotProfile =
        this.frame && !this.hotRotate && !this.hotPoint && !['endpoint', 'midpoint'].includes(this.inference?.kind ?? '')
          ? profileUnder(editor, pointer, this.frame)
          : null;
      return;
    }
    const inference = this.pick(pointer, this.start, contextFilters(editor, this.live));
    this.apply(inference.point.clone().sub(this.start));
  }
  apply(delta: V3) {
    const editor = this.editor;
    this.delta.copy(delta);
    const localStart = editor.toLocal(this.start!),
      localEnd = editor.toLocal(this.start!.clone().add(delta));
    const matrix = new THREE.Matrix4().makeTranslation(localEnd.x - localStart.x, localEnd.y - localStart.y, localEnd.z - localStart.z);
    this.live!.apply(matrix);
    editor.invalidate();
    editor.setVcb(editor.fmt(delta.length()));
  }
  begin(point: V3) {
    const editor = this.editor;
    if (!editor.selected().length && editor.hover) {
      editor.select([editor.hover]);
    }
    if (!editor.selected().length) {
      return;
    }
    editor.setHover(null);
    this.start = point.clone();
    editor.beginOp(this.copy ? 'commands.copy' : 'tools.move');
    let refs = this.refs();
    const orig = refs;
    this.moved = orig;
    if (this.copy) {
      refs = editor.entities.copy(refs, new THREE.Matrix4(), editor.model);
      editor.select(refs);
    }
    this.live = new LiveTransform(editor.entities, refs);
    this.lastCopy = this.copy ? { refs, delta: new THREE.Vector3(), orig } : null;
    if (this.fromProfile) {
      this.applySeeThrough();
    }
  }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    if (!this.start) {
      if (this.hotRotate && this.frame) {
        const grip = this.hotRotate;
        const editor = this.editor;
        editor.select([this.frame.instance]);
        editor.setHover(null);
        const rotate = editor.tools.get('rotate') as RotateTool | undefined;
        if (rotate) {
          editor.setTool('rotate');
          rotate.startAt(grip, pointer, 'move');
        }
        return;
      }
      const point = this.hotPoint ?? this.hotProfile?.point ?? this.pick(pointer, null).point;
      this.fromProfile = !!this.hotProfile;
      if ((this.hotPoint || this.hotProfile) && this.frame) {
        this.editor.select([this.frame.instance]);
      }
      this.clearGrips();
      this.begin(point);
      this.pressed = true;
      return;
    }
    this.finish();
  }
  onUp(pointer: PEvt) {
    if (this.pressed && this.isDrag(pointer) && this.start) {
      this.finish();
    }
    this.pressed = false;
  }
  finish() {
    if (!this.start || !this.live) {
      return;
    }
    const editor = this.editor;
    if (this.delta.lengthSq() < 1e-12 && !this.copy) {
      this.cancel();
      return;
    }
    this.clearSeeThrough();
    this.live.finish();
    editor.endOp();
    if (this.lastCopy) {
      this.lastCopy.delta = this.delta.clone();
    }
    this.start = null;
    this.live = null;
    this.fromProfile = false;
    this.resetLocks();
    editor.invalidate();
  }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    if (keyEvent.key === 'Control' && down && !keyEvent.repeat) {
      this.copy = !this.copy;
      if (this.start) {
        const start = this.start,
          delta = this.delta.clone();
        this.clearSeeThrough();
        this.editor.abortOp();
        this.editor.select(this.moved);
        this.start = null;
        this.live = null;
        this.begin(start);
        this.apply(delta);
      }
      this.editor.refreshStatus();
      return true;
    }
    // before the start point arrow keys move the selection (nudge) instead of locking a direction
    if (!this.start && keyEvent.key.startsWith('Arrow') && this.editor.selected().length) {
      return false;
    }
    return super.onKey(keyEvent, down);
  }
  onVcb(text: string) {
    const editor = this.editor;
    const arr = parseArray(text);
    if (arr && !this.start && this.lastCopy) {
      const { orig, delta } = this.lastCopy;
      const copies = arr.count;
      if (copies < 1) {
        return false;
      }
      editor.undo();
      editor.commit(arr.kind === 'multiply' ? 'undo.copyArray' : 'undo.copyDivide', () => {
        const step = arr.kind === 'multiply' ? delta.clone() : delta.clone().multiplyScalar(1 / copies);
        const all: EntityRef[] = [];
        for (let i = 1; i <= copies; i++) {
          const localStart = editor.toLocal(new THREE.Vector3()),
            localEnd = editor.toLocal(step.clone().multiplyScalar(i));
          const refs = editor.entities.copy(
            orig,
            new THREE.Matrix4().makeTranslation(localEnd.x - localStart.x, localEnd.y - localStart.y, localEnd.z - localStart.z),
            editor.model,
          );
          editor.entities.weld(editor.entities.collectVertices(refs));
          all.push(...refs);
        }
        editor.select(all);
      });
      this.lastCopy = null;
      return true;
    }
    if (!this.start) {
      return false;
    }
    const lengths = parseLengthList(text, editor.model.settings.units);
    if (lengths.length === 3 && lengths.every((x) => x != null)) {
      this.apply(new THREE.Vector3(lengths[0]!, lengths[1]!, lengths[2]!));
      this.finish();
      return true;
    }
    const distance = this.lengthOf(text);
    if (distance == null) {
      return false;
    }
    const dir = this.delta.lengthSq() > 1e-12 ? this.delta.clone().normalize() : new THREE.Vector3(1, 0, 0);
    this.apply(dir.multiplyScalar(distance));
    this.finish();
    return true;
  }
  draw(overlay: Overlay) {
    if (this.start && this.inference) {
      const col = this.inference.axis ? AXIS_COLOR[this.inference.axis] : '#000';
      overlay.line(this.start, this.start.clone().add(this.delta), col, 1.2, [4, 3]);
    }
    if (!this.start && this.frame) {
      drawBoxFrame(this.editor, overlay, this.frame, this.rotateGrips, this.hotRotate);
      if (this.hotPoint) {
        overlay.marker(this.hotPoint, 'endpoint');
      }
      if (this.hotRotate) {
        overlay.tooltip(this.editor.mouse.x, this.editor.mouse.y, t('tools.hints.rotateGrip'));
      }
      if (this.hotProfile) {
        overlay.line(this.hotProfile.start, this.hotProfile.end, '#e07000', 3);
        overlay.marker(this.hotProfile.point, 'edge');
        overlay.tooltip(this.editor.mouse.x, this.editor.mouse.y, t('inference.onProfile'));
      }
    }
    this.drawInference(overlay, !this.hotRotate && !this.hotPoint && !this.hotProfile);
    if (this.copy) {
      const context = overlay.context;
      context.font = 'bold 14px sans-serif';
      context.fillStyle = '#000';
      context.fillText('+', this.editor.mouse.x + 12, this.editor.mouse.y - 6);
    }
  }
}

// ===================================================================== Rotate
export class RotateTool extends PointTool {
  id = 'rotate';
  name = 'tools.rotate';
  vcbLabel = 'vcb.angle';
  cursor = 'crosshair';
  center: V3 | null = null;
  ref: V3 | null = null;
  normal = new THREE.Vector3(0, 0, 1);
  angle = 0;
  live: LiveTransform | null = null;
  copy = false;
  normalLock: 'x' | 'y' | 'z' | null = null;
  hoverN = new THREE.Vector3(0, 0, 1);
  hoverP: V3 | null = null;
  lastCopy: { orig: EntityRef[]; angle: number; center: V3; normal: V3 } | null = null;
  frame: BoxFrame | null = null;
  grips: RotateGrip[] = [];
  hotGrip: RotateGrip | null = null;
  /** started from a rotation grip of another tool (Move): back to it when done */
  returnTo: string | null = null;
  pressed = false;
  /** the start point's circle meets the face under the cursor here – the angle snapped to it */
  lean: { angle: number; point: V3 } | null = null;
  status() {
    return !this.center ? t('tools.status.rotateCenter') : !this.ref ? t('tools.status.rotateStart') : t('tools.status.rotateAngle');
  }
  busy() {
    return !!this.center;
  }
  cancel() {
    if (this.live) {
      this.editor.abortOp();
    }
    this.center = this.ref = null;
    this.live = null;
    this.angle = 0;
    this.lean = null;
    this.frame = null;
    this.grips = [];
    this.hotGrip = null;
    this.editor.setHover(null);
    this.goBack();
  }
  /** after the rotation from a grip: the tool it came from, unless the user picked another one meanwhile */
  goBack() {
    const back = this.returnTo;
    this.returnTo = null;
    this.pressed = false;
    if (back) {
      queueMicrotask(() => {
        if (this.editor.tool === this) {
          this.editor.setTool(back);
        }
      });
    }
  }
  /** rotation grip clicked in another tool: the protractor lies on the grip's face, the grip is the start of the angle */
  startAt(grip: RotateGrip, pointer: PEvt, returnTo: string) {
    this.center = grip.center.clone();
    this.normal = grip.axis.clone();
    this.begin(grip.world.clone());
    this.returnTo = returnTo;
    this.pressed = true;
    this.downAt = { x: pointer.x, y: pointer.y };
    this.editor.refreshStatus();
  }
  /** the start of the angle is set: the selection rotates live from here */
  begin(ref: V3) {
    const editor = this.editor;
    this.ref = ref;
    editor.beginOp(this.copy ? 'undo.rotateCopy' : 'tools.rotate');
    let refs = editor.selected();
    const orig = refs;
    if (this.copy) {
      refs = editor.entities.copy(refs, new THREE.Matrix4(), editor.model);
      editor.select(refs);
    }
    this.live = new LiveTransform(editor.entities, refs);
    this.lastCopy = this.copy ? { orig, angle: 0, center: this.center!.clone(), normal: this.normal.clone() } : null;
  }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    if (down && ['ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(keyEvent.key) && !this.ref) {
      const axis = keyEvent.key === 'ArrowUp' ? 'z' : keyEvent.key === 'ArrowRight' ? 'x' : 'y';
      this.normalLock = this.normalLock === axis ? null : axis;
      if (this.center) {
        this.normal = AXES[axis].clone();
      }
      return true;
    }
    if (keyEvent.key === 'Control' && down && !keyEvent.repeat) {
      this.copy = !this.copy;
      return true;
    }
    return super.onKey(keyEvent, down);
  }
  planeNormal(): V3 {
    if (this.normalLock) {
      return AXES[this.normalLock].clone();
    }
    return this.hoverN.clone();
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (!this.center) {
      const hoverInference = this.pick(pointer, null);
      this.hoverP = hoverInference.point.clone();
      this.hoverN =
        hoverInference.face && hoverInference.kind === 'face' ? hoverInference.face.normal.clone().normalize() : new THREE.Vector3(0, 0, 1);
      if (!editor.selected().length) {
        editor.setHover(hoverPick(editor, pointer));
      }
      // the protractor snaps to the rotation grips of a group's or component's box
      this.frame = boxFrame(editor);
      this.grips = this.frame ? rotateGrips(editor, this.frame) : [];
      this.hotGrip = this.normalLock ? null : nearestOnScreen(editor, pointer, this.grips, (grip) => grip.world);
      if (this.hotGrip) {
        this.hoverP = this.hotGrip.center.clone();
        this.hoverN = this.hotGrip.axis.clone();
      }
      return;
    }
    if (!this.ref) {
      const refInference = this.pick(pointer, this.center);
      this.hoverP = onPlane(refInference.point, this.center, this.normal);
      return;
    }
    const hit = editor.viewer
      .ray(pointer.x, pointer.y)
      .intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.center), new THREE.Vector3());
    let target = hit;
    const inference = this.pick(pointer, this.center, contextFilters(editor, this.live));
    if (inference.kind === 'endpoint' || inference.kind === 'midpoint' || inference.kind === 'edge') {
      target = onPlane(inference.point, this.center, this.normal);
    }
    if (!target) {
      return;
    }
    const fromRef = this.ref.clone().sub(this.center),
      toTarget = target.sub(this.center);
    let ang = Math.atan2(fromRef.clone().cross(toTarget).dot(this.normal), fromRef.dot(toTarget));
    const step = Math.PI / 12;
    const snap = Math.round(ang / step) * step;
    if (snapping.value && Math.abs(ang - snap) < THREE.MathUtils.degToRad(2.5) && !(inference.kind === 'endpoint')) {
      ang = snap;
    }
    // over a face: the angle where the start point's circle meets it (a ladder leaning against a wall)
    this.lean = snapping.value && inference.kind === 'face' && inference.face ? this.leanOn(inference.face, ang) : null;
    if (this.lean) {
      ang = this.lean.angle;
    }
    this.applyAngle(ang);
  }
  /** where the circle the start point runs on crosses the face – the crossing nearest to `angle`, if inside the face */
  leanOn(faceHit: FaceHit, angle: number): { angle: number; point: V3 } | null {
    const center = this.center!,
      normal = this.normal;
    const radial = this.ref!.clone().sub(center);
    const across = normal.clone().cross(radial);
    const faceNormal = faceHit.normal.clone().normalize();
    // radial·m cos θ + across·m sin θ = -(center - face)·m
    const cosPart = radial.dot(faceNormal),
      sinPart = across.dot(faceNormal),
      offset = center.clone().sub(faceHit.point).dot(faceNormal);
    const amplitude = Math.hypot(cosPart, sinPart);
    if (amplitude < 1e-9 || Math.abs(offset) > amplitude) {
      return null;
    }
    const phase = Math.atan2(sinPart, cosPart),
      spread = Math.acos(-offset / amplitude);
    const wrap = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
    const best = [phase + spread, phase - spread]
      .map(wrap)
      .sort((left, right) => Math.abs(wrap(left - angle)) - Math.abs(wrap(right - angle)))[0];
    const point = center.clone().addScaledVector(radial, Math.cos(best)).addScaledVector(across, Math.sin(best));
    const ents = faceHit.context.entities;
    const face = ents.faces.get(faceHit.faceId);
    const local = point.clone().applyMatrix4(faceHit.context.world.clone().invert());
    if (!face || !ents.pointInFace(face, local, false)) {
      return null;
    }
    return { angle: best, point };
  }
  matrix(angle: number): THREE.Matrix4 {
    const editor = this.editor;
    const center = this.center!;
    const matrix = new THREE.Matrix4()
      .makeTranslation(center.x, center.y, center.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(this.normal, angle))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    return editor.contextInverse.multiply(matrix).multiply(editor.contextMatrix);
  }
  applyAngle(angle: number) {
    this.angle = angle;
    this.live?.apply(this.matrix(angle));
    this.editor.invalidate();
    this.editor.setVcb(formatAngle(angle));
  }
  onDown(pointer: PEvt) {
    const editor = this.editor;
    if (!this.center) {
      if (!editor.selected().length && editor.hover) {
        editor.select([editor.hover]);
      }
      if (!editor.selected().length) {
        editor.toast(t('toast.selectFirst'));
        return;
      }
      editor.setHover(null);
      if (this.hotGrip) {
        this.center = this.hotGrip.center.clone();
        this.normal = this.hotGrip.axis.clone();
      } else {
        const inference = this.pick(pointer, null);
        this.center = inference.point.clone();
        this.normal = this.planeNormal();
      }
      this.frame = null;
      this.grips = [];
      this.hotGrip = null;
      return;
    }
    if (!this.ref) {
      const inference = this.pick(pointer, this.center);
      const point = onPlane(inference.point, this.center, this.normal);
      if (point.distanceTo(this.center) < 1e-5) {
        return;
      }
      this.begin(point);
      return;
    }
    this.finish();
  }
  onUp(pointer: PEvt) {
    // dragged from a rotation grip: letting go ends the rotation
    if (this.pressed && this.isDrag(pointer) && this.live) {
      this.finish();
    }
    this.pressed = false;
  }
  finish() {
    const editor = this.editor;
    if (!this.live) {
      return;
    }
    this.live.finish();
    editor.endOp();
    if (this.lastCopy) {
      this.lastCopy.angle = this.angle;
    }
    this.center = this.ref = null;
    this.live = null;
    editor.invalidate();
    this.goBack();
  }
  onVcb(text: string) {
    const editor = this.editor;
    const arr = parseArray(text);
    if (arr && !this.center && this.lastCopy) {
      const { orig, angle, center, normal } = this.lastCopy;
      editor.undo();
      editor.commit('undo.rotateArray', () => {
        const all: EntityRef[] = [];
        for (let i = 1; i <= arr.count; i++) {
          this.center = center;
          this.normal = normal;
          const matrix = this.matrix(arr.kind === 'multiply' ? angle * i : (angle * i) / arr.count);
          const refs = editor.entities.copy(orig, matrix, editor.model);
          editor.entities.weld(editor.entities.collectVertices(refs));
          all.push(...refs);
        }
        this.center = null;
        editor.select(all);
      });
      this.lastCopy = null;
      return true;
    }
    if (!this.ref) {
      return false;
    }
    const degrees = parseFloat(normalizeNumberInput(text).replace(',', '.').replace('°', ''));
    if (isNaN(degrees)) {
      return false;
    }
    this.applyAngle((degrees * Math.PI) / 180);
    this.finish();
    return true;
  }
  draw(overlay: Overlay) {
    const editor = this.editor;
    if (!this.center && this.frame) {
      drawBoxFrame(editor, overlay, this.frame, this.grips, null);
    }
    const center = this.center ?? this.hoverP;
    if (!center) {
      return;
    }
    const normal = this.center ? this.normal : this.planeNormal();
    const radius = editor.viewer.worldPerPixel(center) * 55;
    const col =
      Math.abs(normal.z) > 0.99 ? '#0000e0' : Math.abs(normal.x) > 0.99 ? '#e00000' : Math.abs(normal.y) > 0.99 ? '#00a000' : '#555';
    overlay.circle3D(center, normal, radius, col, 1.5, 64);
    // ticks every 15°
    const { basisU, basisV } = planeAxes(normal);
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const direction = basisU.clone().multiplyScalar(Math.cos(angle)).addScaledVector(basisV, Math.sin(angle));
      overlay.line(
        center.clone().addScaledVector(direction, radius * (i % 6 === 0 ? 0.78 : 0.88)),
        center.clone().addScaledVector(direction, radius),
        col,
        1,
      );
    }
    overlay.marker(center, 'center');
    if (this.center && (this.ref || this.hoverP)) {
      const reference = this.ref ?? this.hoverP!;
      overlay.line(this.center, reference, '#555', 1, [4, 3]);
      if (this.ref) {
        const cur = this.ref.clone().sub(this.center).applyAxisAngle(this.normal, this.angle).add(this.center);
        overlay.line(this.center, cur, '#000', 1.2);
        if (this.lean) {
          const screenPos = overlay.screen(this.lean.point);
          if (screenPos) {
            const context = overlay.context;
            context.strokeStyle = '#e00000';
            context.lineWidth = 2;
            context.setLineDash([]);
            context.beginPath();
            context.moveTo(screenPos.x - 5, screenPos.y - 5);
            context.lineTo(screenPos.x + 5, screenPos.y + 5);
            context.moveTo(screenPos.x + 5, screenPos.y - 5);
            context.lineTo(screenPos.x - 5, screenPos.y + 5);
            context.stroke();
          }
          overlay.tooltip(editor.mouse.x, editor.mouse.y, t('inference.radiusOnFace'));
        }
      }
    }
    if (this.copy) {
      const context = overlay.context;
      context.font = 'bold 14px sans-serif';
      context.fillStyle = '#000';
      context.fillText('+', editor.mouse.x + 12, editor.mouse.y - 6);
    }
    if (!this.ref) {
      this.drawInference(overlay);
    }
  }
}

// ===================================================================== Scale
interface Grip {
  fraction: V3;
  world: V3;
}
export class ScaleTool extends PointTool {
  id = 'scale';
  name = 'tools.scale';
  vcbLabel = 'vcb.scale';
  cursor = 'crosshair';
  box: THREE.Box3 | null = null;
  grips: Grip[] = [];
  hot: Grip | null = null;
  active: Grip | null = null;
  anchor = new THREE.Vector3();
  mask = new THREE.Vector3();
  live: LiveTransform | null = null;
  factor = new THREE.Vector3(1, 1, 1);
  pressed = false;
  status() {
    return this.active ? t('tools.status.scaleDrag') : this.box ? t('tools.status.scaleGrip') : t('tools.status.scalePick');
  }
  activate() {
    this.refresh();
  }
  busy() {
    return !!this.active;
  }
  cancel() {
    if (this.active) {
      this.editor.abortOp();
    }
    this.active = null;
    this.live = null;
    this.refresh();
  }
  refresh() {
    const editor = this.editor;
    const refs = editor.selected();
    if (!refs.length) {
      this.box = null;
      this.grips = [];
      return;
    }
    const box = editor.entities.refBounds(refs);
    if (box.isEmpty()) {
      this.box = null;
      this.grips = [];
      return;
    }
    this.box = box;
    this.grips = [];
    const size = box.getSize(new THREE.Vector3());
    const seen = new Set<string>();
    for (const x of [0, 0.5, 1]) {
      for (const y of [0, 0.5, 1]) {
        for (const z of [0, 0.5, 1]) {
          if (x === 0.5 && y === 0.5 && z === 0.5) {
            continue;
          }
          const fraction = new THREE.Vector3(size.x < 1e-6 ? 0.5 : x, size.y < 1e-6 ? 0.5 : y, size.z < 1e-6 ? 0.5 : z);
          if (fraction.x === 0.5 && fraction.y === 0.5 && fraction.z === 0.5) {
            continue;
          }
          const key = fraction.toArray().join();
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          const localPos = new THREE.Vector3(
            box.min.x + size.x * fraction.x,
            box.min.y + size.y * fraction.y,
            box.min.z + size.z * fraction.z,
          );
          this.grips.push({ fraction: fraction, world: editor.toWorld(localPos) });
        }
      }
    }
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (!this.box) {
      this.refresh();
      if (!this.box) {
        editor.setHover(hoverPick(editor, pointer));
        return;
      }
    }
    if (!this.active) {
      this.hot = null;
      let best = 10;
      for (const candidate of this.grips) {
        const screenPos = editor.viewer.project(candidate.world);
        const distance = Math.hypot(screenPos.x - pointer.x, screenPos.y - pointer.y);
        if (distance < best) {
          best = distance;
          this.hot = candidate;
        }
      }
      return;
    }
    const grip = this.active;
    const anchorWorld = editor.toWorld(this.anchor);
    const dir = grip.world.clone().sub(anchorWorld);
    const gripDistance = dir.length();
    if (gripDistance < 1e-9) {
      return;
    }
    const point = closestOnLineToRay(anchorWorld, dir.clone().normalize(), editor.viewer.ray(pointer.x, pointer.y));
    let factor = point.sub(anchorWorld).dot(dir) / (gripDistance * gripDistance);
    if (Math.abs(factor) < 1e-3) {
      factor = 1e-3 * Math.sign(factor || 1);
    }
    // snap to round factors
    const rounded = Math.round(factor * 10) / 10;
    if (snapping.value && Math.abs(factor - rounded) < 0.02) {
      factor = rounded;
    }
    this.applyFactor(factor);
  }
  isCorner(grip: Grip) {
    return (
      [grip.fraction.x, grip.fraction.y, grip.fraction.z].filter((value) => value !== 0.5).length === 3 ||
      (this.box && [grip.fraction.x, grip.fraction.y, grip.fraction.z].filter((value) => value !== 0.5).length === this.dims())
    );
  }
  dims() {
    const size = this.box!.getSize(new THREE.Vector3());
    return [size.x, size.y, size.z].filter((value) => value > 1e-6).length;
  }
  applyFactor(factor: number, explicit?: V3) {
    const editor = this.editor;
    const mask = this.mask;
    const uniform = this.isCorner(this.active!) !== (editor.ui as any)._shift;
    const scale =
      explicit ??
      (uniform
        ? new THREE.Vector3(factor, factor, factor)
        : new THREE.Vector3(mask.x ? factor : 1, mask.y ? factor : 1, mask.z ? factor : 1));
    const size = this.box!.getSize(new THREE.Vector3());
    if (size.x < 1e-6) {
      scale.x = 1;
    }
    if (size.y < 1e-6) {
      scale.y = 1;
    }
    if (size.z < 1e-6) {
      scale.z = 1;
    }
    this.factor.copy(scale);
    const anchor = this.anchor;
    const matrix = new THREE.Matrix4()
      .makeTranslation(anchor.x, anchor.y, anchor.z)
      .multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z))
      .multiply(new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z));
    this.live!.apply(matrix);
    editor.invalidate();
    editor.setVcb(
      [scale.x, scale.y, scale.z]
        .filter((_, i) => (uniform ? i === 0 : [mask.x, mask.y, mask.z][i]))
        .map((value) => formatDecimal(value, 2))
        .join('; '),
    );
  }
  onDown(pointer: PEvt) {
    const editor = this.editor;
    this.downAt = { x: pointer.x, y: pointer.y };
    if (!this.box) {
      if (editor.hover) {
        editor.select([editor.hover]);
        editor.setHover(null);
        this.refresh();
      }
      return;
    }
    if (!this.active) {
      if (!this.hot) {
        // clicking elsewhere selects something else
        const entityRef = hoverPick(editor, pointer);
        if (entityRef) {
          editor.select([entityRef]);
          this.refresh();
        }
        return;
      }
      const grip = this.hot;
      this.active = grip;
      this.pressed = true;
      const box = this.box;
      const size = box.getSize(new THREE.Vector3());
      const ctrl = pointer.ctrl;
      const anchorFraction = ctrl
        ? new THREE.Vector3(0.5, 0.5, 0.5)
        : new THREE.Vector3(1 - grip.fraction.x, 1 - grip.fraction.y, 1 - grip.fraction.z);
      this.anchor = new THREE.Vector3(
        box.min.x + size.x * anchorFraction.x,
        box.min.y + size.y * anchorFraction.y,
        box.min.z + size.z * anchorFraction.z,
      );
      this.mask.set(grip.fraction.x !== 0.5 ? 1 : 0, grip.fraction.y !== 0.5 ? 1 : 0, grip.fraction.z !== 0.5 ? 1 : 0);
      editor.beginOp('tools.scale');
      this.live = new LiveTransform(editor.entities, editor.selected());
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
  finish() {
    if (!this.live) {
      return;
    }
    this.live.finish();
    this.editor.endOp();
    this.active = null;
    this.live = null;
    this.refresh();
    this.editor.invalidate();
  }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    if (keyEvent.key === 'Shift') {
      (this.editor.ui as any)._shift = down;
      return true;
    }
    return false;
  }
  onVcb(text: string) {
    if (!this.active) {
      return false;
    }
    const parts = text
      .split(/[;]/)
      .map((part) => part.trim())
      .filter(Boolean);
    const nums = parts.map((part) => {
      const unit = /[a-z"']/i.test(part);
      if (unit) {
        const distance = this.lengthOf(part);
        if (distance == null) {
          return NaN;
        }
        const size = this.box!.getSize(new THREE.Vector3());
        const ref = Math.max(size.x * this.mask.x, size.y * this.mask.y, size.z * this.mask.z) || Math.max(size.x, size.y, size.z);
        return distance / ref;
      }
      return parseFloat(part.replace(',', '.'));
    });
    if (nums.some(isNaN) || !nums.length) {
      return false;
    }
    if (nums.length === 1) {
      this.applyFactor(nums[0]);
    } else if (nums.length === 3) {
      this.applyFactor(1, new THREE.Vector3(nums[0], nums[1], nums[2]));
    } else {
      const mask = this.mask;
      const values = [1, 1, 1];
      let k = 0;
      [mask.x, mask.y, mask.z].forEach((enabled, i) => {
        if (enabled && k < nums.length) {
          values[i] = nums[k++];
        }
      });
      this.applyFactor(1, new THREE.Vector3(...values));
    }
    this.finish();
    return true;
  }
  draw(overlay: Overlay) {
    const editor = this.editor;
    if (!this.box) {
      this.refresh();
      if (!this.box) {
        return;
      }
    }
    // bounding box (yellow like SketchUp) and grips (green)
    if (!this.active) {
      this.refresh();
    }
    const box = this.box;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
      editor.toWorld(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)),
    );
    const boxEdges = [
      [0, 1],
      [1, 3],
      [3, 2],
      [2, 0],
      [4, 5],
      [5, 7],
      [7, 6],
      [6, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    for (const [i, j] of boxEdges) {
      overlay.line(corners[i], corners[j], '#d4b000', 1.2);
    }
    for (const grip of this.grips) {
      const screenPos = overlay.screen(grip.world);
      if (!screenPos) {
        continue;
      }
      const hot = grip === this.hot || grip === this.active;
      overlay.context.fillStyle = hot ? '#e00000' : '#00a000';
      overlay.context.fillRect(screenPos.x - 4, screenPos.y - 4, 8, 8);
    }
    if (this.active) {
      const screenPos = overlay.screen(editor.toWorld(this.anchor));
      if (screenPos) {
        overlay.context.strokeStyle = '#e00000';
        overlay.context.lineWidth = 2;
        overlay.context.strokeRect(screenPos.x - 5, screenPos.y - 5, 10, 10);
      }
    }
    if (this.hot && !this.active) {
      const count = [this.hot.fraction.x, this.hot.fraction.y, this.hot.fraction.z].filter((value) => value !== 0.5).length;
      overlay.tooltip(
        editor.mouse.x,
        editor.mouse.y,
        count === 3 || count === this.dims()
          ? t('tools.hints.scaleUniform')
          : count === 2
            ? t('tools.hints.scaleTwoAxes')
            : t('tools.hints.scaleOneAxis'),
      );
    }
  }
}

// ===================================================================== Follow Me
export class FollowMeTool extends PointTool {
  id = 'followme';
  name = 'tools.followme';
  cursor = 'crosshair';
  status() {
    return this.path() ? t('tools.status.followmeProfile') : t('tools.status.followmePath');
  }
  path(): { points: V3[]; closed: boolean } | null {
    const editor = this.editor;
    const ents = editor.entities;
    let edges = this.selectedEdges();
    // a selected face (without edges) means "its boundary"
    if (!edges.length) {
      const entityRef = editor.selected().find((selectedRef) => selectedRef.kind === 'face');
      if (entityRef) {
        const face = ents.faces.get(entityRef.id);
        if (face) {
          edges = ents.loopEdges(face.outer);
        }
      }
    }
    if (!edges.length) {
      return null;
    }
    const adj = new Map<number, number[]>();
    for (const edge of edges) {
      (adj.get(edge.start) ?? adj.set(edge.start, []).get(edge.start)!).push(edge.end);
      (adj.get(edge.end) ?? adj.set(edge.end, []).get(edge.end)!).push(edge.start);
    }
    if ([...adj.values()].some((neighbours) => neighbours.length > 2)) {
      return null;
    }
    let start = [...adj.keys()].find((k) => adj.get(k)!.length === 1);
    const closed = start == null;
    if (start == null) {
      start = edges[0].start;
    }
    const order = [start];
    const seen = new Set([start]);
    let cur = start;
    while (true) {
      const next = adj.get(cur)!.find((vertex) => !seen.has(vertex));
      if (next == null) {
        break;
      }
      order.push(next);
      seen.add(next);
      cur = next;
    }
    if (order.length !== adj.size) {
      return null;
    }
    return { points: order.map((vertex) => ents.positionOf(vertex).clone()), closed };
  }
  selectedEdges() {
    const ents = this.editor.entities;
    return this.editor
      .selected()
      .filter((entityRef) => entityRef.kind === 'edge')
      .map((entityRef) => ents.edges.get(entityRef.id)!)
      .filter(Boolean);
  }
  /** a loose path and a profile on its own lose nothing when they become inputs – edges of a solid must stay where they are */
  canBeProcedure(faceId: number) {
    const ents = this.editor.entities;
    const face = ents.faces.get(faceId);
    const path = this.selectedEdges();
    return (
      !!face &&
      path.length > 0 &&
      path.every((edge) => !ents.facesOfEdge(edge.id).length) &&
      ents.faceEdges(face).every((edge) => ents.facesOfEdge(edge.id).length === 1)
    );
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    const faceHit = editor.viewer.pickFace(
      pointer.x,
      pointer.y,
      (context) => context.path.length === editor.activePath.length && editor.inContext(context.path),
    );
    editor.setHover(faceHit ? { kind: 'face', id: faceHit.faceId } : null);
  }
  onDown(pointer: PEvt) {
    const editor = this.editor;
    const path = this.path();
    if (!path) {
      editor.toast(t('toast.noValidPath'));
      return;
    }
    const faceHit = editor.viewer.pickFace(
      pointer.x,
      pointer.y,
      (context) => context.path.length === editor.activePath.length && editor.inContext(context.path),
    );
    if (!faceHit) {
      return;
    }
    if (this.canBeProcedure(faceHit.faceId)) {
      const pathEdges = this.selectedEdges().map((edge) => edge.id);
      const names = {
        group: editor.model.uniqueDefName(t('procedures.names.followMe')),
        profile: t('procedures.names.profile'),
        path: t('procedures.names.path'),
      };
      try {
        editor.commit('tools.followme', () => {
          const procedure = createFollowMeProcedure(editor.model, editor.entities, faceHit.faceId, pathEdges, names);
          editor.select([{ kind: 'instance', id: procedure.id }]);
        });
      } catch {
        // commit has put everything back and said so
      }
      editor.setHover(null);
      return;
    }
    // start the path at the end closest to the profile
    const faceCenter = editor.entities.faceCenter(editor.entities.faces.get(faceHit.faceId)!);
    if (!path.closed && path.points[path.points.length - 1].distanceTo(faceCenter) < path.points[0].distanceTo(faceCenter)) {
      path.points.reverse();
    }
    if (path.closed) {
      let bestIndex = 0,
        bestDistance = Infinity;
      path.points.forEach((point, i) => {
        const distance = point.distanceTo(faceCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      });
      path.points = [...path.points.slice(bestIndex), ...path.points.slice(0, bestIndex)];
    }
    editor.commit('tools.followme', () => editor.entities.followMe(faceHit.faceId, path.points, path.closed));
    editor.clearSelection();
    editor.setHover(null);
  }
}
