<template>
  <div class="left">
    <div class="search s3d-panel">
      <button class="s3d-iconbtn" title="Befehlspalette – alles suchen (Strg+Umschalt+P, F1 oder zweimal Umschalt)" @click="$emit('search')"><Icon name="search" /></button>
    </div>
    <div class="toolbar s3d-panel">
      <ToolButton v-for="t in MAIN_TOOLS" :key="t" :tool="t" />
      <div class="sep"></div>
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

<style scoped>
.left { position: absolute; left: 6px; top: 50%; transform: translateY(-50%); z-index: 25; display: flex; flex-direction: column; gap: 14px; }
.search { width: 40px; }
.toolbar { width: 40px; display: flex; flex-direction: column; }
.toolbar .s3d-iconbtn { border-radius: 0; }
.sep { height: 1px; background: #c9cbd4; margin: 5px 6px; }
</style>
