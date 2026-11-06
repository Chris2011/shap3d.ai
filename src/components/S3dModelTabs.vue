<template>
  <!-- only with more than one model open -->
  <div v-if="modelTabs.list.length > 1" class="absolute top-12 left-1/2 z-20 max-w-[calc(100vw-30rem)] -translate-x-1/2">
    <div class="s3d-panel flex items-center gap-0.5 overflow-x-auto p-1" role="tablist" :aria-label="t('commands.newTab')">
      <div
        v-for="tab in modelTabs.list"
        :key="tab.id"
        class="flex flex-none items-center rounded-[3px] text-xs"
        :class="modelTabs.active === tab.id ? 'bg-sel font-bold text-navy' : 'hover:bg-hover'"
      >
        <button
          class="px-2.5 py-1 whitespace-nowrap"
          role="tab"
          :aria-selected="modelTabs.active === tab.id"
          @click="switchTab(editor, tab.id)"
        >
          {{ modelTabs.active === tab.id ? modelName : tab.name }}
        </button>
        <button
          class="px-1.5 py-1 hover:text-danger"
          :aria-label="t('common.close')"
          :title="t('common.close')"
          @click="closeTab(editor, tab.id)"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from './keys';
import { useModel } from '../composables/useModel';
import { closeTab, modelTabs, switchTab } from '../engine/modelTabs';
import { t } from '../i18n';

const editor = useEditor();
const modelName = useModel(() => editor.model.name);
</script>
