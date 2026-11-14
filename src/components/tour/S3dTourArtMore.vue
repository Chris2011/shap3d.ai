<template>
  <div class="ill trio">
    <div class="tile">
      <svg viewBox="0 0 80 60">
        <path
          class="draw d1"
          pathLength="1"
          d="M4 52 L24 26 L36 38 L50 14 L76 52"
          fill="none"
          stroke="#3e9b4b"
          stroke-width="3"
          stroke-linejoin="round"
        />
        <path class="snow" d="M44 23 L50 14 L56 23 Z" /></svg
      ><b>{{ t('tour.more.terrain') }}</b>
    </div>
    <div class="tile">
      <svg viewBox="0 0 80 60">
        <rect class="ln l1" x="8" y="12" height="6" rx="3" />
        <rect class="ln l2" x="16" y="26" height="6" rx="3" />
        <rect class="ln l3" x="16" y="40" height="6" rx="3" /></svg
      ><b>{{ t('tour.more.scripts') }}</b>
    </div>
    <div class="tile">
      <svg viewBox="0 0 80 60">
        <path class="tray" d="M10 40 V52 H70 V40" fill="none" stroke-width="3" />
        <g class="file">
          <path d="M30 6 H46 L54 14 V34 H30 Z" />
          <text x="42" y="28" text-anchor="middle">SKP</text>
        </g></svg
      ><b>{{ t('tour.more.import') }}</b>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '../../i18n';
/** Step 5 – terrain, scripts, import. Shared animation classes come from S3dTourArt.vue. */
</script>

<style scoped>
.trio {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
.tile {
  width: 92px;
  height: 110px;
  border: 1px solid #22313d;
  background: #101820;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #c8d1da;
  font-size: 12px;
}
.tile svg {
  width: 74px;
  height: 56px;
}
.snow {
  fill: #f3f6f9;
  opacity: 0;
  animation: s3d-tour-fade-up 0.4s ease-out 0.9s forwards;
}
.ln {
  fill: #5fd4e6;
  width: 0;
  animation: lines 2.4s ease-out infinite;
}
.l2 {
  fill: #d2a8ff;
  animation-delay: 0.25s;
}
.l3 {
  fill: #7ee787;
  animation-delay: 0.5s;
}
.tray {
  stroke: #5fd4e6;
}
.file path {
  fill: #e6ebf1;
}
.file text {
  font:
    700 8px Consolas,
    monospace;
  fill: #0b0f14;
}
.file {
  animation: drop 2.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}
@keyframes lines {
  0% {
    width: 0;
  }
  40%,
  100% {
    width: 54px;
  }
}
@keyframes drop {
  0% {
    transform: translateY(-14px);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  60%,
  100% {
    transform: translateY(12px);
    opacity: 1;
  }
}
</style>
