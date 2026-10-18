<template>
  <div class="mb-2 flex flex-wrap gap-1.5 [&_.s3d-btn]:flex [&_.s3d-btn]:items-center [&_.s3d-btn]:gap-1">
    <button class="s3d-btn small" @click="add"><S3dIcon name="plus" :size="14" /> Szene hinzufügen</button>
    <button class="s3d-btn small" :disabled="!sel" @click="update">Aktualisieren</button>
    <button class="s3d-btn small" :disabled="!scenes.length" @click="play">{{ playing ? 'Stopp' : 'Abspielen' }}</button>
  </div>
  <div>
    <div v-for="sc in scenes" :key="sc.id" class="flex cursor-pointer items-center gap-2 rounded-[3px] p-1.5" :class="sel === sc.id ? 'bg-active' : 'hover:bg-hover'" @click="go(sc)">
      <S3dIcon name="scenes" :size="18" />
      <input v-if="editing === sc.id" class="s3d-input" :value="sc.name" @change="rename(sc, ($event.target as HTMLInputElement).value)" @blur="editing = null" />
      <span v-else class="flex-1" @dblclick="editing = sc.id">{{ sc.name }}</span>
      <button class="flex bg-transparent opacity-60 hover:opacity-100" title="Löschen" @click.stop="remove(sc)"><S3dIcon name="trash" :size="15" /></button>
    </div>
    <div v-if="!scenes.length" class="px-0.5 py-2 text-xs text-ink-2">Noch keine Szenen. Szenen speichern Kamera, Stil und sichtbare Tags.</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import { newId } from '../../core/model';
import type { Scene } from '../../core/document';
import { applyScene } from '../../engine/scenes';
import { useModel } from '../../composables/useModel';

const ed = useEditor(); const sel = ref<number | null>(null); const editing = ref<number | null>(null); 
const scenes = useModel(() => ed.model.scenes);
function capture(): Omit<Scene, 'id' | 'name'> { return { camera: ed.viewer.rig.getState(), style: { ...ed.model.settings.style }, hiddenTags: ed.model.tags.filter(t => !t.visible).map(t => t.name) }; }
function add() { const sc: Scene = { id: newId(), name: `Szene ${ed.model.scenes.length + 1}`, ...capture() }; ed.commit('Szene hinzufügen', () => ed.model.scenes.push(sc)); sel.value = sc.id; }
function update() { const sc = ed.model.scenes.find(s => s.id === sel.value); if (sc) ed.commit('Szene aktualisieren', () => Object.assign(sc, capture())); }
function go(sc: Scene) {
  sel.value = sc.id; applyScene(ed, sc);
}
function rename(sc: Scene, n: string) { editing.value = null; if (n.trim()) ed.commit('Szene umbenennen', () => { sc.name = n.trim(); }); }
function remove(sc: Scene) { ed.commit('Szene löschen', () => { ed.model.scenes = ed.model.scenes.filter(s => s !== sc); }); }
// slide show: one scene every 2.5 s, stops by itself when the panel closes
let next = 0;
const { pause, resume, isActive: playing } = useIntervalFn(step, 2500, { immediate: false });
function step() { const l = ed.model.scenes; if (!l.length) { pause(); return; } go(l[next % l.length]); next++; }
function play() {
  if (playing.value) { pause(); return; }
  next = Math.max(0, ed.model.scenes.findIndex(s => s.id === sel.value));
  step(); resume();
}
</script>
