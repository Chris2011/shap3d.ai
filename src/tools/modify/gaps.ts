// The free space from what Move moves to its neighbours: measured, picked with Tab and drawn as dimensions.
import * as THREE from 'three';
import type { Editor } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import { LEN_EPS } from '../../core/geometry';

type V3 = THREE.Vector3;

/** the free space between what is moved and the nearest group or component on one side (world points) */
export interface Gap {
  /** which side: 'x+', 'x-', 'y+', 'y-' */
  side: string;
  from: V3;
  to: V3;
  length: number;
}

/**
 * The gaps from the moved selection to its nearest neighbour on each side along red and green: groups and components
 * of the open context whose box lies beside it (overlapping across and in height).
 * shortcut: boxes in the context's axes and lengths unscaled – off inside a scaled group; fine until someone moves there.
 */
export const neighbourGaps = (editor: Editor): Gap[] => {
  const refs = editor.selected();
  const moving = editor.entities.refBounds(refs);
  if (moving.isEmpty()) {
    return [];
  }
  const movedIds = new Set(refs.filter((entityRef) => entityRef.kind === 'instance').map((entityRef) => entityRef.id));
  const others = [...editor.entities.instances.values()]
    .filter((instance) => !movedIds.has(instance.id) && !instance.hidden)
    .map((instance) => editor.entities.refBounds([{ kind: 'instance', id: instance.id }]));
  const gaps: Gap[] = [];
  for (const axis of ['x', 'y'] as const) {
    const across = axis === 'x' ? 'y' : 'x';
    for (const sign of [1, -1]) {
      let nearest: THREE.Box3 | null = null;
      let length = Infinity;
      for (const box of others) {
        if (
          box.max[across] < moving.min[across] ||
          box.min[across] > moving.max[across] ||
          box.max.z < moving.min.z ||
          box.min.z > moving.max.z
        ) {
          continue;
        }
        const gap = sign > 0 ? box.min[axis] - moving.max[axis] : moving.min[axis] - box.max[axis];
        if (gap > LEN_EPS && gap < length) {
          length = gap;
          nearest = box;
        }
      }
      if (nearest) {
        // the dimension runs in the middle of the part where both boxes face each other
        const from = new THREE.Vector3();
        from[across] = (Math.max(nearest.min[across], moving.min[across]) + Math.min(nearest.max[across], moving.max[across])) / 2;
        from.z = (Math.max(nearest.min.z, moving.min.z) + Math.min(nearest.max.z, moving.max.z)) / 2;
        from[axis] = sign > 0 ? moving.max[axis] : moving.min[axis];
        const to = from.clone();
        to[axis] += sign * length;
        gaps.push({ side: axis + (sign > 0 ? '+' : '-'), from: editor.toWorld(from), to: editor.toWorld(to), length });
      }
    }
  }
  return gaps;
};

/** The gaps while Move runs: measured after every step, one of them picked with Tab, drawn as dimensions. */
export class GapPicker {
  gaps: Gap[] = [];
  side: string | null = null;
  get hot() {
    return this.gaps.find((gap) => gap.side === this.side) ?? null;
  }
  /** measures again; true when there were gaps before and now none, or the other way round */
  update(editor: Editor) {
    const had = this.gaps.length > 0;
    this.gaps = neighbourGaps(editor);
    return had !== this.gaps.length > 0;
  }
  clear() {
    this.gaps = [];
    this.side = null;
  }
  /** Tab: the next gap (Shift+Tab: the previous), then none again */
  next(back: boolean) {
    const index = this.gaps.findIndex((gap) => gap.side === this.side);
    const next = ((index + (back ? this.gaps.length + 1 : 2)) % (this.gaps.length + 1)) - 1;
    this.side = next < 0 ? null : this.gaps[next].side;
  }
  /** the offset that leaves this length to the picked neighbour, from the offset moved so far */
  deltaFor(length: number, delta: V3) {
    const gap = this.hot!;
    return delta.clone().addScaledVector(gap.to.clone().sub(gap.from).normalize(), gap.length - length);
  }
  draw(editor: Editor, overlay: Overlay) {
    for (const gap of this.gaps) {
      editor.drawDimension(overlay, gap.from, gap.to, new THREE.Vector3(), gap.side === this.side);
    }
  }
}
