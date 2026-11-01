<template>
  <!-- the film: size, video or PNG images, and the render with its progress -->
  <section class="s3d-an-section">
    <div class="s3d-an-heading">
      <span>{{ t('animation.render.title') }}</span>
    </div>
    <div class="s3d-an-grid two">
      <label class="s3d-an-field">
        <span>{{ t('animation.render.size') }}</span>
        <select v-model="preset" class="s3d-input">
          <option v-for="entry in PRESETS" :key="entry.id" :value="entry.id">{{ t(`animation.render.sizes.${entry.id}`) }}</option>
        </select>
      </label>
      <label class="s3d-an-field">
        <span>{{ t('animation.render.format') }}</span>
        <select v-model="kind" class="s3d-input">
          <option value="video">{{ t('animation.render.video', { type: videoName }) }}</option>
          <option value="png">{{ t('animation.render.png') }}</option>
        </select>
      </label>
    </div>
    <label v-if="advanced" class="s3d-an-check"><input v-model="overlay" type="checkbox" /> {{ t('animation.render.overlay') }}</label>
    <p class="s3d-an-hint">
      {{
        t('animation.render.summary', {
          frames: scene.end - scene.start + 1,
          seconds: ((scene.end - scene.start + 1) / scene.fps).toFixed(1),
          fps: scene.fps,
          width: size.width,
          height: size.height,
        })
      }}
    </p>
    <p v-if="!scene.cameras.length" class="s3d-an-hint">{{ t('animation.render.noCamera') }}</p>
    <template v-if="state.rendering">
      <div class="s3d-an-progress"><div :style="{ width: `${state.rendering.progress * 100}%` }"></div></div>
      <div class="s3d-an-row between">
        <span class="s3d-an-hint">{{
          t(`animation.render.phase.${state.rendering.phase}`, { percent: Math.round(state.rendering.progress * 100) })
        }}</span>
        <button class="s3d-btn" @click="cancelRender">{{ t('animation.render.cancel') }}</button>
      </div>
    </template>
    <button v-else class="s3d-btn primary" @click="start">🎬 {{ t('animation.render.start') }}</button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { currentScene } from './apply';
import { cancelRender, renderAnimation, videoType } from './render';
import { pluginContext, t } from './runtime';
import { useAnimationState } from './state';

/** rendering the film – in the simple view without the overlay switch */
defineProps<{ advanced?: boolean }>();

const PRESETS = [
  { id: 'hd', width: 1280, height: 720 },
  { id: 'fullhd', width: 1920, height: 1080 },
  { id: 'square', width: 1080, height: 1080 },
  { id: 'portrait', width: 1080, height: 1920 },
  { id: 'view', width: 0, height: 0 },
];

const context = pluginContext();
const editor = context.editor;
const state = useAnimationState();
const scene = computed(() => {
  void state.revision;
  void editor.ui.revision;
  return currentScene();
});

const preset = ref<string>(context.storage.get('renderSize', 'hd'));
const kind = ref<'video' | 'png'>(context.storage.get('renderKind', 'video'));
const overlay = ref(context.storage.get('renderOverlay', true));
watch([preset, kind, overlay], () => {
  context.storage.set('renderSize', preset.value);
  context.storage.set('renderKind', kind.value);
  context.storage.set('renderOverlay', overlay.value);
});

const size = computed(() => {
  const chosen = PRESETS.find((entry) => entry.id === preset.value) ?? PRESETS[0];
  return chosen.width ? chosen : { width: editor.viewer.width, height: editor.viewer.height };
});
const videoName = computed(() => (videoType()?.startsWith('video/mp4') ? 'MP4' : 'WebM'));

const start = () => void renderAnimation({ kind: kind.value, width: size.value.width, height: size.value.height, overlay: overlay.value });
</script>
