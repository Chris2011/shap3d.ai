<template>
  <div class="topbar s3d-panel">
    <button class="tb-btn menu" :class="{ on: menuOpen }" title="Modell/Voreinstellungen öffnen" @click.stop="menuOpen = !menuOpen"><Icon name="menu" :size="22" /></button>
    <input v-if="editing" ref="nameInput" class="name-input" v-model="name" @keydown.enter="commitName" @blur="commitName" @keydown.esc="editing = false" />
    <div v-else class="name" title="Modell umbenennen" @click="startEdit">{{ modelName }}</div>
    <button class="tb-btn" :class="{ on: openPanel === 'ai' }" title="KI-Assistent" @click="openPanel = openPanel === 'ai' ? null : 'ai'"><Icon name="sparkle" :size="22" /></button>
    <button class="tb-btn sm" :title="'Rückgängig ' + ed.ui.undoLabel" :disabled="!ed.ui.canUndo" @click="ed.undo()"><Icon name="undo" :size="18" /></button>
    <button class="tb-btn sm" :title="'Wiederholen ' + ed.ui.redoLabel" :disabled="!ed.ui.canRedo" @click="ed.redo()"><Icon name="redo" :size="18" /></button>
    <button class="tb-btn sm clear" title="Arbeitsfläche leeren (rückgängig mit Strg+Z)" @click="run('clearAll')"><Icon name="trash" :size="18" /></button>
    <ThemeButton />
    <span v-if="ed.ui.saved" class="saved">Gespeichert</span>
    <button v-else class="save-link" title="Speichern (Strg+S)" @click="run('save')">Speichern</button>
  </div>

  <div class="topright s3d-panel">
    <button class="share" @click.stop="exportOpen = !exportOpen">Exportieren</button>
    <div v-if="exportOpen" class="s3d-menu" style="right: 0; top: 44px" @click="exportOpen = false">
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

<style scoped>
.topbar { position: absolute; top: 0; left: 0; height: 44px; display: flex; align-items: center; padding: 0 12px 0 4px; gap: 2px; z-index: 30; }
.tb-btn { border: 0; background: transparent; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--s3d-navy); padding: 0; }
.tb-btn.sm { width: 24px; color: #6b6f7b; }
.tb-btn:hover:not(:disabled), .tb-btn.on { background: var(--s3d-hover); }
.tb-btn:disabled { opacity: .35; cursor: default; }
.tb-btn.clear:hover { color: var(--s3d-danger); }
.name { font-weight: 700; font-size: 14px; letter-spacing: .85px; color: var(--s3d-navy); padding: 0 8px 0 6px; cursor: text; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 44px; }
.name-input { width: 200px; height: 28px; border: 1px solid var(--s3d-navy); padding: 0 8px; outline: none; font-weight: 700; color: var(--s3d-navy); margin: 0 4px; background: var(--s3d-bg); }
.saved { color: #90939f; font-size: 14px; font-weight: 700; padding: 0 0 0 14px; white-space: nowrap; }
.save-link { border: 0; background: transparent; color: var(--s3d-navy); font-size: 14px; font-weight: 700; padding: 0 0 0 14px; cursor: pointer; white-space: nowrap; }
.save-link:hover { text-decoration: underline; }
.topright { position: absolute; top: 0; right: 0; height: 44px; display: flex; gap: 8px; align-items: center; padding: 0 8px; z-index: 30; }
.share { height: 28px; padding: 0 10px; border: 0; background: var(--s3d-navy-bg); color: #fff; font-weight: 700; font-size: 13px; letter-spacing: .3px; cursor: pointer; border-radius: 2px; }
.share:hover { background: #0b3457; }
</style>
