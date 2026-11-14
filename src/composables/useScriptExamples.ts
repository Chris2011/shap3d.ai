import { computed } from 'vue';
import { EXAMPLES, PLUGIN_EXAMPLES } from '../scripting/examples';
import { findScriptLanguage } from '../scripting/languages';
import { useScripts } from './useScripts';
import { useScriptEditorState } from './useScriptEditorState';
import { t, localize } from '../i18n';

/**
 * The examples and saved scripts written in the editor's language, and loading one of them.
 * Ids: `<example>`, `plugin:<language>:<example>`, `example:<plugin example>`, `my:<saved name>`.
 */
export const useScriptExamples = () => {
  const scripts = useScripts();
  const { lang, code, out, currentSaved } = useScriptEditorState();

  const pluginLanguage = computed(() => findScriptLanguage(lang.value));
  const appExamples = computed(() => EXAMPLES.filter((example) => example.lang === lang.value));
  const pluginExampleGroups = computed(() => {
    const groups = new Map<string, typeof PLUGIN_EXAMPLES>();
    for (const example of PLUGIN_EXAMPLES.filter((candidate) => candidate.lang === lang.value)) {
      groups.set(example.plugin, [...(groups.get(example.plugin) ?? []), example]);
    }
    return [...groups].map(([plugin, examples]) => ({ plugin, examples }));
  });
  const savedHere = computed(() => scripts.saved.value.filter((script) => script.lang === lang.value));

  /** shows an example with its name (and description) in the console */
  const show = (language: string, exampleCode: string, name: string, description?: string) => {
    lang.value = language;
    code.value = exampleCode;
    currentSaved.value = null;
    out.value = [
      {
        kind: 'log',
        text: description ? t('scriptEditor.exampleWithDescription', { name, description }) : t('scriptEditor.example', { name }),
      },
    ];
  };

  const loadExample = (id: string) => {
    if (id.startsWith('example:')) {
      const example = PLUGIN_EXAMPLES.find((candidate) => candidate.id === id.slice('example:'.length));
      if (example) {
        show(example.lang, example.code, example.name, example.description);
      }
      return;
    }
    if (id.startsWith('plugin:')) {
      const [, languageId, exampleId] = id.split(':');
      const language = findScriptLanguage(languageId);
      const example = language?.examples?.find((candidate) => candidate.id === exampleId);
      if (language && example) {
        show(language.id, example.code, localize(example.name), example.description ? localize(example.description) : undefined);
      }
      return;
    }
    if (id.startsWith('my:')) {
      const script = scripts.find(id.slice(3));
      if (script) {
        lang.value = script.lang;
        code.value = script.code;
        currentSaved.value = script.name;
      }
      return;
    }
    const example = EXAMPLES.find((candidate) => candidate.id === id);
    if (example) {
      lang.value = example.lang;
      code.value = example.code;
      currentSaved.value = null;
      out.value = [
        { kind: 'log', text: t('scriptEditor.exampleWithDescription', { name: example.name, description: example.description }) },
      ];
    }
  };

  return { pluginLanguage, appExamples, pluginExampleGroups, savedHere, loadExample };
};
