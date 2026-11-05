import type { Instance } from '../../../src/core/model';
import type { Editor, PEvt } from '../../../src/engine/editor';
import type { Overlay } from '../../../src/engine/overlay';
import { overrides, showFrame } from './apply';
import { LIMIT_CHANNELS, objectAnimation } from './data';
import { keyRotations, shownPlacementOf } from './keying';
import { JOINT_TOOL_ID, POSE_TOOL_ID } from './names';
import { limitPlacement, matrixOf, placementOf, type Placement } from './pose';
import { boneOnPath, boneSegments, setJoint, shownWorld } from './rig';
import { pluginContext, t, THREE } from './runtime';
import { boxOf, findInstance, pivotOf } from './scene';
import { useAnimationState } from './state';

/**
 * The rig's tools. Joint makes a group a bone: the first click sets its joint, the second the tip – up and down arrows
 * choose which of the groups under the cursor it is. Pose turns bones without opening their groups: drag a bone about
 * its joint, in the plane of the screen or about an axis locked with the arrow keys, within its limits. What is posed
 * is shown until the frame changes and keyed with I (or at once with auto-keying) – the model does not change.
 */

type Matrix = InstanceType<typeof THREE.Matrix4>;
type Vector = InstanceType<typeof THREE.Vector3>;

const BOX_COLOUR = '#5c7cfa';
const BOX_EDGES = [
  [0, 1],
  [1, 3],
  [3, 2],
  [2, 0],
  [4, 5],
  [5, 7],
  [7, 6],
  [6, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

const nameOf = (instance: Instance) => instance.name || instance.definition.name || '';

export const createJointTool = (editor: Editor) => {
  const Base = pluginContext().classes.PointTool;
  return new (class JointTool extends Base {
    id = JOINT_TOOL_ID;
    name = 'animation.tools.joint';
    cursor = 'crosshair';
    /** the groups under the cursor (outermost first) and how many levels above the deepest fitting one the choice is */
    private path: Instance[] = [];
    private levelsUp = 0;
    private target: Instance | null = null;
    private head: Vector | null = null;

    status() {
      return t(this.head ? 'animation.tools.jointTail' : 'animation.tools.jointHead');
    }

    busy() {
      return !!this.head;
    }

    cancel() {
      this.head = null;
      this.target = null;
      this.path = [];
      this.levelsUp = 0;
      this.resetLocks();
    }

    /** the deepest bone on the path, else the deepest group – moved up by the levels chosen */
    private chosen() {
      if (!this.path.length) {
        return null;
      }
      const bone = boneOnPath(this.path);
      const deepest = bone ? this.path.indexOf(bone) : this.path.length - 1;
      return this.path[Math.max(0, deepest - this.levelsUp)];
    }

    onMove(event: PEvt) {
      const inference = this.pick(event, this.head);
      if (!this.head) {
        this.path = inference.face?.context.path ?? inference.edge?.context.path ?? inference.vert?.context.path ?? [];
        this.target = this.chosen();
      }
    }

    onDown(event: PEvt) {
      if (event.button !== 0) {
        return;
      }
      const inference = this.pick(event, this.head);
      if (!this.head) {
        if (!this.target) {
          pluginContext().ui.toast(t('animation.tools.jointNoGroup'));
          return;
        }
        this.head = inference.point.clone();
        editor.refreshStatus();
        return;
      }
      if (inference.point.distanceTo(this.head) < 1e-5) {
        return;
      }
      setJoint(this.target!, this.head, inference.point.clone());
      this.cancel();
      editor.refreshStatus();
    }

    onKey(event: KeyboardEvent, down: boolean) {
      if (!this.head && down && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        this.levelsUp = Math.max(0, this.levelsUp + (event.key === 'ArrowUp' ? 1 : -1));
        this.target = this.chosen();
        return true;
      }
      return super.onKey(event, down);
    }

    draw(overlay: Overlay) {
      if (this.target) {
        const found = findInstance(this.target.id);
        const world = shownWorld([...(found?.ancestors ?? []), this.target]);
        const box = boxOf(this.target.definition.entities);
        if (!box.isEmpty()) {
          const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
            new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(
              world,
            ),
          );
          for (const [from, to] of BOX_EDGES) {
            overlay.line(corners[from], corners[to], BOX_COLOUR, 1.2);
          }
        }
      }
      if (this.head) {
        overlay.marker(this.head, 'center');
        if (this.inference) {
          overlay.line(this.head, this.inference.point, BOX_COLOUR, 2);
        }
      }
      this.drawInference(overlay, !!this.head);
      if (this.target && !this.head) {
        overlay.tooltip(editor.mouse.x, editor.mouse.y, t('animation.tools.jointTarget', { name: nameOf(this.target) }));
      }
    }
  })(editor);
};

/** what is being turned: the bone, its joint, the axis and how it was shown when the drag began */
interface PoseDrag {
  instance: Instance;
  pivot: [number, number, number];
  head: Vector;
  parentWorld: Matrix;
  startLocal: Matrix;
  /** what was shown by hand before – Esc goes back to it */
  before: Matrix | undefined;
  startAngle: number;
  moved: boolean;
  /** the place it was shown at last while dragging */
  last: Placement;
}

export const createPoseTool = (editor: Editor) => {
  const context = pluginContext();
  const Base = context.classes.Tool;
  const state = useAnimationState();
  const AXES = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };
  return new (class PoseTool extends Base {
    id = POSE_TOOL_ID;
    name = 'animation.tools.pose';
    cursor = 'pointer';
    private drag: PoseDrag | null = null;
    private axis: 'x' | 'y' | 'z' | null = null;

    status() {
      return t('animation.tools.poseStatus');
    }

    busy() {
      return !!this.drag;
    }

    deactivate() {
      state.hoverBone = null;
    }

    cancel() {
      const drag = this.drag;
      this.drag = null;
      if (!drag) {
        return;
      }
      if (drag.before) {
        overrides.set(drag.instance, drag.before);
      } else {
        overrides.delete(drag.instance);
      }
      showFrame(state.frame);
    }

    /** the bone under the cursor: a bone drawn there, else the deepest bone the face there lies in */
    private boneAt(event: PEvt): Instance | null {
      const viewer = editor.viewer;
      const mouse = new THREE.Vector2(event.x, event.y);
      let best: Instance | null = null;
      let bestDistance = 8;
      if (state.show.bones) {
        for (const segment of boneSegments()) {
          const head = viewer.project(segment.head);
          const tail = viewer.project(segment.tail);
          if (!head.visible || !tail.visible) {
            continue;
          }
          const from = new THREE.Vector2(head.x, head.y);
          const along = new THREE.Vector2(tail.x, tail.y).sub(from);
          const share = along.lengthSq() > 1e-9 ? Math.min(1, Math.max(0, mouse.clone().sub(from).dot(along) / along.lengthSq())) : 0;
          const distance = from.addScaledVector(along, share).distanceTo(mouse);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = segment.instance;
          }
        }
      }
      return best ?? boneOnPath(viewer.pickFace(event.x, event.y)?.context.path ?? []);
    }

    /** the angle of the cursor around the joint on the screen */
    private angleAt(event: PEvt, head: Vector) {
      const screen = editor.viewer.project(head);
      return Math.atan2(event.y - screen.y, event.x - screen.x);
    }

    onDown(event: PEvt) {
      if (event.button !== 0) {
        return;
      }
      const instance = this.boneAt(event);
      state.bone = instance?.id ?? null;
      if (!instance) {
        return;
      }
      const animation = objectAnimation(instance);
      const pivot = pivotOf(instance, animation);
      const ancestors = findInstance(instance.id)?.ancestors ?? [];
      const parentWorld = shownWorld(ancestors);
      const startLocal = editor.viewer.shownMatrix(instance).clone();
      const head = new THREE.Vector3(...pivot).applyMatrix4(parentWorld.clone().multiply(startLocal));
      this.drag = {
        instance,
        pivot,
        head,
        parentWorld,
        startLocal,
        before: overrides.get(instance),
        startAngle: this.angleAt(event, head),
        moved: false,
        last: placementOf(startLocal, pivot),
      };
    }

    onMove(event: PEvt) {
      if (!this.drag) {
        state.hoverBone = this.boneAt(event)?.id ?? null;
        return;
      }
      const drag = this.drag;
      const forward = editor.viewer.rig.forward().normalize();
      // the axis in the model: the screen's, or the parent's axis locked with the arrow keys
      const axis = this.axis ? AXES[this.axis].clone().transformDirection(drag.parentWorld) : forward.clone();
      // a turn clockwise on the screen is a turn about the axis pointing into the screen
      const angle = (this.angleAt(event, drag.head) - drag.startAngle) * (axis.dot(forward) < 0 ? -1 : 1);
      const inParent = axis.transformDirection(drag.parentWorld.clone().invert());
      const joint = new THREE.Vector3(...drag.pivot).applyMatrix4(drag.startLocal);
      const turned = new THREE.Matrix4()
        .makeTranslation(joint.x, joint.y, joint.z)
        .multiply(new THREE.Matrix4().makeRotationAxis(inParent, angle))
        .multiply(new THREE.Matrix4().makeTranslation(-joint.x, -joint.y, -joint.z))
        .multiply(drag.startLocal);
      const wanted = placementOf(turned, drag.pivot);
      const place = limitPlacement(drag.instance, objectAnimation(drag.instance), wanted);
      // dragged on past a limit it stays there: the far side of the circle must not throw it to its other limit
      for (const channel of LIMIT_CHANNELS) {
        if (place[channel] !== wanted[channel] && Math.abs(place[channel] - drag.last[channel]) > 90) {
          place[channel] = drag.last[channel];
        }
      }
      drag.last = place;
      overrides.set(drag.instance, matrixOf(place, drag.pivot));
      drag.moved = true;
      showFrame(state.frame);
    }

    onUp() {
      const drag = this.drag;
      this.drag = null;
      if (drag?.moved && state.autoKey) {
        const { rx, ry, rz } = shownPlacementOf(drag.instance);
        keyRotations([{ instance: drag.instance, rx, ry, rz }]);
      }
    }

    onKey(event: KeyboardEvent, down: boolean) {
      if (down && ['ArrowRight', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
        const axis = event.key === 'ArrowRight' ? 'x' : event.key === 'ArrowLeft' ? 'y' : 'z';
        this.axis = this.axis === axis ? null : axis;
        return true;
      }
      if (down && event.key === 'ArrowDown') {
        this.axis = null;
        return true;
      }
      return false;
    }

    draw(overlay: Overlay) {
      const drag = this.drag;
      if (this.axis) {
        overlay.tooltip(editor.mouse.x, editor.mouse.y, t('animation.tools.poseAxis', { axis: this.axis.toUpperCase() }));
      }
      if (!drag) {
        return;
      }
      overlay.marker(drag.head, 'center');
      const place = shownPlacementOf(drag.instance);
      overlay.text(drag.head, `${Math.round(place.rx)}° ${Math.round(place.ry)}° ${Math.round(place.rz)}°`, {
        color: '#fff',
        background: BOX_COLOUR,
        offsetY: -16,
        font: '11px "Segoe UI", sans-serif',
      });
    }
  })(editor);
};
