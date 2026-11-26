// The gumball at the selection (like Rhino's): arrows move, arcs turn, squares scale, the orange dot pulls one face –
// dragged right in the Select tool, without switching tools. Off unless switched on (View › Gumball).
import type * as THREE from 'three';
import { useLocalStorage } from '@vueuse/core';
import type { Editor, PEvt } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import { aboutPoint } from '../../core/geometry';
import { LiveTransform, localTranslation } from './transform';
import type { RotateTool } from './rotate';
import { type GumballHandle, type GumballLayout, gumballLayout, shaftStart, screenDistance, alongLine, stretch } from './gumballLayout';
import { drawGumball, drawPulledFace } from './gumballDraw';

type Pointer = { x: number; y: number };

export const gumballOn = useLocalStorage('s3d.gumball', false);

interface Drag {
  handle: GumballHandle;
  layout: GumballLayout;
  /** where the cursor was along the handle's line when it was grabbed */
  from: number;
  /** the distance moved or pulled, or the scale factor */
  value: number;
  live: LiveTransform | null;
}

const HIT_PX = 7;
/** squares and the dot sit on or near the arrows, so they are tested first */
const HIT_ORDER = ['scale', 'extrude', 'move', 'rotate'];

export class Gumball {
  layout: GumballLayout | null = null;
  hot: GumballHandle | null = null;
  drag: Drag | null = null;

  /** the handles at the selection and the one under the cursor */
  update(editor: Editor, pointer: Pointer) {
    this.layout = gumballOn.value ? gumballLayout(editor) : null;
    this.hot = null;
    const layout = this.layout;
    if (!layout) {
      return;
    }
    const handles = [...layout.handles].sort((left, right) => HIT_ORDER.indexOf(left.kind) - HIT_ORDER.indexOf(right.kind));
    this.hot =
      handles.find((handle) => {
        const points = handle.kind === 'move' ? [shaftStart(layout, handle), handle.points[0]] : handle.points;
        return points.some((point, i) => screenDistance(editor, pointer, point, points[i + 1] ?? point) < HIT_PX);
      }) ?? null;
  }

  /** grabs the hot handle; true when it took the click */
  start(editor: Editor, pointer: PEvt) {
    const { hot: handle, layout } = this;
    if (!handle || !layout) {
      return false;
    }
    if (handle.kind === 'rotate') {
      // Rotate takes over with its protractor, snaps and typed angles, and comes back to Select
      const distance = (point: THREE.Vector3) => screenDistance(editor, pointer, point, point);
      const nearest = handle.points.reduce((best, point) => (distance(point) < distance(best) ? point : best));
      const rotate = editor.tools.get('rotate') as RotateTool | undefined;
      if (rotate) {
        editor.setTool('rotate');
        rotate.startAt({ world: nearest.clone(), center: layout.center.clone(), axis: handle.direction.clone() }, pointer, 'select');
      }
      return true;
    }
    const from = alongLine(editor, pointer, layout.center, handle.direction);
    if (from === null) {
      return true;
    }
    const live = handle.kind === 'extrude' ? null : new LiveTransform(editor.entities, editor.selected());
    if (live) {
      editor.beginOp(handle.kind === 'move' ? 'tools.move' : 'tools.scale');
    }
    this.drag = { handle, layout, from, value: handle.kind === 'scale' ? 1 : 0, live };
    return true;
  }

  move(editor: Editor, pointer: Pointer) {
    const drag = this.drag!;
    const { handle, layout } = drag;
    const along = alongLine(editor, pointer, layout.center, handle.direction);
    if (along === null) {
      return;
    }
    if (handle.kind === 'scale') {
      const factor = drag.from !== 0 ? along / drag.from : 1;
      if (Math.abs(factor) < 1e-3) {
        return;
      }
      drag.value = factor;
      const stretched = aboutPoint(layout.center, stretch(handle.direction, factor));
      drag.live!.apply(editor.contextInverse.multiply(stretched).multiply(editor.contextMatrix));
      editor.setVcb(factor.toFixed(3));
    } else {
      drag.value = along - drag.from;
      drag.live?.apply(localTranslation(editor, layout.center, handle.direction.clone().multiplyScalar(drag.value)));
      editor.setVcb(editor.fmt(Math.abs(drag.value)));
    }
    editor.invalidate();
  }

  /** letting go: one undo step, nothing when it did not move */
  finish(editor: Editor) {
    const drag = this.drag!;
    this.drag = null;
    const unchanged = Math.abs(drag.value - (drag.handle.kind === 'scale' ? 1 : 0)) < 1e-9;
    if (drag.live) {
      if (unchanged) {
        editor.abortOp();
      } else {
        drag.live.finish();
        editor.endOp();
      }
    } else if (!unchanged && drag.layout.face !== null) {
      const faceId = drag.layout.face;
      const face = editor.entities.faces.get(faceId)!;
      // the pulled distance along the face's own normal in the open group
      const start = drag.layout.center;
      const end = start.clone().addScaledVector(drag.handle.direction, drag.value);
      const local = editor.toLocal(end).sub(editor.toLocal(start)).dot(editor.entities.faceNormal(face));
      editor.commit('tools.pushpull', () => editor.entities.pushPull(faceId, local));
    }
    editor.invalidate();
  }

  cancel(editor: Editor) {
    if (this.drag?.live) {
      editor.abortOp();
    }
    this.drag = null;
    this.hot = null;
  }

  draw(editor: Editor, overlay: Overlay) {
    const layout = this.drag?.layout ?? this.layout;
    if (!layout) {
      return;
    }
    drawGumball(overlay, layout, this.drag?.handle ?? this.hot);
    const drag = this.drag;
    if (drag?.handle.kind === 'extrude' && layout.face !== null) {
      drawPulledFace(editor, overlay, layout.face, drag.handle.direction.clone().multiplyScalar(drag.value));
    }
  }
}
