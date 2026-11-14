<template>
  <!-- search, filter, preview -->
  <div class="flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-1.5">
    <input
      v-model="editorState.search"
      class="s3d-input h-7 min-w-40 flex-1"
      :placeholder="t('i18n.editor.search')"
      :aria-label="t('i18n.editor.search')"
      spellcheck="false"
      @keydown.stop
    />
    <S3dCheckbox v-model="editorState.missingOnly" class="whitespace-nowrap">{{ t('i18n.editor.missingOnly') }}</S3dCheckbox>
    <label class="flex items-center gap-1.5 whitespace-nowrap" :title="t('i18n.editor.previewTitle')"
      ><S3dToggleSwitch v-model="editorState.preview" small :label="t('i18n.editor.preview')" /> {{ t('i18n.editor.preview') }}</label
    >
  </div>
</template>

<script setup lang="ts">
import S3dCheckbox from '../../../../components/ui/S3dCheckbox.vue';
import S3dToggleSwitch from '../../../../components/ui/S3dToggleSwitch.vue';
import { t } from '../../../../i18n';
import { editorState } from '../state';

/** Search, "missing only" and the live preview in the app. */
</script>
