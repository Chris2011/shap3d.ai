<template>
  <div class="mt-2.5 mb-1.25 flex items-center gap-2 s3d-caption text-navy">{{ t('terrain.panel.brush') }}</div>
  <div class="grid grid-cols-[repeat(5,1fr)] gap-0.75">
    <button
      v-for="(mode, i) in MODES"
      :key="mode.id"
      type="button"
      class="flex flex-col items-center gap-px border py-1 text-[0.65625rem]"
      :class="
        terrainUi.brush.mode === mode.id ? 'border-navy bg-sel font-bold text-navy' : 'border-line-2 bg-surface text-ink hover:border-navy'
      "
      :aria-pressed="terrainUi.brush.mode === mode.id"
      :title="modeTitle(mode.id, i)"
      @click="setMode(mode.id)"
    >
      <span class="text-[0.9375rem]/4" aria-hidden="true">{{ mode.icon }}</span
      ><span>{{ t(`terrain.modes.${mode.id}`) }}</span>
    </button>
  </div>
  <S3dTerrainSlider
    v-model="terrainUi.brush.radius"
    :label="t('materials.size')"
    :min="0.2"
    :max="maxRadius"
    :step="0.1"
    :value-text="`Ø ${formatMetres(terrainUi.brush.radius * 2)}`"
  />
  <S3dTerrainSlider
    v-model="terrainUi.brush.strength"
    :label="t('terrain.panel.strength')"
    min="0.05"
    max="1"
    step="0.05"
    :value-text="`${Math.round(terrainUi.brush.strength * 100)} %`"
  />
  <p class="mt-1.5 mb-2 text-[0.6875rem]/[1.4] text-ink-2" v-html="richText(t('terrain.panel.brushHint'))"></p>
</template>

<script setup lang="ts">
import S3dTerrainSlider from './S3dTerrainSlider.vue';
import { useEditor } from '../../../../components/keys';
import { richText } from '../../../../utils/safeHtml';
import { terrainUi } from '../session';
import type { BrushMode } from '../terrainData';
import { formatMetres, useTerrainSession } from '../useTerrainSession';
import { t } from '../../../../i18n';

/** The brush: what it does (keys 1–5), its size and its strength. */
const editor = useEditor();
const { maxRadius } = useTerrainSession();
/** names and tips: `terrain.modes.<id>` and `terrain.modes.<id>Tip` */
const MODES: { id: BrushMode; icon: string }[] = [
  { id: 'raise', icon: '▲' },
  { id: 'lower', icon: '▼' },
  { id: 'smooth', icon: '≈' },
  { id: 'flatten', icon: '▬' },
  { id: 'rough', icon: '✶' },
];
const modeTitle = (id: BrushMode, index: number) => `${t(`terrain.modes.${id}Tip`)} (${t('terrain.panel.key', { key: index + 1 })})`;
const setMode = (mode: BrushMode) => {
  terrainUi.brush.mode = mode;
  editor.refreshStatus();
};
</script>
