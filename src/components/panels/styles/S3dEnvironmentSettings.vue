<template>
  <S3dSectionTitle>{{ t('styles.environment') }}</S3dSectionTitle>
  <S3dFieldRow>
    <S3dButton small @click="loadEnvironmentFile">{{ t('styles.environmentLoad') }}</S3dButton>
    <span class="truncate" :title="environmentName">{{ environmentName }}</span>
    <S3dButton v-if="environmentName" small :title="t('styles.environmentRemove')" @click="setEnvironment(undefined)">×</S3dButton>
  </S3dFieldRow>
  <template v-if="environmentName">
    <S3dCheckbox :model-value="settings.environmentBackground" @update:model-value="setSetting('environmentBackground', $event)">{{
      t('styles.environmentBackground')
    }}</S3dCheckbox>
    <S3dFieldRow :label="t('styles.environmentIntensity')">
      <S3dRangeSlider
        class="flex-1"
        min="0"
        max="3"
        step="0.05"
        :aria-label="t('styles.environmentIntensity')"
        :model-value="settings.environmentIntensity"
        @update:model-value="setSetting('environmentIntensity', $event)"
      />
    </S3dFieldRow>
  </template>
  <S3dCheckbox :model-value="settings.sectionFill" @update:model-value="setSetting('sectionFill', $event)">{{
    t('styles.sectionFill')
  }}</S3dCheckbox>
</template>

<script setup lang="ts">
import S3dButton from '../../ui/S3dButton.vue';
import S3dCheckbox from '../../ui/S3dCheckbox.vue';
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import S3dRangeSlider from '../../ui/S3dRangeSlider.vue';
import S3dSectionTitle from '../../ui/S3dSectionTitle.vue';
import { useEditor } from '../../keys';
import type { ModelEnvironment } from '../../../core/document';
import { pickFile } from '../../../engine/commands';
import { readDataUrl } from '../../../utils/imageFile';
import { useModel } from '../../../composables/useModel';
import { useModelSettings } from '../../../composables/useModelSettings';
import { t } from '../../../i18n';

/** An HDR/EXR picture as light, reflections and sky (saved with the model), and filled section cuts. */
const MAX_ENVIRONMENT_BYTES = 32 * 1024 * 1024;
const editor = useEditor();
const settings = useModel(() => ({ ...editor.model.settings }));
const environmentName = useModel(() => editor.model.environment?.name);
const setSetting = useModelSettings();
const setEnvironment = (environment: ModelEnvironment | undefined) => {
  editor.commit('undo.environment', () => {
    editor.model.environment = environment;
  });
};
const loadEnvironmentFile = async () => {
  const file = await pickFile('.hdr,.exr');
  if (!file) {
    return;
  }
  if (file.size > MAX_ENVIRONMENT_BYTES) {
    editor.toast(t('styles.environmentTooBig'));
    return;
  }
  setEnvironment({ name: file.name, data: await readDataUrl(file) });
};
</script>
