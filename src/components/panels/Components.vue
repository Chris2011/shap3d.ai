<template>
  <div class="s3d-section-title">Im Modell</div>
  <div v-if="!defs.length" class="s3d-label">Keine Komponenten. Wählen Sie Geometrie aus und drücken Sie „G“.</div>
  <div class="grid">
    <div v-for="d in defs" :key="d.id" class="card" :title="'Klicken zum Platzieren: ' + d.name" @click="place(d)">
      <Icon :name="d.isComponent ? 'component' : 'group'" :size="28" />
      <div class="nm">{{ d.name }}</div>
      <div class="cnt">{{ counts.get(d) ?? 0 }}×</div>
    </div>
  </div>
  <div class="s3d-section-title">Personen</div>
  <div class="grid">
    <div v-for="(p, k) in PEOPLE" :key="k" class="card person" :title="p.label + ' platzieren (dreht sich immer zur Kamera)'" @click="place(personDefinition(ed, k))">
      <img :src="'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(p.svg)" alt="" />
      <div class="nm">{{ p.label }}</div>
    </div>
  </div>
  <div class="s3d-section-title">Bibliothek</div>
  <div class="grid">
    <div v-for="b in LIB" :key="b.name" class="card" @click="insertLib(b)"><Icon :name="b.icon" :size="28" /><div class="nm">{{ b.name }}</div></div>
  </div>
  <p class="s3d-label">Bibliotheksobjekte werden per Skript erzeugt und anschließend am Cursor platziert.</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';
import { useEditor } from '../keys';
import type { Definition, Entities } from '../../core/model';
import { Entities as Ents } from '../../core/model';
import { ScriptApi } from '../../scripting/api';
import type { PlaceTool } from '../../tools/place';
import { personDefinition } from '../../engine/defaults';
import { PEOPLE } from '../../core/people';

const ed = useEditor();
const defs = computed(() => { void ed.ui.rev; return [...ed.model.definitions.values()].filter(d => d.isComponent); });
const counts = computed(() => { void ed.ui.rev; const m = new Map<Definition, number>(); const w = (e: Entities) => { for (const i of e.instances.values()) { m.set(i.def, (m.get(i.def) ?? 0) + 1); w(i.def.entities); } }; w(ed.model.root); return m; });
function place(d: Definition) { (ed.tools.get('place') as PlaceTool).start(d); }

interface Lib { name: string; icon: string; build: (s3d: ScriptApi) => void }
const LIB: Lib[] = [
  { name: 'Tür', icon: 'cube', build: s3d => { s3d.box([0, 0, 0], 0.9, 0.05, 2.1, { group: false }); } },
  { name: 'Fenster', icon: 'cube', build: s3d => { const f = s3d.rect([0, 0, 0], 1.2, 1.2, 'xz'); f.offset(0.08); } },
  { name: 'Tisch', icon: 'cube', build: s3d => { s3d.box([0, 0, 0.72], 1.6, 0.9, 0.04, { group: false }); for (const [x, y] of [[0.05, 0.05], [1.5, 0.05], [0.05, 0.8], [1.5, 0.8]]) s3d.box([x, y, 0], 0.05, 0.05, 0.72, { group: false }); } },
  { name: 'Stuhl', icon: 'cube', build: s3d => { s3d.box([0, 0, 0.45], 0.45, 0.45, 0.04, { group: false }); for (const [x, y] of [[0, 0], [0.41, 0], [0, 0.41], [0.41, 0.41]]) s3d.box([x, y, 0], 0.04, 0.04, 0.45, { group: false }); s3d.box([0, 0.41, 0.49], 0.45, 0.04, 0.45, { group: false }); } },
  { name: 'Baum', icon: 'cube', build: s3d => { s3d.cylinder([0, 0, 0], 0.15, 2, { group: false, segments: 12 }); s3d.sphere([0, 0, 3], 1.2, { segments: 16, material: 'Rasen' }); } },
  { name: 'Treppe', icon: 'cube', build: s3d => { const p: [number, number, number][] = [[0, 0, 0]]; for (let i = 0; i < 8; i++) { p.push([0, i * 0.28, (i + 1) * 0.175], [0, (i + 1) * 0.28, (i + 1) * 0.175]); } p.push([0, 8 * 0.28, 0]); s3d.face(p).extrude(1, 'x'); } },
];
function insertLib(b: Lib) {
  const ents = new Ents();
  const api = new ScriptApi(ed, ents);
  b.build(api);
  const def = ed.model.newDefinition(ed.model.uniqueDefName(b.name), true, ents);
  place(def);
}
</script>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.card { border: 1px solid #e0e4e8; border-radius: 4px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; text-align: center; color: var(--s3d-text); }
.card:hover { background: var(--s3d-hover); border-color: #c5ccd3; }
.nm { font-size: 11px; line-height: 1.2; word-break: break-word; }
.person img { width: 100%; height: 64px; object-fit: contain; }
.cnt { font-size: 10px; color: var(--s3d-text-2); }
</style>
