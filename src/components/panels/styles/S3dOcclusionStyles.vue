<template>
  <S3dSectionTitle>{{ t('styles.ambientOcclusion') }}</S3dSectionTitle>
  <S3dStyleCheck field="ao">{{ t('styles.aoShow') }}</S3dStyleCheck>
  <S3dFieldRow :label="t('styles.aoDistance')">
    <S3dRangeSlider
      class="min-w-0 flex-1"
      min="0.05"
      max="3"
      step="0.05"
      :aria-label="t('styles.aoDistance')"
      :model-value="style.aoDistance"
      @update:model-value="setStyle('aoDistance', $event)"
    /><span class="w-16 text-end tabular-nums">{{ formatLength(style.aoDistance, units) }}</span>
  </S3dFieldRow>
  <S3dFieldRow :label="t('styles.aoIntensity')">
    <S3dRangeSlider
      class="min-w-0 flex-1"
      min="0"
      max="2"
      step="0.05"
      :aria-label="t('styles.aoIntensity')"
      :model-value="style.aoIntensity"
      @update:model-value="setStyle('aoIntensity', $event)"
    /><span class="w-16 text-end tabular-nums">{{ Math.round(style.aoIntensity * 100) }} %</span>
  </S3dFieldRow>
  <S3dStyleColor field="aoColor" :label="t('styles.aoColor')" />
</template>

<script setup lang="ts">
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import S3dRangeSlider from '../../ui/S3dRangeSlider.vue';
import S3dSectionTitle from '../../ui/S3dSectionTitle.vue';
import S3dStyleCheck from './S3dStyleCheck.vue';
import S3dStyleColor from './S3dStyleColor.vue';
import { useEditor } from '../../keys';
import { formatLength } from '../../../core/units';
import { useModel } from '../../../composables/useModel';
import { useStyleSettings } from '../../../composables/useStyleSettings';
import { t } from '../../../i18n';

/** Ambient occlusion: darkening in corners – on/off, reach, strength, colour. */
const editor = useEditor();
const { style, setStyle } = useStyleSettings();
const units = useModel(() => editor.model.settings.units);
</script>
