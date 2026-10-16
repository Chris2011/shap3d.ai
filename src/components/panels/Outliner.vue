<template>
  <input v-model="filter" class="s3d-input" placeholder="Filter" style="margin-bottom:8px" />
  <div class="tree">
    <div class="node root" :class="{ ctx: !ed.activePath.length }" @click="ed.exitContext(true)"><Icon name="file" :size="16" /> {{ ed.model.name }}</div>
    <OutlinerNode v-for="n in nodes" :key="n.inst.id" :node="n" :depth="1" :filter="filter.toLowerCase()" />
    <div v-if="!nodes.length" class="empty">Keine Gruppen oder Komponenten im Modell.</div>
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

<style scoped>
.tree { font-size: 12.5px; }
.node { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 3px; cursor: pointer; }
.node:hover { background: var(--s3d-hover); }
.root { font-weight: 600; }
.ctx { color: var(--s3d-blue); }
.empty { color: var(--s3d-text-2); padding: 8px 4px; font-size: 12px; }
</style>
