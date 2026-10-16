<template>
  <button class="s3d-iconbtn" :class="{ active: ed.ui.tool === tool }" @click="ed.setTool(tool)" @mouseenter="hover = true" @mouseleave="hover = false">
    <Icon :name="info.icon" />
    <span v-if="hover" class="tip">{{ info.name }}<template v-if="info.key"> ({{ info.key }})</template></span>
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

<style scoped>
.tip { position: absolute; left: 46px; top: 50%; transform: translateY(-50%); white-space: nowrap; background: var(--s3d-panel); color: var(--s3d-navy); font-weight: 600; font-size: 12px; letter-spacing: .5px; padding: 3px 9px; box-shadow: var(--s3d-shadow); pointer-events: none; z-index: 100; }
</style>
