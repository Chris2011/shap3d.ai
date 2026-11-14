import { onMounted, watch } from 'vue';
import { findScriptLanguage } from '../scripting/languages';
import { useScripts } from './useScripts';
import type { ScriptEditorState } from './useScriptEditorState';

const BUILT_IN_LANGS: readonly string[] = ['js', 'json', 'obj'];
const isKnownLang = (id: string) => BUILT_IN_LANGS.includes(id) || !!findScriptLanguage(id);

/**
 * Keeps the script editor's code across sessions: restores the last draft on open, stores every change,
 * and takes code that a plugin or the AI sends while the editor is open.
 */
export const useScriptDraft = ({ lang, code, objSize, currentSaved }: ScriptEditorState) => {
  const scripts = useScripts();
  onMounted(() => {
    const draft = scripts.draft.value; // last session – or code the AI assistant just sent over
    // no draft yet: an empty editor whose placeholder points to the examples
    if (draft) {
      lang.value = isKnownLang(draft.lang) ? draft.lang : 'js';
      code.value = draft.code;
      if (draft.size) {
        objSize.value = `${draft.size}m`;
      }
    }
  });
  watch([code, lang], () => {
    scripts.draft.value = { lang: lang.value, code: code.value };
  });
  watch(
    scripts.request,
    (request) => {
      if (!request) {
        return;
      }
      lang.value = request.lang;
      code.value = request.code;
      if (request.size) {
        objSize.value = `${request.size}m`;
      }
      currentSaved.value = null;
      scripts.request.value = null;
    },
    { immediate: true },
  );
};
