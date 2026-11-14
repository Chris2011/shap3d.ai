<template>
  <div class="px-5.5 pt-4 pb-1.5">
    <div class="s3d-caption text-muted">{{ t('tour.stepOf', { step: index + 1, count }) }}</div>
    <h2 class="mt-1 mb-1.5 text-[1.1875rem] font-bold text-ink">{{ step.title }}</h2>
    <p class="text-[0.84375rem]/normal text-ink-2">{{ step.text }}</p>
    <ul
      v-if="step.tips"
      class="mt-2.5 list-disc ps-4.5 text-[0.78125rem]/[1.8] text-ink [&_kbd]:rounded-[3px] [&_kbd]:border [&_kbd]:border-b-2 [&_kbd]:border-line-2 [&_kbd]:bg-surface-2 [&_kbd]:px-1.25 [&_kbd]:font-mono [&_kbd]:text-[0.6875rem]"
    >
      <li v-for="tip in step.tips" :key="tip" v-html="richText(tip)"></li>
    </ul>
    <S3dButton v-if="step.action && (step.action.available?.() ?? true)" small class="mt-3" @click="step.action.run()">
      {{ step.action.label }}
    </S3dButton>
  </div>
</template>

<script setup lang="ts">
import S3dButton from '../ui/S3dButton.vue';
import type { TourStep } from '../../composables/useTourSteps';
import { richText } from '../../utils/safeHtml';
import { t } from '../../i18n';

/** Text of one tour step: "step n of m", title, text, tips and an optional action button. */
defineProps<{ step: TourStep; index: number; count: number }>();
</script>
