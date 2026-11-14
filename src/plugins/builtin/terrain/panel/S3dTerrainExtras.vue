<template>
  <div class="mt-2.5 mb-1.25 flex items-center gap-2 s3d-caption text-navy">{{ t('terrain.panel.extras') }}</div>
  <S3dCheckbox :model-value="shown.skirt" @update:model-value="terrain.skirt = $event">{{ t('terrain.panel.skirt') }}</S3dCheckbox>
  <S3dTerrainSlider
    :model-value="shown.water ?? 0"
    :min="minHeight"
    :max="maxHeight"
    step="0.05"
    :disabled="shown.water == null"
    :value-text="shown.water != null ? formatMetres(shown.water) : t('terrain.panel.off')"
    @update:model-value="setWater"
  >
    <template #label
      ><span class="flex items-center gap-1"
        ><input type="checkbox" :checked="shown.water != null" @change="toggleWater(checkedOf($event))" />
        {{ t('terrain.panel.water') }}</span
      ></template
    >
  </S3dTerrainSlider>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dCheckbox from '../../../../components/ui/S3dCheckbox.vue';
import S3dTerrainSlider from './S3dTerrainSlider.vue';
import { checkedOf } from '../../../../utils/inputEvent';
import { refreshLook, terrainUi } from '../session';
import type { TerrainData } from '../terrainData';
import { formatMetres, useTerrainSession } from '../useTerrainSession';
import { t } from '../../../../i18n';

/** Extras: a skirt down to the ground around the edges, and water at a height. */
const props = defineProps<{ terrain: TerrainData }>();
const { terrainStats, maxHeight, minHeight } = useTerrainSession();
// the terrain object stays the same when it changes – a copy per change of the session re-renders the values
const shown = computed(() => {
  void terrainUi.revision;
  return { skirt: props.terrain.skirt, water: props.terrain.water };
});
const setWater = (height: number) => {
  if (props.terrain.water != null) {
    props.terrain.water = height;
    refreshLook();
  }
};
const toggleWater = (on: boolean) => {
  props.terrain.water = on ? Math.min(0, (terrainStats.value?.lowest ?? 0) + 0.3) : null;
  refreshLook();
};
</script>
