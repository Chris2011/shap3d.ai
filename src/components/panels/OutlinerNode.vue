<template>
  <div v-if="visible">
    <div class="node" :class="{ sel: selected, ctx: inContext, hid: node.inst.hidden }" :style="{ paddingLeft: depth * 14 + 'px' }" @click="click" @dblclick="dbl">
      <span class="tw" @click.stop="open = !open">{{ node.children.length ? (open ? '▾' : '▸') : '' }}</span>
      <Icon :name="node.inst.def.isComponent ? 'component' : 'group'" :size="16" />
      <span class="lbl">{{ label }}</span>
      <button class="eye" :title="node.inst.hidden ? 'Einblenden' : 'Ausblenden'" @click.stop="toggleHidden"><Icon :name="node.inst.hidden ? 'eyeOff' : 'eye'" :size="14" /></button>
    </div>
    <template v-if="open"><OutlinerNode v-for="c in node.children" :key="c.inst.id" :node="c" :depth="depth + 1" :filter="filter" /></template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import { useEditor } from '../keys';
import type { Instance } from '../../core/model';

interface ONode { inst: Instance; path: Instance[]; children: ONode[] }
const props = defineProps<{ node: ONode; depth: number; filter: string }>();
const ed = useEditor(); const open = ref(true);
const label = computed(() => { const i = props.node.inst; return (i.name ? `${i.name} ` : '') + `<${i.def.name}>`; });
const matches = (n: ONode): boolean => !props.filter || (n.inst.name + ' ' + n.inst.def.name).toLowerCase().includes(props.filter) || n.children.some(matches);
const visible = computed(() => matches(props.node));
const parentPath = computed(() => props.node.path.slice(0, -1));
const sameContext = () => parentPath.value.length === ed.activePath.length && parentPath.value.every((p, i) => ed.activePath[i] === p);
const selected = computed(() => { void ed.ui.selRev; return sameContext() && ed.selection.has('instance:' + props.node.inst.id); });
const inContext = computed(() => { void ed.ui.rev; return ed.activePath.includes(props.node.inst); });
function goTo() { ed.setContext([...parentPath.value]); }
function click() { if (!sameContext()) goTo(); ed.select([{ kind: 'instance', id: props.node.inst.id }]); }
function dbl() { goTo(); ed.enterInstance(props.node.inst); }
function toggleHidden() { ed.commit('Ausblenden', () => { props.node.inst.hidden = !props.node.inst.hidden; }); }
</script>

<style scoped>
.node { display: flex; align-items: center; gap: 4px; padding: 3px 6px; border-radius: 3px; cursor: pointer; }
.node:hover { background: var(--s3d-hover); }
.node.sel { background: var(--s3d-active); }
.node.ctx { color: var(--s3d-blue); font-weight: 600; }
.node.hid .lbl { color: #9aa3ab; font-style: italic; }
.tw { width: 12px; color: #6b7680; font-size: 11px; }
.lbl { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eye { border: 0; background: transparent; cursor: pointer; opacity: .55; padding: 0 2px; display: flex; }
.eye:hover { opacity: 1; }
</style>
