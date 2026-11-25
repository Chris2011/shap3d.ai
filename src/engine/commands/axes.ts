// Turning the drawing axes onto a face and back – drawing in empty space then follows that face's plane.
import type { Editor } from '../editor';
import { axesOnFace } from '../drawingAxes';
import { t } from '../../i18n';

/** the one selected face, if exactly one is selected */
const selectedFace = (editor: Editor) => {
  const faces = editor.selected().filter((entityRef) => entityRef.kind === 'face');
  return faces.length === 1 ? editor.entities.faces.get(faces[0].id) : undefined;
};

/** Red along the face's first edge, blue out of its front, origin at its first corner (one undo step). */
export const alignAxesToFace = (editor: Editor) => {
  const face = selectedFace(editor);
  if (!face) {
    editor.toast(t('toast.selectOneFace'));
    return;
  }
  editor.commit('commands.alignAxes', () => {
    editor.model.settings.drawingAxes = axesOnFace(editor.entities, face, editor.contextMatrix);
  });
};

/** back to the model axes */
export const resetAxes = (editor: Editor) =>
  editor.commit('commands.resetAxes', () => {
    editor.model.settings.drawingAxes = undefined;
  });

export const canAlignAxes = (editor: Editor) => !!selectedFace(editor);
