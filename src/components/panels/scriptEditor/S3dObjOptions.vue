<template>
  <div class="flex items-center gap-3.5 px-2.5 pb-1.5 text-xs [&_label]:flex [&_label]:items-center [&_label]:gap-1.25">
    <label :title="t('scriptEditor.sizeTitle')"
      >{{ t('materials.size') }} <input v-model="objSize" class="s3d-input h-6 w-16" @keydown.stop
    /></label>
    <S3dCheckbox v-model="objYUp" :title="t('scriptEditor.yUpTitle')">{{ t('scriptEditor.yUp') }}</S3dCheckbox>
    <label :title="t('scriptEditor.smoothTitle')"
      >{{ t('scriptEditor.smooth') }}
      <input v-model.number="objSmooth" class="s3d-input h-6 w-13" type="number" min="0" max="180" @keydown.stop />°</label
    >
  </div>
</template>

<script setup lang="ts">
import S3dCheckbox from '../../ui/S3dCheckbox.vue';
import { useScriptEditorState } from '../../../composables/useScriptEditorState';
import { t } from '../../../i18n';

/** OBJ import options: edge length, Y axis up, soften angle. */
const { objSize, objYUp, objSmooth } = useScriptEditorState();
</script>
