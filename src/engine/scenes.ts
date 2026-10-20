import type { Editor } from './editor';
import type { Scene } from '../core/document';

/** Jump to a scene: camera, style and tag visibility (Szenen panel and command palette). */
export const applyScene = (editor: Editor, scene: Scene) => {
  editor.viewer.rig.applyState(scene.camera, true);
  editor.ui.projection = scene.camera.ortho ? 'ortho' : 'persp';
  if (scene.style) {
    Object.assign(editor.model.settings.style, scene.style);
  }
  if (scene.hiddenTags) {
    for (const tag of editor.model.tags) {
      tag.visible = !scene.hiddenTags.includes(tag.name);
    }
  }
  editor.invalidate();
};
