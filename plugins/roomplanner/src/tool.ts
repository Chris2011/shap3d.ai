import type * as Three from 'three';
import type { Instance } from '../../../src/core/model';
import type { Editor, PEvt } from '../../../src/engine/editor';
import type { Overlay } from '../../../src/engine/overlay';
import { itemById } from './catalog';
import {
  baseHeight,
  describe,
  footprintOf,
  furnitureOf,
  levelOf,
  moveFurniture,
  placedFurniture,
  placementMatrix,
  placementOf,
  rotateFurniture,
  runPlace,
  selectFurniture,
  selectedFurniture,
  type Footprint,
  type FurnitureData,
} from './furniture';
import { findRoom, findRooms, roomAt } from './room';
import { pluginContext, t, THREE } from './runtime';
import { clearances, snapPlacement, type PlanLine, type SnapResult } from './snap';
import { usePlannerState } from './state';

/**
 * The planner tool in the 3D view: a piece from the catalog follows the pointer and is placed with a click;
 * placed pieces are picked up by dragging and put down again – both snapping to walls and other pieces.
 * R turns by 90° (Shift+R back), Alt moves freely, Esc stops. Orbiting and zooming stay as in the app.
 */

const COLOURS = { box: '#1d6fd8', collides: '#d92d20', guide: '#f08c00', measure: '#0f766e' };

interface Carry {
  instance: Instance;
  data: FurnitureData;
  original: Three.Matrix4;
  /** its rotation when it was picked up – kept unless a wall turns it */
  rotation: number;
  /** the floor it stands on (it stays there) */
  level: number;
  /** pointer position minus the piece's centre when it was picked up */
  grab: { x: number; y: number };
  moved: boolean;
}

export const createPlannerTool = (editor: Editor) => {
  const context = pluginContext();
  const state = usePlannerState();
  const Base = context.classes.Tool;

  return new (class PlannerTool extends Base {
    id = 'roomplanner.planner';
    name = 'roomplanner.tool.name';
    cursor = 'default';
    private carry: Carry | null = null;
    private pointer: { x: number; y: number } | null = null;
    private free = false;

    status() {
      if (state.placing) {
        return t('roomplanner.tool.statusPlacing');
      }
      return this.carry ? t('roomplanner.tool.statusMoving') : t('roomplanner.tool.status');
    }

    deactivate() {
      this.cancel();
    }

    /** the floor that is worked on: the carried piece's, else the chosen one */
    private level() {
      const levels = findRoom()?.levels.length ?? 1;
      return this.carry ? this.carry.level : Math.min(state.level, levels - 1);
    }

    /** the pointer on the floor of that level */
    private floorPoint(event: PEvt, level = this.level()) {
      const ray = editor.viewer.rig.ray(editor.viewer.ndc(event.x, event.y));
      const room = findRoom();
      const z = room?.levels[level]?.z ?? room?.z ?? 0;
      return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3());
    }

    /** the placed piece under the pointer */
    private furnitureAt(event: PEvt) {
      const hit = editor.viewer.pickFace(event.x, event.y);
      const instance = hit?.context.path[0];
      const data = instance && furnitureOf(instance.definition);
      return instance && data && editor.model.root.instances.has(instance.id) ? { instance, data } : null;
    }

    private others(except?: Instance): Footprint[] {
      return placedFurniture()
        .filter(({ instance }) => instance !== except)
        .map(({ instance, data }) => footprintOf(instance, data));
    }

    private snap(data: FurnitureData, toWall: boolean, x: number, y: number, except?: Instance, rotation = 0): SnapResult {
      return snapPlacement({
        data,
        toWall,
        x,
        y,
        rotation,
        turn: state.turn,
        z: baseHeight(data, this.level(), x, y),
        room: roomAt(x, y),
        walls: findRooms().flatMap((room) => room.walls),
        others: this.others(except),
        free: this.free,
      });
    }

    private update() {
      const pointer = this.pointer;
      if (!pointer) {
        return;
      }
      if (state.placing) {
        const item = itemById(state.placing.item);
        if (item) {
          state.preview = this.snap(describe(item, state.placing.params), item.wall || item.mount === 'wall', pointer.x, pointer.y);
        }
      } else if (this.carry) {
        const { instance, data, grab } = this.carry;
        const item = itemById(data.item);
        const result = this.snap(
          data,
          !!item && (item.wall || item.mount === 'wall'),
          pointer.x - grab.x,
          pointer.y - grab.y,
          instance,
          this.carry.rotation,
        );
        state.preview = result;
        // the piece itself moves along (put back before the change is committed)
        instance.matrix.copy(placementMatrix(result.x, result.y, baseHeight(data, this.carry.level, result.x, result.y), result.rotation));
        editor.invalidate();
      }
      editor.redraw();
    }

    onMove(event: PEvt) {
      this.free = event.alt;
      const point = this.floorPoint(event);
      if (!point) {
        return;
      }
      if (this.carry && !this.carry.moved && this.pointer) {
        this.carry.moved = Math.hypot(point.x - this.pointer.x, point.y - this.pointer.y) > 0.01;
      }
      this.pointer = { x: point.x, y: point.y };
      if (!state.placing && !this.carry) {
        this.cursor = this.furnitureAt(event) ? 'grab' : 'default';
        editor.redraw();
        return;
      }
      this.update();
    }

    onDown(event: PEvt) {
      if (event.button !== 0) {
        return;
      }
      if (state.placing && state.preview) {
        const placing = state.placing;
        const preview = state.preview;
        const id = runPlace(placing.item, {
          params: placing.params,
          at: [preview.x, preview.y],
          rotation: preview.rotation,
          level: this.level(),
        });
        // Shift keeps placing more of the same, otherwise the new piece is selected
        if (!event.shift) {
          state.placing = null;
          state.preview = null;
          state.turn = 0;
        }
        if (id != null) {
          selectFurniture([id]);
        }
        state.revision++;
        return;
      }
      const found = this.furnitureAt(event);
      if (!found) {
        editor.select([], 'set');
        return;
      }
      selectFurniture([found.instance.id]);
      const point = this.floorPoint(event, levelOf(found.instance));
      const at = placementOf(found.instance);
      state.turn = 0;
      this.carry = {
        ...found,
        original: found.instance.matrix.clone(),
        rotation: at.rotation,
        level: levelOf(found.instance),
        grab: { x: (point?.x ?? at.x) - at.x, y: (point?.y ?? at.y) - at.y },
        moved: false,
      };
      this.pointer = point ? { x: point.x, y: point.y } : null;
      this.cursor = 'grabbing';
    }

    onUp() {
      const carry = this.carry;
      if (!carry) {
        return;
      }
      this.carry = null;
      this.cursor = 'grab';
      const preview = state.preview;
      state.preview = null;
      state.turn = 0;
      carry.instance.matrix.copy(carry.original);
      if (carry.moved && preview) {
        moveFurniture(carry.instance, preview.x, preview.y, preview.rotation);
        state.revision++;
      }
      editor.invalidate();
    }

    onKey(event: KeyboardEvent, down: boolean) {
      if (!down) {
        return false;
      }
      if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) {
        const step = event.shiftKey ? -90 : 90;
        if (state.placing || this.carry) {
          state.turn = (state.turn + step + 360) % 360;
          this.update();
        } else {
          selectedFurniture().forEach(({ instance }) => rotateFurniture(instance, step));
          state.revision++;
        }
        return true;
      }
      return false;
    }

    cancel() {
      if (this.carry) {
        this.carry.instance.matrix.copy(this.carry.original);
        this.carry = null;
        editor.invalidate();
      }
      state.placing = null;
      state.preview = null;
      state.turn = 0;
      editor.redraw();
    }

    busy() {
      return !!state.placing || !!this.carry;
    }

    draw(overlay: Overlay) {
      const preview = state.preview;
      if (preview) {
        drawBox(overlay, preview.box, preview.collides ? COLOURS.collides : COLOURS.box);
        for (const guide of preview.guides) {
          drawPlanLine(overlay, guide, preview.box.z0, COLOURS.guide, [6, 4]);
        }
        if (state.showMeasures) {
          preview.distances.forEach((line) => drawMeasure(overlay, line, preview.box.z0));
        }
        if (preview.collides) {
          overlay.text(
            new THREE.Vector3((preview.box.x0 + preview.box.x1) / 2, (preview.box.y0 + preview.box.y1) / 2, preview.box.z1 + 0.15),
            t('roomplanner.tool.collides'),
            {
              color: '#fff',
              background: COLOURS.collides,
            },
          );
        }
        return;
      }
      // selected pieces: their distances to what is around them
      if (state.showMeasures) {
        const walls = findRooms().flatMap((room) => room.walls);
        for (const { instance, data } of selectedFurniture()) {
          const box = footprintOf(instance, data);
          clearances(box, walls, this.others(instance)).forEach((line) => drawMeasure(overlay, line, box.z0));
        }
      }
    }
  })(editor);
};

// ------------------------------------------------------------ drawing
const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const drawBox = (overlay: Overlay, box: Footprint, colour: string) => {
  const corners = (z: number) => [point(box.x0, box.y0, z), point(box.x1, box.y0, z), point(box.x1, box.y1, z), point(box.x0, box.y1, z)];
  const bottom = corners(box.z0),
    top = corners(box.z1);
  overlay.fillPolygon(bottom, `${colour}33`);
  overlay.polyline(bottom, colour, 2, true);
  overlay.polyline(top, colour, 1.5, true);
  bottom.forEach((corner, i) => overlay.line(corner, top[i], colour, 1.5));
};

const drawPlanLine = (overlay: Overlay, line: PlanLine, z: number, colour: string, dash?: number[]) =>
  overlay.line(point(line.from[0], line.from[1], z + 0.005), point(line.to[0], line.to[1], z + 0.005), colour, 1.5, dash);

/** a distance on the floor with its length in centimetres */
export const drawMeasure = (overlay: Overlay, line: PlanLine, z: number, colour = COLOURS.measure) => {
  drawPlanLine(overlay, line, z, colour);
  const middle = point((line.from[0] + line.to[0]) / 2, (line.from[1] + line.to[1]) / 2, z + 0.005);
  overlay.text(middle, `${Math.round((line.length ?? 0) * 100)} cm`, {
    color: '#fff',
    background: colour,
    font: '600 11px "Segoe UI", sans-serif',
  }); // i18n-ignore – unit symbol
};
