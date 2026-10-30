import type { Editor, PEvt } from '../../../src/engine/editor';
import type { Overlay } from '../../../src/engine/overlay';
import { blockoutData, blockoutGroup } from './blockout';
import { KINDS } from './kinds';
import { PLACE_TOOL_ID } from './names';
import { kindOf, runPlace, selectObjects } from './objects';
import { intoLevelMode, pluginContext, t, THREE } from './runtime';
import { useLevelState } from './state';

/**
 * The place tool: the chosen kind follows the pointer on the surface under it (or the ground) and is placed with a
 * click – Shift keeps placing more of it, R turns it by 45° (Shift+R back), Esc stops. Without a chosen kind a click
 * selects the level object under the pointer.
 */

export const createPlaceTool = (editor: Editor) => {
  const context = pluginContext();
  const state = useLevelState();
  const Base = context.classes.Tool;

  return new (class PlaceTool extends Base {
    id = PLACE_TOOL_ID;
    name = 'level.tool.name';
    cursor = 'crosshair';
    private at: InstanceType<typeof THREE.Vector3> | null = null;
    /** a door snapped to a blockout wall turns with it */
    private snappedTurn: number | null = null;

    status() {
      return state.placing ? t('level.tool.statusPlacing', { kind: t(`level.kinds.${state.placing}`) }) : t('level.tool.status');
    }

    activate() {
      // the kind chosen goes along into the mode
      intoLevelMode(PLACE_TOOL_ID, () => {
        const kind = state.placing;
        return () => {
          state.placing = kind;
        };
      });
    }

    deactivate() {
      this.cancel();
    }

    /** the first face under the pointer that is not a level object, else the ground */
    private surfacePoint(event: PEvt) {
      const hit = editor.viewer.pickFace(event.x, event.y, (pick) => !pick.path.some((instance) => kindOf(instance.definition)));
      const ray = editor.viewer.rig.ray(editor.viewer.ndc(event.x, event.y));
      const point = hit ? hit.point.clone() : ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
      // a camera hangs under the ceiling, the others stand on the surface
      return point?.add(new THREE.Vector3(0, 0, state.placing ? (KINDS[state.placing].lift ?? 0) : 0)) ?? null;
    }

    /** the level object under the pointer */
    private objectAt(event: PEvt) {
      const hit = editor.viewer.pickFace(event.x, event.y);
      return hit?.context.path.find((instance) => kindOf(instance.definition)) ?? null;
    }

    /** a door near a blockout wall: on the wall's line, its middle on a grid line, turned along the wall */
    private snapDoor() {
      this.snappedTurn = null;
      if (state.placing !== 'door' || !this.at || !blockoutGroup()) {
        return;
      }
      const cell = blockoutData().cell;
      const onGrid = (value: number) => Math.round(value / cell) * cell;
      const offX = Math.abs(this.at.x - onGrid(this.at.x)),
        offY = Math.abs(this.at.y - onGrid(this.at.y));
      if (Math.min(offX, offY) > cell * 0.8) {
        return;
      }
      this.at.set(onGrid(this.at.x), onGrid(this.at.y), this.at.z);
      // a wall along y (x on a grid line): the leaf lies in its plane as it is; a wall along x: turned by 90°
      this.snappedTurn = offX <= offY ? 0 : 90;
    }

    /** the way the next object faces */
    private turn() {
      return this.snappedTurn ?? state.turn;
    }

    onMove(event: PEvt) {
      if (state.placing) {
        this.at = this.surfacePoint(event);
        this.snapDoor();
      } else {
        this.cursor = this.objectAt(event) ? 'pointer' : 'crosshair';
      }
      editor.redraw();
    }

    onDown(event: PEvt) {
      if (event.button !== 0) {
        return;
      }
      if (state.placing && this.at) {
        const id = runPlace(state.placing, {
          at: [round(this.at.x), round(this.at.y), round(this.at.z)],
          rotation: this.turn(),
        });
        if (!event.shift) {
          state.placing = null;
          this.at = null;
        }
        if (id != null) {
          editor.select([{ kind: 'instance', id }], 'set');
        }
        state.revision++;
        return;
      }
      const found = this.objectAt(event);
      if (found) {
        selectObjects([found]);
      } else {
        editor.select([], 'set');
      }
    }

    onKey(event: KeyboardEvent, down: boolean) {
      if (!down || event.key.toLowerCase() !== 'r' || event.ctrlKey || event.metaKey || !state.placing) {
        return false;
      }
      state.turn = (state.turn + (event.shiftKey ? -45 : 45) + 360) % 360;
      editor.redraw();
      return true;
    }

    cancel() {
      state.placing = null;
      this.at = null;
      editor.redraw();
    }

    busy() {
      return !!state.placing;
    }

    draw(overlay: Overlay) {
      if (!state.placing || !this.at) {
        return;
      }
      const spec = KINDS[state.placing];
      drawFootprint(overlay, this.at, spec.size, this.turn(), spec.colour);
      overlay.text(this.at.clone().add(new THREE.Vector3(0, 0, spec.size[2] + 0.3)), t(`level.kinds.${state.placing}`), {
        color: '#fff',
        background: spec.colour,
      });
    }
  })(editor);
};

/** centimetres are enough for a placed object */
const round = (value: number) => Math.round(value * 100) / 100;

/** the box an object takes, turned by `rotation` degrees – where it will stand */
const drawFootprint = (
  overlay: Overlay,
  at: InstanceType<typeof THREE.Vector3>,
  size: [number, number, number],
  rotation: number,
  colour: string,
) => {
  const radians = (rotation * Math.PI) / 180;
  const corner = (u: number, v: number, z: number) =>
    new THREE.Vector3(
      at.x + (u * Math.cos(radians) - v * Math.sin(radians)) * (size[0] / 2),
      at.y + (u * Math.sin(radians) + v * Math.cos(radians)) * (size[1] / 2),
      at.z + z,
    );
  const ring = (z: number) => [corner(-1, -1, z), corner(1, -1, z), corner(1, 1, z), corner(-1, 1, z)];
  const bottom = ring(0),
    top = ring(size[2]);
  overlay.fillPolygon(bottom, `${colour}44`);
  overlay.polyline(bottom, colour, 2, true);
  overlay.polyline(top, colour, 1.5, true);
  bottom.forEach((point, index) => overlay.line(point, top[index], colour, 1.5));
  // the way it faces
  overlay.line(at.clone(), corner(1.6, 0, 0), colour, 2.5);
};
