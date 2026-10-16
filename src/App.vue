<template>
  <div class="app" @contextmenu.prevent @dragenter.prevent="onDrag" @dragover.prevent="onDrag" @dragleave="onLeave" @drop.prevent="onDrop">
    <div v-if="dragging" class="dropzone"><div class="dz s3d-panel"><Icon name="import" :size="28" /><b>Datei loslassen zum Importieren</b><span>SketchUp (SKP, DAE) · Blender (BLEND) · 3ds Max (FBX, 3DS) · OBJ · STL · glTF/GLB · PLY · 3MF · USDZ · Shap3D (.json)</span></div></div>
    <Viewport class="viewport" @context="openContext" />
    <TopBar />
    <MainToolbar @search="searchOpen = true" />
    <RightPanels />
    <StatusBar ref="statusBar" />
    <ContextMenu v-if="ctx" :x="ctx.x" :y="ctx.y" @close="ctx = null" />
    <SearchPalette v-if="searchOpen" @close="searchOpen = false" />
    <TerrainPanel />
    <Dialogs />
    <transition name="fade"><div v-if="ed.ui.toast" class="toast">{{ ed.ui.toast }}</div></transition>
    <div v-if="ed.ui.contextName" class="context-banner s3d-panel">
      <Icon name="group" :size="16" /> Bearbeiten: <b>{{ ed.ui.contextName }}</b>
      <button class="s3d-btn small" @click="ed.exitContext(true)">Schließen</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { provide, ref, onMounted } from 'vue';
import Viewport from './components/Viewport.vue';
import TopBar from './components/TopBar.vue';
import MainToolbar from './components/MainToolbar.vue';
import RightPanels from './components/RightPanels.vue';
import StatusBar from './components/StatusBar.vue';
import ContextMenu from './components/ContextMenu.vue';
import SearchPalette from './components/SearchPalette.vue';
import Dialogs from './components/Dialogs.vue';
import TerrainPanel from './components/TerrainPanel.vue';
import Icon from './components/Icon.vue';
import { createEditor, installKeyboard } from './engine/setup';
import { EDITOR } from './components/keys';
import { autosave } from './engine/defaults';
import { importFile } from './engine/commands';

const ed = createEditor();
provide(EDITOR, ed);
(window as any).editor = ed; // handy for debugging in the console

const ctx = ref<{ x: number; y: number } | null>(null);
const searchOpen = ref(false);
const statusBar = ref<InstanceType<typeof StatusBar> | null>(null);
function openContext(p: { x: number; y: number }) { ctx.value = p; }

// drag & drop import
const dragging = ref(false);
const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
function onDrag(e: DragEvent) { if (hasFiles(e)) { dragging.value = true; if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; } }
function onLeave(e: DragEvent) { if (!e.relatedTarget || !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragging.value = false; }
async function onDrop(e: DragEvent) {
  dragging.value = false;
  const f = e.dataTransfer?.files?.[0]; if (!f) return;
  await importFile(ed, f).catch(err => ed.toast(String(err?.message ?? err)));
}

onMounted(() => {
  installKeyboard(ed, (ch) => statusBar.value?.focusVcb(ch));
  window.addEventListener('beforeunload', () => {
    autosave(ed);
  });
});
</script>

<style scoped>
.app { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
.viewport { position: absolute; inset: 0 0 var(--s3d-status-h) 0; }
.toast {
  position: absolute; left: 50%; bottom: 48px; transform: translateX(-50%); background: #2b3035; color: #fff; padding: 8px 16px; border-radius: 4px;
  font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,.3); z-index: 80; pointer-events: none;
}
.context-banner { position: absolute; top: 52px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 10px; font-size: 12px; z-index: 20; }
.dropzone { position: absolute; inset: 0; z-index: 90; background: rgba(14, 140, 160, .12); outline: 3px dashed #0e8ca0; outline-offset: -12px; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.dz { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px 30px; color: var(--s3d-text); text-align: center; }
.dz b { font-size: 15px; }
.dz span { font-size: 12px; color: var(--s3d-text-2); }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
