// The gumball at the selection (like Rhino's): arrows move, arcs turn, squares scale, the orange dot pulls one face –
// dragged right in the Select tool, without switching tools. Off unless switched on (View › Gumball).
import * as THREE from 'three';
import { useLocalStorage } from '@vueuse/core';
import type { Editor, PEvt } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import { AXES, AXIS_COLOR } from '../../engine/inference';
import { aboutPoint } from '../../core/geometry';
import { LiveTransform, localTranslation } from './transform';
import type { RotateTool } from './rotate';

type V3 = THREE.Vector3;
type Pointer = { x: number; y: number };
type Axis = 'x' | 'y' | 'z';

export const gumballOn = useLocalStorage('s3d.gumball', false);

interface Handle {
  kind: 'move' | 'scale' | 'rotate' | 'extrude';
  axis: Axis | null;
  direction: V3;
  /** where it is grabbed: the tip, the square, the arc's points or the dot */
  points: V3[];
}
interface Layout {
  center: V3;
  size: number;
  handles: Handle[];
  face: number | null;
}
interface Drag {
  handle: Handle;
  layout: Layout;
  /** where the cursor was along the handle's line when it was grabbed */
  from: number;
  value: number;
  live: LiveTransform | null;
}

const ARROW_PX = 90;
const HIT_PX = 7;
const EXTRUDE_COLOR = '#e07000';

/** the one selected face, if exactly one is selected */
const singleFace = (editor: Editor) => {
  const selection = editor.selected();
  return selection.length === 1 && selection[0].kind === 'face' ? editor.entities.faces.get(selection[0].id) : undefined;
};

/** the handles around the selection's centre, sized to stay the same on screen */
const layoutOf = (editor: Editor): Layout | null => {
  const refs = editor.selected();
  if (!refs.length) {
    return null;
  }
  const box = editor.entities.refBounds(refs);
  if (box.isEmpty()) {
    return null;
  }
  const center = editor.toWorld(box.getCenter(new THREE.Vector3()));
  const size = editor.viewer.worldPerPixel(center) * ARROW_PX;
  const handles: Handle[] = [];
  const axes: Axis[] = ['x', 'y', 'z'];
  for (const axis of axes) {
    const direction = AXES[axis].clone();
    handles.push({ kind: 'scale', axis, direction, points: [center.clone().addScaledVector(direction, size * 0.6)] });
    handles.push({ kind: 'move', axis, direction, points: [center.clone().addScaledVector(direction, size)] });
    // a quarter circle between the two other axes
    const [first, second] = axes.filter((other) => other !== axis).map((other) => AXES[other]);
    const arc: V3[] = [];
    for (let step = 0; step <= 12; step++) {
      const angle = 0.15 + ((Math.PI / 2 - 0.3) * step) / 12;
      arc.push(
        center
          .clone()
          .addScaledVector(first, Math.cos(angle) * size * 0.75)
          .addScaledVector(second, Math.sin(angle) * size * 0.75),
      );
    }
    handles.push({ kind: 'rotate', axis, direction, points: arc });
  }
  const face = singleFace(editor);
  if (face) {
    const normal = editor.entities.faceNormal(face).transformDirection(editor.contextMatrix);
    handles.push({ kind: 'extrude', axis: null, direction: normal, points: [center.clone().addScaledVector(normal, size * 1.3)] });
  }
  return { center, size, handles, face: face?.id ?? null };
};

/** pixels from the pointer to the segment between two points on screen */
const screenDistance = (editor: Editor, pointer: Pointer, start: V3, end: V3) => {
  const from = editor.viewer.project(start),
    to = editor.viewer.project(end);
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  const along = lengthSq > 1e-9 ? Math.max(0, Math.min(1, ((pointer.x - from.x) * dx + (pointer.y - from.y) * dy) / lengthSq)) : 0;
  return Math.hypot(from.x + dx * along - pointer.x, from.y + dy * along - pointer.y);
};

/** how far along the line through `center` in `direction` the cursor's ray passes closest; null when they run parallel */
const alongLine = (editor: Editor, pointer: Pointer, center: V3, direction: V3) => {
  const ray = editor.viewer.ray(pointer.x, pointer.y);
  const offset = ray.origin.clone().sub(center);
  const cross = direction.dot(ray.direction);
  const den = 1 - cross * cross;
  if (den < 1e-6) {
    return null;
  }
  return (direction.dot(offset) - cross * ray.direction.dot(offset)) / den;
};

/** stretching by `factor` along `direction` (unit) */
const stretch = (direction: V3, factor: number) => {
  const [x, y, z] = direction.toArray();
  const k = factor - 1;
  return new THREE.Matrix4().set(
    1 + k * x * x,
    k * x * y,
    k * x * z,
    0,
    k * y * x,
    1 + k * y * y,
    k * y * z,
    0,
    k * z * x,
    k * z * y,
    1 + k * z * z,
    0,
    0,
    0,
    0,
    1,
  );
};

export class Gumball {
  layout: Layout | null = null;
  hot: Handle | null = null;
  drag: Drag | null = null;

  /** finds the handle under the cursor; squares and the dot before the arrows they sit on */
  update(editor: Editor, pointer: Pointer) {
    this.layout = gumballOn.value ? layoutOf(editor) : null;
    this.hot = null;
    if (!this.layout) {
      return;
    }
    const { center, size } = this.layout;
    const order = ['scale', 'extrude', 'move', 'rotate'];
    const handles = [...this.layout.handles].sort((left, right) => order.indexOf(left.kind) - order.indexOf(right.kind));
    for (const handle of handles) {
      const hit =
        handle.kind === 'move'
          ? screenDistance(editor, pointer, center.clone().addScaledVector(handle.direction, size * 0.2), handle.points[0])
          : Math.min(...handle.points.map((point, i) => screenDistance(editor, pointer, point, handle.points[i + 1] ?? point)));
      if (hit < HIT_PX) {
        this.hot = handle;
        return;
      }
    }
  }

  /** grabs the hot handle; true when it took the click */
  start(editor: Editor, pointer: PEvt) {
    const handle = this.hot;
    const layout = this.layout;
    if (!handle || !layout) {
      return false;
    }
    if (handle.kind === 'rotate') {
      // Rotate takes over with its protractor, snaps and typed angles, and comes back to Select
      const nearest = handle.points.reduce((best, point) =>
        screenDistance(editor, pointer, point, point) < screenDistance(editor, pointer, best, best) ? point : best,
      );
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
      drag.live!.apply(
        editor.contextInverse.multiply(aboutPoint(layout.center, stretch(handle.direction, factor))).multiply(editor.contextMatrix),
      );
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
    const unchanged = drag.handle.kind === 'scale' ? Math.abs(drag.value - 1) < 1e-9 : Math.abs(drag.value) < 1e-9;
    if (drag.live) {
      if (unchanged) {
        editor.abortOp();
      } else {
        drag.live.finish();
        editor.endOp();
      }
    } else if (!unchanged && drag.layout.face !== null) {
      const faceId = drag.layout.face;
      const local = this.localDistance(editor, faceId, drag);
      editor.commit('tools.pushpull', () => editor.entities.pushPull(faceId, local));
    }
    editor.invalidate();
  }

  /** the pulled distance along the face's own normal in the open group */
  private localDistance(editor: Editor, faceId: number, drag: Drag) {
    const face = editor.entities.faces.get(faceId)!;
    const start = drag.layout.center;
    const end = start.clone().addScaledVector(drag.handle.direction, drag.value);
    return editor.toLocal(end).sub(editor.toLocal(start)).dot(editor.entities.faceNormal(face));
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
    const { center, size } = layout;
    const active = this.drag?.handle ?? this.hot;
    for (const handle of layout.handles) {
      const color = handle.axis ? AXIS_COLOR[handle.axis] : EXTRUDE_COLOR;
      const width = handle === active ? 3 : 1.6;
      if (handle.kind === 'move') {
        overlay.line(center.clone().addScaledVector(handle.direction, size * 0.2), handle.points[0], color, width);
        this.dot(overlay, handle.points[0], color, handle === active ? 6 : 4, 'arrow', center);
      } else if (handle.kind === 'scale') {
        this.dot(overlay, handle.points[0], color, handle === active ? 5 : 3.5, 'square');
      } else if (handle.kind === 'rotate') {
        overlay.polyline(handle.points, color, width);
      } else {
        overlay.line(center, handle.points[0], color, 1, [3, 3]);
        this.dot(overlay, handle.points[0], color, handle === active ? 6 : 4.5, 'circle');
      }
    }
    this.drawExtrude(editor, overlay);
  }

  /** the pulled face's outline at its new height while the dot is dragged */
  private drawExtrude(editor: Editor, overlay: Overlay) {
    const drag = this.drag;
    if (drag?.handle.kind !== 'extrude' || drag.layout.face === null) {
      return;
    }
    const face = editor.entities.faces.get(drag.layout.face);
    if (!face) {
      return;
    }
    const offset = drag.handle.direction.clone().multiplyScalar(drag.value);
    for (const loop of editor.entities.loops(face)) {
      const base = loop.map((vertex) => editor.toWorld(editor.entities.positionOf(vertex)));
      const top = base.map((point) => point.clone().add(offset));
      overlay.fillPolygon(top, 'rgba(90,120,255,0.18)');
      overlay.polyline(top, '#000', 1.2, true);
      base.forEach((point, i) => overlay.line(point, top[i], '#000', 1));
    }
  }

  private dot(overlay: Overlay, at: V3, color: string, half: number, shape: 'arrow' | 'square' | 'circle', from?: V3) {
    const screenPos = overlay.screen(at);
    if (!screenPos) {
      return;
    }
    const context = overlay.context;
    context.fillStyle = color;
    context.beginPath();
    if (shape === 'square') {
      context.rect(screenPos.x - half, screenPos.y - half, half * 2, half * 2);
    } else if (shape === 'circle') {
      context.arc(screenPos.x, screenPos.y, half, 0, Math.PI * 2);
    } else {
      // a triangle pointing away from the centre
      const base = from ? overlay.screen(from) : null;
      const angle = base ? Math.atan2(screenPos.y - base.y, screenPos.x - base.x) : 0;
      const tip = { x: screenPos.x + Math.cos(angle) * half * 2, y: screenPos.y + Math.sin(angle) * half * 2 };
      context.moveTo(tip.x, tip.y);
      context.lineTo(screenPos.x + Math.cos(angle + Math.PI / 2) * half, screenPos.y + Math.sin(angle + Math.PI / 2) * half);
      context.lineTo(screenPos.x + Math.cos(angle - Math.PI / 2) * half, screenPos.y + Math.sin(angle - Math.PI / 2) * half);
    }
    context.fill();
  }
}
