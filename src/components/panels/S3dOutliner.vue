<template>
  <input v-model="filter" class="s3d-input mb-2" placeholder="Filter" />
  <div class="text-[0.78125rem]">
    <div class="flex cursor-pointer items-center gap-1.5 rounded-[3px] px-1.5 py-0.75 font-semibold hover:bg-hover" :class="{ 'text-blue': !ed.activePath.length }" @click="ed.exitContext(true)"><S3dIcon name="file" :size="16" /> {{ ed.model.name }}</div>
    <S3dOutlinerNode v-for="n in nodes" :key="n.inst.id" :node="n" :depth="1" :filter="filter.toLowerCase()" />
    <div v-if="!nodes.length" class="px-1 py-2 text-xs text-ink-2">Keine Gruppen oder Komponenten im Modell.</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import S3dOutlinerNode from './S3dOutlinerNode.vue';
import { useEditor } from '../keys';
import type { Entities, Instance } from '../../core/model';
import { useSelection } from '../../composables/useModel';

const ed = useEditor(); const filter = ref('');
interface ONode { inst: Instance; path: Instance[]; children: ONode[] }
const build = (e: Entities, path: Instance[]): ONode[] => [...e.instances.values()].map(i => ({ inst: i, path: [...path, i], children: build(i.def.entities, [...path, i]) }));
const nodes = useSelection(() => build(ed.model.root, []));
</script>
