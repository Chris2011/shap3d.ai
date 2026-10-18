<template>
  <div class="relative h-screen w-screen overflow-hidden" @contextmenu.prevent @dragenter.prevent="onDrag" @dragover.prevent="onDrag" @dragleave="onLeave" @drop.prevent="onDrop">
    <div v-if="dragging" class="pointer-events-none absolute inset-0 z-90 flex items-center justify-center bg-brand-deep/12 outline-3 -outline-offset-12 outline-dashed outline-brand-deep"><div class="s3d-panel flex flex-col items-center gap-2 px-7.5 py-5.5 text-center text-ink"><S3dIcon name="import" :size="28" /><b class="text-[0.9375rem]">Datei loslassen zum Importieren</b><span class="text-xs text-ink-2">SketchUp (SKP, DAE) · Blender (BLEND) · 3ds Max (FBX, 3DS) · OBJ · STL · glTF/GLB · PLY · 3MF · USDZ · Shap3D (.json)</span></div></div>
    <S3dViewport class="inset-x-0 top-0 bottom-status" @context="openContext" />
    <S3dTopBar />
    <S3dMainToolbar @search="openPalette()" />
    <S3dRightPanels />
    <S3dStatusBar ref="statusBar" />
    <S3dContextMenu v-if="contextMenu" :x="contextMenu.x" :y="contextMenu.y" @close="contextMenu = null" />
    <S3dCommandPalette v-if="palette.open" />
    <S3dTerrainPanel />
    <S3dDialogs />
    <S3dWelcomeTour />
    <transition enter-active-class="transition-opacity duration-200" leave-active-class="transition-opacity duration-200" enter-from-class="opacity-0" leave-to-class="opacity-0"><div v-if="editor.ui.toast" class="pointer-events-none absolute bottom-12 left-1/2 z-80 -translate-x-1/2 rounded bg-[#2b3035] px-4 py-2 text-[0.8125rem] text-white shadow-[0_2px_8px_rgba(0,0,0,.3)]">{{ editor.ui.toast }}</div></transition>
    <div v-if="editor.ui.contextName" class="s3d-panel absolute top-13 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 py-1 pr-1.5 pl-2.5 text-xs">
      <S3dIcon name="group" :size="16" /> Bearbeiten: <b>{{ editor.ui.contextName }}</b>
      <button class="s3d-btn small" @click="editor.exitContext(true)">Schließen</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { provide, ref, onMounted } from 'vue';
import { useEventListener } from '@vueuse/core';
import S3dViewport from './components/S3dViewport.vue';
import S3dTopBar from './components/S3dTopBar.vue';
import S3dMainToolbar from './components/S3dMainToolbar.vue';
import S3dRightPanels from './components/S3dRightPanels.vue';
import S3dStatusBar from './components/S3dStatusBar.vue';
import S3dContextMenu from './components/S3dContextMenu.vue';
import S3dCommandPalette from './components/S3dCommandPalette.vue';
import { palette, openPalette, closePalette } from './components/paletteState';
import S3dDialogs from './components/S3dDialogs.vue';
import S3dTerrainPanel from './components/S3dTerrainPanel.vue';
import S3dIcon from './components/S3dIcon.vue';
import S3dWelcomeTour from './components/S3dWelcomeTour.vue';
import { openTour, tourSeen } from './components/tour';
import { createEditor, installKeyboard } from './engine/setup';
import { EDITOR } from './components/keys';
import { autosave } from './engine/defaults';
import { importFile } from './engine/commands';

const editor = createEditor();
provide(EDITOR, editor);
(window as any).editor = editor; // handy for debugging in the console

const contextMenu = ref<{ x: number; y: number } | null>(null);
const statusBar = ref<InstanceType<typeof S3dStatusBar> | null>(null);
const openContext = (position: { x: number; y: number }) => { contextMenu.value = position; };

// drag & drop import
const dragging = ref(false);
const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
const onDrag = (event: DragEvent) => { if (hasFiles(event)) { dragging.value = true; if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; } };
const onLeave = (event: DragEvent) => { if (!event.relatedTarget || !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) dragging.value = false; };
const onDrop = async (event: DragEvent) => {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0]; if (!file) return;
  await importFile(editor, file).catch(reason => editor.toast(String(reason?.message ?? reason)));
};

useEventListener(window, 'beforeunload', () => autosave(editor));

// command palette like VS Code / IntelliJ: Strg+Umschalt+P, F1, Strg+K or Umschalt twice
let lastShift = 0, otherKey = false;
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const ctrl = event.ctrlKey || event.metaKey, k = event.key.toLowerCase();
  if ((ctrl && event.shiftKey && k === 'p') || (ctrl && !event.shiftKey && !event.altKey && k === 'k') || (event.key === 'F1' && !ctrl)) {
    event.preventDefault(); event.stopPropagation();
    if (palette.open) closePalette(); else openPalette();
    return;
  }
  otherKey = event.key !== 'Shift';
}, { capture: true });
// Umschalt + mouse (pan, Umschalt+wheel orbit) must not count as a tap
useEventListener(window, ['pointerdown', 'wheel'], () => { otherKey = true; }, { capture: true, passive: true });
useEventListener(window, 'keyup', (event: KeyboardEvent) => {
  if (event.key !== 'Shift') return;
  if (otherKey || event.ctrlKey || event.altKey || event.metaKey) { otherKey = false; lastShift = 0; return; }
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !palette.open) return;
  const now = performance.now();
  if (now - lastShift < 350) { lastShift = 0; if (!palette.open) openPalette(); } else lastShift = now;
}, { capture: true });

onMounted(() => {
  installKeyboard(editor, (firstKey) => statusBar.value?.focusVcb(firstKey));
  // first start: show the welcome tour once the splash is gone
  if (!tourSeen() && !new URLSearchParams(location.search).has('shot')) setTimeout(() => openTour(), 2500);
});
</script>
