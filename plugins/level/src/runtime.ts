import * as appVue from 'vue';
import type * as ThreeModule from 'three';
import type { PluginContext } from '../../../src/plugins/types';
import arabic from './i18n/ar.json';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';

/**
 * What the plugin takes from the app at run time. A plugin package must not import the app's modules – it gets
 * them from the context in activate(). The package build routes `vue` to the app's Vue (see vite.config.ts).
 */

/** The plugin's texts per language – registered by the app as soon as the plugin is loaded. */
export const MESSAGES = { en: english.messages, de: german.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages };

let current: PluginContext | null = null;

/** three.js of the app – set in activate() */
export let THREE: typeof ThreeModule;

/** called first thing in activate() */
export const useRuntime = (context: PluginContext) => {
  current = context;
  THREE = context.THREE;
  (appVue as unknown as { useAppVue?: (vue: unknown) => void }).useAppVue?.(context.vue);
};

export const pluginContext = () => {
  if (!current) {
    throw new Error('Level plugin is not active'); // i18n-ignore – programming error
  }
  return current;
};

/** translates a key – inside a render it also follows a language switch (it reads the reactive language) */
export const t = (key: string, params?: Record<string, unknown>) => {
  current?.i18n.language();
  return current?.i18n.t(key, params) ?? key;
};
