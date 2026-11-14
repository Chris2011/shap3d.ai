<template>
  <svg viewBox="0 0 300 170" class="ill">
    <g transform="translate(118 38) scale(1)">
      <rect width="64" height="64" rx="14" fill="#0d1218" />
      <path
        class="draw d1"
        pathLength="1"
        d="M32 12 L49 22 V42 L32 52 L15 42 V22 Z"
        fill="none"
        stroke="#e6ebf1"
        stroke-width="2.2"
        stroke-linejoin="round"
      />
      <path
        class="draw d2"
        pathLength="1"
        d="M15 22 L32 32 L49 22 M32 32 V52"
        fill="none"
        stroke="#e6ebf1"
        stroke-opacity=".55"
        stroke-width="1.4"
      />
      <circle class="pop p1" cx="32" cy="32" r="3.4" fill="#5fd4e6" />
      <circle class="ring" cx="32" cy="32" r="6.5" fill="none" stroke="#5fd4e6" stroke-width="1.2" />
    </g>
    <text x="150" y="128" text-anchor="middle" class="word">
      Shap
      <tspan class="acc">3D</tspan>
      .
      <tspan class="acc">ai</tspan>
    </text>
    <text x="150" y="150" text-anchor="middle" class="say">{{ t('brand.pronounce', { name: BRAND.pronounced }) }}</text>
  </svg>
</template>

<script setup lang="ts">
import { BRAND } from '../../brand';
import { t } from '../../i18n';
/** Step 1 – welcome: the logo draws itself. Shared animation classes come from S3dTourArt.vue. */
</script>

<style scoped>
.ring {
  transform-box: fill-box;
  transform-origin: center;
  opacity: 0;
  animation: ring 1.8s ease-out 1.1s infinite;
}
.word {
  font:
    600 26px 'Segoe UI',
    Inter,
    sans-serif;
  fill: #e6ebf1;
  letter-spacing: 1px;
  opacity: 0;
  animation: s3d-tour-fade-up 0.5s ease-out 1.1s forwards;
}
.word .acc {
  fill: #5fd4e6;
  font-weight: 700;
}
.say {
  font:
    12px 'Segoe UI',
    Inter,
    sans-serif;
  fill: #7d8794;
  opacity: 0;
  animation: s3d-tour-fade-up 0.5s ease-out 1.5s forwards;
}
@keyframes ring {
  0% {
    opacity: 0.6;
    transform: scale(0.6);
  }
  100% {
    opacity: 0;
    transform: scale(2.3);
  }
}
</style>
