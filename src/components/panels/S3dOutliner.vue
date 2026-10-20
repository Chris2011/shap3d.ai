<template>
  <input v-model="filter" class="s3d-input mb-2" :placeholder="t('outliner.filter')" />
  <div class="text-[0.78125rem]">
    <div
      class="flex cursor-pointer items-center gap-1.5 rounded-[3px] px-1.5 py-0.75 font-semibold hover:bg-hover"
      :class="{ 'text-blue': !editor.activePath.length }"
      @click="editor.exitContext(true)"
    >
      <S3dIcon name="file" :size="16" /> {{ editor.model.name }}
    </div>
    <S3dOutlinerNode v-for="entry in nodes" :key="entry.inst.id" :node="entry" :depth="1" :filter="filter.toLowerCase()" />
    <div v-if="!nodes.length" class="px-1 py-2 text-xs text-ink-2">{{ t('outliner.empty') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import S3dOutlinerNode from './S3dOutlinerNode.vue';
import { useEditor } from '../keys';
import type { Entities, Instance } from '../../core/model';
import { useSelection } from '../../composables/useModel';
import { t } from '../../i18n';

const editor = useEditor();
const filter = ref('');
interface ONode {
  inst: Instance;
  path: Instance[];
  children: ONode[];
}
const build = (entities: Entities, path: Instance[]): ONode[] =>
  [...entities.instances.values()].map((instance) => ({
    inst: instance,
    path: [...path, instance],
    children: build(instance.definition.entities, [...path, instance]),
  }));
const nodes = useSelection(() => build(editor.model.root, []));
</script>
