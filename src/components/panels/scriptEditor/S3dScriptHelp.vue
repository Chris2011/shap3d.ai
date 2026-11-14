<template>
  <pre v-if="lang === 'obj'" :class="HELP_BOX">{{ t('scriptEditor.objHelp') }}</pre>
  <pre v-else-if="pluginLanguage" :class="HELP_BOX">{{
    pluginLanguage.help ? localize(pluginLanguage.help) : t('scriptEditor.noHelp')
  }}</pre>
  <S3dApiReference v-else class="flex-[0_0_52%]" @insert="insertText" @try="tryExample" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dApiReference from '../S3dApiReference.vue';
import { findScriptLanguage } from '../../../scripting/languages';
import { useScriptEditorState } from '../../../composables/useScriptEditorState';
import { useCodeInsert } from '../../../composables/useCodeInsert';
import { useScriptRun } from '../../../composables/useScriptRun';
import { t, localize } from '../../../i18n';

/** Help for the chosen language: OBJ format, a plugin language's own text, or the s3d API reference. */
const HELP_BOX =
  'mx-2.5 mt-0 mb-1.5 max-h-55 overflow-auto rounded-[3px] border border-line bg-surface-2 p-2 font-mono text-[0.6875rem]/[1.45] whitespace-pre-wrap select-text';
const { lang } = useScriptEditorState();
const pluginLanguage = computed(() => findScriptLanguage(lang.value));
const { insertText } = useCodeInsert();
const { tryExample } = useScriptRun();
</script>
