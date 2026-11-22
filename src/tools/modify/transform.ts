// Live transforms of the selection, and what the transforming tools share: moves in the open context, copies, nudging.
import * as THREE from 'three';
import type { Editor } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import type { EntityRef, Entities } from '../../core/model';
import { AXES } from '../../engine/inference';
import { gridLevels } from '../../engine/gridView';
import { parseArray } from '../../core/units';

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

/** A move by `delta` (model coordinates) starting at `from`, as a matrix in the open group's coordinates. */
export const localTranslation = (editor: Editor, from: V3, delta: V3) => {
  const local = editor.toLocal(from.clone().add(delta)).sub(editor.toLocal(from));
  return new THREE.Matrix4().makeTranslation(local.x, local.y, local.z);
};

/**
 * `*5` or `/5` typed right after a copy with Move or Rotate: the copy is undone and becomes an array in one undo step.
 * `matrixAt(factor)` is the transform the copy had, times `factor`: 1, 2, 3 … for `*`, 1/5, 2/5 … for `/`.
 * False when the text is no array.
 */
export const arrayFromCopy = (
  editor: Editor,
  text: string,
  orig: EntityRef[],
  labels: { multiply: string; divide: string },
  matrixAt: (factor: number) => THREE.Matrix4,
) => {
  const array = parseArray(text);
  if (!array || array.count < 1) {
    return false;
  }
  editor.undo();
  editor.commit(array.kind === 'multiply' ? labels.multiply : labels.divide, () => {
    const all: EntityRef[] = [];
    for (let i = 1; i <= array.count; i++) {
      const refs = editor.entities.copy(orig, matrixAt(array.kind === 'multiply' ? i : i / array.count), editor.model);
      editor.entities.weld(editor.entities.collectVertices(refs));
      all.push(...refs);
    }
    editor.select(all);
  });
  return true;
};

/** the "+" next to the cursor while a tool copies (Ctrl) */
export const drawCopyMark = (editor: Editor, overlay: Overlay) => {
  const context = overlay.context;
  context.font = 'bold 14px sans-serif';
  context.fillStyle = '#000';
  context.fillText('+', editor.mouse.x + 12, editor.mouse.y - 6);
};

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
    live.apply(localTranslation(editor, center, delta));
    live.finish();
  });
  editor.setVcb(editor.fmt(step));
  editor.invalidate();
  return true;
};
