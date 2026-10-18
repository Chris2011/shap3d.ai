<template>
  <div class="absolute top-1/2 left-1.5 z-25 flex -translate-y-1/2 flex-col gap-3.5">
    <div class="s3d-panel w-10">
      <button class="s3d-iconbtn" title="Befehlspalette – alles suchen (Strg+Umschalt+P, F1 oder zweimal Umschalt)" @click="$emit('search')"><S3dIcon name="search" /></button>
    </div>
    <div class="s3d-panel flex w-10 flex-col [&_.s3d-iconbtn]:rounded-none">
      <S3dToolButton v-for="tool in MAIN_TOOLS" :key="tool" :tool="tool" />
      <div class="mx-1.5 my-1.25 h-px bg-[#c9cbd4] dark:bg-line-2"></div>
      <S3dToolButton v-for="tool in editor.ui.recentTools" :key="'r' + tool" :tool="tool" />
      <button class="s3d-iconbtn" :class="{ active: expanded }" title="Weitere Werkzeuge" @click.stop="expanded = !expanded"><S3dIcon name="more" /></button>
    </div>
    <S3dExpandedToolset v-if="expanded" @close="expanded = false" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import S3dIcon from './S3dIcon.vue';
import S3dToolButton from './S3dToolButton.vue';
import S3dExpandedToolset from './S3dExpandedToolset.vue';
import { useEditor } from './keys';
import { MAIN_TOOLS } from '../engine/editor';

defineEmits<{ (event: 'search'): void }>();
const editor = useEditor();
const expanded = ref(false);
</script>
