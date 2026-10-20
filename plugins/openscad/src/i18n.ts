import type { PluginContext } from '../../../src/plugins/types';
import arabic from './i18n/ar.json';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';

/** The plugin's texts per language – registered by the app as soon as the plugin is loaded. */
export const MESSAGES = { en: english.messages, de: german.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages };

let context: PluginContext | null = null;

/** called first thing in activate(): from then on t() uses the app's translation */
export const useI18n = (pluginContext: PluginContext) => {
  context = pluginContext;
};

/** translates an `openscad.*` key (current language → English → key) */
export const t = (key: string, params?: Record<string, unknown>) => context?.i18n.t(key, params) ?? key;

/** the language for Intl formatting – Arabic keeps Western digits like the app */
const locale = () => {
  const language = context?.i18n.language() ?? 'en';
  return language.split('-')[0] === 'ar' ? `${language}-u-nu-latn` : language;
};

/** a number formatted for the current language */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale(), options).format(value);

/** "12 KB" / "1.5 MB" – with the language's decimal separator */
export const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`
    : `${formatNumber(bytes / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
