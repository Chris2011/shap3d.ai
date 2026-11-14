<template>
  <div
    v-if="tour.open"
    class="fixed inset-0 z-120 flex animate-fade-in items-center justify-center bg-[rgba(8,12,18,.45)] motion-reduce:animate-none"
    @pointerdown.self="closeTour()"
    @keydown.stop
  >
    <div
      class="s3d-panel relative w-[min(32.5rem,94vw)] animate-rise overflow-hidden rounded-[10px] motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      :aria-label="t('tour.ariaLabel', { step: tour.step + 1, count: steps.length })"
    >
      <S3dCloseButton class="absolute end-2 top-2 z-2" :title="t('tour.close')" @click="closeTour()" />
      <!-- :key restarts the animation on every step -->
      <S3dTourArt :key="tour.step" :step="tour.step" />
      <S3dTourStepText :step="current" :index="tour.step" :count="steps.length" />
      <div class="flex items-center gap-2 px-5.5 pt-3.5 pb-4.5">
        <S3dTourDots v-model="tour.step" :steps="steps" />
        <span class="flex-1"></span>
        <button
          v-if="tour.step === 0"
          type="button"
          class="bg-transparent px-1.5 text-[0.8125rem] text-ink-2 hover:text-ink hover:underline"
          @click="closeTour()"
        >
          {{ t('tour.skip') }}
        </button>
        <S3dButton v-else @click="back()">{{ t('tour.back') }}</S3dButton>
        <S3dButton primary @click="next()">
          {{ isLast ? t('tour.finish') : tour.step === 0 ? t('tour.start') : t('tour.next') }}
        </S3dButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import S3dButton from './ui/S3dButton.vue';
import S3dCloseButton from './ui/S3dCloseButton.vue';
import S3dTourArt from './tour/S3dTourArt.vue';
import S3dTourDots from './tour/S3dTourDots.vue';
import S3dTourStepText from './tour/S3dTourStepText.vue';
import { tour, closeTour } from './tour';
import { useTourSteps } from '../composables/useTourSteps';
import { useTourKeyboard } from '../composables/useTourKeyboard';
import { t } from '../i18n';

/** The welcome tour: a dialog with an illustration, the step's text and the navigation between steps. */
const { steps, current, isLast, next, back } = useTourSteps();
useTourKeyboard(next, back);
</script>
