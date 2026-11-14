<template>
  <div
    class="s3d-tour-art flex h-47.5 items-center justify-center bg-brand-night bg-[linear-gradient(rgba(230,235,241,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(230,235,241,.04)_1px,transparent_1px)] bg-size-[24px_24px]"
  >
    <component :is="ARTS[step] ?? ARTS[ARTS.length - 1]" />
  </div>
</template>

<script setup lang="ts">
import S3dTourArtWelcome from './S3dTourArtWelcome.vue';
import S3dTourArtDraw from './S3dTourArtDraw.vue';
import S3dTourArtNavigate from './S3dTourArtNavigate.vue';
import S3dTourArtAi from './S3dTourArtAi.vue';
import S3dTourArtMore from './S3dTourArtMore.vue';
import S3dTourArtLook from './S3dTourArtLook.vue';

/**
 * The animated illustration above a tour step. The parent keys it by step, so the animation restarts.
 * Keyframe animations Tailwind utilities cannot express; the classes all steps share are below, unscoped
 * but kept under `.s3d-tour-art`, each step's own ones are scoped in its component.
 */
defineProps<{ step: number }>();
const ARTS = [S3dTourArtWelcome, S3dTourArtDraw, S3dTourArtNavigate, S3dTourArtAi, S3dTourArtMore, S3dTourArtLook];
</script>

<style>
.s3d-tour-art .ill {
  width: 100%;
  height: 100%;
  max-width: 360px;
}
.s3d-tour-art .draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: s3d-tour-draw 0.8s cubic-bezier(0.6, 0, 0.2, 1) forwards;
}
.s3d-tour-art .d2 {
  animation-delay: 0.55s;
}
.s3d-tour-art .pop {
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(0);
  animation: s3d-tour-pop 0.45s cubic-bezier(0.3, 1.6, 0.5, 1) 0.95s forwards;
}
.s3d-tour-art .face.l {
  fill: #c9cdd2;
}
.s3d-tour-art .face.r {
  fill: #9ea5ad;
}
.s3d-tour-art .face.t {
  fill: #e7e9ec;
}
.s3d-tour-art .face {
  stroke: #0b0f14;
  stroke-width: 1.2;
  stroke-linejoin: round;
}
@keyframes s3d-tour-draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes s3d-tour-pop {
  to {
    transform: scale(1);
  }
}
@keyframes s3d-tour-fade-up {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .s3d-tour-art * {
    animation-duration: 1ms !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
