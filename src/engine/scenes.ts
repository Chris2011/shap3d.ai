import { reactive } from 'vue';
import type { Editor } from './editor';
import type { Scene } from '../core/document';
import { newId } from '../core/model';
import { t } from '../i18n';

/** the scene last chosen – shared by the Szenen panel and the scene tabs */
export const sceneState = reactive({ active: null as number | null });

const THUMBNAIL_WIDTH = 192;

/** A small JPEG of the current view for the scene tab preview. */
const thumbnail = (editor: Editor): string | undefined => {
  try {
    const source = editor.viewer.canvas;
    editor.viewer.render(); // the drawing buffer is only valid right after a render
    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = Math.round((THUMBNAIL_WIDTH * source.height) / Math.max(1, source.width));
    canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined; // no preview is fine
  }
};

/** What a scene stores: camera, style, hidden tags and a preview image. */
export const captureScene = (editor: Editor): Omit<Scene, 'id' | 'name'> => ({
  camera: editor.viewer.rig.getState(),
  style: { ...editor.model.settings.style },
  hiddenTags: editor.model.tags.filter((tag) => !tag.visible).map((tag) => tag.name),
  thumbnail: thumbnail(editor),
});

/** Adds a scene from the current view (one undo step) and makes it the active one. */
export const addScene = (editor: Editor) => {
  const scene: Scene = { id: newId(), name: t('scenes.defaultName', { number: editor.model.scenes.length + 1 }), ...captureScene(editor) };
  editor.commit('scenes.add', () => editor.model.scenes.push(scene));
  sceneState.active = scene.id;
  return scene;
};

/** Jump to a scene: camera, style and tag visibility (Szenen panel, scene tabs and command palette). */
export const applyScene = (editor: Editor, scene: Scene) => {
  sceneState.active = scene.id;
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
