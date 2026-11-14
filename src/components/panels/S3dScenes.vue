<template>
  <div class="mb-2 flex flex-wrap gap-1.5 [&_.s3d-btn]:flex [&_.s3d-btn]:items-center [&_.s3d-btn]:gap-1">
    <S3dButton small @click="add"><S3dIcon name="plus" :size="14" /> {{ t('scenes.add') }}</S3dButton>
    <S3dButton small :disabled="!sel" @click="update">{{ t('scenes.update') }}</S3dButton>
    <S3dButton small :disabled="!scenes.length" @click="play">{{ playing ? t('scenes.stop') : t('scenes.play') }}</S3dButton>
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
      <S3dTextInput
        v-if="editing === scene.id"
        :model-value="scene.name"
        :aria-label="t('undo.renameScene')"
        @commit="rename(scene, $event)"
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
import S3dButton from '../ui/S3dButton.vue';
import S3dTextInput from '../ui/S3dTextInput.vue';
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
