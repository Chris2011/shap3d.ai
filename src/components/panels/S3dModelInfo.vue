<template>
  <S3dSectionTitle>{{ t('modelInfo.units') }}</S3dSectionTitle>
  <S3dFieldRow :label="t('modelInfo.format')">
    <S3dSelect
      :model-value="settings.units"
      :aria-label="t('modelInfo.format')"
      @update:model-value="setAndRefresh('units', $event as Units)"
    >
      <option value="mm">{{ t('units.millimetres') }}</option>
      <option value="cm">{{ t('units.centimetres') }}</option>
      <option value="m">{{ t('units.metres') }}</option>
      <option value="in">{{ t('units.inches') }}</option>
      <option value="ft">{{ t('units.feetInches') }}</option>
    </S3dSelect>
  </S3dFieldRow>
  <S3dFieldRow :label="t('modelInfo.precision')">
    <S3dSelect
      :model-value="settings.precision"
      :aria-label="t('modelInfo.precision')"
      @update:model-value="setAndRefresh('precision', Number($event))"
    >
      <option v-for="precision in [0, 1, 2, 3, 4]" :key="precision" :value="precision">
        {{ t('modelInfo.decimals', { count: precision }) }}
      </option>
    </S3dSelect>
  </S3dFieldRow>
  <S3dModelVariables />
  <S3dSectionTitle>{{ t('modelInfo.statistics') }}</S3dSectionTitle>
  <S3dFieldRow :label="t('modelInfo.faces')">{{ stats.faces }}</S3dFieldRow>
  <S3dFieldRow :label="t('modelInfo.edges')">{{ stats.edges }}</S3dFieldRow>
  <S3dFieldRow :label="t('modelInfo.definitions')">{{ defs }}</S3dFieldRow>
  <S3dFieldRow :label="t('panels.materials')">{{ editor.model.materials.length }}</S3dFieldRow>
  <S3dFieldRow :label="t('modelInfo.extent')">{{ extent }}</S3dFieldRow>
  <S3dButton small @click="purge">{{ t('modelInfo.purge') }}</S3dButton>
</template>

<script setup lang="ts">
import * as THREE from 'three';
import S3dButton from '../ui/S3dButton.vue';
import S3dFieldRow from '../ui/S3dFieldRow.vue';
import S3dSectionTitle from '../ui/S3dSectionTitle.vue';
import S3dSelect from '../ui/S3dSelect.vue';
import S3dModelVariables from './S3dModelVariables.vue';
import { useEditor } from '../keys';
import type { ModelSettings } from '../../core/document';
import { useModel } from '../../composables/useModel';
import { useModelSettings } from '../../composables/useModelSettings';
import { t } from '../../i18n';

type Units = ModelSettings['units'];
const editor = useEditor();
const settings = useModel(() => editor.model.settings);
const stats = useModel(() => editor.model.root.stats());
const defs = useModel(() => editor.model.definitions.size);
const extent = useModel(() => {
  const bounds = editor.model.bounds();
  if (bounds.isEmpty()) {
    return '—';
  }
  const size = bounds.getSize(new THREE.Vector3());
  return `${editor.fmt(size.x)} × ${editor.fmt(size.y)} × ${editor.fmt(size.z)}`;
});
const set = useModelSettings();
/** units and precision also change the lengths shown in the status bar */
const setAndRefresh = <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) => {
  set(key, value);
  editor.refreshStatus();
};
const purge = () => {
  editor.commit('undo.purge', () => {
    editor.model.purge();
  });
  editor.toast(t('modelInfo.purged'));
};
</script>
