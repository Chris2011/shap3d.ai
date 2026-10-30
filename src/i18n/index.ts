import { computed, shallowReactive, watchEffect } from 'vue';
import { useStorage } from '@vueuse/core';
import english from './en.json';
import bootEnglish from './boot.en.json';
import { BOOT_CACHE, isBootKey } from './boot';

/**
 * Small i18n core: `t('area.key', { name })` with fallback (current language → English → key).
 * English is the source language and always there; further languages come from plugins
 * (the built-in "Sprachen" plugin brings German and the translation editor). The core only
 * registers texts and languages – plugins bring their own texts.
 */

/** Messages as written in the JSON files: nested by area, leaves are texts. */
export interface MessageTree {
  [key: string]: string | MessageTree;
}
/** 'area.key' → text */
export type FlatMessages = Record<string, string>;
export interface LanguageInfo {
  /** BCP 47 code, e.g. "en", "fr", "pt-BR" */
  code: string;
  /** name in the language itself, e.g. "Français" */
  name: string;
  /** writing direction, default "ltr" */
  dir?: 'ltr' | 'rtl';
}
/** A language file (see template.json): info plus messages. */
export interface LanguageFile extends LanguageInfo {
  messages: MessageTree;
}
type Disposer = () => void;

export const SOURCE_LANGUAGE = 'en';

/** { a: { b: 'x' } } → { 'a.b': 'x' }; keys with "#" ("select#en") are hints (template.json) and are skipped. */
export const flattenMessages = (messages: MessageTree | FlatMessages, prefix = '', out: FlatMessages = {}): FlatMessages => {
  for (const [key, value] of Object.entries(messages ?? {})) {
    if (key.includes('#')) {
      continue;
    }
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      flattenMessages(value, path, out);
    } else if (typeof value === 'string') {
      out[path] = value;
    }
  }
  return out;
};

/** { 'a.b': 'x' } → { a: { b: 'x' } } (for export) */
export const nestMessages = (flat: FlatMessages): MessageTree => {
  const tree: MessageTree = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let node = tree;
    for (const part of parts.slice(0, -1)) {
      node = (typeof node[part] === 'object' ? node[part] : (node[part] = {})) as MessageTree;
    }
    node[parts[parts.length - 1]] = value;
  }
  return tree;
};

// ------------------------------------------------------------ message layers

/** One contribution of messages (the app, a plugin, the translation editor) – later layers win. */
export interface MessageLayer {
  language: string;
  source: string;
  messages: FlatMessages;
}
const layers = shallowReactive<MessageLayer[]>([]);
/** merged texts per language – what t() reads (replaced as a whole, so t() tracks one dependency) */
const tables = shallowReactive<Record<string, FlatMessages>>({});

const rebuild = (language: string) => {
  const table: FlatMessages = {};
  for (const layer of layers) {
    if (layer.language === language) {
      for (const key in layer.messages) {
        if (layer.messages[key]) {
          table[key] = layer.messages[key];
        }
      }
    }
  }
  tables[language] = table;
};

/** Adds texts for a language (nested or flat); returns a function that removes them again. */
export const addMessages = (language: string, messages: MessageTree | FlatMessages, source = 'app'): Disposer => {
  const layer: MessageLayer = { language, source, messages: flattenMessages(messages) };
  layers.push(layer);
  rebuild(language);
  return () => {
    const index = layers.indexOf(layer);
    if (index >= 0) {
      layers.splice(index, 1);
      rebuild(language);
    }
  };
};

/** All layers (read-only view for the translation editor). */
export const messageLayers = (): readonly MessageLayer[] => layers;
/** The merged texts of a language (empty object if it has none). */
export const messagesOf = (language: string): FlatMessages => tables[language] ?? {};

// ------------------------------------------------------------ languages

/** languages that can be chosen; English is always there */
export const languages = shallowReactive<LanguageInfo[]>([{ code: SOURCE_LANGUAGE, name: 'English', dir: 'ltr' }]);
export const hasLanguage = (code: string) => languages.some((language) => language.code === code);

/** Registers a language (optionally with its messages); returns a function that removes both again. */
export const addLanguage = (info: LanguageInfo, messages?: MessageTree | FlatMessages, source = 'app'): Disposer => {
  if (hasLanguage(info.code)) {
    throw new Error(t('i18n.errors.languageExists', { code: info.code }));
  }
  const entry: LanguageInfo = { code: info.code, name: info.name || info.code, dir: info.dir === 'rtl' ? 'rtl' : 'ltr' };
  languages.push(entry);
  const removeMessages = messages ? addMessages(info.code, messages, source) : () => {};
  return () => {
    removeMessages();
    const index = languages.indexOf(entry);
    if (index >= 0) {
      languages.splice(index, 1);
    }
  };
};

// ------------------------------------------------------------ the chosen language

/** the user's choice ('' = not chosen yet → browser language) */
const chosen = useStorage<string>('s3d:language', '');
/** workers have no location – the URL switches (?lang=, ?shot=) then simply don't apply */
const parameters =
  typeof location === 'undefined' || !('search' in location) ? new URLSearchParams() : new URLSearchParams(location.search);
/** ?lang=de wins (handy for testing); the README screenshots show German unless a scene asks for another language */
const forced = parameters.get('lang') ?? (parameters.has('shot') ? 'de' : null);

/** best available language for a list of wishes ("en-US" also matches "en") */
const bestMatch = (wishes: readonly string[]) => {
  for (const wish of wishes) {
    const exact = languages.find((language) => language.code.toLowerCase() === wish.toLowerCase());
    if (exact) {
      return exact.code;
    }
    const base = languages.find((language) => language.code.toLowerCase() === wish.toLowerCase().split('-')[0]);
    if (base) {
      return base.code;
    }
  }
  return null;
};

/** the active language: forced → chosen → browser language → English (only languages that are registered) */
export const language = computed(() => {
  if (forced && hasLanguage(forced)) {
    return forced;
  }
  if (chosen.value) {
    return hasLanguage(chosen.value) ? chosen.value : SOURCE_LANGUAGE;
  }
  return bestMatch(typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])) ?? SOURCE_LANGUAGE;
});
export const languageInfo = computed(() => languages.find((entry) => entry.code === language.value) ?? languages[0]);
/** the code the user picked ('' = automatic) */
export const chosenLanguage = computed(() => chosen.value);
/** Chooses the language (kept in the browser); '' = automatic (browser language). */
export const setLanguage = (code: string) => {
  chosen.value = code;
};

watchEffect(() => {
  if (typeof document === 'undefined') {
    return; // workers have no DOM
  }
  document.documentElement.lang = language.value;
  document.documentElement.dir = languageInfo.value.dir ?? 'ltr';
});

// ------------------------------------------------------------ translating

// ------------------------------------------------------------ numbers and plurals

/**
 * Locale for numbers. Arabic keeps Western digits (0–9): lengths are read back from the
 * measurements box and typed on keyboards that have these digits – Arabic-Indic digits are still accepted as input.
 */
export const numberLocale = computed(() => (language.value.split('-')[0] === 'ar' ? `${language.value}-u-nu-latn` : language.value));
/** the decimal separator of the language: "." (English, Arabic) or "," (German, French, Spanish …) */
export const decimalSeparator = computed(() => (1.5).toLocaleString(numberLocale.value).replace(/\d/g, '') || '.');

/** A number with fixed decimals (no grouping – lengths and angles are read back as input); `trim` drops trailing zeros. */
export const formatDecimal = (value: number, digits: number, trim = false) => {
  let text = value.toFixed(Math.max(0, digits));
  if (trim && text.includes('.')) {
    text = text.replace(/0+$/, '').replace(/\.$/, '');
  }
  return text.replace('.', decimalSeparator.value);
};

/**
 * Plural forms in a text are separated by "|":
 * 2 forms = one | other, 3 forms = zero | one | other, 6 forms = zero | one | two | few | many | other (CLDR, e.g. Arabic).
 * The form is chosen with the plural rules of the language (French: 0 and 1 are "one").
 */
const PLURAL_ORDER: Record<number, Intl.LDMLPluralRule[]> = {
  2: ['one', 'other'],
  3: ['zero', 'one', 'other'],
  6: ['zero', 'one', 'two', 'few', 'many', 'other'],
};
const pluralForm = (forms: string[], count: number) => {
  const order = PLURAL_ORDER[forms.length] ?? PLURAL_ORDER[2];
  const category = count === 0 && order.includes('zero') ? 'zero' : new Intl.PluralRules(language.value).select(count);
  const index = order.indexOf(category);
  return forms[index >= 0 ? index : forms.length - 1] ?? forms[0];
};

/** Fills {name} placeholders; numbers are formatted for the language. Plural forms ("one | other" …) are picked by {count}. */
const format = (text: string, params: Record<string, unknown>) => {
  let result = text;
  if (typeof params.count === 'number' && result.includes('|')) {
    result = pluralForm(
      result.split('|').map((form) => form.trim()),
      params.count,
    );
  }
  return result.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    if (!(name in params)) {
      return placeholder;
    }
    const value = params[name];
    return typeof value === 'number' ? value.toLocaleString(numberLocale.value) : String(value ?? '');
  });
};

/** Translates a key: current language → English → the key itself. Reactive (re-renders when the language or texts change). */
export const t = (key: string, params?: Record<string, unknown>): string => {
  const text = tables[language.value]?.[key] ?? tables[SOURCE_LANGUAGE]?.[key] ?? key;
  return params ? format(text, params) : text;
};

/** true if the key has an English text (= it is a known key) */
export const hasMessage = (key: string) => tables[SOURCE_LANGUAGE]?.[key] !== undefined;

/** Text that may be a key: translated if it is one, otherwise shown as it is (labels from plugins). */
export const localize = (textOrKey: string | undefined) => (textOrKey && hasMessage(textOrKey) ? t(textOrKey) : (textOrKey ?? ''));

/** Makes `target[property]` follow the language: every read returns `t(key)`. */
export const localized = <T extends object>(target: T, property: string, key: string, params?: () => Record<string, unknown>): T => {
  Object.defineProperty(target, property, { get: () => t(key, params?.()), enumerable: true, configurable: true });
  return target;
};

/**
 * Copies text properties from a plugin's object to the app's copy so they follow the language:
 * a getter stays a getter, a plain text becomes `localize(text)` (a key is translated).
 */
export const copyLocalized = <T extends object>(source: object, target: T, properties: string[]): T => {
  for (const property of properties) {
    const descriptor = Object.getOwnPropertyDescriptor(source, property);
    if (!descriptor) {
      continue;
    }
    if (descriptor.get) {
      Object.defineProperty(target, property, { get: descriptor.get.bind(source), enumerable: true, configurable: true });
    } else if (typeof descriptor.value === 'string') {
      const text = descriptor.value;
      Object.defineProperty(target, property, { get: () => localize(text), enumerable: true, configurable: true });
    }
  }
  return target;
};

/** names of keys in shortcuts, written in English in the code ("Ctrl+Shift+P") */
const KEY_NAMES: Record<string, string> = {
  Ctrl: 'ctrl',
  Shift: 'shift',
  Alt: 'alt',
  Del: 'delete',
  Space: 'space',
  Enter: 'enter',
  Esc: 'escape',
  Tab: 'tab',
  Backspace: 'backspace',
};
/** "Ctrl+Shift+P" → "Strg+Umschalt+P" in German, unchanged in English */
export const shortcutLabel = (shortcut: string | undefined) =>
  shortcut
    ?.split('+')
    .map((part) => (KEY_NAMES[part] ? t(`keys.${KEY_NAMES[part]}`) : part))
    .join('+') ?? '';

/** Formats a number for the current language. */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => value.toLocaleString(numberLocale.value, options);

/** Unit symbol shown after a length ("mm", Arabic "مم" …) – messages `units.symbols.<unit>`. */
export const unitSymbol = (unit: 'mm' | 'cm' | 'm' | 'km') => t(`units.symbols.${unit}`);

/** Input in the measurements box in a form the parser understands: Western digits, "." as decimal point, Latin unit symbols. */
export const normalizeNumberInput = (text: string) => {
  let result = text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/؛/g, ';')
    .replace(/[\u200e\u200f\u2066-\u2069]/g, '')
    .replace(/[٬  ]/g, '');
  // unit symbols of every registered language, longest first ("مم" before "م")
  const symbols: [string, string][] = [];
  for (const table of Object.values(tables)) {
    for (const unit of ['mm', 'cm', 'km', 'm']) {
      const symbol = table[`units.symbols.${unit}`];
      if (symbol && symbol !== unit) {
        symbols.push([symbol, unit]);
      }
    }
  }
  for (const [symbol, unit] of symbols.sort((first, second) => second[0].length - first[0].length)) {
    result = result.split(symbol).join(unit);
  }
  return result;
};

addMessages(SOURCE_LANGUAGE, (english as LanguageFile).messages, 'app');
addMessages(SOURCE_LANGUAGE, (bootEnglish as LanguageFile).messages, 'app');

// the loading screen of the next start shows the language of this one (see boot.ts)
watchEffect(() => {
  const table = language.value === SOURCE_LANGUAGE ? {} : (tables[language.value] ?? {});
  const messages = Object.fromEntries(Object.entries(table).filter(([key]) => isBootKey(key)));
  try {
    localStorage.setItem(BOOT_CACHE, JSON.stringify({ language: language.value, messages }));
  } catch {
    /* storage blocked */
  }
});
