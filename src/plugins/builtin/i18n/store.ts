import { computed, reactive, toRaw } from 'vue';
import {
  addLanguage,
  addMessages,
  flattenMessages,
  nestMessages,
  messagesOf,
  messageLayers,
  languages,
  chosenLanguage,
  setLanguage,
  t,
  SOURCE_LANGUAGE,
  type FlatMessages,
  type LanguageFile,
  type LanguageInfo,
  type MessageTree,
} from '../../../i18n';
import arabic from './languages/ar.json';
import german from './languages/de.json';
import spanish from './languages/es.json';
import french from './languages/fr.json';

type Disposer = () => void;
interface Storage {
  get: <T>(key: string, fallback: T) => T;
  set: (key: string, value: unknown) => void;
}

/** languages this plugin brings (besides English, which the app always has) */
export const BUILTIN_LANGUAGES = [german, french, spanish, arabic] as LanguageFile[];
export const isBuiltinLanguage = (code: string) => code === SOURCE_LANGUAGE || BUILTIN_LANGUAGES.some((file) => file.code === code);

/** languages created or imported in the translation editor – kept in this browser */
export const customLanguages = reactive<Record<string, { info: LanguageInfo; messages: FlatMessages }>>({});
/** texts changed in the editor for the built-in languages (German) */
export const overrides = reactive<Record<string, FlatMessages>>({});

/** source name of the editor's own message layers */
const EDITOR_SOURCE = 'i18n-editor';
/** message layers in the template: the core ("app") and this plugin – every other plugin brings its own language files */
const TEMPLATE_SOURCES = ['app', 'i18n'];
let storage: Storage | null = null;
const languageDisposers = new Map<string, Disposer>();
const layerDisposers = new Map<string, Disposer>();
let saveTimer = 0;

const writeNow = () => {
  clearTimeout(saveTimer);
  saveTimer = 0;
  storage?.set(
    'languages',
    Object.values(toRaw(customLanguages)).map((entry) => ({ ...entry.info, messages: entry.messages })),
  );
  storage?.set('overrides', toRaw(overrides));
};
/** saves a moment later (typing in the editor writes many times a second) */
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(writeNow, 300);
};

/** (Re-)registers the editor's texts of a language as their own layer – they win over the language pack. */
const refreshLayer = (code: string) => {
  layerDisposers.get(code)?.();
  const messages = customLanguages[code]?.messages ?? overrides[code];
  if (messages && Object.keys(messages).length) {
    layerDisposers.set(code, addMessages(code, { ...messages }, EDITOR_SOURCE));
  } else {
    layerDisposers.delete(code);
  }
};

const registerCustom = (info: LanguageInfo, messages: FlatMessages) => {
  customLanguages[info.code] = {
    info: { code: info.code, name: info.name || info.code, dir: info.dir === 'rtl' ? 'rtl' : 'ltr' },
    messages,
  };
  languageDisposers.set(info.code, addLanguage(customLanguages[info.code].info));
  refreshLayer(info.code);
};

/** Registers the built-in languages and what the user keeps in the browser. Returns the clean-up. */
export const startLanguages = (store: Storage): Disposer => {
  storage = store;
  for (const file of BUILTIN_LANGUAGES) {
    languageDisposers.set(file.code, addLanguage(file, file.messages, 'i18n'));
  }
  for (const [code, messages] of Object.entries(store.get<Record<string, FlatMessages>>('overrides', {}))) {
    overrides[code] = messages;
    refreshLayer(code);
  }
  for (const file of store.get<(LanguageInfo & { messages: FlatMessages })[]>('languages', [])) {
    if (!isBuiltinLanguage(file.code)) {
      registerCustom(file, file.messages ?? {});
    }
  }
  return () => {
    if (saveTimer) {
      writeNow();
    } // don't lose the last change when the plugin is switched off
    for (const dispose of [...layerDisposers.values(), ...languageDisposers.values()]) {
      dispose();
    }
    layerDisposers.clear();
    languageDisposers.clear();
    for (const code of Object.keys(customLanguages)) {
      delete customLanguages[code];
    }
    for (const code of Object.keys(overrides)) {
      delete overrides[code];
    }
    storage = null;
  };
};

// ------------------------------------------------------------ editing

/** every key the app and its plugins know (English is the source) */
export const allKeys = computed(() => Object.keys(messagesOf(SOURCE_LANGUAGE)).sort());

/** the text a language really has for a key ('' = missing, English is used instead) */
export const textOf = (code: string, key: string) => messagesOf(code)[key] ?? '';

/** how much of a language is translated, 0…1 */
export const progressOf = (code: string) => {
  if (code === SOURCE_LANGUAGE) {
    return 1;
  }
  const table = messagesOf(code);
  const keys = allKeys.value;
  return keys.length ? keys.filter((key) => table[key]).length / keys.length : 0;
};

/** Changes one text (live – the app shows it right away). Empty = missing again. */
export const setText = (code: string, key: string, text: string) => {
  if (code === SOURCE_LANGUAGE) {
    return;
  }
  const messages = customLanguages[code]?.messages ?? (overrides[code] ??= {});
  if (text) {
    messages[key] = text;
  } else {
    delete messages[key];
  }
  refreshLayer(code);
  save();
};

/** true if the editor changed this text of a built-in language */
export const isChanged = (code: string, key: string) => !!overrides[code] && key in overrides[code];

export const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Creates an empty language (texts are filled in the editor or by import). */
export const createLanguage = (info: LanguageInfo) => {
  const code = info.code.trim();
  if (!LANGUAGE_CODE.test(code)) {
    throw new Error(t('i18n.errors.badCode', { code }));
  }
  if (languages.some((entry) => entry.code === code)) {
    throw new Error(t('i18n.errors.languageExists', { code }));
  }
  registerCustom({ ...info, code }, {});
  save();
  return code;
};

export const removeLanguage = (code: string) => {
  if (!customLanguages[code]) {
    return;
  }
  layerDisposers.get(code)?.();
  layerDisposers.delete(code);
  languageDisposers.get(code)?.();
  languageDisposers.delete(code);
  delete customLanguages[code];
  if (chosenLanguage.value === code) {
    setLanguage('');
  }
  save();
};

/** Drops the editor's changes to a built-in language. */
export const resetLanguage = (code: string) => {
  delete overrides[code];
  refreshLayer(code);
  save();
};

// ------------------------------------------------------------ JSON files

const hintTree = (messages: MessageTree): MessageTree => {
  const out: MessageTree = {};
  for (const [key, value] of Object.entries(messages)) {
    if (value && typeof value === 'object') {
      out[key] = hintTree(value);
    } else {
      out[key] = '';
      out[`${key}#en`] = value;
    }
  }
  return out;
};
const sorted = (flat: FlatMessages) => Object.fromEntries(Object.entries(flat).sort(([first], [second]) => first.localeCompare(second)));

/** A language as file: info plus every text it has for a known key. */
export const languageFile = (code: string): LanguageFile => {
  const info = languages.find((entry) => entry.code === code) ?? { code, name: code };
  const known = messagesOf(SOURCE_LANGUAGE);
  const table = messagesOf(code);
  const messages = Object.fromEntries(
    Object.keys(known)
      .filter((key) => table[key])
      .map((key) => [key, table[key]]),
  );
  return { code: info.code, name: info.name, dir: info.dir ?? 'ltr', messages: nestMessages(sorted(messages)) };
};

/** The English texts of the core and of this plugin (no other plugin's). */
const templateMessages = (): FlatMessages => {
  const messages: FlatMessages = {};
  for (const layer of messageLayers()) {
    if (layer.language === SOURCE_LANGUAGE && TEMPLATE_SOURCES.includes(layer.source)) {
      Object.assign(messages, layer.messages);
    }
  }
  return messages;
};

/** All keys of the core and this plugin with empty texts and the English text as "<key>#en" hint – the start of a new language. */
export const templateFile = () => ({
  $schema: t('i18n.templateHint'),
  code: '',
  name: '',
  dir: 'ltr',
  messages: hintTree(nestMessages(sorted(templateMessages()))),
});

/** Reads a language file; returns its code. Built-in languages take it as changes, others become (or replace) a language. */
export const importLanguage = (text: string) => {
  let file: Partial<LanguageFile>;
  try {
    file = JSON.parse(text);
  } catch (error: any) {
    throw new Error(t('i18n.errors.badJson', { error: error?.message ?? error }));
  }
  const code = String(file?.code ?? '').trim();
  if (!LANGUAGE_CODE.test(code)) {
    throw new Error(t('i18n.errors.badCode', { code }));
  }
  if (code === SOURCE_LANGUAGE) {
    throw new Error(t('i18n.errors.sourceLanguage'));
  }
  if (!file.messages || typeof file.messages !== 'object') {
    throw new Error(t('i18n.errors.noMessages'));
  }
  const messages = flattenMessages(file.messages as MessageTree);
  const builtin = BUILTIN_LANGUAGES.find((entry) => entry.code === code);
  if (builtin) {
    // only what differs from the registered texts (language pack and plugins, without the editor's) is kept as a change
    const pack: FlatMessages = {};
    for (const layer of messageLayers()) {
      if (layer.language === code && layer.source !== EDITOR_SOURCE) {
        Object.assign(pack, layer.messages);
      }
    }
    overrides[code] = Object.fromEntries(Object.entries(messages).filter(([key, value]) => value && value !== pack[key]));
    refreshLayer(code);
  } else {
    if (customLanguages[code]) {
      removeLanguage(code);
    } else if (languages.some((entry) => entry.code === code)) {
      throw new Error(t('i18n.errors.languageExists', { code }));
    }
    registerCustom(
      { code, name: String(file.name ?? code), dir: file.dir === 'rtl' ? 'rtl' : 'ltr' },
      Object.fromEntries(Object.entries(messages).filter(([, value]) => value)),
    );
  }
  save();
  return code;
};

/** Offers a JSON file for download. */
export const downloadJson = (name: string, data: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
