<template>
  <div class="s3d-an">
    <div class="s3d-an-row s3d-an-top">
      <div class="s3d-an-switch" role="tablist">
        <button role="tab" :aria-selected="!advanced" :class="{ active: !advanced }" @click="advanced = false">
          {{ t('animation.basic.simple') }}
        </button>
        <button role="tab" :aria-selected="advanced" :class="{ active: advanced }" @click="advanced = true">
          {{ t('animation.basic.advanced') }}
        </button>
      </div>
      <button class="s3d-an-link" @click="context.panels.open(GUIDE_PANEL)">{{ t('animation.guide.open') }}</button>
    </div>
    <S3dAnimBasic v-if="!advanced" @advanced="advanced = true" />
    <S3dAnimAdvanced v-else />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import S3dAnimAdvanced from './S3dAnimAdvanced.vue';
import S3dAnimBasic from './S3dAnimBasic.vue';
import { GUIDE_PANEL } from './names';
import { pluginContext, t } from './runtime';

/** the Animation panel: the simple view by default – the advanced one has every value; the choice is remembered */
const context = pluginContext();
const advanced = ref(context.storage.get('advanced', false));
watch(advanced, (value) => context.storage.set('advanced', value));
</script>
