<template>
  <S3dSectionTitle>{{ t('materials.physical') }}</S3dSectionTitle>
  <S3dFieldRow v-for="value in PBR_VALUES" :key="value.key" :label="t(value.label)">
    <S3dRangeSlider
      class="flex-1"
      min="0"
      max="1"
      step="0.01"
      :aria-label="t(value.label)"
      :model-value="shown[value.key] ?? value.standard"
      @update:model-value="liveEdit(() => (material[value.key] = $event))"
    /><span class="w-9 text-end tabular-nums">{{ (shown[value.key] ?? value.standard).toFixed(2) }}</span>
  </S3dFieldRow>
  <S3dFieldRow v-for="map in PBR_MAPS" :key="map.key" :label="t(map.label)">
    <S3dButton small @click="loadMap(map.key)">
      {{ shown.maps?.[map.key] ? t('materials.replaceImage') : t('materials.loadMap') }}
    </S3dButton>
    <S3dButton v-if="shown.maps?.[map.key]" small :title="t('materials.removeMap')" @click="removeMap(map.key)">×</S3dButton>
  </S3dFieldRow>
</template>

<script setup lang="ts">
import S3dButton from '../../ui/S3dButton.vue';
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import S3dRangeSlider from '../../ui/S3dRangeSlider.vue';
import S3dSectionTitle from '../../ui/S3dSectionTitle.vue';
import type { MaterialDef, MaterialMapKind } from '../../../core/document';
import { pickFile } from '../../../engine/commands';
import { readImageFile } from '../../../utils/imageFile';
import { useModel } from '../../../composables/useModel';
import { useLiveEdit } from '../../../composables/useLiveEdit';
import { t } from '../../../i18n';

/** Physically based values (roughness, metalness) and their picture maps. */
const props = defineProps<{ material: MaterialDef }>();
const PBR_VALUES = [
  { key: 'roughness', label: 'materials.roughness', standard: 0.8 },
  { key: 'metalness', label: 'materials.metalness', standard: 0 },
] as const;
const PBR_MAPS = [
  { key: 'normal', label: 'materials.mapNormal' },
  { key: 'roughness', label: 'materials.roughness' },
  { key: 'metalness', label: 'materials.metalness' },
  { key: 'ao', label: 'materials.mapAo' },
] as const;
const shown = useModel(() => ({ ...props.material }));
const liveEdit = useLiveEdit();
const loadMap = async (key: MaterialMapKind) => {
  const file = await pickFile('image/*');
  if (file) {
    const url = (await readImageFile(file)).url;
    liveEdit(() => (props.material.maps = { ...props.material.maps, [key]: url }));
  }
};
const removeMap = (key: MaterialMapKind) => {
  const maps = props.material.maps;
  if (maps) {
    liveEdit(() => delete maps[key]);
  }
};
</script>
