// Guide lines and points (Tape Measure) under the cursor, and the selected one drawn highlighted – so they can be
// selected and deleted one by one like texts and dimensions.
import type { Guide } from '../core/document';
import { lineLineClosest } from '../core/geometry';
import type { Overlay } from './overlay';
import type { Viewer } from './viewer';

const PICK_PX = 5;
/** guide lines are drawn this far each way from their point (m), as in the viewer */
const REACH = 500;

/** the id of the guide under a screen point; null when none is near (or guides are hidden) */
export const guideAt = (viewer: Viewer, guides: Guide[], x: number, y: number): number | null => {
  const ray = viewer.ray(x, y);
  for (const guide of [...guides].reverse()) {
    if (guide.kind === 'point') {
      const screen = viewer.project(guide.point);
      if (screen.visible && Math.hypot(screen.x - x, screen.y - y) <= PICK_PX + 2) {
        return guide.id;
      }
      continue;
    }
    if (!guide.direction) {
      continue;
    }
    // where the cursor's ray passes the line closest – in front of the eye, within the drawn length
    const closest = lineLineClosest(ray.origin, ray.direction, guide.point, guide.direction.clone().normalize());
    if (!closest || closest.s <= 0 || Math.abs(closest.t) > REACH) {
      continue;
    }
    if (closest.c1.distanceTo(closest.c2) <= viewer.worldPerPixel(closest.c2) * PICK_PX) {
      return guide.id;
    }
  }
  return null;
};

/** the selected guide in the selection colour over its dashed line */
export const drawSelectedGuide = (overlay: Overlay, guides: Guide[], id: number | null) => {
  const guide = id === null ? undefined : guides.find((candidate) => candidate.id === id);
  if (!guide) {
    return;
  }
  if (guide.kind === 'point' || !guide.direction) {
    overlay.marker(guide.point, 'guide');
    const screen = overlay.screen(guide.point);
    if (screen) {
      overlay.context.strokeStyle = '#1d4ed8';
      overlay.context.lineWidth = 2;
      overlay.context.strokeRect(screen.x - 6, screen.y - 6, 12, 12);
    }
    return;
  }
  const direction = guide.direction.clone().normalize();
  overlay.line(guide.point.clone().addScaledVector(direction, -REACH), guide.point.clone().addScaledVector(direction, REACH), '#1d4ed8', 2);
};
