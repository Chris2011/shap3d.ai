<template>
  <!-- centred between the top bar and the export button; the tabs scroll when there are many -->
  <div v-if="visible" class="absolute top-2 left-1/2 z-20 hidden max-w-[calc(100vw-60rem)] -translate-x-1/2 min-[1100px]:block">
    <div class="s3d-panel flex items-center gap-0.5 overflow-x-auto p-1">
      <button
        v-for="scene in scenes"
        :key="scene.id"
        class="rounded-[3px] px-2.5 py-1 text-xs whitespace-nowrap"
        :class="sceneState.active === scene.id ? 'bg-sel font-bold text-navy' : 'hover:bg-hover'"
        @click="applyScene(editor, scene)"
        @mouseenter="showPreview(scene, $event)"
        @mouseleave="preview = null"
      >
        {{ scene.name }}
      </button>
      <button class="flex flex-none rounded-[3px] p-1 hover:bg-hover" :title="t('scenes.add')" @click="addScene(editor)">
        <S3dIcon name="plus" :size="14" />
      </button>
    </div>
  </div>
  <div
    v-if="visible && preview"
    class="s3d-panel pointer-events-none fixed z-30 overflow-hidden p-1"
    :style="{ left: `${preview.x}px`, top: `${preview.y}px` }"
  >
    <img :src="preview.image" alt="" class="block w-48 rounded-[2px]" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import S3dIcon from './S3dIcon.vue';
import { useEditor } from './keys';
import type { Scene } from '../core/document';
import { useModel } from '../composables/useModel';
import { addScene, applyScene, sceneState } from '../engine/scenes';
import { t } from '../i18n';

/** Scene tabs above the viewport (SketchUp 2027): a click jumps to the scene, hovering shows its preview. */
const editor = useEditor();
const scenes = useModel(() => [...editor.model.scenes]);
const enabled = useModel(() => editor.model.settings.sceneTabs);
const visible = computed(() => enabled.value && scenes.value.length > 0);

const preview = ref<{ image: string; x: number; y: number } | null>(null);
const showPreview = (scene: Scene, event: MouseEvent) => {
  if (!scene.thumbnail) {
    return;
  }
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  preview.value = { image: scene.thumbnail, x: Math.max(8, box.left + box.width / 2 - 100), y: box.bottom + 8 };
};
</script>
