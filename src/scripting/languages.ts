import { shallowReactive } from 'vue';
import type { Editor } from '../engine/editor';
import type { RunResult } from './api';
import type { CodeLang } from './highlight';

export type CompletionKind = 'method' | 'property' | 'option' | 'value' | 'material' | 'keyword' | 'variable' | 'unit' | 'type';

/** One suggestion of the script editor's code completion. */
export interface ScriptCompletion {
  /** shown in the list and used for filtering */
  label: string;
  /** text that is inserted – default `label` */
  insert?: string;
  kind?: CompletionKind;
  /** short hint on the right, e.g. a category or the return value */
  detail?: string;
  signature?: string;
  description?: string;
  example?: string;
  /** CSS colour shown as a swatch (materials) */
  color?: string;
}

/** What a language's `completions` receives: the code, the cursor offset and the word before the cursor. */
export interface CompletionRequest { code: string; offset: number; word: string }

/** An extra language for the script editor (contributed by a plugin, e.g. OpenSCAD). */
export interface ScriptLanguage {
  id: string;
  label: string;
  /** syntax colouring to borrow – default "js" (fits C-like languages) */
  highlight?: CodeLang;
  /** runs the code; should make one undo step (editor.commit) */
  run: (code: string, editor: Editor) => RunResult | Promise<RunResult>;
  examples?: { id: string; name: string; description?: string; code: string }[];
  /** short help shown by "API-Info" */
  help?: string;
}

/** candidates for the code completion at the cursor (keywords, functions …) – the editor filters and ranks them by `word` */
export type CompletionProvider = (request: CompletionRequest) => (string | ScriptCompletion)[];

export const SCRIPT_LANGUAGES = shallowReactive<ScriptLanguage[]>([]);

/** run before a JavaScript script (plugins prepare what their s3d extensions need, e.g. OpenSCAD instances) */
const beforeRunHooks: ((code: string) => void | Promise<void>)[] = [];

export const registerBeforeRun = (prepare: (code: string) => void | Promise<void>) => {
  beforeRunHooks.push(prepare);
  return () => { const index = beforeRunHooks.indexOf(prepare); if (index >= 0) beforeRunHooks.splice(index, 1); };
};

/** Awaits every hook; a failing hook is logged and does not stop the script. */
export const prepareScript = async (code: string) => {
  await Promise.all(beforeRunHooks.map(async prepare => { try { await prepare(code); } catch (error) { console.error(error); } }));
};

export const findScriptLanguage = (id: string) => SCRIPT_LANGUAGES.find(language => language.id === id);

export const registerScriptLanguage = (language: ScriptLanguage) => {
  if (['js', 'json', 'obj'].includes(language.id) || findScriptLanguage(language.id)) throw new Error(`Skriptsprache „${language.id}“ gibt es schon`);
  SCRIPT_LANGUAGES.push(language);
  return () => { const index = SCRIPT_LANGUAGES.indexOf(language); if (index >= 0) SCRIPT_LANGUAGES.splice(index, 1); };
};
