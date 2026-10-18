<template>
  <div class="absolute top-1/2 left-1.5 z-25 flex -translate-y-1/2 flex-col gap-3.5">
    <div class="s3d-panel w-10">
      <button class="s3d-iconbtn" title="Befehlspalette – alles suchen (Strg+Umschalt+P, F1 oder zweimal Umschalt)" @click="$emit('search')"><Icon name="search" /></button>
    </div>
    <div class="s3d-panel flex w-10 flex-col [&_.s3d-iconbtn]:rounded-none">
      <ToolButton v-for="t in MAIN_TOOLS" :key="t" :tool="t" />
      <div class="mx-1.5 my-1.25 h-px bg-[#c9cbd4] dark:bg-line-2"></div>
      <ToolButton v-for="t in ed.ui.recentTools" :key="'r' + t" :tool="t" />
      <button class="s3d-iconbtn" :class="{ active: expanded }" title="Weitere Werkzeuge" @click.stop="expanded = !expanded"><Icon name="more" /></button>
    </div>
    <ExpandedToolset v-if="expanded" @close="expanded = false" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Icon from './Icon.vue';
import ToolButton from './ToolButton.vue';
import ExpandedToolset from './ExpandedToolset.vue';
import { useEditor } from './keys';
import { MAIN_TOOLS } from '../engine/editor';

defineEmits<{ (e: 'search'): void }>();
const ed = useEditor();
const expanded = ref(false);
</script>
