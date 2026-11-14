<template>
  <svg viewBox="0 0 300 170" class="ill">
    <rect x="18" y="20" width="168" height="40" rx="10" class="bubble" />
    <text x="32" y="45" class="typed">{{ t('tour.ai.prompt') }}</text>
    <g class="dots">
      <circle cx="40" cy="84" r="4" />
      <circle cx="54" cy="84" r="4" />
      <circle cx="68" cy="84" r="4" />
    </g>
    <g class="house">
      <path d="M200 140 L240 154 L240 112 L200 98 Z" class="face l" />
      <path d="M240 154 L278 140 L278 98 L240 112 Z" class="face r" />
      <path d="M196 100 L240 115 L240 82 L216 70 Z" class="roof" />
      <path d="M240 115 L282 100 L262 70 L240 82 Z" class="roof r2" />
      <rect x="252" y="122" width="10" height="20" class="door" />
    </g>
    <path class="spark" d="M230 50 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" />
  </svg>
</template>

<script setup lang="ts">
import { t } from '../../i18n';
/** Step 4 – AI: a prompt turns into a house. Shared animation classes come from S3dTourArt.vue. */
</script>

<style scoped>
.bubble {
  fill: #1b2631;
  stroke: #3a4a58;
}
.typed {
  font:
    15px 'Segoe UI',
    Inter,
    sans-serif;
  fill: #e6ebf1;
  clip-path: inset(0 100% 0 0);
  animation: type 1.2s steps(16) 0.2s forwards;
}
.dots circle {
  fill: #5fd4e6;
  opacity: 0.25;
  animation: blink 1s ease-in-out 1.4s 2;
}
.dots circle:nth-child(2) {
  animation-delay: 1.55s;
}
.dots circle:nth-child(3) {
  animation-delay: 1.7s;
}
.house {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  transform: scale(0);
  animation: s3d-tour-pop 0.6s cubic-bezier(0.3, 1.5, 0.5, 1) 3.3s forwards;
}
.roof {
  fill: #c0503a;
  stroke: #0b0f14;
  stroke-width: 1.2;
}
.roof.r2 {
  fill: #9c3c2b;
}
.door {
  fill: #7a4e2a;
}
.spark {
  fill: #5fd4e6;
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(0);
  animation:
    s3d-tour-pop 0.4s ease-out 3.1s forwards,
    twinkle 1.6s ease-in-out 3.6s infinite;
}
@keyframes type {
  to {
    clip-path: inset(0 0 0 0);
  }
}
@keyframes blink {
  50% {
    opacity: 1;
  }
}
@keyframes twinkle {
  50% {
    transform: scale(0.6) rotate(45deg);
    opacity: 0.6;
  }
}
</style>
