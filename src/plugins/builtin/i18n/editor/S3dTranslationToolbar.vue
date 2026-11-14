<template>
  <!-- target language and files -->
  <div class="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
    <label class="flex items-center gap-1.5 font-semibold"
      >{{ t('i18n.editor.target') }}
      <select v-model="editorState.target" class="s3d-input h-7 w-40 font-normal">
        <option v-for="entry in targets" :key="entry.code" :value="entry.code">{{ entry.name }} ({{ entry.code }})</option>
      </select>
    </label>
    <S3dButton
      small
      class="flex items-center gap-1"
      :class="{ 'bg-active': creating }"
      :aria-pressed="creating"
      @click="emit('update:creating', !creating)"
    >
      <S3dIcon name="plus" :size="13" /> {{ t('i18n.editor.newLanguage') }}
    </S3dButton>
    <span class="flex-1"></span>
    <S3dButton small class="flex items-center gap-1" :title="t('i18n.editor.importTitle')" @click="importFile">
      <S3dIcon name="import" :size="13" /> {{ t('i18n.editor.import') }}
    </S3dButton>
    <S3dButton
      small
      class="flex items-center gap-1"
      :title="t('i18n.editor.exportTitle')"
      :disabled="!editorState.target"
      @click="exportTarget"
    >
      <S3dIcon name="export" :size="13" /> {{ t('i18n.editor.export') }}
    </S3dButton>
    <S3dButton
      small
      class="flex items-center gap-1"
      :title="t('i18n.editor.templateTitle')"
      @click="downloadJson('template.json', templateFile())"
    >
      <S3dIcon name="file" :size="13" /> {{ t('i18n.editor.template') }}
    </S3dButton>
  </div>
</template>

<script setup lang="ts">
import S3dIcon from '../../../../components/S3dIcon.vue';
import S3dButton from '../../../../components/ui/S3dButton.vue';
import { pickFile } from '../../../../engine/commands';
import { t, formatNumber } from '../../../../i18n';
import { editorState } from '../state';
import { importLanguage, languageFile, templateFile, downloadJson, progressOf } from '../store';
import { useTranslationTarget } from '../useTranslationTarget';

/** Top row: the language being translated, "New language" (v-model:creating), import, export and the template. */
defineProps<{ creating: boolean }>();
const emit = defineEmits<{
  (event: 'update:creating', creating: boolean): void;
  (event: 'message', message: { text: string; error: boolean }): void;
}>();
const { targets, targetName } = useTranslationTarget();

const importFile = async () => {
  const file = await pickFile('.json,application/json');
  if (!file) {
    return;
  }
  try {
    const code = importLanguage(await file.text());
    editorState.target = code;
    emit('message', {
      text: t('i18n.editor.imported', { name: targetName.value, percent: formatNumber(Math.floor(progressOf(code) * 100)) }),
      error: false,
    });
  } catch (error: any) {
    emit('message', { text: t('i18n.editor.importFailed', { error: error?.message ?? error }), error: true });
  }
};
const exportTarget = () => downloadJson(`${editorState.target}.json`, languageFile(editorState.target));
</script>
