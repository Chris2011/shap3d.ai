<template>
  <button
    class="s3d-iconbtn"
    :class="{ active: editor.ui.tool === tool }"
    @click="editor.setTool(tool)"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <S3dIcon :name="info.icon" />
    <span
      v-if="hover"
      class="pointer-events-none absolute top-1/2 left-11.5 z-100 -translate-y-1/2 whitespace-nowrap bg-panel px-2.25 py-0.75 text-xs font-semibold tracking-[0.03125rem] text-navy shadow-panel"
      >{{ info.name }}<template v-if="info.key"> ({{ info.key }})</template></span
    >
  </button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import S3dIcon from './S3dIcon.vue';
import { useEditor } from './keys';
import { TOOL_INFO } from '../engine/setup';

const props = defineProps<{ tool: string }>();
const editor = useEditor();
const hover = ref(false);
const info = computed(() => TOOL_INFO[props.tool] ?? { id: props.tool, name: props.tool, icon: 'cube' });
</script>
