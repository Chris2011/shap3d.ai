// How the gumball looks: coloured arrows, squares and arcs, the orange dot, and the pulled face while it is dragged.
import type * as THREE from 'three';
import type { Editor } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import { AXIS_COLOR } from '../../engine/inference';
import { type GumballHandle, type GumballLayout, shaftStart } from './gumballLayout';

type V3 = THREE.Vector3;

const EXTRUDE_COLOR = '#e07000';

/** a filled square, circle or arrowhead (pointing away from `from`) on screen */
const mark = (overlay: Overlay, at: V3, color: string, half: number, shape: 'arrow' | 'square' | 'circle', from?: V3) => {
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
    const base = from ? overlay.screen(from) : null;
    const angle = base ? Math.atan2(screenPos.y - base.y, screenPos.x - base.x) : 0;
    const corner = (turn: number, length: number) => ({
      x: screenPos.x + Math.cos(angle + turn) * length,
      y: screenPos.y + Math.sin(angle + turn) * length,
    });
    const [tip, left, right] = [corner(0, half * 2), corner(Math.PI / 2, half), corner(-Math.PI / 2, half)];
    context.moveTo(tip.x, tip.y);
    context.lineTo(left.x, left.y);
    context.lineTo(right.x, right.y);
  }
  context.fill();
};

/** all handles; `active` (hot or dragged) is drawn bolder */
export const drawGumball = (overlay: Overlay, layout: GumballLayout, active: GumballHandle | null) => {
  for (const handle of layout.handles) {
    const color = handle.axis ? AXIS_COLOR[handle.axis] : EXTRUDE_COLOR;
    const bold = handle === active;
    const tip = handle.points[0];
    if (handle.kind === 'move') {
      overlay.line(shaftStart(layout, handle), tip, color, bold ? 3 : 1.6);
      mark(overlay, tip, color, bold ? 6 : 4, 'arrow', layout.center);
    } else if (handle.kind === 'scale') {
      mark(overlay, tip, color, bold ? 5 : 3.5, 'square');
    } else if (handle.kind === 'rotate') {
      overlay.polyline(handle.points, color, bold ? 3 : 1.6);
    } else {
      overlay.line(layout.center, tip, color, 1, [3, 3]);
      mark(overlay, tip, color, bold ? 6 : 4.5, 'circle');
    }
  }
};

/** the face's outline moved by `offset` (model coordinates), joined to where it is now */
export const drawPulledFace = (editor: Editor, overlay: Overlay, faceId: number, offset: V3) => {
  const face = editor.entities.faces.get(faceId);
  if (!face) {
    return;
  }
  for (const loop of editor.entities.loops(face)) {
    const base = loop.map((vertex) => editor.toWorld(editor.entities.positionOf(vertex)));
    const top = base.map((point) => point.clone().add(offset));
    overlay.fillPolygon(top, 'rgba(90,120,255,0.18)');
    overlay.polyline(top, '#000', 1.2, true);
    base.forEach((point, i) => overlay.line(point, top[i], '#000', 1));
  }
};
