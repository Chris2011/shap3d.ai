import { reactive, watch } from 'vue';
import { localized } from '../i18n';

export type NavAction = 'orbit' | 'pan' | 'zoom';
export type InputDevice = 'mouse' | 'trackpad';

/** Navigation settings like SketchUp Web's "App-Einstellungen › Navigation". */
export interface NavSettings {
  device: InputDevice;
  swipe: NavAction; // trackpad: two-finger swipe
  invert: Record<NavAction, boolean>;
  sensitivity: Record<NavAction, number>; // 0.25 … 3
}

const KEY = 's3d:navigation';
const DEFAULTS: NavSettings = {
  device: 'mouse',
  swipe: 'pan',
  invert: { orbit: false, pan: false, zoom: false },
  sensitivity: { orbit: 1, pan: 1, zoom: 1 },
};

const load = (): NavSettings => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (stored) {
      return {
        ...DEFAULTS,
        ...stored,
        invert: { ...DEFAULTS.invert, ...stored.invert },
        sensitivity: { ...DEFAULTS.sensitivity, ...stored.sensitivity },
      };
    }
  } catch {
    /* storage unavailable */
  }
  return structuredClone(DEFAULTS);
};

export const nav = reactive<NavSettings>(load());
watch(
  nav,
  (settings) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  },
  { deep: true },
);

/**
 * Which action a wheel / two-finger gesture triggers.
 * Mouse: wheel = zoom, Shift = orbit, Ctrl = pan.
 * Trackpad: swipe = chosen action, Shift and Ctrl give the other two (pinch arrives as Ctrl).
 */
export const wheelAction = (shift: boolean, ctrl: boolean): NavAction => {
  if (nav.device === 'mouse') {
    return shift ? 'orbit' : ctrl ? 'pan' : 'zoom';
  }
  const others: Record<NavAction, [NavAction, NavAction]> = { pan: ['orbit', 'zoom'], orbit: ['pan', 'zoom'], zoom: ['orbit', 'pan'] };
  if (shift) {
    return others[nav.swipe][0];
  }
  if (ctrl) {
    return others[nav.swipe][1];
  }
  return nav.swipe;
};

export const ACTION_LABEL = {} as Record<NavAction, string>;
for (const action of ['orbit', 'pan', 'zoom'] as const) {
  localized(ACTION_LABEL, action, `navigation.${action}`);
}
