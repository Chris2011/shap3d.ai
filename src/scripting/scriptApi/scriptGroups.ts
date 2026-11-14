import * as THREE from 'three';
import type { Definition } from '../../core/model';
import { AXIS_VECTORS, toVec, type Pt } from '../points';
import { GroupHandle } from '../handles';
import { ScriptBase } from './scriptBase';

/**
 * Groups and components: build into a new definition – and clear the model.
 */
export class ScriptGroups extends ScriptBase {
  /** Create a group; geometry created inside `fn` goes into the group. */
  group(name: string, build: (s3d: this) => void): GroupHandle {
    const model = this.editor.model;
    const def = model.newDefinition(name, false);
    const parent = this.ents;
    const inst = parent.addInstance(def, new THREE.Matrix4(), name);
    this.stack.push(def.entities);
    try {
      build(this);
    } finally {
      this.stack.pop();
    }
    return new GroupHandle(this, parent, inst);
  }
  /** Create a component definition (reusable); returns a function to place instances. */
  component(
    name: string,
    build: (s3d: this) => void,
  ): { def: Definition; place: (position?: Pt, rotDeg?: number, scale?: number) => GroupHandle } {
    const def = this.editor.model.newDefinition(name, true);
    this.stack.push(def.entities);
    try {
      build(this);
    } finally {
      this.stack.pop();
    }
    const place = (position?: Pt, rotDeg = 0, scale = 1) => {
      const point = toVec(position);
      const matrix = new THREE.Matrix4().compose(
        point,
        new THREE.Quaternion().setFromAxisAngle(AXIS_VECTORS.z, (rotDeg * Math.PI) / 180),
        new THREE.Vector3(scale, scale, scale),
      );
      return new GroupHandle(this, this.ents, this.ents.addInstance(def, matrix, ''));
    };
    return { def, place };
  }
  // ---------------- geometry ----------------
  clear() {
    const entities = this.ents;
    for (const id of [...entities.instances.keys()]) {
      entities.instances.delete(id);
    }
    for (const id of [...entities.faces.keys()]) {
      entities.removeFace(id);
    }
    for (const editor of [...entities.edges.values()]) {
      entities.eraseEdge(editor.id, false);
    }
    entities.removeOrphanVertices();
    if (this.stack.length === 1 && !this.editor.activePath.length) {
      this.editor.model.guides = [];
      this.editor.model.dimensions = [];
      this.editor.model.labels = [];
      this.editor.model.sections = [];
    }
  }
}
