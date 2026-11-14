import { useEventListener } from '@vueuse/core';
import { tour, closeTour } from '../components/tour';

/**
 * Keys while the tour is open: Esc closes, → and ← move. Listens in the capture phase,
 * so the editor's own shortcuts do not see these keys.
 */
export const useTourKeyboard = (next: () => void, back: () => void) => {
  useEventListener(
    window,
    'keydown',
    (event: KeyboardEvent) => {
      if (!tour.open) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeTour();
      } else if (event.key === 'ArrowRight') {
        event.stopPropagation();
        next();
      } else if (event.key === 'ArrowLeft' && tour.step > 0) {
        event.stopPropagation();
        back();
      }
    },
    { capture: true },
  );
};
