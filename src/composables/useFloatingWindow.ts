import { computed, type MaybeRefOrGetter } from 'vue';
import { useDraggable, useWindowSize } from '@vueuse/core';

/**
 * A floating window dragged by its title bar (`handle`). The position stays inside the browser window,
 * so the window can always be reached again. Bind the result to `left`/`top`.
 */
export const useFloatingWindow = (
  panel: MaybeRefOrGetter<HTMLElement | null | undefined>,
  handle: MaybeRefOrGetter<HTMLElement | null | undefined>,
  start = { x: 60, y: 56 },
) => {
  const { x, y } = useDraggable(panel, { handle, initialValue: start, preventDefault: true });
  const view = useWindowSize();
  return computed(() => ({
    x: Math.max(0, Math.min(view.width.value - 120, x.value)),
    y: Math.max(0, Math.min(view.height.value - 40, y.value)),
  }));
};
