import { computed, watch } from 'vue';
import { useEditor } from '../components/keys';
import { parseLength } from '../core/units';
import { CODE_FORMATS, findCodeFormat, convertCode } from '../scripting/codeExport';
import { useScriptEditorState } from './useScriptEditorState';
import { t, localize } from '../i18n';

/** Converts the editor's code into another format (JS ⇄ JSON ⇄ OBJ …) and undoes that until the result is edited. */
export const useCodeConvert = () => {
  const editor = useEditor();
  const { lang, code, objSize, objYUp, objSmooth, out, running, currentSaved, beforeConvert } = useScriptEditorState();

  /** formats the current code can be converted into (only if its own format can be read back) */
  const convertTargets = computed(() =>
    findCodeFormat(lang.value)?.evaluate ? CODE_FORMATS.filter((format) => format.id !== lang.value) : [],
  );
  watch(code, (value) => {
    if (beforeConvert.value && value !== beforeConvert.value.result) {
      beforeConvert.value = null;
    }
  });

  const convertTo = async (targetId: string) => {
    const target = findCodeFormat(targetId);
    if (!target) {
      return;
    }
    running.value = true;
    try {
      const size = parseLength(objSize.value, 'm') ?? 1;
      const result = await convertCode(editor, lang.value, code.value, targetId, {
        objSize: size,
        objYUp: objYUp.value,
        objSmooth: objSmooth.value || 0,
      });
      const previous = { lang: lang.value, code: code.value, size: objSize.value, result: result.code };
      lang.value = targetId;
      code.value = result.code;
      objSize.value = `${result.size}m`;
      currentSaved.value = null;
      beforeConvert.value = previous;
      out.value = [{ kind: 'result', text: `✓ ${t('scriptEditor.converted', { format: localize(target.label) })}` }];
    } catch (error: any) {
      out.value = [{ kind: 'error', text: `✗ ${t('scriptEditor.convertFailed', { error: error?.message ?? error })}` }];
    } finally {
      running.value = false;
    }
  };

  const undoConvert = () => {
    const previous = beforeConvert.value;
    if (!previous) {
      return;
    }
    lang.value = previous.lang;
    code.value = previous.code;
    objSize.value = previous.size;
    beforeConvert.value = null;
  };

  return { convertTargets, convertTo, undoConvert };
};
