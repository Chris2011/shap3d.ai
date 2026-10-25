<template>
  <input v-model="filter" class="s3d-input mb-2" :placeholder="t('outliner.filter')" />
  <S3dSegmentedControl v-model="sortBy" class="mb-2" :options="SORT_OPTIONS" />
  <div class="text-[0.78125rem]">
    <div
      class="flex cursor-pointer items-center gap-1.5 rounded-[3px] px-1.5 py-0.75 font-semibold hover:bg-hover"
      :class="{ 'text-blue': !editor.activePath.length }"
      @click="editor.exitContext(true)"
    >
      <S3dIcon name="file" :size="16" /> {{ editor.model.name }}
    </div>
    <template v-if="sortBy === 'hierarchy'">
      <S3dOutlinerNode v-for="entry in nodes" :key="entry.inst.id" :node="entry" :depth="1" :filter="filter.toLowerCase()" />
    </template>
    <!-- by tag: every group/component (at any depth) under its tag, untagged ones last -->
    <template v-else>
      <div v-for="group in tagGroups" :key="group.tag">
        <div
          class="mt-1 flex cursor-pointer items-center gap-1.5 rounded-[3px] px-1.5 py-0.75 font-semibold hover:bg-hover"
          @click="toggleTag(group.tag)"
        >
          <span class="w-3 text-[0.6875rem] text-[#6b7680]">{{ closedTags.has(group.tag) ? '▸' : '▾' }}</span>
          <span class="size-2.5 flex-none rounded-[2px] border border-line-2" :style="{ background: group.color }"></span>
          <span class="flex-1 truncate">{{ group.label }}</span>
          <span class="text-[0.6875rem] font-normal text-ink-2">{{ group.nodes.length }}</span>
        </div>
        <template v-if="!closedTags.has(group.tag)">
          <S3dOutlinerNode v-for="entry in group.nodes" :key="entry.inst.id" :node="entry" :depth="2" :filter="filter.toLowerCase()" />
        </template>
      </div>
    </template>
    <div v-if="!nodes.length" class="px-1 py-2 text-xs text-ink-2">{{ t('outliner.empty') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import S3dIcon from '../S3dIcon.vue';
import S3dOutlinerNode from './S3dOutlinerNode.vue';
import S3dSegmentedControl from '../ui/S3dSegmentedControl.vue';
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

// sorting (SketchUp 2027): the hierarchy, or every group/component under its tag – remembered in the browser
type SortBy = 'hierarchy' | 'tags';
const sortBy = useLocalStorage<SortBy>('s3d.outliner.sortBy', 'hierarchy');
const SORT_OPTIONS = computed(() => [
  { value: 'hierarchy' as const, label: t('outliner.byHierarchy') },
  { value: 'tags' as const, label: t('outliner.byTags') },
]);
const UNTAGGED = 'Untagged';
const tagGroups = computed(() => {
  const byTag = new Map<string, ONode[]>();
  const collect = (list: ONode[]) => {
    for (const entry of list) {
      const tag = entry.inst.tag ?? UNTAGGED;
      (byTag.get(tag) ?? byTag.set(tag, []).get(tag)!).push({ ...entry, children: [] });
      collect(entry.children);
    }
  };
  collect(nodes.value);
  // in the order of the Tags panel, untagged last
  const order = editor.model.tags.map((tag) => tag.name).filter((name) => name !== UNTAGGED);
  const names = [
    ...order.filter((name) => byTag.has(name)),
    ...[...byTag.keys()].filter((name) => name !== UNTAGGED && !order.includes(name)),
  ];
  if (byTag.has(UNTAGGED)) {
    names.push(UNTAGGED);
  }
  return names.map((name) => ({
    tag: name,
    label: name === UNTAGGED ? t('tags.untagged') : name,
    color: editor.model.tags.find((tag) => tag.name === name)?.color ?? '#888888',
    nodes: byTag.get(name)!,
  }));
});
const closedTags = reactive(new Set<string>());
const toggleTag = (tag: string) => (closedTags.has(tag) ? closedTags.delete(tag) : closedTags.add(tag));
</script>
