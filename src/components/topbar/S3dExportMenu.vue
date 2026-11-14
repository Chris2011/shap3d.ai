<template>
  <div ref="exportBox" class="s3d-panel absolute top-0 right-0 z-30 flex h-11 items-center gap-2 px-2">
    <button
      type="button"
      class="h-7 rounded-[2px] border-0 bg-navy-bg px-2.5 text-[0.8125rem] font-bold tracking-[0.01875rem] text-white hover:bg-[#0b3457]"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle()"
    >
      {{ t('topbar.export') }}
    </button>
    <div v-if="open" class="s3d-menu top-11 right-0" role="menu" @click="close()">
      <S3dMenuItem v-for="entry in exports" :key="entry.command" :icon="entry.icon" @click="runCommand(editor, entry.command)">{{
        entry.label
      }}</S3dMenuItem>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import S3dMenuItem from '../ui/S3dMenuItem.vue';
import { useEditor } from '../keys';
import { runCommand } from '../../engine/commands';
import { usePopover } from '../../composables/usePopover';
import { t } from '../../i18n';

/** "Export" at the top right: save the model, or export it as GLB, glTF, STL, OBJ or PNG. */
const editor = useEditor();
const { open, toggle, close } = usePopover(useTemplateRef('exportBox'));
const exports = computed(() => [
  { command: 'save', icon: 'save', label: t('topbar.exportModel') },
  { command: 'export-glb', icon: 'cube', label: 'GLB' },
  { command: 'export-gltf', icon: 'cube', label: 'glTF' },
  { command: 'export-stl', icon: 'cube', label: t('topbar.exportStl') },
  { command: 'export-obj', icon: 'cube', label: 'OBJ' },
  { command: 'export-png', icon: 'camera', label: t('topbar.exportPng') },
]);
</script>
