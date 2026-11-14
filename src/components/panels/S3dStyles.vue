<template>
  <S3dStylePresets />
  <S3dFaceStyles />
  <S3dSectionTitle>{{ t('styles.edges') }}</S3dSectionTitle>
  <S3dStyleCheck field="edges">{{ t('styles.showEdges') }}</S3dStyleCheck>
  <S3dStyleColor field="edgeColor" :label="t('styles.edgeColor')" />
  <S3dSectionTitle>{{ t('styles.background') }}</S3dSectionTitle>
  <S3dStyleCheck field="sky">{{ t('styles.sky') }}</S3dStyleCheck>
  <S3dStyleColor field="skyColor" :label="t('styles.skyColor')" />
  <S3dStyleCheck field="ground">{{ t('styles.ground') }}</S3dStyleCheck>
  <S3dStyleColor field="groundColor" :label="t('styles.groundColor')" />
  <S3dEnvironmentSettings />
  <S3dOcclusionStyles />
</template>

<script setup lang="ts">
import S3dSectionTitle from '../ui/S3dSectionTitle.vue';
import S3dEnvironmentSettings from './styles/S3dEnvironmentSettings.vue';
import S3dFaceStyles from './styles/S3dFaceStyles.vue';
import S3dOcclusionStyles from './styles/S3dOcclusionStyles.vue';
import S3dStyleCheck from './styles/S3dStyleCheck.vue';
import S3dStyleColor from './styles/S3dStyleColor.vue';
import S3dStylePresets from './styles/S3dStylePresets.vue';
import { t } from '../../i18n';

/** Styles panel: presets, faces, edges, background, environment and ambient occlusion. */
</script>
