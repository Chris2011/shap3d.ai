import * as THREE from 'three';
import type { EntityRef, Instance } from '../../core/model';
import { EditorBase } from './editorBase';

/** The open group (editing context): entering and leaving it, and from its coordinates to the model's. */
export abstract class EditorContext extends EditorBase {
  /** from the open group's coordinates to the model's – where the view shows it (a plugin's display place), so picks match */
  get contextMatrix(): THREE.Matrix4 {
    const matrix = new THREE.Matrix4();
    for (const instance of this.activePath) {
      matrix.multiply(this.viewer.shownMatrix(instance));
    }
    return matrix;
  }
  get contextInverse(): THREE.Matrix4 {
    return this.contextMatrix.invert();
  }
  toLocal(point: THREE.Vector3) {
    return point.clone().applyMatrix4(this.contextInverse);
  }
  toWorld(point: THREE.Vector3) {
    return point.clone().applyMatrix4(this.contextMatrix);
  }
  dirToLocal(direction: THREE.Vector3) {
    return direction.clone().transformDirection(this.contextInverse);
  }

  setContext(path: Instance[]) {
    this.activePath = path;
    this.clearSelection();
    this.updateContextName();
    this.invalidate();
  }
  enterInstance(inst: Instance) {
    this.activePath = [...this.activePath, inst];
    this.clearSelection();
    this.updateContextName();
    this.invalidate();
  }
  exitContext(all = false) {
    if (!this.activePath.length) {
      return;
    }
    const left = this.activePath[this.activePath.length - 1];
    this.activePath = all ? [] : this.activePath.slice(0, -1);
    this.clearSelection();
    if (!all) {
      this.select([{ kind: 'instance', id: left.id }]);
    }
    this.updateContextName();
    this.invalidate();
  }
  protected updateContextName() {
    this.ui.contextName = this.activePath.map((instance) => instance.name || instance.definition.name).join(' › ');
  }

  /** Returns whether a pick context lies inside the active editing context. */
  inContext(path: Instance[]) {
    if (path.length < this.activePath.length) {
      return false;
    }
    return this.activePath.every((instance, i) => path[i] === instance);
  }

  /** Map a pick (face/edge/vertex hit in any nested entities) to a selectable ref in the active context. */
  refFromPick(path: Instance[], kind: 'face' | 'edge', id: number): EntityRef | null {
    if (!this.inContext(path)) {
      return null;
    }
    if (path.length === this.activePath.length) {
      return { kind, id };
    }
    return { kind: 'instance', id: path[this.activePath.length].id };
  }
}
