<template>
  <div class="relative flex gap-1.5 px-2.5 pt-2 pb-1">
    <S3dSelect v-model="lang" class="w-27.5 flex-none">
      <option value="js">JavaScript</option>
      <option value="json">JSON</option>
      <option value="obj">OBJ-Mesh</option>
      <option v-for="language in SCRIPT_LANGUAGES" :key="language.id" :value="language.id">{{ localize(language.label) }}</option>
    </S3dSelect>
    <select class="s3d-input flex-1" value="" :aria-label="t('scriptEditor.loadExample')" @change="pick">
      <!-- only what is written in the chosen language: the app's examples, a plugin language's own, then those
           the plugins bring (one group each), then the user's scripts -->
      <option value="" disabled>{{ t('scriptEditor.loadExample') }}</option>
      <optgroup v-if="appExamples.length" label="Shap3D.ai">
        <option v-for="example in appExamples" :key="example.id" :value="example.id">{{ example.name }}</option>
      </optgroup>
      <optgroup v-if="pluginLanguage?.examples?.length" :label="localize(pluginLanguage.label)">
        <option v-for="example in pluginLanguage.examples" :key="example.id" :value="`plugin:${pluginLanguage.id}:${example.id}`">
          {{ localize(example.name) }}
        </option>
      </optgroup>
      <optgroup v-for="group in pluginExampleGroups" :key="group.plugin" :label="t('scriptEditor.pluginExamples', { name: group.plugin })">
        <option v-for="example in group.examples" :key="example.id" :value="`example:${example.id}`">{{ example.name }}</option>
      </optgroup>
      <optgroup v-if="savedHere.length" :label="t('scriptEditor.myScripts')">
        <option v-for="script in savedHere" :key="script.name" :value="'my:' + script.name">{{ script.name }}</option>
      </optgroup>
    </select>
    <S3dScriptRunButton :running="running" @click="run" />
    <!-- while running: a thin bar under the row -->
    <div
      v-if="running"
      class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
      role="progressbar"
      :aria-label="t('scriptEditor.executing')"
    >
      <div class="h-full w-2/5 animate-splash-load bg-blue motion-reduce:animate-none"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import S3dSelect from '../../ui/S3dSelect.vue';
import S3dScriptRunButton from './S3dScriptRunButton.vue';
import { SCRIPT_LANGUAGES } from '../../../scripting/languages';
import { useScriptEditorState } from '../../../composables/useScriptEditorState';
import { useScriptExamples } from '../../../composables/useScriptExamples';
import { useScriptRun } from '../../../composables/useScriptRun';
import { t, localize } from '../../../i18n';

/** Top row: language, examples and saved scripts, Run. */
const { lang, running } = useScriptEditorState();
const { pluginLanguage, appExamples, pluginExampleGroups, savedHere, loadExample } = useScriptExamples();
const { run } = useScriptRun();
/** the list is an action, not a value: it always goes back to its title */
const pick = (event: Event) => {
  const select = event.target as HTMLSelectElement;
  loadExample(select.value);
  select.value = '';
};
</script>
