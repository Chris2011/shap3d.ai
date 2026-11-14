import { inject, provide, ref, shallowRef, watch, type InjectionKey } from 'vue';
import type { ScriptLog } from '../scripting/api';
import type { ScriptLang } from './useScripts';
import { useCodeCompletion } from './useCodeCompletion';
import { useEditor } from '../components/keys';

/** The code before the last conversion – "undo conversion" brings it back until the result is edited. */
export interface ConvertBackup {
  lang: ScriptLang;
  code: string;
  size: string;
  result: string;
}

const createState = () => {
  const editor = useEditor();
  const lang = ref<ScriptLang>('js');
  const textarea = shallowRef<HTMLTextAreaElement | null>(null);
  const completion = useCodeCompletion({ textarea, lang, editor });
  watch(lang, completion.close);
  return {
    lang,
    code: ref(''),
    /** OBJ import: edge length of the mesh, Y axis up, soften angle (°) */
    objSize: ref('1m'),
    objYUp: ref(true),
    objSmooth: ref(30),
    /** console lines and how long the last run took */
    out: shallowRef<ScriptLog[]>([]),
    lastMs: ref<number | null>(null),
    running: ref(false),
    /** "start a new model first" */
    clearFirst: ref(false),
    showHelp: ref(false),
    /** name of the saved script that is open, if any */
    currentSaved: ref<string | null>(null),
    beforeConvert: shallowRef<ConvertBackup | null>(null),
    textarea,
    /** the console's scroll box – scrolled to the end after a run */
    consoleBox: shallowRef<HTMLElement | null>(null),
    completion,
  };
};
export type ScriptEditorState = ReturnType<typeof createState>;

const SCRIPT_EDITOR: InjectionKey<ScriptEditorState> = Symbol('scriptEditor');

/** Creates the state of one script editor and hands it to its parts (toolbar, code area, console …). */
export const provideScriptEditorState = () => {
  const state = createState();
  provide(SCRIPT_EDITOR, state);
  return state;
};

/** The state of the script editor this component is part of. */
export const useScriptEditorState = () => {
  const state = inject(SCRIPT_EDITOR);
  if (!state) {
    throw new Error('useScriptEditorState() outside S3dScriptEditor');
  }
  return state;
};
