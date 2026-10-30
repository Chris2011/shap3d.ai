import type { Editor, PEvt } from '../../../src/engine/editor';
import type { Overlay } from '../../../src/engine/overlay';
import { pieceRects, type BlockPiece } from '@shap3d/procgen';
import { blockoutData, runBlock } from './blockout';
import { BLOCK_TOOL_ID } from './names';
import { intoLevelMode, pluginContext, t, THREE } from './runtime';
import { useLevelState } from './state';

/**
 * The block tool: draws blockout pieces on the grid at the chosen floor height. A room or stairs: press, drag and
 * release (or click twice) for its rectangle – stairs go up the way the drag went. A corridor: click its start and its
 * end; it bends once when they are not in line (Shift: along y first). Esc stops.
 */

type Point = [number, number];

export const createBlockTool = (editor: Editor) => {
  const context = pluginContext();
  const state = useLevelState();
  const Base = context.classes.Tool;

  return new (class BlockTool extends Base {
    id = BLOCK_TOOL_ID;
    name = 'level.blockout.tool';
    cursor = 'crosshair';
    private start: Point | null = null;
    private end: Point | null = null;
    private pointer: Point | null = null;
    private bendY = false;

    status() {
      const kind = t(`level.blockout.kinds.${state.block.kind}`);
      return this.start ? t('level.blockout.statusSecond', { kind }) : t('level.blockout.statusFirst', { kind });
    }

    activate() {
      intoLevelMode(BLOCK_TOOL_ID, () => () => undefined);
    }

    deactivate() {
      this.cancel();
    }

    /** the pointer on the floor plane, on the grid */
    private gridPoint(event: PEvt): Point | null {
      const cell = blockoutData().cell;
      const ray = editor.viewer.rig.ray(editor.viewer.ndc(event.x, event.y));
      const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -state.block.floor), new THREE.Vector3());
      if (!hit) {
        return null;
      }
      // corridors run along cell middles (their width covers whole cells), rooms and stairs start on cell corners
      const corridor = state.block.kind === 'corridor' && Math.round(state.block.width / cell) % 2 === 1;
      const snap = (value: number) => (corridor ? (Math.floor(value / cell) + 0.5) * cell : Math.round(value / cell) * cell);
      return [snap(hit.x), snap(hit.y)];
    }

    /** the piece the two points make */
    private piece(): BlockPiece | null {
      const [a, b] = [this.start, this.end ?? this.pointer];
      if (!a || !b) {
        return null;
      }
      const { floor, height, ceiling, width, rise } = state.block;
      if (state.block.kind === 'corridor') {
        return { kind: 'corridor', from: a, to: b, width, floor, height, ceiling, bend: this.bendY ? 'y' : 'x' };
      }
      const rect = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), depth: Math.abs(b[1] - a[1]) };
      if (!rect.width || !rect.depth) {
        return null;
      }
      if (state.block.kind === 'stairs') {
        // up the way the drag went, along its longer side
        const direction = rect.width >= rect.depth ? (b[0] >= a[0] ? '+x' : '-x') : b[1] >= a[1] ? '+y' : '-y';
        return { kind: 'stairs', ...rect, floor, height, ceiling, rise, direction };
      }
      return { kind: 'room', ...rect, floor, height, ceiling };
    }

    onMove(event: PEvt) {
      this.pointer = this.gridPoint(event);
      this.bendY = event.shift;
      editor.redraw();
    }

    onDown(event: PEvt) {
      if (event.button !== 0) {
        return;
      }
      const at = this.gridPoint(event);
      if (!at) {
        return;
      }
      if (!this.start) {
        this.start = at;
        return;
      }
      this.end = at;
      this.finish();
    }

    onUp(event: PEvt) {
      // a drag for rooms and stairs: released elsewhere than pressed finishes the piece
      const at = this.gridPoint(event);
      if (state.block.kind !== 'corridor' && this.start && at && (at[0] !== this.start[0] || at[1] !== this.start[1])) {
        this.end = at;
        this.finish();
      }
    }

    private finish() {
      const piece = this.piece();
      this.start = null;
      this.end = null;
      if (!piece) {
        editor.redraw();
        return;
      }
      const { kind, ...options } = piece;
      if (runBlock(`s3d.levelBlock(${JSON.stringify(kind)}, ${JSON.stringify(options)});`)) {
        state.revision++;
      }
    }

    cancel() {
      this.start = null;
      this.end = null;
      editor.redraw();
    }

    busy() {
      return !!this.start;
    }

    draw(overlay: Overlay) {
      const colour = '#1971c2';
      const z = state.block.floor + 0.01;
      if (this.pointer && !this.start) {
        // where the next corner goes
        const [x, y] = this.pointer;
        overlay.line(new THREE.Vector3(x - 0.3, y, z), new THREE.Vector3(x + 0.3, y, z), colour, 2);
        overlay.line(new THREE.Vector3(x, y - 0.3, z), new THREE.Vector3(x, y + 0.3, z), colour, 2);
      }
      const piece = this.piece();
      if (!piece) {
        return;
      }
      const top = z + piece.height + (piece.kind === 'stairs' ? piece.rise : 0);
      for (const [x0, y0, x1, y1] of pieceRects(piece)) {
        const ring = (level: number) => [
          new THREE.Vector3(x0, y0, level),
          new THREE.Vector3(x1, y0, level),
          new THREE.Vector3(x1, y1, level),
          new THREE.Vector3(x0, y1, level),
        ];
        overlay.fillPolygon(ring(z), `${colour}33`);
        overlay.polyline(ring(z), colour, 2, true);
        overlay.polyline(ring(top), colour, 1, true);
        ring(z).forEach((corner, index) => overlay.line(corner, ring(top)[index], colour, 1));
      }
      const [x0, y0, x1, y1] = pieceRects(piece)[0];
      const size = piece.kind === 'corridor' ? `${round(piece.width)} m` : `${round(x1 - x0)} × ${round(y1 - y0)} m`; // i18n-ignore – unit symbol
      overlay.text(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, z), `${t(`level.blockout.kinds.${piece.kind}`)} ${size}`, {
        color: '#fff',
        background: colour,
      });
    }
  })(editor);
};

const round = (value: number) => (Math.round(value * 100) / 100).toString();
