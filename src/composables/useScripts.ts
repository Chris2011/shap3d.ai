import { shallowRef } from 'vue';
import { useStorage, StorageSerializers } from '@vueuse/core';

/** built-in languages, or the id of a plugin language (see scripting/languages.ts) */
export type ScriptLang = 'js' | 'json' | 'obj' | (string & {});
/** What is in the script editor right now (also how the AI hands code over to the editor). */
export interface ScriptDraft { lang: ScriptLang; code: string; size?: number }
export interface SavedScript { name: string; lang: ScriptLang; code: string }

// one shared store for every component (kept in localStorage)
const draft = useStorage<ScriptDraft | null>('s3d:script-draft', null, undefined, { serializer: StorageSerializers.object });
const saved = useStorage<SavedScript[]>('s3d:scripts', []);
/** code handed to an already open script editor (e.g. by a plugin) – the editor takes it and clears it */
const request = shallowRef<ScriptDraft | null>(null);

/** The script editor's draft and the user's saved scripts ("Meine Skripte"). */
export const useScripts = () => ({
  draft,
  saved,
  request,
  /** show `script` in the script editor */
  open: (script: ScriptDraft) => { draft.value = script; request.value = script; },
  /** store under `name`, replacing a script with the same name */
  save: (script: SavedScript) => { saved.value = [...saved.value.filter(other => other.name !== script.name), script]; },
  remove: (name: string) => { saved.value = saved.value.filter(script => script.name !== name); },
  find: (name: string) => saved.value.find(script => script.name === name),
});
