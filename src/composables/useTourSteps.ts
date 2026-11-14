import { computed } from 'vue';
import { BRAND } from '../brand';
import { tour, closeTour } from '../components/tour';
import { PANEL_INFO, showPanel } from '../components/panelState';
import { t } from '../i18n';

/** the chat panel of the built-in AI plugin (plugins/builtin/ai) – only there while the plugin is on */
const AI_PANEL = 'ai.chat';

export interface TourStep {
  title: string;
  text: string;
  tips?: string[];
  action?: { label: string; run: () => void; available?: () => boolean };
}

/** texts: `tour.<step>.title`, `.text`, `.tip1` … (tips may contain <kbd> and <b>) */
const tourStep = (id: string, tips = 0, action?: { run: () => void; available?: () => boolean }): TourStep => ({
  title: t(`tour.${id}.title`, { name: BRAND.name }),
  text: t(`tour.${id}.text`),
  tips: tips ? Array.from({ length: tips }, (_, i) => t(`tour.${id}.tip${i + 1}`)) : undefined,
  action: action && { label: t(`tour.${id}.action`), ...action },
});

/** The steps of the welcome tour in the current language, the shown one, and moving between them. */
export const useTourSteps = () => {
  const steps = computed(() => [
    tourStep('welcome'),
    tourStep('draw', 3),
    tourStep('navigate', 3),
    tourStep('ai', 0, {
      run: () => {
        closeTour();
        showPanel(AI_PANEL);
      },
      available: () => PANEL_INFO.some((panel) => panel.id === AI_PANEL),
    }),
    tourStep('more', 3),
    tourStep('look', 2),
  ]);
  const current = computed(() => steps.value[tour.step] ?? steps.value[0]);
  const isLast = computed(() => tour.step === steps.value.length - 1);
  /** next step, or close after the last one */
  const next = () => {
    if (tour.step < steps.value.length - 1) {
      tour.step++;
    } else {
      closeTour();
    }
  };
  const back = () => {
    if (tour.step > 0) {
      tour.step--;
    }
  };
  return { steps, current, isLast, next, back };
};
