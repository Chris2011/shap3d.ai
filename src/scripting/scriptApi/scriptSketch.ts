import * as THREE from 'three';
import { t } from '../../i18n';
import { AXIS_VECTORS, toVec, axis, type Pt } from '../points';
import { FaceHandle } from '../handles';
import type { PolyhedronFace } from '../scriptTypes';
import { ScriptGroups } from './scriptGroups';

/**
 * Edges and faces: lines, outlines, rectangles, circles, polygons, arcs, polyhedra – and push/pull and offset on faces.
 */
export class ScriptSketch extends ScriptGroups {
  line(fromPoint: Pt, toPoint: Pt) {
    this.ents.addLine(toVec(fromPoint), toVec(toPoint));
  }
  polyline(points: Pt[], closed = false) {
    const vectors = points.map((x) => toVec(x));
    for (let i = 0; i < vectors.length - 1; i++) {
      this.ents.addLine(vectors[i], vectors[i + 1]);
    }
    if (closed && vectors.length > 2) {
      this.ents.addLine(vectors[vectors.length - 1], vectors[0]);
    }
    return this.lastFace();
  }
  /**
   * Faces from a point list and index lists (like OpenSCAD's polyhedron) – exact, any shape.
   * A face is [i, j, k, …] or { outer: [...], holes: [[...]], material: 'Name' }. Returns the number of faces made.
   */
  polyhedron(points: Pt[], faces: PolyhedronFace[], opts: { material?: string } = {}): number {
    const ids = points.map((point) => this.ents.addVertex(toVec(point)));
    const vertexOf = (index: number) => {
      const id = ids[index];
      if (id == null) {
        throw new Error(t('script.errors.noPoint', { index }));
      }
      return id;
    };
    let made = 0;
    for (const face of faces) {
      const spec = Array.isArray(face) ? { outer: face } : face;
      const material = spec.material ?? opts.material;
      const created = this.ents.createFaceRaw(
        spec.outer.map(vertexOf),
        (spec.holes ?? []).map((hole) => hole.map(vertexOf)),
        material ? { material: this.ensureMaterial(material) } : {},
      );
      if (created) {
        made++;
      }
    }
    return made;
  }
  private lastFace(): FaceHandle | null {
    let max = -1;
    for (const id of this.ents.faces.keys()) {
      if (id > max) {
        max = id;
      }
    }
    return max >= 0 ? new FaceHandle(this, this.ents, max) : null;
  }
  /** Create a face from points (closed loop). */
  face(points: Pt[]): FaceHandle {
    const before = new Set(this.ents.faces.keys());
    const vectors = points.map((x) => toVec(x));
    this.ents.addLoop(vectors);
    // find the new face whose vertices match the loop
    const want = vectors.map((vector) => this.ents.findVertex(vector));
    for (const face of this.ents.faces.values()) {
      if (!before.has(face.id) && want.every((vertex) => vertex != null && face.outer.includes(vertex))) {
        return new FaceHandle(this, this.ents, face.id);
      }
    }
    for (const face of this.ents.faces.values()) {
      if (want.every((vertex) => vertex != null && face.outer.includes(vertex))) {
        return new FaceHandle(this, this.ents, face.id);
      }
    }
    const lastFace = this.lastFace();
    if (!lastFace) {
      throw new Error(t('script.errors.faceFailed'));
    }
    return lastFace;
  }
  /** Rectangle with corner `at`, width (x) and depth (y). plane: 'xy' | 'xz' | 'yz'. */
  rect(corner: Pt, width: number | string, depth: number | string, plane: 'xy' | 'xz' | 'yz' = 'xy'): FaceHandle {
    const base = toVec(corner);
    const widthValue = this.length(width),
      depthValue = this.length(depth);
    const [basisU, basisV] =
      plane === 'xz'
        ? [AXIS_VECTORS.x, AXIS_VECTORS.z]
        : plane === 'yz'
          ? [AXIS_VECTORS.y, AXIS_VECTORS.z]
          : [AXIS_VECTORS.x, AXIS_VECTORS.y];
    return this.face([
      base,
      base.clone().addScaledVector(basisU, widthValue),
      base.clone().addScaledVector(basisU, widthValue).addScaledVector(basisV, depthValue),
      base.clone().addScaledVector(basisV, depthValue),
    ]);
  }
  circle(center: Pt, radius: number | string, opts: { segments?: number; normal?: string | Pt } = {}): FaceHandle {
    return this.ngon(center, this.length(radius), opts.segments ?? 24, opts.normal);
  }
  polygon(center: Pt, radius: number | string, sides = 6, normal?: string | Pt): FaceHandle {
    return this.ngon(center, this.length(radius), sides, normal);
  }
  private ngon(center: Pt, radius: number, sides: number, normal?: string | Pt): FaceHandle {
    const centerVec = toVec(center);
    const normalVec = axis(normal);
    const basisU = Math.abs(normalVec.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(normalVec).normalize() : new THREE.Vector3(1, 0, 0);
    const basisV = normalVec.clone().cross(basisU).normalize();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      pts.push(
        centerVec
          .clone()
          .addScaledVector(basisU, Math.cos(angle) * radius)
          .addScaledVector(basisV, Math.sin(angle) * radius),
      );
    }
    return this.face(pts);
  }
  arc(center: Pt, radius: number | string, startDeg: number, endDeg: number, segments = 12, normal?: string | Pt) {
    const centerVec = toVec(center),
      radiusValue = this.length(radius),
      normalVec = axis(normal);
    const basisU = Math.abs(normalVec.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(normalVec).normalize() : new THREE.Vector3(1, 0, 0);
    const basisV = normalVec.clone().cross(basisU).normalize();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = ((startDeg + ((endDeg - startDeg) * i) / segments) * Math.PI) / 180;
      pts.push(
        centerVec
          .clone()
          .addScaledVector(basisU, Math.cos(angle) * radiusValue)
          .addScaledVector(basisV, Math.sin(angle) * radiusValue),
      );
    }
    this.polyline(pts);
    return pts.map((point) => point.toArray());
  }
  pushpull(face: FaceHandle, distance: number | string) {
    return face.pushpull(distance);
  }
}
