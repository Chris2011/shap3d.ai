import type { Overlay } from '../../../src/engine/overlay';
import { applyWallView, findRoom, findRooms } from './room';
import { usePlannerState } from './state';
import { drawMeasure } from './tool';

/**
 * The rooms measured in the viewport: the inner length of every wall (curved ones along their chord) and the
 * openings with their widths – drawn on the floor that is worked on while "Show measures" is on. Also keeps the
 * walls in step with the camera.
 */
export const drawRoomMeasures = (overlay: Overlay) => {
  const rooms = findRooms();
  const state = usePlannerState();
  if (!rooms.length) {
    return;
  }
  // the walls follow the camera (the overlay is drawn after every view change)
  const active = findRoom();
  applyWallView(state.walls, state.level > 0 || (active?.levels.length ?? 1) === 1);
  if (!state.showMeasures) {
    return;
  }
  for (const room of rooms) {
    const level = Math.min(state.level, room.levels.length - 1);
    const z = room.levels[level].z;
    const point = (wall: (typeof room.edges)[number], along: number, inset: number): [number, number] => [
      wall.a[0] + wall.dir[0] * along - wall.normal[0] * inset,
      wall.a[1] + wall.dir[1] * along - wall.normal[1] * inset,
    ];
    const colour = room.id === active?.id ? '#475467' : '#98a2b3';
    for (const wall of room.edges) {
      drawMeasure(overlay, { from: point(wall, 0, 0.12), to: point(wall, wall.length, 0.12), length: wall.length }, z, colour);
    }
    for (const opening of room.data.openings) {
      const wall = room.edges[typeof opening.wall === 'number' ? opening.wall : 0];
      if (!wall || Math.abs(wall.bulge) >= 0.01 || (opening.level ?? 0) !== level) {
        continue;
      }
      const end = Math.min(opening.offset + opening.width, wall.length);
      drawMeasure(
        overlay,
        { from: point(wall, opening.offset, 0.3), to: point(wall, end, 0.3), length: end - opening.offset },
        z,
        '#7a5af8',
      );
    }
  }
};
