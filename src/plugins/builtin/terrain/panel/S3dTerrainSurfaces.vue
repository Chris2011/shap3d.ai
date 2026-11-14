<template>
  <div class="mt-2.5 mb-1.25 flex items-center gap-2 s3d-caption text-navy">
    {{ t('terrain.panel.surfaces') }}
    <S3dCheckbox
      :model-value="shown.auto"
      class="ms-auto font-normal tracking-normal text-ink normal-case"
      @update:model-value="change(() => (layers.auto = $event))"
      >{{ t('terrain.panel.auto') }}</S3dCheckbox
    >
  </div>
  <div class="flex flex-col gap-0.75">
    <div
      v-for="layer in LAYERS"
      :key="layer"
      class="grid grid-cols-[1.25rem_5.125rem_1fr] items-center gap-1.5"
      :class="{ 'opacity-45': !shown.auto && layer !== 'grass' }"
    >
      <span class="relative size-5 overflow-hidden border border-black/15"
        ><span class="absolute inset-0" :style="swatch(shown[layer])"></span
      ></span>
      <span>{{ t(`terrain.layers.${layer}`) }}</span>
      <S3dSelect
        :model-value="shown[layer]"
        class="h-6 px-1 text-xs"
        :aria-label="t(`terrain.layers.${layer}`)"
        @update:model-value="change(() => (layers[layer] = $event))"
      >
        <option v-for="name in materialChoices(shown[layer])" :key="name" :value="name">{{ name }}</option>
      </S3dSelect>
    </div>
  </div>
  <template v-if="shown.auto">
    <S3dTerrainSlider
      :model-value="shown.rockHeight"
      :label="t('terrain.panel.rockFrom')"
      :min="0.3"
      :max="maxHeight"
      step="0.1"
      :value-text="formatMetres(shown.rockHeight)"
      @update:model-value="change(() => (layers.rockHeight = $event))"
    />
    <S3dTerrainSlider
      :model-value="shown.earthSlope"
      :label="t('terrain.panel.earthFrom')"
      min="10"
      max="60"
      step="1"
      :value-text="t('terrain.panel.slope', { degrees: shown.earthSlope })"
      @update:model-value="change(() => (layers.earthSlope = $event))"
    />
    <S3dTerrainSlider
      :model-value="shown.snowHeight ?? maxHeight * 0.6"
      :min="0.5"
      :max="maxHeight"
      step="0.1"
      :disabled="shown.snowHeight == null"
      :value-text="shown.snowHeight != null ? formatMetres(shown.snowHeight) : t('terrain.panel.off')"
      @update:model-value="change(() => layers.snowHeight != null && (layers.snowHeight = $event))"
    >
      <template #label
        ><span class="flex items-center gap-1"
          ><input type="checkbox" :checked="shown.snowHeight != null" @change="toggleSnow(checkedOf($event))" />
          {{ t('terrain.panel.snowFrom') }}</span
        ></template
      >
    </S3dTerrainSlider>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dCheckbox from '../../../../components/ui/S3dCheckbox.vue';
import S3dSelect from '../../../../components/ui/S3dSelect.vue';
import S3dTerrainSlider from './S3dTerrainSlider.vue';
import { useEditor } from '../../../../components/keys';
import { MATERIAL_LIBRARY, libraryMaterial } from '../../../../core/materialLibrary';
import { checkedOf } from '../../../../utils/inputEvent';
import { swatchStyle } from '../../../../utils/materialSwatch';
import { refreshLook, terrainUi } from '../session';
import type { TerrainLayers } from '../terrainData';
import { formatMetres, useTerrainSession } from '../useTerrainSession';
import { t } from '../../../../i18n';

/** The surfaces by height and slope (grass, earth, rock, snow) – automatic or grass only – and their materials. */
const props = defineProps<{ layers: TerrainLayers }>();
const editor = useEditor();
const { maxHeight } = useTerrainSession();
// the layers object stays the same when it changes – a copy per change of the session re-renders the values
const shown = computed(() => {
  void terrainUi.revision;
  return { ...props.layers };
});
/** names: `terrain.layers.<key>` */
const LAYERS = ['grass', 'earth', 'rock', 'snow'] as const;
/** every change repaints the terrain */
const change = (apply: () => unknown) => {
  apply();
  refreshLook();
};
const toggleSnow = (on: boolean) => change(() => (props.layers.snowHeight = on ? +(maxHeight.value * 0.6).toFixed(1) : null));
/** Natural surfaces first, then whatever the model already has. */
const materialChoices = (current: string) => {
  const natural = MATERIAL_LIBRARY.filter(
    (material) => material.category === 'Natur' || material.category === 'Stein & Mineral' /* i18n-ignore – library categories */,
  ).map((material) => material.name);
  const own = editor.model.materials.map((material) => material.name);
  return [...new Set([current, ...natural, ...own])];
};
/** swatch of a layer material – it may already be in the model or still only in the library */
const swatch = (name: string) =>
  swatchStyle(editor.model.materials.find((material) => material.name === name) ?? libraryMaterial(name) ?? { color: '#888888' });
</script>
