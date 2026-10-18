import { computed, type ComputedRef } from 'vue';
import { useEditor } from '../components/keys';
import type { Editor } from '../engine/editor';

/**
 * The model itself is not reactive (it is plain kernel data); the editor bumps `ui.rev` after every change
 * and `ui.selRev` after every selection change. These computeds re-read the model whenever that happens.
 */
export const useModel = <T>(read: (editor: Editor) => T): ComputedRef<T> => {
  const editor = useEditor();
  return computed(() => { void editor.ui.rev; return read(editor); });
};

/** Like useModel, but also follows selection changes. */
export const useSelection = <T>(read: (editor: Editor) => T): ComputedRef<T> => {
  const editor = useEditor();
  return computed(() => { void editor.ui.rev; void editor.ui.selRev; return read(editor); });
};
