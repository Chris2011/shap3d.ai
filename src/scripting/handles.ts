import * as THREE from 'three';
import { copyInstanceDetails, type Entities, type EntityRef, type Instance } from '../core/model';
import { t } from '../i18n';
import { toVec, axis, type Pt } from './points';
import type { ScriptBase } from './scriptApi/scriptBase';

/** Handle to a face created by a script. */
export class FaceHandle {
  constructor(
    private api: ScriptBase,
    public ents: Entities,
    public id: number,
  ) {}
  get exists() {
    return this.ents.faces.has(this.id);
  }
  get area() {
    const face = this.ents.faces.get(this.id);
    return face ? this.ents.faceArea(face) : 0;
  }
  get normal() {
    const face = this.ents.faces.get(this.id);
    return face ? this.ents.faceNormal(face).toArray() : [0, 0, 0];
  }
  /** Push/Pull along the face normal. Returns the new top face. */
  pushpull(distance: number | string): FaceHandle | null {
    const dist = this.api.length(distance);
    const face = this.ents.faces.get(this.id);
    if (!face) {
      throw new Error(t('script.errors.faceGone'));
    }
    // positive values always extrude "up/out" for faces lying on the ground (normal pointing down)
    const normal = this.ents.faceNormal(face);
    const sign = normal.z < -0.999 ? -1 : 1;
    const top = this.ents.pushPull(this.id, sign * dist);
    return top != null ? new FaceHandle(this.api, this.ents, top) : null;
  }
  /** Extrude by `d` towards a direction ('x' | 'y' | 'z' | '-x' ... or a vector), regardless of face orientation. */
  extrude(distance: number | string, dir: string | Pt = 'z'): FaceHandle | null {
    const face = this.ents.faces.get(this.id);
    if (!face) {
      throw new Error(t('script.errors.faceGone'));
    }
    let want: THREE.Vector3;
    if (typeof dir === 'string') {
      const neg = dir.startsWith('-');
      want = axis(dir.replace('-', ''));
      if (neg) {
        want.negate();
      }
    } else {
      want = toVec(dir);
    }
    const sign = this.ents.faceNormal(face).dot(want) >= 0 ? 1 : -1;
    const top = this.ents.pushPull(this.id, sign * this.api.length(distance));
    return top != null ? new FaceHandle(this.api, this.ents, top) : null;
  }
  material(name: string) {
    const face = this.ents.faces.get(this.id);
    if (face) {
      face.material = this.api.ensureMaterial(name);
    }
    return this;
  }
  backMaterial(name: string) {
    const face = this.ents.faces.get(this.id);
    if (face) {
      face.backMaterial = this.api.ensureMaterial(name);
    }
    return this;
  }
  reverse() {
    const face = this.ents.faces.get(this.id);
    if (face) {
      this.ents.reverseFace(face);
    }
    return this;
  }
  offset(distance: number | string) {
    const face = this.ents.faces.get(this.id);
    if (!face) {
      return this;
    }
    this.api.offsetFace(this.ents, this.id, this.api.length(distance));
    return this;
  }
  followMe(path: Pt[], closed = false) {
    this.ents.followMe(
      this.id,
      path.map((point) => toVec(point)),
      closed,
    );
    return this;
  }
  ref(): EntityRef {
    return { kind: 'face', id: this.id };
  }
}

/** Handle to a group/component instance. */
export class GroupHandle {
  constructor(
    private api: ScriptBase,
    public parent: Entities,
    public inst: Instance,
  ) {}
  get name() {
    return this.inst.name || this.inst.definition.name;
  }
  get entities() {
    return this.inst.definition.entities;
  }
  move(vector: Pt) {
    const delta = toVec(vector);
    this.inst.matrix.premultiply(new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z));
    return this;
  }
  moveTo(point: Pt) {
    const target = toVec(point);
    const elements = this.inst.matrix.elements;
    elements[12] = target.x;
    elements[13] = target.y;
    elements[14] = target.z;
    return this;
  }
  rotate(deg: number, axisSpec: string | Pt = 'z', center?: Pt) {
    const pivot = center ? toVec(center) : new THREE.Vector3().setFromMatrixPosition(this.inst.matrix);
    const matrix = new THREE.Matrix4()
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis(axisSpec), (deg * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    this.inst.matrix.premultiply(matrix);
    return this;
  }
  scale(factor: number | Pt, center?: Pt) {
    const scaleVec = typeof factor === 'number' ? new THREE.Vector3(factor, factor, factor) : toVec(factor);
    const pivot = center ? toVec(center) : new THREE.Vector3().setFromMatrixPosition(this.inst.matrix);
    const matrix = new THREE.Matrix4()
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeScale(scaleVec.x, scaleVec.y, scaleVec.z))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    this.inst.matrix.premultiply(matrix);
    return this;
  }
  material(name: string) {
    this.inst.material = this.api.ensureMaterial(name);
    return this;
  }
  tag(name: string) {
    this.inst.tag = this.api.ensureTag(name);
    return this;
  }
  hide() {
    this.inst.hidden = true;
    return this;
  }
  copy(offset?: Pt): GroupHandle {
    const def = this.inst.definition.isComponent ? this.inst.definition : this.api.editor.model.cloneDefinition(this.inst.definition);
    const instance = copyInstanceDetails(this.inst, this.parent.addInstance(def, this.inst.matrix.clone(), this.inst.name));
    const handle = new GroupHandle(this.api, this.parent, instance);
    if (offset) {
      handle.move(offset);
    }
    return handle;
  }
  explode() {
    const refs = this.parent.merge(this.inst.definition.entities, this.inst.matrix, this.api.editor.model, this.inst.material);
    this.parent.instances.delete(this.inst.id);
    return refs.length;
  }
  ref(): EntityRef {
    return { kind: 'instance', id: this.inst.id };
  }
}
