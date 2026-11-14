import { computed } from 'vue';
import { languages, SOURCE_LANGUAGE } from '../../../i18n';
import { editorState } from './state';
import { customLanguages, overrides } from './store';

/** The languages that can be edited and what the editor needs to know about the chosen one. */
export const useTranslationTarget = () => {
  /** every language except English (the source) can be edited */
  const targets = computed(() => languages.filter((entry) => entry.code !== SOURCE_LANGUAGE));
  const targetInfo = computed(() => targets.value.find((entry) => entry.code === editorState.target));
  const targetName = computed(() => targetInfo.value?.name ?? editorState.target);
  const targetDir = computed(() => targetInfo.value?.dir ?? 'ltr');
  /** made by the user (can be deleted), not shipped with the app */
  const isCustom = computed(() => !!customLanguages[editorState.target]);
  const hasChanges = computed(() => !!overrides[editorState.target] && Object.keys(overrides[editorState.target]).length > 0);
  /** German as a second column while another language is translated */
  const reference = computed(() => (editorState.target !== 'de' && languages.some((entry) => entry.code === 'de') ? 'de' : ''));
  const referenceName = computed(() => languages.find((entry) => entry.code === reference.value)?.name ?? '');
  return { targets, targetName, targetDir, isCustom, hasChanges, reference, referenceName };
};
