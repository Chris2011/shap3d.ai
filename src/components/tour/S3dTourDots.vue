<template>
  <div class="flex gap-1.5">
    <button
      v-for="(step, i) in steps"
      :key="step.title"
      type="button"
      class="h-2 rounded-full p-0 transition-[width,background-color] duration-200"
      :class="i === modelValue ? 'w-5.5 rounded bg-brand-deep' : i < modelValue ? 'w-2 bg-[#5fa9bf]' : 'w-2 bg-line-2'"
      :title="step.title"
      :aria-label="t('tour.stepLabel', { step: i + 1, title: step.title })"
      :aria-current="i === modelValue ? 'step' : undefined"
      @click="emit('update:modelValue', i)"
    ></button>
  </div>
</template>

<script setup lang="ts">
import type { TourStep } from '../../composables/useTourSteps';
import { t } from '../../i18n';

/** One dot per tour step (v-model = index): done, current (wide) and still to come; a click jumps there. */
defineProps<{ steps: readonly TourStep[]; modelValue: number }>();
const emit = defineEmits<{ (event: 'update:modelValue', index: number): void }>();
</script>
