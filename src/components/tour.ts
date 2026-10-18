import { reactive } from 'vue';
import { useStorage } from '@vueuse/core';

/** Welcome tour: opens by itself on the very first start, later via Menü › Einführung. */
const seen = useStorage<boolean>('s3d:tour-seen', false, undefined, {
  serializer: { read: v => v === '1' || v === 'true', write: v => (v ? '1' : '') }, // '1' as stored by earlier versions
});
export const tour = reactive({ open: false, step: 0 });

export function openTour(step = 0) { tour.step = step; tour.open = true; }
export function closeTour() { tour.open = false; seen.value = true; }
export const tourSeen = () => seen.value;
