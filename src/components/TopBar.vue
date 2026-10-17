<template>
  <div class="s3d-panel absolute top-0 left-0 z-30 flex h-11 items-center gap-0.5 pr-3 pl-1">
    <button :class="[TB, { 'bg-hover': menuOpen }]" title="Modell/Voreinstellungen öffnen" @click.stop="menuOpen = !menuOpen"><Icon name="menu" :size="22" /></button>
    <input v-if="editing" ref="nameInput" class="mx-1 h-7 w-50 border border-navy bg-surface px-2 font-bold text-navy outline-none" v-model="name" @keydown.enter="commitName" @blur="commitName" @keydown.esc="editing = false" />
    <div v-else class="max-w-65 cursor-text truncate pr-2 pl-1.5 text-sm/11 font-bold tracking-[.85px] text-navy" title="Modell umbenennen" @click="startEdit">{{ modelName }}</div>
    <button :class="[TB, { 'bg-hover': openPanel === 'ai' }]" title="KI-Assistent" @click="openPanel = openPanel === 'ai' ? null : 'ai'"><Icon name="sparkle" :size="22" /></button>
    <button :class="TB_SM" :title="'Rückgängig ' + ed.ui.undoLabel" :disabled="!ed.ui.canUndo" @click="ed.undo()"><Icon name="undo" :size="18" /></button>
    <button :class="TB_SM" :title="'Wiederholen ' + ed.ui.redoLabel" :disabled="!ed.ui.canRedo" @click="ed.redo()"><Icon name="redo" :size="18" /></button>
    <button :class="[TB_SM, 'hover:text-danger']" title="Arbeitsfläche leeren (rückgängig mit Strg+Z)" @click="run('clearAll')"><Icon name="trash" :size="18" /></button>
    <ThemeButton />
    <span v-if="ed.ui.saved" class="whitespace-nowrap pl-3.5 text-sm font-bold text-[#90939f]">Gespeichert</span>
    <button v-else class="whitespace-nowrap border-0 bg-transparent pl-3.5 text-sm font-bold text-navy hover:underline" title="Speichern (Strg+S)" @click="run('save')">Speichern</button>
  </div>

  <div class="s3d-panel absolute top-0 right-0 z-30 flex h-11 items-center gap-2 px-2">
    <button class="h-7 rounded-[2px] border-0 bg-navy-bg px-2.5 text-[13px] font-bold tracking-[.3px] text-white hover:bg-[#0b3457]" @click.stop="exportOpen = !exportOpen">Exportieren</button>
    <div v-if="exportOpen" class="s3d-menu top-11 right-0" @click="exportOpen = false">
      <div class="s3d-menu-item" @click="run('save')"><Icon name="save" :size="18" /> Modell (.shap3d.json)</div>
      <div class="s3d-menu-item" @click="run('export-glb')"><Icon name="cube" :size="18" /> GLB</div>
      <div class="s3d-menu-item" @click="run('export-gltf')"><Icon name="cube" :size="18" /> glTF</div>
      <div class="s3d-menu-item" @click="run('export-stl')"><Icon name="cube" :size="18" /> STL (3D-Druck)</div>
      <div class="s3d-menu-item" @click="run('export-obj')"><Icon name="cube" :size="18" /> OBJ</div>
      <div class="s3d-menu-item" @click="run('export-png')"><Icon name="camera" :size="18" /> PNG-Bild</div>
    </div>
  </div>

  <MainMenu v-if="menuOpen" @close="menuOpen = false" />
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';
import MainMenu from './MainMenu.vue';
import { useEditor } from './keys';
import { runCommand } from '../engine/commands';
import { openPanel } from './panelState';
import ThemeButton from './ThemeButton.vue';

const ed = useEditor();
const TB_BASE = 'flex h-9 items-center justify-center border-0 p-0 hover:enabled:bg-hover disabled:cursor-default disabled:opacity-35';
const TB = `${TB_BASE} w-9 text-navy`;
const TB_SM = `${TB_BASE} w-6 text-[#6b6f7b] dark:text-ink-2`;
const menuOpen = ref(false); const exportOpen = ref(false);
const editing = ref(false); const name = ref(''); const nameInput = ref<HTMLInputElement | null>(null);
const modelName = computed(() => { void ed.ui.rev; return ed.model.name; });
function startEdit() { name.value = ed.model.name; editing.value = true; nextTick(() => { nameInput.value?.focus(); nameInput.value?.select(); }); }
function commitName() { if (!editing.value) return; editing.value = false; if (name.value.trim()) { ed.model.name = name.value.trim(); ed.ui.saved = false; ed.ui.rev++; } }
function run(id: string) { runCommand(ed, id); }
const close = () => { exportOpen.value = false; };
onMounted(() => window.addEventListener('click', close));
onUnmounted(() => window.removeEventListener('click', close));
</script>
