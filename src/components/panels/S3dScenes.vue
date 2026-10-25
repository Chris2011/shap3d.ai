<template>
  <div class="mb-2 flex flex-wrap gap-1.5 [&_.s3d-btn]:flex [&_.s3d-btn]:items-center [&_.s3d-btn]:gap-1">
    <button class="s3d-btn small" @click="add"><S3dIcon name="plus" :size="14" /> {{ t('scenes.add') }}</button>
    <button class="s3d-btn small" :disabled="!sel" @click="update">{{ t('scenes.update') }}</button>
    <button class="s3d-btn small" :disabled="!scenes.length" @click="play">{{ playing ? t('scenes.stop') : t('scenes.play') }}</button>
  </div>
  <div>
    <div
      v-for="scene in scenes"
      :key="scene.id"
      class="flex cursor-pointer items-center gap-2 rounded-[3px] p-1.5"
      :class="sel === scene.id ? 'bg-active' : 'hover:bg-hover'"
      @click="go(scene)"
    >
      <S3dIcon name="scenes" :size="18" />
      <input
        v-if="editing === scene.id"
        class="s3d-input"
        :value="scene.name"
        @change="rename(scene, ($event.target as HTMLInputElement).value)"
        @blur="editing = null"
      />
      <span v-else class="flex-1" @dblclick="editing = scene.id">{{ scene.name }}</span>
      <button class="flex bg-transparent opacity-60 hover:opacity-100" :title="t('commands.delete')" @click.stop="remove(scene)">
        <S3dIcon name="trash" :size="15" />
      </button>
    </div>
    <div v-if="!scenes.length" class="px-0.5 py-2 text-xs text-ink-2">{{ t('scenes.empty') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import type { Scene } from '../../core/document';
import { addScene, applyScene, captureScene, sceneState } from '../../engine/scenes';
import { useModel } from '../../composables/useModel';
import { t } from '../../i18n';

const editor = useEditor();
const sel = toRef(sceneState, 'active');
const editing = ref<number | null>(null);
const scenes = useModel(() => editor.model.scenes);
const add = () => addScene(editor);
const update = () => {
  const scene = editor.model.scenes.find((entry) => entry.id === sel.value);
  if (scene) {
    editor.commit('undo.updateScene', () => Object.assign(scene, captureScene(editor)));
  }
};
const go = (scene: Scene) => applyScene(editor, scene);
const rename = (scene: Scene, name: string) => {
  editing.value = null;
  if (name.trim()) {
    editor.commit('undo.renameScene', () => {
      scene.name = name.trim();
    });
  }
};
const remove = (scene: Scene) => {
  editor.commit('undo.deleteScene', () => {
    editor.model.scenes = editor.model.scenes.filter((other) => other !== scene);
  });
};
// slide show: one scene every 2.5 s, stops by itself when the panel closes
let next = 0;
const { pause, resume, isActive: playing } = useIntervalFn(() => step(), 2500, { immediate: false });
const step = () => {
  const list = editor.model.scenes;
  if (!list.length) {
    pause();
    return;
  }
  go(list[next % list.length]);
  next++;
};
const play = () => {
  if (playing.value) {
    pause();
    return;
  }
  next = Math.max(
    0,
    editor.model.scenes.findIndex((scene) => scene.id === sel.value),
  );
  step();
  resume();
};
</script>
