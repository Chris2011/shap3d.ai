import type { StyleSettings } from '../../core/document';
import { newId } from '../../core/model';
import { toVec, type Pt } from '../points';
import { ScriptRoundSolids } from './scriptRoundSolids';
import { recordParametricShapes } from '../parametric';

/**
 * The `s3d` object available to scripts. Units are meters unless strings like "50cm" are used.
 * Built in layers (base, groups, sketch, solids, round solids); this last one adds guides, dimensions, labels, camera, view, shadows and style.
 */
export class ScriptApi extends ScriptRoundSolids {
  private cameraAfter: (() => void) | null = null;
  guide(point: Pt, dir?: Pt) {
    if (dir) {
      this.editor.model.guides.push({ id: newId(), kind: 'line', point: toVec(point), direction: toVec(dir).normalize() });
    } else {
      this.editor.model.guides.push({ id: newId(), kind: 'point', point: toVec(point) });
    }
  }
  dimension(fromPoint: Pt, toPoint: Pt, offset: Pt = [0, -0.5, 0]) {
    this.editor.model.dimensions.push({ id: newId(), start: toVec(fromPoint), end: toVec(toPoint), offset: toVec(offset) });
  }
  label(point: Pt, text: string, offset: Pt = [0.5, 0.5, 0.8]) {
    this.editor.model.labels.push({ id: newId(), point: toVec(point), text, offset: toVec(offset) });
  }
  // ---------------- view ----------------
  camera(pos: Pt, target: Pt, fov?: number) {
    const rig = this.editor.viewer.rig;
    this.cameraAfter = () =>
      rig.applyState({ position: toVec(pos).toArray(), target: toVec(target).toArray(), fov: fov ?? rig.persp.fov, ortho: rig.isOrtho });
  }
  zoomExtents() {
    this.cameraAfter = () => this.editor.zoomExtents();
  }
  view(name: 'top' | 'front' | 'back' | 'left' | 'right' | 'iso' | 'bottom') {
    this.cameraAfter = () => this.editor.viewer.rig.standardView(name, this.editor.model.bounds());
  }
  shadows(enabled = true, hour?: number) {
    this.editor.model.settings.shadows = enabled;
    if (hour != null) {
      this.editor.model.settings.shadowHour = hour;
    }
  }
  style(settings: Partial<StyleSettings>) {
    Object.assign(this.editor.model.settings.style, settings);
  }
  afterRun() {
    this.cameraAfter?.();
  }
}

// round shapes remember how they were made, for the polygon panel
recordParametricShapes(ScriptApi);
