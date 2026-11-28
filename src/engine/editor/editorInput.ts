import * as THREE from 'three';
import { Model } from '../../core/document';
import { t } from '../../i18n';
import { nav, wheelAction } from '../navigation';
import { EditorAnnotations } from './editorAnnotations';
import type { PEvt } from './tool';

/** Pointer and wheel input (to the tool, or orbit and pan), zoom extents, and starting a new or opened model. */
export abstract class EditorInput extends EditorAnnotations {
  private nav: { mode: 'orbit' | 'pan'; x: number; y: number; pivot: THREE.Vector3 | null } | null = null;
  // ------------------------------------------------------------ input
  private lastDown = { t: 0, x: 0, y: 0 };
  pointerDown(pointer: PEvt) {
    // a click right after a change (a rectangle, then P) must already see the new geometry – the view rebuilds only
    // on the next animation frame, which may come after this event (slow frames, a busy or hidden window)
    this.frame();
    if (pointer.button === 1 || (pointer.button === 0 && this.ui.tool === 'orbit' && false)) {
      const faceHit = this.viewer.pickFace(pointer.x, pointer.y);
      this.nav = { mode: pointer.shift ? 'pan' : 'orbit', x: pointer.x, y: pointer.y, pivot: faceHit ? faceHit.point : null };
      return;
    }
    if (pointer.button === 2) {
      return;
    }
    this.tool.onDown(pointer);
    this.refreshStatus();
    this.redraw();
  }
  pointerMove(pointer: PEvt) {
    this.mouse.x = pointer.x;
    this.mouse.y = pointer.y;
    this.mouse.inside = true;
    if (this.nav) {
      const deltaX = pointer.x - this.nav.x,
        deltaY = pointer.y - this.nav.y;
      this.nav.x = pointer.x;
      this.nav.y = pointer.y;
      if (this.nav.mode === 'orbit' && !pointer.shift) {
        this.viewer.rig.orbit(deltaX, deltaY, this.nav.pivot ?? undefined);
      } else {
        this.viewer.rig.pan(deltaX, deltaY, this.viewer.height, this.nav.pivot ?? undefined);
      }
      return;
    }
    this.tool.onMove(pointer);
    this.redraw();
  }
  pointerUp(pointer: PEvt) {
    if (this.nav && pointer.button === 1) {
      this.nav = null;
      return;
    }
    if (pointer.button !== 0) {
      return;
    }
    this.tool.onUp(pointer);
    this.refreshStatus();
    this.redraw();
  }
  dblClick(pointer: PEvt) {
    this.frame();
    if (pointer.button === 0) {
      this.tool.onDblClick(pointer);
      this.refreshStatus();
      this.redraw();
    }
  }
  private gesture: { pivot: THREE.Vector3 | null; time: number } | null = null;
  /** Wheel / trackpad gestures: zoom, orbit or pan depending on device and Shift/Ctrl (see navigation.ts). */
  wheel(x: number, y: number, wheelEvent: { deltaX: number; deltaY: number; shift: boolean; ctrl: boolean; mode: number }) {
    const unit = wheelEvent.mode === 1 ? 16 : wheelEvent.mode === 2 ? this.viewer.height : 1;
    let deltaX = wheelEvent.deltaX * unit,
      deltaY = wheelEvent.deltaY * unit;
    // browsers turn Shift+wheel into a horizontal scroll on mouse wheels
    if (wheelEvent.shift && nav.device === 'mouse' && deltaY === 0) {
      deltaY = deltaX;
      deltaX = 0;
    }
    const action = wheelAction(wheelEvent.shift, wheelEvent.ctrl);
    const now = performance.now();
    if (!this.gesture || now - this.gesture.time > 250) {
      this.gesture = { pivot: this.pivotAt(x, y), time: now };
    }
    this.gesture.time = now;
    const rig = this.viewer.rig;
    const sens = nav.sensitivity[action];
    const inv = nav.invert[action] ? -1 : 1;
    if (action === 'zoom') {
      // pinch deltas are small, wheel notches are ~100px
      const speed = nav.device === 'trackpad' ? (wheelEvent.ctrl ? 0.012 : 0.004) : 0.0016;
      rig.zoomAt(this.pivotAt(x, y), Math.exp(THREE.MathUtils.clamp(deltaY * speed * sens * inv, -0.6, 0.6)));
    } else if (action === 'orbit') {
      const k = (nav.device === 'mouse' ? 0.35 : 0.8) * sens * inv;
      rig.orbit(deltaX * k, deltaY * k, this.gesture.pivot ?? undefined);
    } else {
      const k = (nav.device === 'mouse' ? 0.6 : 1) * sens * inv;
      rig.pan(-deltaX * k, -deltaY * k, this.viewer.height, this.gesture.pivot ?? undefined);
    }
  }
  /** Point under the cursor (face hit, else ground plane, else target distance). */
  pivotAt(x: number, y: number): THREE.Vector3 {
    const faceHit = this.viewer.pickFace(x, y);
    if (faceHit) {
      return faceHit.point;
    }
    const ray = this.viewer.ray(x, y);
    const distance = this.viewer.rig.position.distanceTo(this.viewer.rig.target);
    const groundPoint = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
    return groundPoint && groundPoint.distanceTo(ray.origin) < distance * 8 ? groundPoint : ray.at(distance, new THREE.Vector3());
  }

  zoomExtents(animate = true) {
    this.viewer.rig.zoomExtents(this.model.bounds(), animate);
  }

  newModel() {
    this.model.load(new Model().toJSON());
    this.model.name = t('names.untitled');
    this.activePath = [];
    this.updateContextName();
    this.clearSelection();
    this.onNewModel.forEach((listener) => listener());
    this.resetHistory();
    this.ui.saved = true;
    this.invalidate();
    this.setTool('select');
    this.viewer.rig.applyState({ position: [-11, -17, 5.5], target: [2, 2, 1.2], fov: 35, ortho: false });
  }
  loadJSON(json: any) {
    this.model.load(json);
    this.activePath = [];
    this.updateContextName();
    this.resetHistory();
    this.clearSelection();
    this.ui.saved = true;
    this.invalidate();
    this.zoomExtents(false);
  }
}
