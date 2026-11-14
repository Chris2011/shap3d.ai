<template>
  <div class="flex items-center gap-2.5 px-2.5 pb-1.5 text-xs">
    <S3dCheckbox v-model="clearFirst">{{ t('scriptEditor.clearFirst') }}</S3dCheckbox>
    <span class="flex-1"></span>
    <select
      v-if="convertTargets.length"
      class="s3d-input h-6 w-auto py-0 text-xs"
      value=""
      :title="t('scriptEditor.convertTitle')"
      :aria-label="t('scriptEditor.convertTitle')"
      :disabled="running"
      @change="pickConversion"
    >
      <option value="" disabled>{{ t('scriptEditor.convertTo') }}</option>
      <option v-for="format in convertTargets" :key="format.id" :value="format.id">{{ format.label }}</option>
    </select>
    <button v-if="beforeConvert" type="button" class="s3d-link" :title="t('scriptEditor.undoConvertTitle')" @click="undoConvert">
      {{ t('scriptEditor.undoConvert') }}
    </button>
    <button type="button" class="s3d-link" :title="t('scriptEditor.newTitle')" @click="newScript">{{ t('menu.new') }}</button>
    <button type="button" class="s3d-link" @click="save">{{ t('topbar.save') }}</button>
    <button v-if="currentSaved" type="button" class="s3d-link" @click="removeSaved">{{ t('commands.delete') }}</button>
    <button type="button" class="s3d-link" @click="showHelp = !showHelp">
      {{ showHelp ? t('scriptEditor.hideApiInfo') : t('scriptEditor.apiInfo') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import S3dCheckbox from '../../ui/S3dCheckbox.vue';
import { useEditor } from '../../keys';
import { useScripts } from '../../../composables/useScripts';
import { useScriptEditorState } from '../../../composables/useScriptEditorState';
import { useCodeConvert } from '../../../composables/useCodeConvert';
import { useCodeInsert } from '../../../composables/useCodeInsert';
import { t } from '../../../i18n';

/** Second row: start from an empty model, convert, new, save/delete as "my script", API help. */
const editor = useEditor();
const scripts = useScripts();
const { lang, code, running, clearFirst, showHelp, currentSaved, beforeConvert } = useScriptEditorState();
const { convertTargets, convertTo, undoConvert } = useCodeConvert();
const { newScript } = useCodeInsert();
/** the list is an action, not a value: it always goes back to its title */
const pickConversion = (event: Event) => {
  const select = event.target as HTMLSelectElement;
  void convertTo(select.value);
  select.value = '';
};
const save = async () => {
  const name = await editor.prompt(t('prompt.scriptName'), currentSaved.value ?? t('scriptEditor.myScript'));
  if (!name) {
    return;
  }
  scripts.save({ name, lang: lang.value, code: code.value });
  currentSaved.value = name;
  editor.toast(t('scriptEditor.saved'));
};
const removeSaved = () => {
  if (currentSaved.value) {
    scripts.remove(currentSaved.value);
  }
  currentSaved.value = null;
};
</script>
