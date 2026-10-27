<template>
  <!-- between the top bar and the status bar: centred while it fits, scrolls on low screens (tiles get smaller there);
       the outer box lets clicks through, only the tiles take them -->
  <div class="pointer-events-none absolute top-13 right-0 bottom-[calc(var(--s3d-status-h)+0.5rem)] z-27 flex flex-col justify-center">
    <div
      class="pointer-events-auto flex max-h-full flex-col gap-2.25 overflow-y-auto overscroll-contain py-0.5 ps-2 pe-1.5 [@media(max-height:760px)]:gap-1.25"
    >
      <div
        v-for="panel in tiles"
        :key="panel.id"
        class="flex flex-none items-center justify-end gap-2.5 rtl:flex-row-reverse"
        @mouseenter="hot = panel.id"
        @mouseleave="hot = null"
      >
        <span
          v-if="!openPanel || hot === panel.id"
          class="cursor-pointer whitespace-nowrap rounded-[2px] bg-panel px-1.75 py-0.5 text-[0.6875rem] font-bold tracking-[0.04688rem] text-navy shadow-panel"
          @click="toggle(panel.id)"
          >{{ panel.label }}</span
        >
        <button
          class="s3d-panel flex size-10 flex-none items-center justify-center border-0 p-0 text-ink [@media(max-height:760px)]:size-8.5"
          :class="openPanel === panel.id ? 'bg-active shadow-[inset_-3px_0_0_#1f6fbf,var(--s3d-shadow)]' : 'hover:bg-hover'"
          :title="panel.label"
          @click="toggle(panel.id)"
        >
          <S3dIcon :name="panel.icon" :size="22" />
        </button>
      </div>
    </div>
  </div>
  <div
    v-if="current"
    class="s3d-panel absolute top-13 right-14 bottom-[calc(var(--s3d-status-h)+0.5rem)] z-28 flex flex-col"
    :style="{ width: current.width / 16 + 'rem' }"
  >
    <div class="flex h-10 flex-none items-center gap-2 bg-panel-2 pe-1 ps-3.5">
      <span class="flex-1 text-base font-semibold tracking-[0.04688rem] text-navy">{{ current.label }}</span>
      <S3dCloseButton @click="openPanel = null" />
    </div>
    <div class="flex-1 select-text" :class="current.flush ? 'flex flex-col overflow-hidden' : 'overflow-auto px-3.5 pt-2 pb-3'">
      <component :is="current.comp" />
    </div>
  </div>
</template>

<script setup lang="ts">
import S3dCloseButton from './ui/S3dCloseButton.vue';
import { ref, computed, markRaw, type Component } from 'vue';
import S3dIcon from './S3dIcon.vue';
import { openPanel, PANEL_INFO, togglePanel as toggle } from './panelState';
import S3dEntityInfo from './panels/S3dEntityInfo.vue';
import S3dOutliner from './panels/S3dOutliner.vue';
import S3dInstructor from './panels/S3dInstructor.vue';
import S3dMaterials from './panels/S3dMaterials.vue';
import S3dStyles from './panels/S3dStyles.vue';
import S3dTags from './panels/S3dTags.vue';
import S3dShadows from './panels/S3dShadows.vue';
import S3dScenes from './panels/S3dScenes.vue';
import S3dDisplay from './panels/S3dDisplay.vue';
import S3dSoften from './panels/S3dSoften.vue';
import S3dMesh from './panels/S3dMesh.vue';
import S3dModelInfo from './panels/S3dModelInfo.vue';
import S3dScriptEditor from './panels/S3dScriptEditor.vue';
import S3dComponents from './panels/S3dComponents.vue';
import S3dPluginManager from './panels/S3dPluginManager.vue';

const hot = ref<string | null>(null);
const COMPS: Record<string, Component> = {
  entityinfo: S3dEntityInfo,
  components: S3dComponents,
  instructor: S3dInstructor,
  materials: S3dMaterials,
  styles: S3dStyles,
  tags: S3dTags,
  shadows: S3dShadows,
  scenes: S3dScenes,
  display: S3dDisplay,
  soften: S3dSoften,
  mesh: S3dMesh,
  modelinfo: S3dModelInfo,
  outliner: S3dOutliner,
  scripts: S3dScriptEditor,
  plugins: S3dPluginManager,
};
const PANELS = computed(() => PANEL_INFO.map((panel) => ({ ...panel, comp: markRaw(panel.component ?? COMPS[panel.id]) })));
const tiles = computed(() => PANELS.value.filter((panel) => panel.tile !== false));
const current = computed(() => PANELS.value.find((panel) => panel.id === openPanel.value));
</script>
