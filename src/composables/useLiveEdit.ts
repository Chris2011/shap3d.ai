import { useEditor } from '../components/keys';

/**
 * Changes the model without an undo step – for values that follow a slider or colour picker live
 * (material colour, shadows …). Runs `apply`, redraws and marks the file unsaved.
 * Use `editor.commit` instead for changes that must be undoable.
 */
export const useLiveEdit = () => {
  const editor = useEditor();
  return (apply: () => void) => {
    apply();
    editor.invalidate();
    editor.ui.saved = false;
  };
};
