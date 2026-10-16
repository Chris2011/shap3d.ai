<template>
  <div class="bar">
    <button class="s3d-btn small" @click="add"><Icon name="plus" :size="14" /> Szene hinzufügen</button>
    <button class="s3d-btn small" :disabled="!sel" @click="update">Aktualisieren</button>
    <button class="s3d-btn small" :disabled="!scenes.length" @click="play">{{ playing ? 'Stopp' : 'Abspielen' }}</button>
  </div>
  <div class="list">
    <div v-for="sc in scenes" :key="sc.id" class="scene" :class="{ on: sel === sc.id }" @click="go(sc)">
      <Icon name="scenes" :size="18" />
      <input v-if="editing === sc.id" class="s3d-input" :value="sc.name" @change="rename(sc, ($event.target as HTMLInputElement).value)" @blur="editing = null" />
      <span v-else class="nm" @dblclick="editing = sc.id">{{ sc.name }}</span>
      <button class="del" title="Löschen" @click.stop="remove(sc)"><Icon name="trash" :size="15" /></button>
    </div>
    <div v-if="!scenes.length" class="empty">Noch keine Szenen. Szenen speichern Kamera, Stil und sichtbare Tags.</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue';
import Icon from '../Icon.vue';
import { useEditor } from '../keys';
import { newId } from '../../core/model';
import type { Scene } from '../../core/document';

const ed = useEditor(); const sel = ref<number | null>(null); const editing = ref<number | null>(null); const playing = ref(false); let timer = 0;
const scenes = computed(() => { void ed.ui.rev; return ed.model.scenes; });
function capture(): Omit<Scene, 'id' | 'name'> { return { camera: ed.viewer.rig.getState(), style: { ...ed.model.settings.style }, hiddenTags: ed.model.tags.filter(t => !t.visible).map(t => t.name) }; }
function add() { const sc: Scene = { id: newId(), name: `Szene ${ed.model.scenes.length + 1}`, ...capture() }; ed.commit('Szene hinzufügen', () => ed.model.scenes.push(sc)); sel.value = sc.id; }
function update() { const sc = ed.model.scenes.find(s => s.id === sel.value); if (sc) ed.commit('Szene aktualisieren', () => Object.assign(sc, capture())); }
function go(sc: Scene) {
  sel.value = sc.id; ed.viewer.rig.applyState(sc.camera, true); ed.ui.projection = sc.camera.ortho ? 'ortho' : 'persp';
  if (sc.style) Object.assign(ed.model.settings.style, sc.style);
  if (sc.hiddenTags) for (const t of ed.model.tags) t.visible = !sc.hiddenTags.includes(t.name);
  ed.invalidate();
}
function rename(sc: Scene, n: string) { editing.value = null; if (n.trim()) ed.commit('Szene umbenennen', () => { sc.name = n.trim(); }); }
function remove(sc: Scene) { ed.commit('Szene löschen', () => { ed.model.scenes = ed.model.scenes.filter(s => s !== sc); }); }
function play() {
  if (playing.value) { playing.value = false; clearInterval(timer); return; }
  playing.value = true; let i = Math.max(0, ed.model.scenes.findIndex(s => s.id === sel.value));
  const step = () => { const l = ed.model.scenes; if (!l.length) { playing.value = false; clearInterval(timer); return; } go(l[i % l.length]); i++; };
  step(); timer = window.setInterval(step, 2500);
}
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.bar { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.bar .s3d-btn { display: flex; align-items: center; gap: 4px; }
.scene { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 3px; cursor: pointer; }
.scene:hover { background: var(--s3d-hover); }
.scene.on { background: var(--s3d-active); }
.nm { flex: 1; }
.del { border: 0; background: transparent; cursor: pointer; opacity: .6; display: flex; }
.empty { color: var(--s3d-text-2); font-size: 12px; padding: 8px 2px; }
</style>
