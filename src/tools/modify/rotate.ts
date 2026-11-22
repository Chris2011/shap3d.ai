import * as THREE from 'three';
import type { PEvt } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import type { EntityRef } from '../../core/model';
import { PointTool, onPlane } from '../base';
import { AXES } from '../../engine/inference';
import { formatAngle } from '../../core/units';
import { t } from '../../i18n';
import { LiveTransform, arrayFromCopy, drawCopyMark } from './transform';
import { hoverPick, contextFilters, selectHoverIfNone } from './picking';
import { type RotateGrip } from './boxFrame';
import { BoxGrips } from './boxGrips';
import { pointerAngle, typedAngle, rotationMatrix } from './rotateAngle';
import { drawProtractor } from './protractor';

type V3 = THREE.Vector3;

export class RotateTool extends PointTool {
  id = 'rotate';
  name = 'tools.rotate';
  vcbLabel = 'vcb.angle';
  cursor = 'crosshair';
  center: V3 | null = null;
  ref: V3 | null = null;
  normal = new THREE.Vector3(0, 0, 1);
  angle = 0;
  live: LiveTransform | null = null;
  copy = false;
  normalLock: 'x' | 'y' | 'z' | null = null;
  hoverN = new THREE.Vector3(0, 0, 1);
  hoverP: V3 | null = null;
  lastCopy: { orig: EntityRef[]; angle: number; center: V3; normal: V3 } | null = null;
  /** the protractor snaps to the rotation grips of a group's or component's box */
  grips = new BoxGrips();
  /** started from a rotation grip of another tool (Move): back to it when done */
  returnTo: string | null = null;
  pressed = false;
  /** the start point's circle meets the face under the cursor here – the angle snapped to it */
  lean: { angle: number; point: V3 } | null = null;
  status() {
    return !this.center ? t('tools.status.rotateCenter') : !this.ref ? t('tools.status.rotateStart') : t('tools.status.rotateAngle');
  }
  busy() {
    return !!this.center;
  }
  cancel() {
    if (this.live) {
      this.editor.abortOp();
    }
    this.center = this.ref = null;
    this.live = null;
    this.angle = 0;
    this.lean = null;
    this.grips.clear();
    this.editor.setHover(null);
    this.goBack();
  }
  /** after the rotation from a grip: the tool it came from, unless the user picked another one meanwhile */
  goBack() {
    const back = this.returnTo;
    this.returnTo = null;
    this.pressed = false;
    if (back) {
      queueMicrotask(() => {
        if (this.editor.tool === this) {
          this.editor.setTool(back);
        }
      });
    }
  }
  /** rotation grip clicked in another tool: the protractor lies on the grip's face, the grip is the start of the angle */
  startAt(grip: RotateGrip, pointer: PEvt, returnTo: string) {
    this.center = grip.center.clone();
    this.normal = grip.axis.clone();
    this.begin(grip.world.clone());
    this.returnTo = returnTo;
    this.pressed = true;
    this.downAt = { x: pointer.x, y: pointer.y };
    this.editor.refreshStatus();
  }
  /** the start of the angle is set: the selection rotates live from here */
  begin(ref: V3) {
    const editor = this.editor;
    this.ref = ref;
    editor.beginOp(this.copy ? 'undo.rotateCopy' : 'tools.rotate');
    const orig = editor.selected();
    let refs = orig;
    if (this.copy) {
      refs = editor.entities.copy(refs, new THREE.Matrix4(), editor.model);
      editor.select(refs);
    }
    this.live = new LiveTransform(editor.entities, refs);
    this.lastCopy = this.copy ? { orig, angle: 0, center: this.center!.clone(), normal: this.normal.clone() } : null;
  }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    if (down && ['ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(keyEvent.key) && !this.ref) {
      const axis = keyEvent.key === 'ArrowUp' ? 'z' : keyEvent.key === 'ArrowRight' ? 'x' : 'y';
      this.normalLock = this.normalLock === axis ? null : axis;
      if (this.center) {
        this.normal = AXES[axis].clone();
      }
      return true;
    }
    if (keyEvent.key === 'Control' && down && !keyEvent.repeat) {
      this.copy = !this.copy;
      return true;
    }
    return super.onKey(keyEvent, down);
  }
  planeNormal(): V3 {
    return this.normalLock ? AXES[this.normalLock].clone() : this.hoverN.clone();
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (!this.center) {
      const hoverInference = this.pick(pointer, null);
      this.hoverP = hoverInference.point.clone();
      this.hoverN =
        hoverInference.face && hoverInference.kind === 'face' ? hoverInference.face.normal.clone().normalize() : new THREE.Vector3(0, 0, 1);
      if (!editor.selected().length) {
        editor.setHover(hoverPick(editor, pointer));
      }
      this.grips.update(editor, pointer, { rotate: !this.normalLock, starts: false, onGeometry: false });
      const hot = this.grips.hotRotate;
      if (hot) {
        this.hoverP = hot.center.clone();
        this.hoverN = hot.axis.clone();
      }
      return;
    }
    if (!this.ref) {
      this.hoverP = onPlane(this.pick(pointer, this.center).point, this.center, this.normal);
      return;
    }
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.center);
    let target = editor.viewer.ray(pointer.x, pointer.y).intersectPlane(plane, new THREE.Vector3());
    const inference = this.pick(pointer, this.center, contextFilters(editor, this.live));
    if (inference.kind === 'endpoint' || inference.kind === 'midpoint' || inference.kind === 'edge') {
      target = onPlane(inference.point, this.center, this.normal);
    }
    if (!target) {
      return;
    }
    const { angle, lean } = pointerAngle(this.center, this.normal, this.ref, target, inference);
    this.lean = lean;
    this.applyAngle(angle);
  }
  applyAngle(angle: number) {
    this.angle = angle;
    this.live?.apply(rotationMatrix(this.editor, this.center!, this.normal, angle));
    this.editor.invalidate();
    this.editor.setVcb(formatAngle(angle));
  }
  onDown(pointer: PEvt) {
    const editor = this.editor;
    if (!this.center) {
      if (!selectHoverIfNone(editor)) {
        editor.toast(t('toast.selectFirst'));
        return;
      }
      editor.setHover(null);
      const hot = this.grips.hotRotate;
      this.center = hot ? hot.center.clone() : this.pick(pointer, null).point.clone();
      this.normal = hot ? hot.axis.clone() : this.planeNormal();
      this.grips.clear();
      return;
    }
    if (!this.ref) {
      const point = onPlane(this.pick(pointer, this.center).point, this.center, this.normal);
      if (point.distanceTo(this.center) >= 1e-5) {
        this.begin(point);
      }
      return;
    }
    this.finish();
  }
  onUp(pointer: PEvt) {
    // dragged from a rotation grip: letting go ends the rotation
    if (this.pressed && this.isDrag(pointer) && this.live) {
      this.finish();
    }
    this.pressed = false;
  }
  finish() {
    if (!this.live) {
      return;
    }
    this.live.finish();
    this.editor.endOp();
    if (this.lastCopy) {
      this.lastCopy.angle = this.angle;
    }
    this.center = this.ref = null;
    this.live = null;
    this.editor.invalidate();
    this.goBack();
  }
  onVcb(text: string) {
    const last = this.lastCopy;
    if (!this.center && last) {
      // the array turns about the copy's centre and axis
      const labels = { multiply: 'undo.rotateArray', divide: 'undo.rotateArray' };
      const turned = (factor: number) => rotationMatrix(this.editor, last.center, last.normal, last.angle * factor);
      if (arrayFromCopy(this.editor, text, last.orig, labels, turned)) {
        this.lastCopy = null;
        return true;
      }
    }
    if (!this.ref) {
      return false;
    }
    const angle = typedAngle(text);
    if (angle == null) {
      return false;
    }
    this.applyAngle(angle);
    this.finish();
    return true;
  }
  draw(overlay: Overlay) {
    const editor = this.editor;
    if (!this.center) {
      this.grips.draw(editor, overlay, false);
    }
    const center = this.center ?? this.hoverP;
    if (!center) {
      return;
    }
    drawProtractor(editor, overlay, center, this.center ? this.normal : this.planeNormal());
    if (this.center && (this.ref || this.hoverP)) {
      overlay.line(this.center, this.ref ?? this.hoverP!, '#555', 1, [4, 3]);
      if (this.ref) {
        overlay.line(this.center, this.ref.clone().sub(this.center).applyAxisAngle(this.normal, this.angle).add(this.center), '#000', 1.2);
        if (this.lean) {
          overlay.marker(this.lean.point, 'cross');
          overlay.tooltip(editor.mouse.x, editor.mouse.y, t('inference.radiusOnFace'));
        }
      }
    }
    if (this.copy) {
      drawCopyMark(editor, overlay);
    }
    if (!this.ref) {
      this.drawInference(overlay);
    }
  }
}
