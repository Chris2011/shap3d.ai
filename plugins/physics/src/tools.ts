import type { Entities, Instance } from '../../../src/core/model';
import type { Editor, PEvt } from '../../../src/engine/editor';
import type { Overlay } from '../../../src/engine/overlay';
import { bodyData, writeBodyData, type JointData, type JointKind } from './data';
import { JOINT_TOOL_ID, PULL_TOOL_ID } from './names';
import { bodyOnRay, currentSim, grab, moveGrab, release, resetSim, startSim } from './sim';
import { findInstance } from './scene';
import { pluginContext, t, THREE } from './runtime';
import { usePhysicsState } from './state';

/**
 * The tools: Pull drags a body while the simulation runs (a spring from the point grabbed to the pointer, in the
 * plane facing the camera) – it starts the simulation when it is not running. Joint puts a joint on a body: the
 * first click on a face sets the anchor (the face's normal is a hinge's axis), the second the body it holds on to
 * (the same body: the group it lies in; nothing: the world).
 */

type Vector = InstanceType<typeof THREE.Vector3>;

export const createPullTool = (editor: Editor) => {
  const context = pluginContext();
  const Base = context.classes.Tool;
  return new (class PullTool extends Base {
    id = PULL_TOOL_ID;
    name = 'physics.tools.pull';
    cursor = 'grab';
    private plane: InstanceType<typeof THREE.Plane> | null = null;

    status() {
      return t('physics.tools.pullStatus');
    }

    activate() {
      if (usePhysicsState().status !== 'running') {
        void startSim();
      }
    }

    deactivate() {
      this.cancel();
    }

    onDown(event: PEvt) {
      if (event.button !== 0) {
        return;
      }
      const ray = editor.viewer.ray(event.x, event.y);
      const hit = bodyOnRay(ray.origin, ray.direction);
      if (!hit) {
        // say why nothing happens: the engine still loads, or there is no dynamic body under the pointer
        context.ui.toast(t(currentSim() ? 'physics.tools.pullMiss' : 'physics.panel.loading'));
        return;
      }
      const facing = new THREE.Vector3().setFromMatrixColumn(editor.viewer.rig.camera.matrixWorld, 2);
      this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(facing, hit.point);
      grab(hit.body, hit.point);
      this.cursor = 'grabbing';
    }

    onMove(event: PEvt) {
      if (!this.plane) {
        return;
      }
      const target = editor.viewer.ray(event.x, event.y).intersectPlane(this.plane, new THREE.Vector3());
      if (target) {
        moveGrab(target);
      }
    }

    onUp() {
      this.cancel();
    }

    cancel() {
      this.plane = null;
      this.cursor = 'grab';
      release();
    }

    busy() {
      return !!this.plane;
    }
  })(editor);
};

/** where a click on a face snapped to: a corner, the middle, or nowhere (the point itself) */
type Snap = 'corner' | 'middle' | null;

/**
 * A joint's anchor on a face: a click near a corner snaps to it (a door's hinge sits at its edge), one near the middle
 * of the face to the middle (a wheel's axle) – anywhere else it stays where it was clicked.
 */
const snapOnFace = (entities: Entities, faceId: number, world: InstanceType<typeof THREE.Matrix4>, point: Vector) => {
  const face = entities.faces.get(faceId);
  if (!face || face.outer.length < 3) {
    return { point: point.clone(), snap: null as Snap };
  }
  const corners = face.outer.map((vertex) => entities.positionOf(vertex).clone().applyMatrix4(world));
  let size = 0;
  for (const a of corners) {
    for (const b of corners) {
      size = Math.max(size, a.distanceTo(b));
    }
  }
  const nearest = corners.reduce((best, corner) => (corner.distanceTo(point) < best.distanceTo(point) ? corner : best));
  if (nearest.distanceTo(point) < size * 0.25) {
    return { point: nearest.clone(), snap: 'corner' as Snap };
  }
  const middle = corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3()).divideScalar(corners.length);
  if (middle.distanceTo(point) < size * 0.2) {
    return { point: middle, snap: 'middle' as Snap };
  }
  return { point: point.clone(), snap: null as Snap };
};

/** the joint kind the joint tool puts – chosen in the panel */
let jointKind: JointKind = 'hinge';
/** a door hinge (the simple view): its axis stands upright at the object's edge nearest the click, whatever face is hit */
let doorHinge = false;
export const setJointKind = (kind: JointKind, door = false) => {
  jointKind = kind;
  doorHinge = door && kind === 'hinge';
};

/** a door's hinge: upright (the object's own z) through the corner of its box nearest the point, at the point's height */
const doorEdge = (instance: Instance, point: Vector) => {
  const world = findInstance(instance.id)?.world ?? instance.matrix;
  const local = point.clone().applyMatrix4(world.clone().invert());
  const box = instance.definition.entities.bounds(new THREE.Box3());
  const x = Math.abs(local.x - box.min.x) < Math.abs(local.x - box.max.x) ? box.min.x : box.max.x;
  const y = Math.abs(local.y - box.min.y) < Math.abs(local.y - box.max.y) ? box.min.y : box.max.y;
  return {
    point: new THREE.Vector3(x, y, local.z).applyMatrix4(world),
    normal: new THREE.Vector3(0, 0, 1).transformDirection(world),
  };
};
export const currentJointKind = () => jointKind;

export const createJointTool = (editor: Editor) => {
  const context = pluginContext();
  const Base = context.classes.Tool;
  return new (class JointTool extends Base {
    id = JOINT_TOOL_ID;
    name = 'physics.tools.joint';
    cursor = 'crosshair';
    /** the first click: the body, the anchor and the face's normal (model coordinates) */
    private first: { instance: Instance; point: Vector; normal: Vector } | null = null;
    private hover: { point: Vector; normal: Vector; snap: Snap } | null = null;
    /** the body that just got its joint – selected when the mouse button is released */
    private finished: number | null = null;

    status() {
      return t(this.first ? 'physics.tools.jointStatusSecond' : 'physics.tools.jointStatusFirst', {
        kind: t(`physics.joints.${jointKind}`),
      });
    }

    activate() {
      // joints are set on the model as it is
      if (currentSim()) {
        resetSim();
      }
    }

    deactivate() {
      this.cancel();
    }

    /** the group under the pointer: the innermost one with physics data, else the outermost in the context */
    private pick(event: PEvt) {
      const hit = editor.viewer.pickFace(event.x, event.y);
      if (!hit) {
        return null;
      }
      const path = hit.context.path.slice(editor.activePath.length);
      const instance = [...path].reverse().find((candidate) => bodyData(candidate)) ?? path[0] ?? null;
      if (doorHinge && !this.first && instance) {
        return { instance, ...doorEdge(instance, hit.point), snap: 'corner' as Snap };
      }
      const { point, snap } = snapOnFace(hit.context.entities, hit.faceId, hit.context.world, hit.point);
      return { instance, point, snap, normal: hit.normal.clone().normalize() };
    }

    onMove(event: PEvt) {
      const hit = this.pick(event);
      this.hover = hit ? { point: hit.point, normal: hit.normal, snap: hit.snap } : null;
      editor.redraw();
    }

    onDown(event: PEvt) {
      if (event.button !== 0) {
        return;
      }
      const hit = this.pick(event);
      if (!this.first) {
        if (!hit?.instance) {
          context.ui.toast(t('physics.errors.jointOnGroup'));
          return;
        }
        this.first = { instance: hit.instance, point: hit.point, normal: hit.normal };
        editor.redraw();
        return;
      }
      const { instance, point, normal } = this.first;
      const other = hit?.instance && hit.instance !== instance ? hit.instance : null;
      const to: JointData['to'] = other ? other.id : hit?.instance === instance ? 'parent' : 'world';
      const world = findInstance(instance.id)?.world ?? instance.matrix;
      const inverse = world.clone().invert();
      const round = (vector: Vector) => vector.toArray().map((value) => Math.round(value * 1e4) / 1e4) as [number, number, number];
      const joint: JointData = { kind: jointKind, to, at: round(point.clone().applyMatrix4(inverse)) };
      if (jointKind === 'hinge' || jointKind === 'slider') {
        joint.axis = round(normal.clone().transformDirection(inverse));
      }
      if ((jointKind === 'rope' || jointKind === 'spring') && hit) {
        const otherWorld = other ? (findInstance(other.id)?.world ?? other.matrix) : null;
        joint.toAt = round(otherWorld ? hit.point.clone().applyMatrix4(otherWorld.clone().invert()) : hit.point);
      }
      editor.commit('physics.undo.joint', () => {
        const data = bodyData(instance) ?? { type: 'dynamic' as const };
        writeBodyData(instance, { ...data, joints: [...(data.joints ?? []), joint] });
        if (other && !bodyData(other)) {
          writeBodyData(other, { type: 'dynamic' });
        }
      });
      usePhysicsState().revision++;
      context.ui.toast(
        t('physics.tools.jointAdded', {
          kind: t(`physics.joints.${jointKind}`),
          name: instance.name || instance.definition.name,
          to: other ? other.name || other.definition.name : t(to === 'parent' ? 'physics.panel.toParent' : 'physics.panel.toWorld'),
        }),
      );
      this.first = null;
      this.finished = instance.id;
    }

    // done: back to selecting with the body selected (its joint shows in the Physics panel) – only once the button is
    // up, so the release does not go to the select tool and clear the selection
    onUp() {
      if (this.finished !== null) {
        const id = this.finished;
        this.finished = null;
        editor.setTool('select');
        editor.select([{ kind: 'instance', id }], 'set');
      }
    }

    onKey(event: KeyboardEvent, down: boolean) {
      if (down && event.key === 'Escape' && this.first) {
        this.cancel();
        return true;
      }
      return false;
    }

    cancel() {
      this.first = null;
      editor.redraw();
    }

    busy() {
      return !!this.first;
    }

    draw(overlay: Overlay) {
      const colour = '#f08c00';
      if (this.hover) {
        overlay.circle3D(this.hover.point, this.hover.normal, 0.1, colour, 2, 24);
        // where it snapped: a dot on the corner or the middle of the face
        if (this.hover.snap) {
          const at = overlay.screen(this.hover.point);
          if (at) {
            overlay.context.fillStyle = colour;
            overlay.context.beginPath();
            overlay.context.arc(at.x, at.y, 5, 0, Math.PI * 2);
            overlay.context.fill();
          }
        }
        // the axis it will turn around (or slide along), through the point
        if (!this.first && (jointKind === 'hinge' || jointKind === 'slider')) {
          const { point, normal } = this.hover;
          overlay.line(point.clone().addScaledVector(normal, -0.6), point.clone().addScaledVector(normal, 0.6), colour, 2, [5, 3]);
        }
      }
      if (this.first) {
        overlay.circle3D(this.first.point, this.first.normal, 0.12, colour, 3, 24);
        if (this.hover) {
          overlay.line(this.first.point, this.hover.point, colour, 1, [4, 4]);
        }
      }
    }
  })(editor);
};
