import type { Instance } from '../../../src/core/model';
import type { Editor, PEvt } from '../../../src/engine/editor';
import type { Overlay } from '../../../src/engine/overlay';
import {
  boxAt,
  brickOf,
  collides,
  frameBricks,
  liftedHeight,
  measuresOf,
  moveBrick,
  placeBrick,
  placementMatrix,
  placementOf,
  removeBricks,
  restingHeight,
  selectBricks,
  selectedBricks,
  snapCentre,
  turnBrick,
  turned,
  type BrickData,
  type Box,
} from './bricks';
import { colorById } from './colors';
import { modelSpec } from './parts';
import { pluginContext, t, THREE } from './runtime';
import { PITCH } from './shapes';
import { useBrickState, type Preview } from './state';

/**
 * The building tool in the 3D view: a chosen brick follows the pointer on the stud grid and comes to rest on what is
 * below it, a click sets it and the next one follows. Placed bricks are picked up by dragging. R turns, Page Up and
 * Page Down raise and lower, Delete removes, Esc stops. Orbiting and zooming stay as in the app.
 */

/** cells of the grid drawn around a brick being placed, on each side */
const GRID_REACH = 8;
/** in square metres: eight by eight cells */
const LARGEST_FILLED_PREVIEW = (8 * PITCH) ** 2;
const COLOURS = { grid: '#7a869a55', gridStrong: '#7a869aaa', collides: '#d92d20' };

interface Carry {
  instance: Instance;
  data: BrickData;
  original: InstanceType<typeof THREE.Matrix4>;
  rotation: number;
  /** pointer position minus the brick's centre when it was picked up */
  grab: { x: number; y: number };
  moved: boolean;
}

export const TOOL_ID = 'bricks.build';

export const createBuildTool = (editor: Editor) => {
  const context = pluginContext();
  const state = useBrickState();
  const Base = context.classes.Tool;

  return new (class BuildTool extends Base {
    id = TOOL_ID;
    name = 'bricks.tool.name';
    cursor = 'default';
    private carry: Carry | null = null;
    private pointer: { x: number; y: number } | null = null;

    status() {
      if (state.placing) {
        return t('bricks.tool.statusPlacing');
      }
      return this.carry ? t('bricks.tool.statusMoving') : t('bricks.tool.status');
    }

    deactivate() {
      this.cancel();
    }

    /** the placed brick under the pointer */
    private brickAt(event: PEvt, except?: Instance) {
      const hit = editor.viewer.pickFace(event.x, event.y, (found) => found.path[0] !== except);
      const instance = hit?.context.path[0];
      const data = instance && brickOf(instance.definition);
      return hit && instance && data && editor.model.root.instances.has(instance.id) ? { hit, instance, data } : null;
    }

    /** the spot the pointer means: a brick's top is where it points; beside a brick, the cell next to it; else the ground */
    private aim(event: PEvt, except?: Instance) {
      const found = this.brickAt(event, except);
      if (found) {
        const { hit, instance, data } = found;
        // the side of a stud still counts as the top
        const onTop = hit.normal.z > 0.5 || hit.point.z >= placementOf(instance).z + data.height - 1e-5;
        const reach = onTop || hit.normal.z < -0.5 ? 0 : PITCH / 2;
        return { x: hit.point.x + hit.normal.x * reach, y: hit.point.y + hit.normal.y * reach };
      }
      const ray = editor.viewer.rig.ray(editor.viewer.ndc(event.x, event.y));
      const ground = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
      return ground && { x: ground.x, y: ground.y };
    }

    private update() {
      const pointer = this.pointer;
      const carry = this.carry;
      const measures = carry ? carry.data : state.placing ? measuresOf(state.placing) : null;
      if (!pointer || !measures) {
        return;
      }
      const rotation = ((carry?.rotation ?? 0) + state.turn) % 360;
      const [w, d] = turned(measures.w, measures.d, rotation);
      const x = snapCentre(pointer.x - (carry?.grab.x ?? 0), w);
      const y = snapCentre(pointer.y - (carry?.grab.y ?? 0), d);
      const z = liftedHeight(restingHeight(boxAt(x, y, 0, w, d, measures.height), carry?.instance), state.lift);
      state.preview = {
        x,
        y,
        z,
        w,
        d,
        height: measures.height,
        rotation,
        collides: collides(boxAt(x, y, z, w, d, measures.height), carry?.instance),
      };
      if (carry) {
        // the brick itself moves along (put back before the change is committed)
        carry.instance.matrix.copy(placementMatrix(x, y, z, rotation));
        editor.invalidate();
      }
      editor.redraw();
    }

    onMove(event: PEvt) {
      const point = this.aim(event, this.carry?.instance);
      if (!point) {
        return;
      }
      if (this.carry && !this.carry.moved && this.pointer) {
        this.carry.moved = Math.hypot(point.x - this.pointer.x, point.y - this.pointer.y) > PITCH / 4;
      }
      this.pointer = point;
      if (!state.placing && !this.carry) {
        this.cursor = this.brickAt(event) ? 'grab' : 'default';
        editor.redraw();
        return;
      }
      this.update();
    }

    onDown(event: PEvt) {
      if (event.button !== 0) {
        return;
      }
      if (state.placing) {
        const preview = state.preview;
        if (!preview) {
          return;
        }
        if (preview.collides) {
          context.ui.toast(t('bricks.tool.collides'));
          return;
        }
        try {
          placeBrick(state.placing, preview.x, preview.y, preview.z, preview.rotation, state.color);
        } catch (error) {
          context.ui.toast((error as Error).message);
        }
        state.revision++;
        // one model is what was asked for, and it may be far bigger than the view
        if (modelSpec(state.placing)) {
          this.cancel();
          frameBricks();
        } else {
          this.update();
        }
        return;
      }
      const found = this.brickAt(event);
      if (!found) {
        editor.select([], 'set');
        return;
      }
      selectBricks([found.instance.id]);
      const at = placementOf(found.instance);
      const point = this.aim(event, found.instance);
      state.turn = 0;
      state.lift = 0;
      this.carry = {
        instance: found.instance,
        data: found.data,
        original: found.instance.matrix.clone(),
        rotation: at.rotation,
        grab: { x: (point?.x ?? at.x) - at.x, y: (point?.y ?? at.y) - at.y },
        moved: false,
      };
      this.pointer = point;
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
      state.lift = 0;
      carry.instance.matrix.copy(carry.original);
      if (carry.moved && preview && !preview.collides) {
        moveBrick(carry.instance, preview.x, preview.y, preview.z, preview.rotation);
        state.revision++;
      }
      editor.invalidate();
    }

    onKey(event: KeyboardEvent, down: boolean) {
      if (!down || event.ctrlKey || event.metaKey) {
        return false;
      }
      const key = event.key.toLowerCase();
      if (key === 'r') {
        const step = event.shiftKey ? 270 : 90;
        if (state.placing || this.carry) {
          state.turn = (state.turn + step) % 360;
          this.update();
        } else {
          selectedBricks().forEach(({ instance, data }) => turnBrick(instance, data, step));
          state.revision++;
        }
        return true;
      }
      if ((key === 'pageup' || key === 'pagedown') && (state.placing || this.carry)) {
        state.lift += key === 'pageup' ? 1 : -1;
        this.update();
        return true;
      }
      if ((key === 'delete' || key === 'backspace') && !state.placing && !this.carry) {
        const selected = selectedBricks();
        if (selected.length) {
          removeBricks(selected.map(({ instance }) => instance));
          editor.select([], 'set');
          state.revision++;
          return true;
        }
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
      state.lift = 0;
      editor.redraw();
    }

    busy() {
      return !!state.placing || !!this.carry;
    }

    draw(overlay: Overlay) {
      const preview = state.preview;
      if (preview) {
        drawGrid(overlay, preview);
        const box = boxAt(preview.x, preview.y, preview.z, preview.w, preview.d, preview.height);
        drawBox(overlay, box, preview.collides ? COLOURS.collides : colorById(state.color).hex);
      }
    }
  })(editor);
};

// ------------------------------------------------------------ drawing
const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * The stud grid at the height the brick comes to rest, a stronger line every four cells. An overlay has no depth, so
 * it lies over everything: it only shows while it helps, and only around the brick.
 */
const drawGrid = (overlay: Overlay, { x, y, z }: Preview) => {
  const reach = GRID_REACH * PITCH;
  const originX = Math.round(x / PITCH) * PITCH;
  const originY = Math.round(y / PITCH) * PITCH;
  for (let i = -GRID_REACH; i <= GRID_REACH; i++) {
    const at = i * PITCH;
    const colour = i % 4 === 0 ? COLOURS.gridStrong : COLOURS.grid;
    overlay.line(point(originX + at, originY - reach, z), point(originX + at, originY + reach, z), colour, 1);
    overlay.line(point(originX - reach, originY + at, z), point(originX + reach, originY + at, z), colour, 1);
  }
};

const drawBox = (overlay: Overlay, box: Box, colour: string) => {
  const corners = (z: number) => [point(box.x0, box.y0, z), point(box.x1, box.y0, z), point(box.x1, box.y1, z), point(box.x0, box.y1, z)];
  const bottom = corners(box.z0);
  const top = corners(box.z1);
  // what is larger than a big plate would hide everything around the spot it is aimed at: only its footprint is filled
  if ((box.x1 - box.x0) * (box.y1 - box.y0) > LARGEST_FILLED_PREVIEW) {
    overlay.fillPolygon(bottom, `${colour}33`);
  } else {
    overlay.fillPolygon(top, `${colour}aa`);
    bottom.forEach((corner, i) => {
      const next = (i + 1) % 4;
      overlay.fillPolygon([corner, bottom[next], top[next], top[i]], `${colour}66`);
    });
  }
  overlay.polyline(bottom, colour, 2, true);
  overlay.polyline(top, colour, 2, true);
  bottom.forEach((corner, i) => overlay.line(corner, top[i], colour, 2));
};
