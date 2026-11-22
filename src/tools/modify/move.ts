import * as THREE from 'three';
import type { PEvt } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import type { EntityRef } from '../../core/model';
import { PointTool } from '../base';
import { AXIS_COLOR } from '../../engine/inference';
import { t } from '../../i18n';
import { LiveTransform, localTranslation, arrayFromCopy, drawCopyMark } from './transform';
import { hoverPick, contextFilters, selectHoverIfNone } from './picking';
import { BoxGrips } from './boxGrips';
import { SeeThrough } from './seeThrough';
import { GapPicker } from './gaps';
import { typedOffset } from './typedOffset';

type V3 = THREE.Vector3;

export class MoveTool extends PointTool {
  id = 'move';
  name = 'tools.move';
  vcbLabel = 'vcb.distance';
  cursor = 'move';
  start: V3 | null = null;
  live: LiveTransform | null = null;
  copy = false;
  pressed = false;
  delta = new THREE.Vector3();
  lastCopy: { delta: V3; orig: EntityRef[] } | null = null;
  /** what was selected when the move began – a copy is selected while it moves */
  moved: EntityRef[] = [];
  grips = new BoxGrips();
  /** moving from an outline edge: the moved groups are see-through */
  seeThrough = new SeeThrough();
  fromProfile = false;
  /** while moving: the free space to the neighbours; Tab picks one, and a typed length is then that space */
  gaps = new GapPicker();
  status() {
    const base = this.start ? t(this.copy ? 'tools.status.moveTargetCopy' : 'tools.status.moveTarget') : t('tools.status.moveStart');
    return this.start && this.gaps.gaps.length
      ? `${base} ${t(this.gaps.hot ? 'tools.status.moveGapType' : 'tools.status.moveGapTab')}`
      : base;
  }
  busy() {
    return !!this.start;
  }
  /** back to waiting for a start point (after finishing, or when cancelled) */
  reset() {
    this.seeThrough.clear(this.editor);
    this.start = null;
    this.live = null;
    this.gaps.clear();
    this.fromProfile = false;
    this.resetLocks();
  }
  cancel() {
    if (this.start) {
      this.editor.abortOp();
    }
    this.reset();
    this.grips.clear();
    this.editor.setHover(null);
  }
  activate() {
    this.copy = false;
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (!this.start) {
      this.pick(pointer, null);
      if (!editor.selected().length) {
        editor.setHover(hoverPick(editor, pointer));
      }
      // a group or component shows its box: crosses rotate it, corners, midpoints and outline edges are start points
      const onGeometry = ['endpoint', 'midpoint'].includes(this.inference?.kind ?? '');
      this.grips.update(editor, pointer, { rotate: true, starts: true, onGeometry });
      return;
    }
    const inference = this.pick(pointer, this.start, contextFilters(editor, this.live));
    this.apply(inference.point.clone().sub(this.start));
  }
  apply(delta: V3) {
    const editor = this.editor;
    this.delta.copy(delta);
    this.live!.apply(localTranslation(editor, this.start!, delta));
    if (this.gaps.update(editor)) {
      editor.refreshStatus();
    }
    editor.invalidate();
    editor.setVcb(editor.fmt(delta.length()));
  }
  begin(point: V3, fromProfile = false) {
    const editor = this.editor;
    if (!selectHoverIfNone(editor)) {
      return;
    }
    editor.setHover(null);
    this.start = point.clone();
    editor.beginOp(this.copy ? 'commands.copy' : 'tools.move');
    const orig = editor.selected();
    let refs = orig;
    this.moved = orig;
    if (this.copy) {
      refs = editor.entities.copy(refs, new THREE.Matrix4(), editor.model);
      editor.select(refs);
    }
    this.live = new LiveTransform(editor.entities, refs);
    this.lastCopy = this.copy ? { delta: new THREE.Vector3(), orig } : null;
    this.fromProfile = fromProfile;
    if (fromProfile) {
      this.seeThrough.apply(editor, this.live.insts.keys());
    }
  }
  onDown(pointer: PEvt) {
    this.downAt = { x: pointer.x, y: pointer.y };
    if (this.start) {
      this.finish();
      return;
    }
    const editor = this.editor;
    const { frame, hotRotate, hotPoint, hotProfile } = this.grips;
    if (hotRotate && frame) {
      this.grips.startRotate(editor, pointer);
      return;
    }
    if ((hotPoint || hotProfile) && frame) {
      editor.select([frame.instance]);
    }
    const point = hotPoint ?? hotProfile?.point ?? this.pick(pointer, null).point;
    this.grips.clear();
    this.begin(point, !!hotProfile);
    this.pressed = true;
  }
  onUp(pointer: PEvt) {
    if (this.pressed && this.isDrag(pointer) && this.start) {
      this.finish();
    }
    this.pressed = false;
  }
  finish() {
    if (!this.start || !this.live) {
      return;
    }
    if (this.delta.lengthSq() < 1e-12 && !this.copy) {
      this.cancel();
      return;
    }
    this.seeThrough.clear(this.editor);
    this.live.finish();
    this.editor.endOp();
    if (this.lastCopy) {
      this.lastCopy.delta = this.delta.clone();
    }
    this.reset();
    this.editor.invalidate();
  }
  onKey(keyEvent: KeyboardEvent, down: boolean) {
    // Tab steps through the gaps to the neighbours (and back to none); a typed length then sets that gap
    if (keyEvent.key === 'Tab' && this.start && this.gaps.gaps.length) {
      if (down) {
        this.gaps.next(keyEvent.shiftKey);
        this.editor.setVcb(this.editor.fmt(this.gaps.hot?.length ?? this.delta.length()));
      }
      return true;
    }
    if (keyEvent.key === 'Control' && down && !keyEvent.repeat) {
      this.toggleCopy();
      return true;
    }
    // before the start point arrow keys move the selection (nudge) instead of locking a direction
    if (!this.start && keyEvent.key.startsWith('Arrow') && this.editor.selected().length) {
      return false;
    }
    return super.onKey(keyEvent, down);
  }
  /** Ctrl: copy on/off – while moving, it starts over from the same point with the same offset */
  toggleCopy() {
    this.copy = !this.copy;
    if (this.start) {
      const start = this.start,
        delta = this.delta.clone();
      this.seeThrough.clear(this.editor);
      this.editor.abortOp();
      this.editor.select(this.moved);
      this.start = null;
      this.live = null;
      this.begin(start, this.fromProfile);
      this.apply(delta);
    }
    this.editor.refreshStatus();
  }
  onVcb(text: string) {
    if (!this.start) {
      return this.arrayFromLastCopy(text);
    }
    const offset = typedOffset(this.editor, text, (part) => this.lengthOf(part), this.delta, this.gaps);
    if (!offset) {
      return false;
    }
    this.apply(offset);
    this.finish();
    return true;
  }
  /** *5 or /5 right after a copy: an array along the copy's offset */
  arrayFromLastCopy(text: string) {
    const editor = this.editor;
    const last = this.lastCopy;
    const labels = { multiply: 'undo.copyArray', divide: 'undo.copyDivide' };
    const along = (factor: number) => localTranslation(editor, new THREE.Vector3(), last!.delta.clone().multiplyScalar(factor));
    if (!last || !arrayFromCopy(editor, text, last.orig, labels, along)) {
      return false;
    }
    this.lastCopy = null;
    return true;
  }
  draw(overlay: Overlay) {
    if (this.start && this.inference) {
      const col = this.inference.axis ? AXIS_COLOR[this.inference.axis] : '#000';
      overlay.line(this.start, this.start.clone().add(this.delta), col, 1.2, [4, 3]);
    }
    if (this.start) {
      this.gaps.draw(this.editor, overlay);
    } else {
      this.grips.draw(this.editor, overlay, true);
    }
    this.drawInference(overlay, !this.grips.hot);
    if (this.copy) {
      drawCopyMark(this.editor, overlay);
    }
  }
}
