<template>
  <div v-if="visible">
    <div class="flex cursor-pointer items-center gap-1 rounded-[3px] px-1.5 py-0.75" :class="[selected ? 'bg-active' : 'hover:bg-hover', inContext && 'font-semibold text-blue']" :style="{ paddingLeft: depth * 0.875 + 'rem' }" @click="click" @dblclick="dbl">
      <span class="w-3 text-[0.6875rem] text-[#6b7680]" @click.stop="open = !open">{{ node.children.length ? (open ? '▾' : '▸') : '' }}</span>
      <S3dIcon :name="node.inst.def.isComponent ? 'component' : 'group'" :size="16" />
      <span class="flex-1 truncate" :class="node.inst.hidden && 'text-[#9aa3ab] italic'">{{ label }}</span>
      <button class="flex bg-transparent px-0.5 opacity-55 hover:opacity-100" :title="node.inst.hidden ? 'Einblenden' : 'Ausblenden'" @click.stop="toggleHidden"><S3dIcon :name="node.inst.hidden ? 'eyeOff' : 'eye'" :size="14" /></button>
    </div>
    <template v-if="open"><S3dOutlinerNode v-for="c in node.children" :key="c.inst.id" :node="c" :depth="depth + 1" :filter="filter" /></template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import type { Instance } from '../../core/model';
import { useModel } from '../../composables/useModel';

interface ONode { inst: Instance; path: Instance[]; children: ONode[] }
const props = defineProps<{ node: ONode; depth: number; filter: string }>();
const ed = useEditor(); const open = ref(true);
const label = computed(() => { const i = props.node.inst; return (i.name ? `${i.name} ` : '') + `<${i.def.name}>`; });
const matches = (n: ONode): boolean => !props.filter || (n.inst.name + ' ' + n.inst.def.name).toLowerCase().includes(props.filter) || n.children.some(matches);
const visible = computed(() => matches(props.node));
const parentPath = computed(() => props.node.path.slice(0, -1));
const sameContext = () => parentPath.value.length === ed.activePath.length && parentPath.value.every((p, i) => ed.activePath[i] === p);
const selected = computed(() => { void ed.ui.selRev; return sameContext() && ed.selection.has('instance:' + props.node.inst.id); });
const inContext = useModel(() => ed.activePath.includes(props.node.inst));
function goTo() { ed.setContext([...parentPath.value]); }
function click() { if (!sameContext()) goTo(); ed.select([{ kind: 'instance', id: props.node.inst.id }]); }
function dbl() { goTo(); ed.enterInstance(props.node.inst); }
function toggleHidden() { ed.commit('Ausblenden', () => { props.node.inst.hidden = !props.node.inst.hidden; }); }
</script>
