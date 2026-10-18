<template>
  <div class="s3d-section-title">Im Modell</div>
  <div v-if="!defs.length" class="s3d-label">Keine Komponenten. Wählen Sie Geometrie aus und drücken Sie „G“.</div>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-1.5">
    <div v-for="definition in defs" :key="definition.id" class="flex cursor-pointer flex-col items-center gap-1 rounded border border-[#e0e4e8] px-1 py-2 text-center text-ink hover:border-[#c5ccd3] hover:bg-hover dark:border-line dark:hover:border-line-2" :title="'Klicken zum Platzieren: ' + definition.name" @click="place(definition)">
      <S3dIcon :name="definition.isComponent ? 'component' : 'group'" :size="28" />
      <div class="text-[0.6875rem]/[1.2] break-words">{{ definition.name }}</div>
      <div class="text-[0.625rem] text-ink-2">{{ counts.get(definition) ?? 0 }}×</div>
    </div>
  </div>
  <div class="s3d-section-title">Personen</div>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-1.5">
    <div v-for="(person, key) in PEOPLE" :key="key" class="flex cursor-pointer flex-col items-center gap-1 rounded border border-[#e0e4e8] px-1 py-2 text-center text-ink hover:border-[#c5ccd3] hover:bg-hover dark:border-line dark:hover:border-line-2" :title="person.label + ' platzieren (dreht sich immer zur Kamera)'" @click="place(personDefinition(editor, key))">
      <img class="h-16 w-full object-contain" :src="'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(person.svg)" alt="" />
      <div class="text-[0.6875rem]/[1.2] break-words">{{ person.label }}</div>
    </div>
  </div>
  <div class="s3d-section-title">Bibliothek</div>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-1.5">
    <div v-for="item in LIB" :key="item.name" class="flex cursor-pointer flex-col items-center gap-1 rounded border border-[#e0e4e8] px-1 py-2 text-center text-ink hover:border-[#c5ccd3] hover:bg-hover dark:border-line dark:hover:border-line-2" @click="insertLib(item)"><S3dIcon :name="item.icon" :size="28" /><div class="text-[0.6875rem]/[1.2] break-words">{{ item.name }}</div></div>
  </div>
  <p class="s3d-label my-3">Bibliotheksobjekte werden per Skript erzeugt und anschließend am Cursor platziert.</p>
</template>

<script setup lang="ts">
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import type { Definition, Entities } from '../../core/model';
import type { PlaceTool } from '../../tools/place';
import { personDefinition } from '../../engine/defaults';
import { PEOPLE } from '../../core/people';
import { LIB, insertLibrary, type Lib } from '../../engine/library';
import { useModel } from '../../composables/useModel';

const editor = useEditor();
const defs = useModel(() => [...editor.model.definitions.values()].filter(definition => definition.isComponent));
const counts = useModel(() => { const perDefinition = new Map<Definition, number>(); const walk = (entities: Entities) => { for (const instance of entities.instances.values()) { perDefinition.set(instance.def, (perDefinition.get(instance.def) ?? 0) + 1); walk(instance.def.entities); } }; walk(editor.model.root); return perDefinition; });
const place = (definition: Definition) => { (editor.tools.get('place') as PlaceTool).start(definition); };

const insertLib = (item: Lib) => insertLibrary(editor, item);
</script>
