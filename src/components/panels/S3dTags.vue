<template>
  <div class="mb-2 flex gap-1.5 [&_.s3d-btn]:flex [&_.s3d-btn]:items-center [&_.s3d-btn]:gap-1">
    <button class="s3d-btn small" @click="add"><S3dIcon name="plus" :size="14" /> Tag hinzufügen</button>
    <button class="s3d-btn small" :disabled="!ed.selection.size" title="Auswahl dem markierten Tag zuweisen" @click="assign">Zuweisen</button>
  </div>
  <div class="rounded-[3px] border border-line">
    <div v-for="t in tags" :key="t.name" class="flex cursor-pointer items-center gap-1.5 border-b border-line px-1.5 py-1 last:border-b-0" :class="{ 'bg-active': active === t.name }" @click="active = t.name">
      <button class="flex bg-transparent p-0.5 text-[#4a535b] dark:text-ink-2" @click.stop="toggle(t)"><S3dIcon :name="t.visible ? 'eye' : 'eyeOff'" :size="16" /></button>
      <input v-if="editing === t.name" class="s3d-input" :value="t.name" @change="rename(t, ($event.target as HTMLInputElement).value)" @blur="editing = null" @keydown.enter="($event.target as HTMLInputElement).blur()" />
      <span v-else class="flex-1 truncate" @dblclick="t.name !== 'Untagged' && (editing = t.name)">{{ t.name === 'Untagged' ? 'Ohne Tag' : t.name }}</span>
      <input class="h-4.5 w-5.5 rounded-[2px] border border-line-2 p-0" type="color" :value="t.color" @click.stop @change="setColor(t, ($event.target as HTMLInputElement).value)" />
      <button v-if="t.name !== 'Untagged'" class="flex bg-transparent p-0.5 text-[#4a535b] dark:text-ink-2" title="Löschen" @click.stop="remove(t)"><S3dIcon name="trash" :size="15" /></button>
    </div>
  </div>
  <p class="s3d-label my-3">Doppelklick benennt um. Ausgeblendete Tags verbergen alle Elemente mit diesem Tag.</p>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import type { Tag } from '../../core/document';
import type { Entities } from '../../core/model';
import { useModel } from '../../composables/useModel';

const ed = useEditor(); const active = ref('Untagged'); const editing = ref<string | null>(null);
const tags = useModel(() => ed.model.tags);
function add() { let n = 'Tag'; let i = 1; while (ed.model.tags.some(t => t.name === n)) n = `Tag ${++i}`; ed.commit('Tag hinzufügen', () => ed.model.tags.push({ name: n, visible: true, color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') })); editing.value = n; active.value = n; }
function toggle(t: Tag) { ed.commit('Tag-Sichtbarkeit', () => { t.visible = !t.visible; }); }
function setColor(t: Tag, c: string) { t.color = c; ed.ui.saved = false; ed.ui.rev++; }
function walkAll(fn: (o: { tag?: string }) => void) { const seen = new Set<Entities>(); const w = (e: Entities) => { if (seen.has(e)) return; seen.add(e); e.faces.forEach(fn); e.edges.forEach(fn); e.instances.forEach(i => { fn(i); w(i.def.entities); }); }; w(ed.model.root); }
function rename(t: Tag, n: string) { n = n.trim(); editing.value = null; if (!n || ed.model.tags.some(x => x.name === n)) return; const old = t.name; ed.commit('Tag umbenennen', () => { t.name = n; walkAll(o => { if (o.tag === old) o.tag = n; }); }); }
function remove(t: Tag) { ed.commit('Tag löschen', () => { ed.model.tags = ed.model.tags.filter(x => x !== t); walkAll(o => { if (o.tag === t.name) o.tag = undefined; }); }); }
function assign() { const v = active.value === 'Untagged' ? undefined : active.value; ed.commit('Tag zuweisen', () => { const E = ed.entities; for (const r of ed.selected()) { const o: any = r.kind === 'face' ? E.faces.get(r.id) : r.kind === 'edge' ? E.edges.get(r.id) : E.instances.get(r.id); if (o) o.tag = v; } }); }
</script>
