import { onBeforeUnmount, watch } from 'vue';
import { chosenLanguage, setLanguage } from '../../../i18n';
import { editorState } from './state';

/**
 * Live preview: while it is on, the app shows the language being translated. The language chosen before
 * comes back when the preview is switched off or the editor closes.
 */
export const useLanguagePreview = () => {
  let before: string | null = null;
  const apply = () => {
    if (editorState.preview && editorState.target) {
      before ??= chosenLanguage.value;
      setLanguage(editorState.target);
    } else if (before != null) {
      setLanguage(before);
      before = null;
    }
  };
  watch(() => [editorState.preview, editorState.target], apply, { immediate: true });
  onBeforeUnmount(() => {
    if (before != null) {
      setLanguage(before);
    }
  });
};
