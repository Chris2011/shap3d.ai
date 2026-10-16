import { reactive } from 'vue';

/** Appearance of the interface. "system" follows the operating system and is the default. */
export type ThemeMode = 'system' | 'light' | 'dark';
/** Appearance of the 3D scene: like the interface, always day, or always night. */
export type SceneMode = 'auto' | 'day' | 'night';
const KEY = 's3d:theme', SCENE_KEY = 's3d:scene';
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try { const v = localStorage.getItem(key) as T | null; if (v && allowed.includes(v)) return v; } catch { /* storage unavailable */ }
  return fallback;
}

export const theme = reactive({
  mode: read<ThemeMode>(KEY, ['system', 'light', 'dark'], 'system'),
  scene: read<SceneMode>(SCENE_KEY, ['auto', 'day', 'night'], 'auto'),
  /** interface is dark right now */
  dark: false,
  /** 3D scene is rendered as night right now */
  night: false,
});
const listeners: (() => void)[] = [];
export const onThemeChange = (fn: () => void) => { listeners.push(fn); };

function apply() {
  theme.dark = theme.mode === 'dark' || (theme.mode === 'system' && !!mq?.matches);
  theme.night = theme.scene === 'night' || (theme.scene === 'auto' && theme.dark);
  document.documentElement.dataset.theme = theme.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.dark ? '#0b0f14' : '#f1f1f6');
  listeners.forEach(f => f());
}

export function setTheme(mode: ThemeMode) {
  theme.mode = mode;
  try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  apply();
}
export function setScene(scene: SceneMode) {
  theme.scene = scene;
  try { localStorage.setItem(SCENE_KEY, scene); } catch { /* ignore */ }
  apply();
}
/** The on/off switch: dark mode on = dark, off = light (leaves "follow system" behind). */
export const toggleTheme = () => setTheme(theme.dark ? 'light' : 'dark');

mq?.addEventListener('change', () => { if (theme.mode === 'system') apply(); });
apply();
