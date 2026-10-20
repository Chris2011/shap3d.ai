<template>
  <div class="s3d-section-title">{{ t('modelInfo.units') }}</div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('modelInfo.format') }}</span>
    <select class="s3d-input" :value="settings.units" @change="set('units', ($event.target as HTMLSelectElement).value as any)">
      <option value="mm">{{ t('units.millimetres') }}</option>
      <option value="cm">{{ t('units.centimetres') }}</option>
      <option value="m">{{ t('units.metres') }}</option>
      <option value="in">{{ t('units.inches') }}</option>
      <option value="ft">{{ t('units.feetInches') }}</option>
    </select>
  </div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('modelInfo.precision') }}</span>
    <select class="s3d-input" :value="settings.precision" @change="set('precision', +($event.target as HTMLSelectElement).value)">
      <option v-for="precision in [0, 1, 2, 3, 4]" :key="precision" :value="precision">
        {{ t('modelInfo.decimals', { count: precision }) }}
      </option>
    </select>
  </div>
  <div class="s3d-section-title">{{ t('modelInfo.statistics') }}</div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('modelInfo.faces') }}</span
    ><span>{{ stats.faces }}</span>
  </div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('modelInfo.edges') }}</span
    ><span>{{ stats.edges }}</span>
  </div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('modelInfo.definitions') }}</span
    ><span>{{ defs }}</span>
  </div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('panels.materials') }}</span
    ><span>{{ editor.model.materials.length }}</span>
  </div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('modelInfo.extent') }}</span
    ><span>{{ extent }}</span>
  </div>
  <button class="s3d-btn small" @click="purge">{{ t('modelInfo.purge') }}</button>
</template>

<script setup lang="ts">
import * as THREE from 'three';
import { useEditor } from '../keys';
import type { ModelSettings } from '../../core/document';
import { useModel } from '../../composables/useModel';
import { t } from '../../i18n';
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
const set = <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) => {
  editor.model.settings[key] = value;
  editor.ui.saved = false;
  editor.invalidate();
  editor.refreshStatus();
};
const purge = () => {
  editor.commit('undo.purge', () => {
    editor.model.purge();
  });
  editor.toast(t('modelInfo.purged'));
};
</script>
