// Flip, align and distribute the selection.
import * as THREE from 'three';
import type { Editor } from '../editor';
import type { EntityRef } from '../../core/model';
import { EPS, aboutPoint } from '../../core/geometry';
import { t } from '../../i18n';

export const flipSelection = (editor: Editor, axis: 'x' | 'y' | 'z') => {
  const refs = editor.selected();
  if (!refs.length) {
    return;
  }
  const box = editor.entities.refBounds(refs);
  const center = box.getCenter(new THREE.Vector3());
  const scale = new THREE.Vector3(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1);
  const matrix = aboutPoint(center, new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
  editor.commit('undo.flip', () => {
    const entities = editor.entities;
    entities.transform(refs, matrix);
    // mirrored faces must be reversed to keep their front side outside
    for (const entityRef of refs) {
      if (entityRef.kind === 'face') {
        const face = entities.faces.get(entityRef.id);
        if (face) {
          entities.reverseFace(face);
        }
      }
    }
  });
};
type Axis = 'x' | 'y' | 'z';
/** the selected groups and components with their bounds; locked ones stay where they are but still count as a reference */
const selectedObjects = (editor: Editor) =>
  editor
    .selected()
    .filter((entityRef) => entityRef.kind === 'instance')
    .map((entityRef) => ({ entityRef, instance: editor.entities.instances.get(entityRef.id), box: editor.entities.refBounds([entityRef]) }))
    .filter((object) => object.instance && !object.box.isEmpty());
const moveObject = (editor: Editor, entityRef: EntityRef, axis: Axis, distance: number) => {
  if (Math.abs(distance) > EPS) {
    const offset = new THREE.Vector3().setComponent('xyz'.indexOf(axis), distance);
    editor.entities.transform([entityRef], new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z));
  }
};

/** Lines up the selected groups and components along an axis: their start, centre or end on the selection's. */
export const alignSelection = (editor: Editor, axis: Axis, to: 'min' | 'center' | 'max') => {
  const objects = selectedObjects(editor);
  if (objects.length < 2) {
    editor.toast(t('toast.selectTwoObjects'));
    return;
  }
  const all = objects.reduce((box, object) => box.union(object.box), new THREE.Box3());
  const at = (box: THREE.Box3) => (to === 'min' ? box.min[axis] : to === 'max' ? box.max[axis] : (box.min[axis] + box.max[axis]) / 2);
  editor.commit('undo.align', () => {
    for (const object of objects) {
      if (!object.instance!.locked) {
        moveObject(editor, object.entityRef, axis, at(all) - at(object.box));
      }
    }
  });
};

/**
 * Where each piece starts so that the gaps between them are equal – the first and the last stay.
 * Pieces are [start, end] intervals in order along the axis.
 */
export const distributedStarts = (pieces: [number, number][]): number[] => {
  const span = pieces[pieces.length - 1][1] - pieces[0][0];
  const sizes = pieces.reduce((sum, [start, end]) => sum + end - start, 0);
  const gap = (span - sizes) / (pieces.length - 1);
  let next = pieces[0][0];
  return pieces.map(([start, end]) => {
    const placed = next;
    next += end - start + gap;
    return placed;
  });
};

/** Equal gaps between the selected groups and components along an axis; the outer two stay in place. */
export const distributeSelection = (editor: Editor, axis: Axis) => {
  const objects = selectedObjects(editor).sort((a, b) => a.box.min[axis] - b.box.min[axis]);
  if (objects.length < 3) {
    editor.toast(t('toast.selectThreeObjects'));
    return;
  }
  const starts = distributedStarts(objects.map((object) => [object.box.min[axis], object.box.max[axis]]));
  editor.commit('undo.distribute', () => {
    objects.forEach((object, index) => {
      if (!object.instance!.locked) {
        moveObject(editor, object.entityRef, axis, starts[index] - object.box.min[axis]);
      }
    });
  });
};
