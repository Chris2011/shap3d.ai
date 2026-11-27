<template>
  <S3dSectionTitle>{{ t('styles.faces') }}</S3dSectionTitle>
  <S3dSegmentedControl class="mb-1.5" :model-value="style.faceStyle" :options="FACES" @update:model-value="setStyle('faceStyle', $event)" />
  <S3dStyleCheck field="xray">{{ t('styles.xray') }}</S3dStyleCheck>
  <S3dStyleCheck field="backEdges">{{ t('styles.backEdges') }}</S3dStyleCheck>
  <S3dStyleColor field="frontColor" :label="t('styles.front')" />
  <S3dStyleColor field="backColor" :label="t('styles.back')" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dSectionTitle from '../../ui/S3dSectionTitle.vue';
import S3dSegmentedControl from '../../ui/S3dSegmentedControl.vue';
import S3dStyleCheck from './S3dStyleCheck.vue';
import S3dStyleColor from './S3dStyleColor.vue';
import type { FaceStyle } from '../../../core/document';
import { useStyleSettings } from '../../../composables/useStyleSettings';
import { t } from '../../../i18n';

/** How faces are drawn (wireframe … monochrome), X-ray, and the front and back colours. */
const { style, setStyle } = useStyleSettings();
const FACES = computed((): { value: FaceStyle; label: string }[] => [
  { value: 'wireframe', label: t('styles.wireframe') },
  { value: 'hiddenline', label: t('styles.hiddenline') },
  { value: 'shaded', label: t('styles.shaded') },
  { value: 'textured', label: t('styles.textured') },
  { value: 'monochrome', label: t('styles.monochrome') },
]);
</script>
