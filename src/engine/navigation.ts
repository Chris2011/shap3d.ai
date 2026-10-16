import { reactive, watch } from 'vue';

export type NavAction = 'orbit' | 'pan' | 'zoom';
export type InputDevice = 'mouse' | 'trackpad';

/** Navigation settings like SketchUp Web's "App-Einstellungen › Navigation". */
export interface NavSettings {
  device: InputDevice;
  swipe: NavAction;                       // trackpad: two-finger swipe
  invert: Record<NavAction, boolean>;
  sensitivity: Record<NavAction, number>; // 0.25 … 3
}

const KEY = 's3d:navigation';
const DEFAULTS: NavSettings = {
  device: 'mouse', swipe: 'pan',
  invert: { orbit: false, pan: false, zoom: false },
  sensitivity: { orbit: 1, pan: 1, zoom: 1 },
};

function load(): NavSettings {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (j) return { ...DEFAULTS, ...j, invert: { ...DEFAULTS.invert, ...j.invert }, sensitivity: { ...DEFAULTS.sensitivity, ...j.sensitivity } };
  } catch { /* storage unavailable */ }
  return structuredClone(DEFAULTS);
}

export const nav = reactive<NavSettings>(load());
watch(nav, v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } }, { deep: true });

/**
 * Which action a wheel / two-finger gesture triggers.
 * Mouse: wheel = zoom, Shift = orbit, Ctrl = pan.
 * Trackpad: swipe = chosen action, Shift and Ctrl give the other two (pinch arrives as Ctrl).
 */
export function wheelAction(shift: boolean, ctrl: boolean): NavAction {
  if (nav.device === 'mouse') return shift ? 'orbit' : ctrl ? 'pan' : 'zoom';
  const others: Record<NavAction, [NavAction, NavAction]> = { pan: ['orbit', 'zoom'], orbit: ['pan', 'zoom'], zoom: ['orbit', 'pan'] };
  if (shift) return others[nav.swipe][0];
  if (ctrl) return others[nav.swipe][1];
  return nav.swipe;
}

export const ACTION_LABEL: Record<NavAction, string> = { orbit: 'Orbit', pan: 'Schwenken', zoom: 'Zoomen' };
