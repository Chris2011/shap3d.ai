import { ref, type MaybeRefOrGetter } from 'vue';
import { onClickOutside } from '@vueuse/core';

/** Open/close state of a small popup menu that closes on any click outside `target` (button + popup). */
export const usePopover = (target: MaybeRefOrGetter<HTMLElement | null | undefined>) => {
  const open = ref(false);
  const close = () => {
    open.value = false;
  };
  const toggle = () => {
    open.value = !open.value;
  };
  onClickOutside(target, close);
  return { open, toggle, close };
};
