import { watch } from 'vue';
import type { Disposer, S3dPlugin } from '../../types';
import { t, languages, language, chosenLanguage, setLanguage } from '../../../i18n';
import S3dTranslationEditor from './S3dTranslationEditor.vue';
import S3dLanguageMenu from './S3dLanguageMenu.vue';
import { languageMenu, toggleLanguageMenu } from './state';
import { startLanguages } from './store';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';
import arabic from './i18n/ar.json';

/** a globe – the language icon in the top bar, the editor and the menus */
const LANGUAGE_ICON =
  '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" stroke="currentColor" stroke-width="1.6"/>';

/**
 * Built-in plugin: languages. Brings German (English is the app's own source language), a
 * language switch next to the light/dark button, one command per language (main menu ›
 * Ansicht, command palette) and the translation editor: all texts grouped by area with the
 * app's icons, English / German / target language side by side, search, "missing only",
 * progress per language, live preview and "where is this text?", plus import/export of
 * language files and a template for new languages. Switched off, the app is English again.
 */
const i18nPlugin: S3dPlugin = {
  id: 'i18n',
  name: 'i18n.plugin.name',
  version: '1.0.3',
  author: 'Shap3D.ai',
  description: 'i18n.plugin.description',
  messages: { de: german.messages, en: english.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages },

  activate(context) {
    context.icons.register('language', LANGUAGE_ICON);
    context.onDispose(startLanguages(context.storage));

    context.panels.register({
      id: 'editor',
      label: 'i18n.editor.title',
      icon: 'language',
      width: 820,
      flush: true,
      component: S3dTranslationEditor,
    });
    context.ui.addWindow(S3dLanguageMenu);
    context.ui.addTopBarButton({
      icon: 'language',
      title: 'i18n.switcher.title',
      position: 'theme',
      badge: () => language.value.split('-')[0].toUpperCase(),
      active: () => languageMenu.open,
      run: (_editor, event) => toggleLanguageMenu(event),
    });

    // one command per language (main menu › Ansicht and the palette) – follows languages that are added or removed
    let languageCommands: Disposer[] = [];
    const syncCommands = () => {
      for (const dispose of languageCommands) {
        dispose();
      }
      languageCommands = [
        ...languages.map((entry) =>
          context.commands.register({
            id: `use-${entry.code}`,
            group: 'view',
            icon: 'language',
            keywords: `language sprache ${entry.code} ${entry.name}`,
            get label() {
              return t('i18n.commands.use', { name: entry.name });
            },
            checked: () => chosenLanguage.value === entry.code,
            run: () => setLanguage(entry.code),
          }),
        ),
        context.commands.register({
          id: 'use-auto',
          group: 'view',
          icon: 'language',
          keywords: 'language sprache browser auto',
          label: 'i18n.commands.automatic',
          checked: () => chosenLanguage.value === '',
          run: () => setLanguage(''),
        }),
      ];
    };
    context.onDispose(watch(() => languages.map((entry) => `${entry.code}:${entry.name}`).join(), syncCommands, { immediate: true }));
    context.onDispose(() => {
      for (const dispose of languageCommands) {
        dispose();
      }
      languageMenu.open = false;
    });
  },
};

export default i18nPlugin;
