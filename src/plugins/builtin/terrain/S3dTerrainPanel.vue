<template>
  <div
    v-if="terrainUi.active || terrainUi.chooser"
    ref="panel"
    class="s3d-panel fixed z-60 flex max-h-[calc(100vh-6.875rem)] w-72.5 flex-col shadow-[0_4px_18px_rgba(0,0,0,.18)]"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
    role="dialog"
    :aria-label="terrainUi.active ? t('terrain.panel.sculpt') : t('terrain.panel.new')"
    @keydown.stop
    @pointerdown.stop
  >
    <div ref="handle" class="flex cursor-move items-center gap-2 bg-panel-2 py-1.75 pe-1.5 ps-2.5 text-navy select-none">
      <S3dIcon name="terrain" :size="18" />
      <span class="flex-1 text-[0.8125rem] font-bold">{{ terrainUi.active ? t('terrain.panel.sculpt') : t('terrain.panel.new') }}</span>
      <S3dCloseButton
        size="sm"
        :title="t('terrain.panel.discardClose')"
        @pointerdown.stop
        @click="terrainUi.active ? discardTerrain() : closeChooser(editor)"
      />
    </div>

    <S3dTerrainChooser v-if="!terrainUi.active" />

    <!-- sculpting -->
    <div v-else class="overflow-auto px-3 pt-2 pb-3 text-xs">
      <div v-if="terrainStats" class="mb-1 text-[0.6875rem] text-ink-2 tabular-nums">
        {{ formatMetres(terrainStats.width) }} × {{ formatMetres(terrainStats.depth) }} ·
        {{ t('terrain.panel.grid', { columns: terrainStats.columns, rows: terrainStats.rows, cell: formatMetres(terrainStats.cellSize) }) }}
        ·
        {{ t('terrain.panel.height', { low: formatMetres(terrainStats.lowest), high: formatMetres(terrainStats.highest) }) }}
      </div>
      <S3dTerrainBrush />
      <div class="mt-2.5 mb-1.25 flex items-center gap-2 s3d-caption text-navy">{{ t('terrain.panel.quick') }}</div>
      <div class="flex flex-wrap gap-1">
        <S3dButton small :title="t('terrain.panel.hillsTitle')" @click="generate('hills')">{{ t('terrain.panel.hills') }}</S3dButton>
        <S3dButton small :title="t('terrain.panel.mountainsTitle')" @click="generate('mountains')">{{
          t('terrain.panel.mountains')
        }}</S3dButton>
        <S3dButton small :title="t('terrain.panel.flatTitle')" @click="generate('flat')">{{ t('terrain.panel.flat') }}</S3dButton>
        <S3dButton
          small
          :disabled="!terrainUi.canUndo"
          :title="t('terrain.panel.undoTitle')"
          :aria-label="t('terrain.panel.undoTitle')"
          @click="undoStroke()"
          >↶</S3dButton
        >
      </div>
      <S3dTerrainSurfaces v-if="layers" :layers="layers" />
      <S3dTerrainExtras v-if="terrain" :terrain="terrain" />
      <div class="mt-3 flex justify-end gap-2">
        <S3dButton :title="t('terrain.panel.discardTitle')" @click="discardTerrain()">{{ t('terrain.panel.discard') }}</S3dButton>
        <S3dButton primary :title="t('terrain.panel.applyTitle')" @click="applyTerrain()">{{ t('terrain.panel.apply') }}</S3dButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue';
import S3dIcon from '../../../components/S3dIcon.vue';
import S3dButton from '../../../components/ui/S3dButton.vue';
import S3dCloseButton from '../../../components/ui/S3dCloseButton.vue';
import S3dTerrainBrush from './panel/S3dTerrainBrush.vue';
import S3dTerrainChooser from './panel/S3dTerrainChooser.vue';
import S3dTerrainExtras from './panel/S3dTerrainExtras.vue';
import S3dTerrainSurfaces from './panel/S3dTerrainSurfaces.vue';
import { useEditor } from '../../../components/keys';
import { useFloatingWindow } from '../../../composables/useFloatingWindow';
import { terrainUi, applyTerrain, discardTerrain, closeChooser, generate, undoStroke } from './session';
import { formatMetres, useTerrainSession } from './useTerrainSession';
import { t } from '../../../i18n';

/** Floating terrain window: create a terrain, then sculpt it, paint its surfaces and apply it to the model. */
const editor = useEditor();
const { terrain, layers, terrainStats } = useTerrainSession();
// floating window: drag it by its title bar, it always stays reachable inside the browser window
const position = useFloatingWindow(useTemplateRef<HTMLElement>('panel'), useTemplateRef<HTMLElement>('handle'));
</script>
