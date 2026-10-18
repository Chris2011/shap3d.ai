<template>
  <div class="absolute top-1/2 right-1.5 z-27 flex -translate-y-1/2 flex-col gap-2.25">
    <div v-for="p in PANELS" :key="p.id" class="flex items-center justify-end gap-2.5" @mouseenter="hot = p.id" @mouseleave="hot = null">
      <span v-if="!openPanel || hot === p.id" class="cursor-pointer whitespace-nowrap rounded-[2px] bg-panel px-1.75 py-0.5 text-[0.6875rem] font-bold tracking-[0.04688rem] text-navy shadow-panel" @click="toggle(p.id)">{{ p.label }}</span>
      <button class="s3d-panel flex size-10 items-center justify-center border-0 p-0 text-ink" :class="openPanel === p.id ? 'bg-active shadow-[inset_-3px_0_0_#1f6fbf,var(--s3d-shadow)]' : 'hover:bg-hover'" :title="p.label" @click="toggle(p.id)">
        <Icon :name="p.icon" :size="22" />
      </button>
    </div>
  </div>
  <div v-if="current" class="s3d-panel absolute top-13 right-14 bottom-[calc(var(--s3d-status-h)+0.5rem)] z-28 flex flex-col" :style="{ width: current.width / 16 + 'rem' }">
    <div class="flex h-10 flex-none items-center gap-2 bg-panel-2 pr-1 pl-3.5">
      <span class="flex-1 text-base font-semibold tracking-[0.04688rem] text-navy">{{ current.label }}</span>
      <button class="flex size-7.5 items-center justify-center border-0 bg-transparent text-navy hover:bg-hover" title="Schließen" @click="openPanel = null"><Icon name="close" :size="16" /></button>
    </div>
    <div class="flex-1 select-text" :class="current.flush ? 'flex flex-col overflow-hidden' : 'overflow-auto px-3.5 pt-2 pb-3'"><component :is="current.comp" /></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, type Component } from 'vue';
import Icon from './Icon.vue';
import { openPanel, PANEL_INFO, togglePanel as toggle } from './panelState';
import EntityInfo from './panels/EntityInfo.vue';
import Outliner from './panels/Outliner.vue';
import Instructor from './panels/Instructor.vue';
import Materials from './panels/Materials.vue';
import Styles from './panels/Styles.vue';
import Tags from './panels/Tags.vue';
import Shadows from './panels/Shadows.vue';
import Scenes from './panels/Scenes.vue';
import Display from './panels/Display.vue';
import Soften from './panels/Soften.vue';
import Mesh from './panels/Mesh.vue';
import ModelInfo from './panels/ModelInfo.vue';
import ScriptEditor from './panels/ScriptEditor.vue';
import Components from './panels/Components.vue';
import AiChat from './panels/AiChat.vue';

const hot = ref<string | null>(null);
const COMPS: Record<string, Component> = {
  ai: AiChat, entityinfo: EntityInfo, components: Components, instructor: Instructor, materials: Materials, styles: Styles, tags: Tags,
  shadows: Shadows, scenes: Scenes, display: Display, soften: Soften, mesh: Mesh, modelinfo: ModelInfo, outliner: Outliner, scripts: ScriptEditor,
};
const PANELS = PANEL_INFO.map(p => ({ ...p, comp: markRaw(COMPS[p.id]) }));
const current = computed(() => PANELS.find(p => p.id === openPanel.value));
</script>
