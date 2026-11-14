import { nextTick } from 'vue';
import { insertSnippet } from '../utils/codeText';
import { useScriptEditorState } from './useScriptEditorState';
import { t } from '../i18n';

/** the start of a new script per language – JSON gets its frame, the caret goes where the first object belongs */
const NEW_SCRIPT: Record<string, { code: string; caret: number }> = {
  json: { code: '{\n  "objects": [\n    \n  ]\n}', caret: '{\n  "objects": [\n    '.length },
};

/** Puts text into the script editor's textarea: a snippet at the caret, or a fresh script ("New"). */
export const useCodeInsert = () => {
  const { lang, code, out, currentSaved, beforeConvert, textarea, completion } = useScriptEditorState();

  /** inserts at the caret (API info "Insert") – switches to JavaScript, the snippets are JavaScript */
  const insertText = (text: string) => {
    if (lang.value !== 'js') {
      lang.value = 'js';
    }
    const area = textarea.value;
    const start = area?.selectionStart ?? code.value.length;
    const edit = insertSnippet(code.value, start, area?.selectionEnd ?? start, text);
    code.value = edit.code;
    nextTick(() => {
      if (area) {
        area.focus();
        area.selectionStart = area.selectionEnd = edit.caret;
      }
    });
  };

  /** "New": empty editor in the current language; replaced through the textarea, so Ctrl+Z brings the old code back */
  const newScript = () => {
    const area = textarea.value;
    if (!area) {
      return;
    }
    const template = NEW_SCRIPT[lang.value] ?? { code: '', caret: 0 };
    completion.close();
    area.focus();
    area.select();
    if (!document.execCommand(template.code ? 'insertText' : 'delete', false, template.code)) {
      code.value = template.code;
    }
    nextTick(() => area.setSelectionRange(template.caret, template.caret));
    currentSaved.value = null;
    beforeConvert.value = null;
    out.value = code.value ? [] : [{ kind: 'log', text: t('scriptEditor.newHint') }];
  };

  return { insertText, newScript };
};
