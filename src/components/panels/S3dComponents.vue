<template>
  <div class="s3d-section-title">{{ t('components.inModel') }}</div>
  <div v-if="!defs.length" class="s3d-label">{{ t('components.empty') }}</div>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-1.5">
    <div
      v-for="definition in defs"
      :key="definition.id"
      class="flex cursor-pointer flex-col items-center gap-1 rounded border border-[#e0e4e8] px-1 py-2 text-center text-ink hover:border-[#c5ccd3] hover:bg-hover dark:border-line dark:hover:border-line-2"
      :title="t('components.clickToPlace', { name: definition.name })"
      @click="place(definition)"
    >
      <S3dIcon :name="definition.isComponent ? 'component' : 'group'" :size="28" />
      <div class="text-[0.6875rem]/[1.2] break-words">{{ definition.name }}</div>
      <div class="text-[0.625rem] text-ink-2">{{ counts.get(definition) ?? 0 }}×</div>
    </div>
  </div>
  <div class="s3d-section-title">{{ t('components.people') }}</div>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-1.5">
    <div
      v-for="(person, key) in PEOPLE"
      :key="key"
      class="flex cursor-pointer flex-col items-center gap-1 rounded border border-[#e0e4e8] px-1 py-2 text-center text-ink hover:border-[#c5ccd3] hover:bg-hover dark:border-line dark:hover:border-line-2"
      :title="t('components.placePerson', { name: person.label })"
      @click="place(personDefinition(editor, key))"
    >
      <img class="h-16 w-full object-contain" :src="'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(person.svg)" alt="" />
      <div class="text-[0.6875rem]/[1.2] break-words">{{ person.label }}</div>
    </div>
  </div>
  <div class="s3d-section-title">{{ t('components.library') }}</div>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-1.5">
    <div
      v-for="item in LIB"
      :key="item.id"
      class="flex cursor-pointer flex-col items-center gap-1 rounded border border-[#e0e4e8] px-1 py-2 text-center text-ink hover:border-[#c5ccd3] hover:bg-hover dark:border-line dark:hover:border-line-2"
      @click="insertLib(item)"
    >
      <S3dIcon :name="item.icon" :size="28" />
      <div class="text-[0.6875rem]/[1.2] break-words">{{ item.name }}</div>
    </div>
  </div>
  <p class="s3d-label my-3">{{ t('components.libraryHint') }}</p>
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
import { t } from '../../i18n';

const editor = useEditor();
const defs = useModel(() => [...editor.model.definitions.values()].filter((definition) => definition.isComponent));
const counts = useModel(() => {
  const perDefinition = new Map<Definition, number>();
  const walk = (entities: Entities) => {
    for (const instance of entities.instances.values()) {
      perDefinition.set(instance.definition, (perDefinition.get(instance.definition) ?? 0) + 1);
      walk(instance.definition.entities);
    }
  };
  walk(editor.model.root);
  return perDefinition;
});
const place = (definition: Definition) => {
  (editor.tools.get('place') as PlaceTool).start(definition);
};

const insertLib = (item: Lib) => insertLibrary(editor, item);
</script>
