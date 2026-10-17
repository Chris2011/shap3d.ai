<template>
  <button class="s3d-iconbtn" :class="{ active: ed.ui.tool === tool }" @click="ed.setTool(tool)" @mouseenter="hover = true" @mouseleave="hover = false">
    <Icon :name="info.icon" />
    <span v-if="hover" class="pointer-events-none absolute top-1/2 left-[46px] z-100 -translate-y-1/2 whitespace-nowrap bg-panel px-[9px] py-[3px] text-xs font-semibold tracking-[.5px] text-navy shadow-panel">{{ info.name }}<template v-if="info.key"> ({{ info.key }})</template></span>
  </button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import { useEditor } from './keys';
import { TOOL_INFO } from '../engine/setup';

const props = defineProps<{ tool: string }>();
const ed = useEditor();
const hover = ref(false);
const info = computed(() => TOOL_INFO[props.tool] ?? { id: props.tool, name: props.tool, icon: 'cube' });
</script>
