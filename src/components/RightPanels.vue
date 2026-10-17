<template>
  <div class="tiles">
    <div v-for="p in PANELS" :key="p.id" class="tile-row" @mouseenter="hot = p.id" @mouseleave="hot = null">
      <span v-if="!openPanel || hot === p.id" class="pill" @click="toggle(p.id)">{{ p.label }}</span>
      <button class="tile s3d-panel" :class="{ active: openPanel === p.id }" :title="p.label" @click="toggle(p.id)">
        <Icon :name="p.icon" :size="22" />
      </button>
    </div>
  </div>
  <div v-if="current" class="panel s3d-panel" :style="{ width: current.width + 'px' }">
    <div class="head">
      <span class="t">{{ current.label }}</span>
      <button class="x" title="Schließen" @click="openPanel = null"><Icon name="close" :size="16" /></button>
    </div>
    <div class="body" :class="{ flush: current.flush }"><component :is="current.comp" /></div>
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

<style scoped>
.tiles { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); z-index: 27; display: flex; flex-direction: column; gap: 9px; }
.tile-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.tile { width: 40px; height: 40px; border: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--s3d-text); padding: 0; }
.tile:hover { background: var(--s3d-hover); }
.tile.active { background: var(--s3d-active); box-shadow: inset -3px 0 0 #1f6fbf, var(--s3d-shadow); }
.pill { background: var(--s3d-panel); color: var(--s3d-navy); font-size: 11px; font-weight: 700; letter-spacing: .75px; padding: 2px 7px; box-shadow: var(--s3d-shadow); white-space: nowrap; cursor: pointer; border-radius: 2px; }
.panel { position: absolute; right: 56px; top: 52px; bottom: calc(var(--s3d-status-h) + 8px); z-index: 28; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 4px 0 14px; background: var(--s3d-panel-2); flex: none; }
.head .t { font-weight: 600; font-size: 16px; letter-spacing: .75px; color: var(--s3d-navy); flex: 1; }
.x { width: 30px; height: 30px; border: 0; background: transparent; cursor: pointer; color: var(--s3d-navy); display: flex; align-items: center; justify-content: center; }
.x:hover { background: var(--s3d-hover); }
.body { flex: 1; overflow: auto; padding: 8px 14px 12px; user-select: text; }
.body.flush { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
</style>
