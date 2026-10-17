<template>
  <div class="s3d-section-title">Im Modell</div>
  <div v-if="!defs.length" class="s3d-label">Keine Komponenten. Wählen Sie Geometrie aus und drücken Sie „G“.</div>
  <div class="grid grid-cols-3 gap-1.5">
    <div v-for="d in defs" :key="d.id" class="flex cursor-pointer flex-col items-center gap-1 rounded border border-[#e0e4e8] px-1 py-2 text-center text-ink hover:border-[#c5ccd3] hover:bg-hover dark:border-line dark:hover:border-line-2" :title="'Klicken zum Platzieren: ' + d.name" @click="place(d)">
      <Icon :name="d.isComponent ? 'component' : 'group'" :size="28" />
      <div class="text-[11px]/[1.2] break-words">{{ d.name }}</div>
      <div class="text-[10px] text-ink-2">{{ counts.get(d) ?? 0 }}×</div>
    </div>
  </div>
  <div class="s3d-section-title">Personen</div>
  <div class="grid grid-cols-3 gap-1.5">
    <div v-for="(p, k) in PEOPLE" :key="k" class="flex cursor-pointer flex-col items-center gap-1 rounded border border-[#e0e4e8] px-1 py-2 text-center text-ink hover:border-[#c5ccd3] hover:bg-hover dark:border-line dark:hover:border-line-2" :title="p.label + ' platzieren (dreht sich immer zur Kamera)'" @click="place(personDefinition(ed, k))">
      <img class="h-16 w-full object-contain" :src="'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(p.svg)" alt="" />
      <div class="text-[11px]/[1.2] break-words">{{ p.label }}</div>
    </div>
  </div>
  <div class="s3d-section-title">Bibliothek</div>
  <div class="grid grid-cols-3 gap-1.5">
    <div v-for="b in LIB" :key="b.name" class="flex cursor-pointer flex-col items-center gap-1 rounded border border-[#e0e4e8] px-1 py-2 text-center text-ink hover:border-[#c5ccd3] hover:bg-hover dark:border-line dark:hover:border-line-2" @click="insertLib(b)"><Icon :name="b.icon" :size="28" /><div class="text-[11px]/[1.2] break-words">{{ b.name }}</div></div>
  </div>
  <p class="s3d-label my-3">Bibliotheksobjekte werden per Skript erzeugt und anschließend am Cursor platziert.</p>
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
