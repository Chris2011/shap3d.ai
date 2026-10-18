import { useStorage, StorageSerializers } from '@vueuse/core';

export type ScriptLang = 'js' | 'json' | 'obj';
/** What is in the script editor right now (also how the AI hands code over to the editor). */
export interface ScriptDraft { lang: ScriptLang; code: string; size?: number }
export interface SavedScript { name: string; lang: ScriptLang; code: string }

// one shared store for every component (kept in localStorage)
const draft = useStorage<ScriptDraft | null>('s3d:script-draft', null, undefined, { serializer: StorageSerializers.object });
const saved = useStorage<SavedScript[]>('s3d:scripts', []);

/** The script editor's draft and the user's saved scripts ("Meine Skripte"). */
export function useScripts() {
  return {
    draft,
    saved,
    /** store under `name`, replacing a script with the same name */
    save(script: SavedScript) { saved.value = [...saved.value.filter(s => s.name !== script.name), script]; },
    remove(name: string) { saved.value = saved.value.filter(s => s.name !== name); },
    find: (name: string) => saved.value.find(s => s.name === name),
  };
}
