import type { Editor } from './editor';
import type { Scene } from '../core/document';

/** Jump to a scene: camera, style and tag visibility (Szenen panel and command palette). */
export function applyScene(ed: Editor, sc: Scene) {
  ed.viewer.rig.applyState(sc.camera, true); ed.ui.projection = sc.camera.ortho ? 'ortho' : 'persp';
  if (sc.style) Object.assign(ed.model.settings.style, sc.style);
  if (sc.hiddenTags) for (const t of ed.model.tags) t.visible = !sc.hiddenTags.includes(t.name);
  ed.invalidate();
}
