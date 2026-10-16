<template>
  <div class="bar">
    <button class="s3d-btn small" @click="add"><Icon name="plus" :size="14" /> Tag hinzufügen</button>
    <button class="s3d-btn small" :disabled="!ed.selection.size" title="Auswahl dem markierten Tag zuweisen" @click="assign">Zuweisen</button>
  </div>
  <div class="list">
    <div v-for="t in tags" :key="t.name" class="tag" :class="{ on: active === t.name }" @click="active = t.name">
      <button class="eye" @click.stop="toggle(t)"><Icon :name="t.visible ? 'eye' : 'eyeOff'" :size="16" /></button>
      <input v-if="editing === t.name" class="s3d-input" :value="t.name" @change="rename(t, ($event.target as HTMLInputElement).value)" @blur="editing = null" @keydown.enter="($event.target as HTMLInputElement).blur()" />
      <span v-else class="nm" @dblclick="t.name !== 'Untagged' && (editing = t.name)">{{ t.name === 'Untagged' ? 'Ohne Tag' : t.name }}</span>
      <input type="color" :value="t.color" @click.stop @change="setColor(t, ($event.target as HTMLInputElement).value)" />
      <button v-if="t.name !== 'Untagged'" class="eye" title="Löschen" @click.stop="remove(t)"><Icon name="trash" :size="15" /></button>
    </div>
  </div>
  <p class="s3d-label">Doppelklick benennt um. Ausgeblendete Tags verbergen alle Elemente mit diesem Tag.</p>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import { useEditor } from '../keys';
import type { Tag } from '../../core/document';
import type { Entities } from '../../core/model';

const ed = useEditor(); const active = ref('Untagged'); const editing = ref<string | null>(null);
const tags = computed(() => { void ed.ui.rev; return ed.model.tags; });
function add() { let n = 'Tag'; let i = 1; while (ed.model.tags.some(t => t.name === n)) n = `Tag ${++i}`; ed.commit('Tag hinzufügen', () => ed.model.tags.push({ name: n, visible: true, color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') })); editing.value = n; active.value = n; }
function toggle(t: Tag) { ed.commit('Tag-Sichtbarkeit', () => { t.visible = !t.visible; }); }
function setColor(t: Tag, c: string) { t.color = c; ed.ui.saved = false; ed.ui.rev++; }
function walkAll(fn: (o: { tag?: string }) => void) { const seen = new Set<Entities>(); const w = (e: Entities) => { if (seen.has(e)) return; seen.add(e); e.faces.forEach(fn); e.edges.forEach(fn); e.instances.forEach(i => { fn(i); w(i.def.entities); }); }; w(ed.model.root); }
function rename(t: Tag, n: string) { n = n.trim(); editing.value = null; if (!n || ed.model.tags.some(x => x.name === n)) return; const old = t.name; ed.commit('Tag umbenennen', () => { t.name = n; walkAll(o => { if (o.tag === old) o.tag = n; }); }); }
function remove(t: Tag) { ed.commit('Tag löschen', () => { ed.model.tags = ed.model.tags.filter(x => x !== t); walkAll(o => { if (o.tag === t.name) o.tag = undefined; }); }); }
function assign() { const v = active.value === 'Untagged' ? undefined : active.value; ed.commit('Tag zuweisen', () => { const E = ed.entities; for (const r of ed.selected()) { const o: any = r.kind === 'face' ? E.faces.get(r.id) : r.kind === 'edge' ? E.edges.get(r.id) : E.instances.get(r.id); if (o) o.tag = v; } }); }
</script>

<style scoped>
.bar { display: flex; gap: 6px; margin-bottom: 8px; }
.bar .s3d-btn { display: flex; align-items: center; gap: 4px; }
.list { border: 1px solid var(--s3d-line); border-radius: 3px; }
.tag { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-bottom: 1px solid var(--s3d-line); cursor: pointer; }
.tag:last-child { border-bottom: 0; }
.tag.on { background: var(--s3d-active); }
.nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eye { border: 0; background: transparent; cursor: pointer; display: flex; padding: 2px; color: #4a535b; }
input[type=color] { width: 22px; height: 18px; border: 1px solid var(--s3d-line-2); padding: 0; border-radius: 2px; }
</style>
