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
import type { PlaceTool } from '../../tools/place';
import { personDefinition } from '../../engine/defaults';
import { PEOPLE } from '../../core/people';
import { LIB, insertLibrary, type Lib } from '../../engine/library';

const ed = useEditor();
const defs = computed(() => { void ed.ui.rev; return [...ed.model.definitions.values()].filter(d => d.isComponent); });
const counts = computed(() => { void ed.ui.rev; const m = new Map<Definition, number>(); const w = (e: Entities) => { for (const i of e.instances.values()) { m.set(i.def, (m.get(i.def) ?? 0) + 1); w(i.def.entities); } }; w(ed.model.root); return m; });
function place(d: Definition) { (ed.tools.get('place') as PlaceTool).start(d); }

const insertLib = (b: Lib) => insertLibrary(ed, b);
</script>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.card { border: 1px solid #e0e4e8; border-radius: 4px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; text-align: center; color: var(--s3d-text); }
.card:hover { background: var(--s3d-hover); border-color: #c5ccd3; }
.nm { font-size: 11px; line-height: 1.2; word-break: break-word; }
.person img { width: 100%; height: 64px; object-fit: contain; }
.cnt { font-size: 10px; color: var(--s3d-text-2); }
</style>
