// What Move and Rotate offer on the box of a group before they start: rotation grips, box points and outline edges.
import type * as THREE from 'three';
import type { Editor, PEvt } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import { snapping } from '../../engine/inference';
import { t } from '../../i18n';
import { type BoxFrame, type RotateGrip, boxFrame, rotateGrips, boxGripPoints, drawBoxFrame } from './boxFrame';
import { type ProfileGrip, profileUnder } from './profile';
import { nearestOnScreen } from './picking';
import type { RotateTool } from './rotate';

type Pointer = { x: number; y: number };

/** The box of the single selected (or hovered) group or component, and the grip under the cursor. */
export class BoxGrips {
  frame: BoxFrame | null = null;
  rotate: RotateGrip[] = [];
  hotRotate: RotateGrip | null = null;
  /** a corner or edge midpoint of the box – Move starts there like at geometry */
  hotPoint: THREE.Vector3 | null = null;
  /** an outline edge – also of round things, whose outline is no real edge */
  hotProfile: ProfileGrip | null = null;

  /**
   * `rotate`: the rotation grips can be hot; `starts`: box points and outline edges too (Move);
   * `onGeometry`: the cursor already snaps to an endpoint or midpoint, which wins over the box.
   */
  update(editor: Editor, pointer: Pointer, options: { rotate: boolean; starts: boolean; onGeometry: boolean }) {
    this.frame = boxFrame(editor);
    this.rotate = this.frame ? rotateGrips(editor, this.frame) : [];
    this.hotRotate = options.rotate ? nearestOnScreen(editor, pointer, this.rotate, (grip) => grip.world) : null;
    const free = !!this.frame && options.starts && !this.hotRotate && !options.onGeometry;
    this.hotPoint = free && snapping.value ? nearestOnScreen(editor, pointer, boxGripPoints(this.frame!), (point) => point) : null;
    this.hotProfile = free && !this.hotPoint ? profileUnder(editor, pointer, this.frame!) : null;
  }
  clear() {
    this.frame = null;
    this.rotate = [];
    this.hotRotate = null;
    this.hotPoint = null;
    this.hotProfile = null;
  }
  get hot() {
    return !!(this.hotRotate || this.hotPoint || this.hotProfile);
  }
  /** a rotation grip was clicked in Move: Rotate takes over from it and comes back afterwards */
  startRotate(editor: Editor, pointer: PEvt) {
    editor.select([this.frame!.instance]);
    editor.setHover(null);
    const rotate = editor.tools.get('rotate') as RotateTool | undefined;
    if (rotate) {
      editor.setTool('rotate');
      rotate.startAt(this.hotRotate!, pointer, 'move');
    }
  }
  /** `hints`: the hot grip's protractor and tooltips (Move); Rotate draws its own protractor */
  draw(editor: Editor, overlay: Overlay, hints: boolean) {
    if (!this.frame) {
      return;
    }
    drawBoxFrame(overlay, this.frame, this.rotate, hints ? this.hotRotate : null);
    if (!hints) {
      return;
    }
    if (this.hotPoint) {
      overlay.marker(this.hotPoint, 'endpoint');
    }
    if (this.hotRotate) {
      overlay.tooltip(editor.mouse.x, editor.mouse.y, t('tools.hints.rotateGrip'));
    }
    if (this.hotProfile) {
      overlay.line(this.hotProfile.start, this.hotProfile.end, '#e07000', 3);
      overlay.marker(this.hotProfile.point, 'edge');
      overlay.tooltip(editor.mouse.x, editor.mouse.y, t('inference.onProfile'));
    }
  }
}
