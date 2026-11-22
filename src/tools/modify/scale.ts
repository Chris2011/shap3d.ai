import * as THREE from 'three';
import type { PEvt } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import { PointTool } from '../base';
import { closestOnLineToRay, snapping } from '../../engine/inference';
import { aboutPoint } from '../../core/geometry';
import { t, formatDecimal } from '../../i18n';
import { LiveTransform } from './transform';
import { hoverPick, nearestOnScreen } from './picking';
import { drawBoxEdges } from './boxFrame';
import { type ScaleGrip, scaleGrips, gripAxes, boxAxes, isCornerGrip, typedFactors } from './scaleBox';

export class ScaleTool extends PointTool {
  id = 'scale';
  name = 'tools.scale';
  vcbLabel = 'vcb.scale';
  cursor = 'crosshair';
  box: THREE.Box3 | null = null;
  grips: ScaleGrip[] = [];
  hot: ScaleGrip | null = null;
  active: ScaleGrip | null = null;
  anchor = new THREE.Vector3();
  /** 1 for each axis the active grip scales */
  mask = new THREE.Vector3();
  live: LiveTransform | null = null;
  pressed = false;
  /** Shift held: a corner scales per axis, an edge or face grip evenly */
  shift = false;
  status() {
    return this.active ? t('tools.status.scaleDrag') : this.box ? t('tools.status.scaleGrip') : t('tools.status.scalePick');
  }
  activate() {
    this.refresh();
  }
  busy() {
    return !!this.active;
  }
  cancel() {
    if (this.active) {
      this.editor.abortOp();
    }
    this.active = null;
    this.live = null;
    this.refresh();
  }
  /** the box of the selection in the open group's axes, and its grips */
  refresh() {
    const editor = this.editor;
    const refs = editor.selected();
    const box = refs.length ? editor.entities.refBounds(refs) : null;
    this.box = box && !box.isEmpty() ? box : null;
    this.grips = this.box ? scaleGrips({ box: this.box, matrix: editor.contextMatrix }) : [];
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (!this.box) {
      this.refresh();
      if (!this.box) {
        editor.setHover(hoverPick(editor, pointer));
        return;
      }
    }
    if (!this.active) {
      this.hot = nearestOnScreen(editor, pointer, this.grips, (grip) => grip.world, 10);
      return;
    }
    const anchorWorld = editor.toWorld(this.anchor);
    const direction = this.active.world.clone().sub(anchorWorld);
    const gripDistance = direction.length();
    if (gripDistance < 1e-9) {
      return;
    }
    const point = closestOnLineToRay(anchorWorld, direction.clone().normalize(), editor.viewer.ray(pointer.x, pointer.y));
    let factor = point.sub(anchorWorld).dot(direction) / (gripDistance * gripDistance);
    if (Math.abs(factor) < 1e-3) {
      factor = 1e-3 * Math.sign(factor || 1);
    }
    // snap to round factors
    const rounded = Math.round(factor * 10) / 10;
    if (snapping.value && Math.abs(factor - rounded) < 0.02) {
      factor = rounded;
    }
    this.applyFactor(factor);
  }
  /** scales by `factor` along the grip's axes (all of them at a corner), or by `explicit` per axis */
  applyFactor(factor: number, explicit?: THREE.Vector3) {
    const editor = this.editor;
    const mask = this.mask;
    const uniform = isCornerGrip(this.active!, this.box!) !== this.shift;
    const scale =
      explicit ??
      (uniform
        ? new THREE.Vector3(factor, factor, factor)
        : new THREE.Vector3(mask.x ? factor : 1, mask.y ? factor : 1, mask.z ? factor : 1));
    // a flat box is not scaled across its flat side
    const size = this.box!.getSize(new THREE.Vector3());
    (['x', 'y', 'z'] as const).forEach((axis) => {
      if (size[axis] < 1e-6) {
        scale[axis] = 1;
      }
    });
    this.live!.apply(aboutPoint(this.anchor, new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z)));
    editor.invalidate();
    editor.setVcb(
      scale
        .toArray()
        .filter((_, i) => (uniform ? i === 0 : mask.toArray()[i]))
        .map((value) => formatDecimal(value, 2))
        .join('; '),
    );
  }
  onDown(pointer: PEvt) {
    const editor = this.editor;
    this.downAt = { x: pointer.x, y: pointer.y };
    if (!this.box) {
      if (editor.hover) {
        editor.select([editor.hover]);
        editor.setHover(null);
        this.refresh();
      }
      return;
    }
    if (this.active) {
      this.finish();
      return;
    }
    if (!this.hot) {
      // clicking elsewhere selects something else
      const entityRef = hoverPick(editor, pointer);
      if (entityRef) {
        editor.select([entityRef]);
        this.refresh();
      }
      return;
    }
    const grip = (this.active = this.hot);
    this.pressed = true;
    // the opposite grip stays in place – with Ctrl the centre
    const anchorFraction = pointer.ctrl ? new THREE.Vector3(0.5, 0.5, 0.5) : new THREE.Vector3(1, 1, 1).sub(grip.fraction);
    const size = this.box.getSize(new THREE.Vector3());
    this.anchor = this.box.min.clone().add(size.multiply(anchorFraction));
    this.mask.set(grip.fraction.x !== 0.5 ? 1 : 0, grip.fraction.y !== 0.5 ? 1 : 0, grip.fraction.z !== 0.5 ? 1 : 0);
    editor.beginOp('tools.scale');
    this.live = new LiveTransform(editor.entities, editor.selected());
  }
  onUp(pointer: PEvt) {
    if (this.pressed && this.isDrag(pointer)) {
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
    this.active = null;
    this.live = null;
    this.refresh();
    this.editor.invalidate();
  }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    if (keyEvent.key === 'Shift') {
      this.shift = down;
      return true;
    }
    return false;
  }
  onVcb(text: string) {
    if (!this.active) {
      return false;
    }
    const typed = typedFactors(text, this.mask, this.box!.getSize(new THREE.Vector3()), (part) => this.lengthOf(part));
    if (!typed) {
      return false;
    }
    this.applyFactor('uniform' in typed ? typed.uniform : 1, 'factors' in typed ? typed.factors : undefined);
    this.finish();
    return true;
  }
  draw(overlay: Overlay) {
    const editor = this.editor;
    if (!this.active) {
      this.refresh();
    }
    if (!this.box) {
      return;
    }
    // bounding box (yellow like SketchUp) and grips (green, the hot one red)
    drawBoxEdges(overlay, { box: this.box, matrix: editor.contextMatrix }, 1.2);
    const context = overlay.context;
    for (const grip of this.grips) {
      const screenPos = overlay.screen(grip.world);
      if (screenPos) {
        context.fillStyle = grip === this.hot || grip === this.active ? '#e00000' : '#00a000';
        context.fillRect(screenPos.x - 4, screenPos.y - 4, 8, 8);
      }
    }
    const anchor = this.active && overlay.screen(editor.toWorld(this.anchor));
    if (anchor) {
      context.strokeStyle = '#e00000';
      context.lineWidth = 2;
      context.strokeRect(anchor.x - 5, anchor.y - 5, 10, 10);
    }
    if (this.hot && !this.active) {
      const axes = gripAxes(this.hot);
      const hint =
        axes === 3 || axes === boxAxes(this.box)
          ? t('tools.hints.scaleUniform')
          : axes === 2
            ? t('tools.hints.scaleTwoAxes')
            : t('tools.hints.scaleOneAxis');
      overlay.tooltip(editor.mouse.x, editor.mouse.y, hint);
    }
  }
}
