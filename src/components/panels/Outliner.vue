<template>
  <input v-model="filter" class="s3d-input mb-2" placeholder="Filter" />
  <div class="text-[0.78125rem]">
    <div class="flex cursor-pointer items-center gap-1.5 rounded-[3px] px-1.5 py-0.75 font-semibold hover:bg-hover" :class="{ 'text-blue': !ed.activePath.length }" @click="ed.exitContext(true)"><Icon name="file" :size="16" /> {{ ed.model.name }}</div>
    <OutlinerNode v-for="n in nodes" :key="n.inst.id" :node="n" :depth="1" :filter="filter.toLowerCase()" />
    <div v-if="!nodes.length" class="px-1 py-2 text-xs text-ink-2">Keine Gruppen oder Komponenten im Modell.</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import OutlinerNode from './OutlinerNode.vue';
import { useEditor } from '../keys';
import type { Entities, Instance } from '../../core/model';

const ed = useEditor(); const filter = ref('');
interface ONode { inst: Instance; path: Instance[]; children: ONode[] }
const build = (e: Entities, path: Instance[]): ONode[] => [...e.instances.values()].map(i => ({ inst: i, path: [...path, i], children: build(i.def.entities, [...path, i]) }));
const nodes = computed(() => { void ed.ui.rev; void ed.ui.selRev; return build(ed.model.root, []); });
</script>
