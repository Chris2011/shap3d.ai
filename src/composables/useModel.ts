import { computed, type ComputedRef } from 'vue';
import { useEditor } from '../components/keys';
import type { Editor } from '../engine/editor';

/**
 * The model itself is not reactive (it is plain kernel data); the editor bumps `ui.rev` after every change
 * and `ui.selRev` after every selection change. These computeds re-read the model whenever that happens.
 */
export function useModel<T>(read: (ed: Editor) => T): ComputedRef<T> {
  const ed = useEditor();
  return computed(() => { void ed.ui.rev; return read(ed); });
}

/** Like useModel, but also follows selection changes. */
export function useSelection<T>(read: (ed: Editor) => T): ComputedRef<T> {
  const ed = useEditor();
  return computed(() => { void ed.ui.rev; void ed.ui.selRev; return read(ed); });
}
