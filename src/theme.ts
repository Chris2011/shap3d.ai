import { reactive, watch } from 'vue';
import { useStorage, usePreferredDark } from '@vueuse/core';

/** Appearance of the interface. "system" follows the operating system and is the default. */
export type ThemeMode = 'system' | 'light' | 'dark';
/** Appearance of the 3D scene: like the interface, always day, or always night. */
export type SceneMode = 'auto' | 'day' | 'night';
const MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];
const SCENES: readonly SceneMode[] = ['auto', 'day', 'night'];

// persisted choices (plain strings in localStorage, as before)
const mode = useStorage<ThemeMode>('s3d:theme', 'system');
const scene = useStorage<SceneMode>('s3d:scene', 'auto');
if (!MODES.includes(mode.value)) mode.value = 'system';
if (!SCENES.includes(scene.value)) scene.value = 'auto';
const systemDark = usePreferredDark();

export const theme = reactive({
  mode,
  scene,
  /** interface is dark right now */
  dark: false,
  /** 3D scene is rendered as night right now */
  night: false,
});
const listeners: (() => void)[] = [];
export const onThemeChange = (listener: () => void) => { listeners.push(listener); };

// sync: data-theme must be set before the first render (no white flash in dark mode)
watch([mode, scene, systemDark], () => {
  theme.dark = mode.value === 'dark' || (mode.value === 'system' && systemDark.value);
  theme.night = scene.value === 'night' || (scene.value === 'auto' && theme.dark);
  document.documentElement.dataset.theme = theme.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.dark ? '#0b0f14' : '#f1f1f6');
  listeners.forEach(listener => listener());
}, { immediate: true, flush: 'sync' });

export const setTheme = (newMode: ThemeMode) => { mode.value = newMode; };
export const setScene = (newScene: SceneMode) => { scene.value = newScene; };
/** The on/off switch: dark mode on = dark, off = light (leaves "follow system" behind). */
export const toggleTheme = () => setTheme(theme.dark ? 'light' : 'dark');
