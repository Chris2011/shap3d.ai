<template>
  <!-- while a film is rendered: how far it is, and a way to stop – also when the panel is closed -->
  <div v-if="state.rendering" class="s3d-an-rendering" role="status">
    <b>🎬 {{ t('animation.render.title') }}</b>
    <div class="s3d-an-progress"><div :style="{ width: `${state.rendering.progress * 100}%` }"></div></div>
    <div class="s3d-an-row between">
      <span class="s3d-an-hint">{{
        t(`animation.render.phase.${state.rendering.phase}`, { percent: Math.round(state.rendering.progress * 100) })
      }}</span>
      <button class="s3d-btn" @click="cancelRender">{{ t('animation.render.cancel') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { cancelRender } from './render';
import { t } from './runtime';
import { useAnimationState } from './state';

const state = useAnimationState();
</script>
