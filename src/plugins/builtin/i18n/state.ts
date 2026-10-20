import { reactive } from 'vue';

/** id of the translation editor panel (plugin id + panel id) */
export const EDITOR_PANEL = 'i18n.editor';

/** the language popover under the button in the top bar */
export const languageMenu = reactive({ open: false, x: 0, y: 0 });

export const toggleLanguageMenu = (event?: MouseEvent) => {
  if (languageMenu.open) {
    languageMenu.open = false;
    return;
  }
  const rect = (event?.currentTarget as HTMLElement | null)?.getBoundingClientRect();
  languageMenu.x = Math.max(4, Math.min(window.innerWidth - 244, rect?.left ?? 200));
  languageMenu.y = (rect?.bottom ?? 44) + 4;
  languageMenu.open = true;
};
export const closeLanguageMenu = () => {
  languageMenu.open = false;
};

/** what the translation editor shows – kept while the panel is closed */
export const editorState = reactive({
  target: '',
  area: 'all',
  search: '',
  missingOnly: false,
  /** the app shows the target language while the editor is open */
  preview: true,
  /** how many rows are shown (more on request – a language has well over a thousand texts) */
  limit: 120,
});
