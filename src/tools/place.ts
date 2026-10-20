import * as THREE from 'three';
import type { PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import { PointTool } from './base';
import type { Definition } from '../core/model';
import { t } from '../i18n';

/** Places a component definition at the clicked point (used by the component browser and the 3D-text plugin). */
export class PlaceTool extends PointTool {
  id = 'place';
  name = 'tools.place';
  cursor = 'crosshair';
  definition: Definition | null = null;
  box = new THREE.Box3();
  orient: 'auto' | 'flat' = 'auto';
  rotation = 0;
  material?: string;
  status() {
    return this.definition ? t('tools.status.place', { name: this.definition.name }) : t('tools.status.placeNothing');
  }
  start(def: Definition, material?: string) {
    this.definition = def;
    this.material = material;
    this.box = def.entities.bounds(new THREE.Box3());
    this.rotation = 0;
    this.editor.setTool(this.id);
  }
  onKey(keyEvent: KeyboardEvent, isDown: boolean) {
    if (isDown && (keyEvent.key === 'ArrowLeft' || keyEvent.key === 'ArrowRight')) {
      this.rotation += keyEvent.key === 'ArrowLeft' ? 90 : -90;
      return true;
    }
    return false;
  }
  matrixAt(): THREE.Matrix4 {
    const inference = this.inference;
    const point = inference?.point.clone() ?? new THREE.Vector3();
    const matrix = new THREE.Matrix4().makeTranslation(point.x, point.y, point.z);
    // glue to faces: align component Z with the face normal
    if (inference?.face && inference.kind === 'face') {
      const normal = inference.face.normal.clone().normalize();
      if (Math.abs(normal.z) < 0.999) {
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        // for upright text on walls: rotate so local -Y faces outwards
        matrix.multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
      } else if (normal.z < 0) {
        matrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
      }
    }
    matrix.multiply(new THREE.Matrix4().makeRotationZ((this.rotation * Math.PI) / 180));
    return this.editor.contextInverse.multiply(matrix);
  }
  onMove(pointer: PEvt) {
    this.pick(pointer, null);
  }
  onDown(pointer: PEvt) {
    if (!this.definition) {
      return;
    }
    this.pick(pointer, null);
    const editor = this.editor;
    const def = this.definition;
    const matrix = this.matrixAt();
    const mat = this.material;
    editor.commit('tools.place', () => {
      const instance = editor.entities.addInstance(def, matrix, '');
      if (mat) {
        instance.material = mat;
      }
      editor.select([{ kind: 'instance', id: instance.id }]);
    });
    this.definition = null;
    editor.setTool('select');
  }
  cancel() {
    if (this.definition) {
      this.editor.model.purge();
    }
    this.definition = null;
  }
  draw(overlay: Overlay) {
    if (!this.definition || this.box.isEmpty()) {
      this.drawInference(overlay);
      return;
    }
    const matrix = this.editor.contextMatrix.multiply(this.matrixAt());
    const box = this.box;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
      new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(matrix),
    );
    for (const [i, j] of [
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
    ]) {
      overlay.line(corners[i], corners[j], '#1d4ed8', 1.2);
    }
    // draw the definition's edges as preview
    const entities = this.definition.entities;
    let count = 0;
    for (const edge of entities.edges.values()) {
      if (count++ > 3000) {
        break;
      }
      if (edge.soft) {
        continue;
      }
      overlay.line(
        entities.positionOf(edge.start).clone().applyMatrix4(matrix),
        entities.positionOf(edge.end).clone().applyMatrix4(matrix),
        '#333',
        1,
      );
    }
    this.drawInference(overlay, false);
  }
}
