import { computed } from 'vue';
import { terrainUi, terrainData, stats } from './session';
import type { TerrainLayers } from './terrainData';
import { formatNumber } from '../../../i18n';

/** Terrain works at landscape scale – always metres, whatever the model unit is. */
export const formatMetres = (value: number) => `${formatNumber(value, { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1 })} m`;

/**
 * The terrain being sculpted, re-read after every change of the session, with the limits the sliders use:
 * brush radius up to half the terrain, heights up to half its size (at least 5 m), water down to minus half.
 */
export const useTerrainSession = () => {
  const terrain = computed(() => {
    void terrainUi.revision;
    return terrainData();
  });
  const layers = computed<TerrainLayers | null>(() => terrain.value?.layers ?? null);
  const terrainStats = computed(() => {
    void terrainUi.revision;
    return stats();
  });
  const maxRadius = computed(() => (terrain.value ? +(Math.max(terrain.value.width, terrain.value.depth) / 2).toFixed(1) : 10));
  const maxHeight = computed(() => (terrain.value ? Math.max(5, Math.ceil(Math.max(terrain.value.width, terrain.value.depth) * 0.5)) : 10));
  const minHeight = computed(() => -maxHeight.value / 2);
  return { terrain, layers, terrainStats, maxRadius, maxHeight, minHeight };
};
