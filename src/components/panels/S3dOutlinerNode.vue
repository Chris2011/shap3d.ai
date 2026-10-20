<template>
  <div v-if="visible">
    <div
      class="flex cursor-pointer items-center gap-1 rounded-[3px] px-1.5 py-0.75"
      :class="[selected ? 'bg-active' : 'hover:bg-hover', inContext && 'font-semibold text-blue']"
      :style="{ paddingLeft: depth * 0.875 + 'rem' }"
      @click="click"
      @dblclick="dbl"
    >
      <span class="w-3 text-[0.6875rem] text-[#6b7680]" @click.stop="open = !open">{{
        node.children.length ? (open ? '▾' : '▸') : ''
      }}</span>
      <S3dIcon :name="node.inst.definition.isComponent ? 'component' : 'group'" :size="16" />
      <span class="flex-1 truncate" :class="node.inst.hidden && 'text-[#9aa3ab] italic'">{{ label }}</span>
      <button
        class="flex bg-transparent px-0.5 opacity-55 hover:opacity-100"
        :title="node.inst.hidden ? t('outliner.show') : t('commands.hide')"
        @click.stop="toggleHidden"
      >
        <S3dIcon :name="node.inst.hidden ? 'eyeOff' : 'eye'" :size="14" />
      </button>
    </div>
    <template v-if="open"
      ><S3dOutlinerNode v-for="child in node.children" :key="child.inst.id" :node="child" :depth="depth + 1" :filter="filter"
    /></template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import type { Instance } from '../../core/model';
import { useModel } from '../../composables/useModel';
import { t } from '../../i18n';

interface ONode {
  inst: Instance;
  path: Instance[];
  children: ONode[];
}
const props = defineProps<{ node: ONode; depth: number; filter: string }>();
const editor = useEditor();
const open = ref(true);
const label = computed(() => {
  const instance = props.node.inst;
  return (instance.name ? `${instance.name} ` : '') + `<${instance.definition.name}>`;
});
const matches = (candidate: ONode): boolean =>
  !props.filter ||
  (candidate.inst.name + ' ' + candidate.inst.definition.name).toLowerCase().includes(props.filter) ||
  candidate.children.some(matches);
const visible = computed(() => matches(props.node));
const parentPath = computed(() => props.node.path.slice(0, -1));
const sameContext = () =>
  parentPath.value.length === editor.activePath.length && parentPath.value.every((instance, i) => editor.activePath[i] === instance);
const selected = computed(() => {
  void editor.ui.selRev;
  return sameContext() && editor.selection.has('instance:' + props.node.inst.id);
});
const inContext = useModel(() => editor.activePath.includes(props.node.inst));
const goTo = () => {
  editor.setContext([...parentPath.value]);
};
const click = () => {
  if (!sameContext()) {
    goTo();
  }
  editor.select([{ kind: 'instance', id: props.node.inst.id }]);
};
const dbl = () => {
  goTo();
  editor.enterInstance(props.node.inst);
};
const toggleHidden = () => {
  editor.commit('commands.hide', () => {
    props.node.inst.hidden = !props.node.inst.hidden;
  });
};
</script>
