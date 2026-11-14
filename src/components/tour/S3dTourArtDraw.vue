<template>
  <svg viewBox="0 0 300 170" class="ill">
    <defs>
      <clipPath id="grow"><rect class="grow" x="0" y="0" width="300" height="170" /></clipPath>
    </defs>
    <path d="M40 125 L150 160 L260 125 L150 90 Z" class="ground" />
    <path class="draw d1" pathLength="1" d="M95 118 L150 136 L205 118 L150 100 Z" fill="none" stroke="#0e8ca0" stroke-width="2" />
    <g clip-path="url(#grow)" class="box">
      <path d="M95 118 L150 136 L150 78 L95 60 Z" class="face l" />
      <path d="M150 136 L205 118 L205 60 L150 78 Z" class="face r" />
      <path d="M95 60 L150 78 L205 60 L150 42 Z" class="face t" />
    </g>
    <g class="arrow">
      <path
        d="M150 54 V22 M141 31 L150 22 L159 31"
        fill="none"
        stroke="#d0312d"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
    <g class="keys">
      <rect x="14" y="14" width="22" height="22" rx="4" />
      <text x="25" y="30">R</text>
      <rect x="42" y="14" width="22" height="22" rx="4" />
      <text x="53" y="30">P</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
/** Step 2 – draw + push/pull: a rectangle becomes a box. Shared animation classes come from S3dTourArt.vue. */
</script>

<style scoped>
.ground {
  fill: #142029;
  stroke: #22313d;
}
.box {
  animation: none;
}
.grow {
  transform-box: view-box;
  transform-origin: 150px 170px;
  transform: scaleY(0.18);
  animation: grow 1.4s cubic-bezier(0.5, 0, 0.2, 1) 0.9s infinite alternate;
}
.arrow {
  opacity: 0;
  animation: arrow 1.4s ease-in-out 0.9s infinite alternate;
}
.keys rect {
  fill: #1b2631;
  stroke: #3a4a58;
}
.keys text {
  font:
    700 12px Consolas,
    monospace;
  fill: #e6ebf1;
  text-anchor: middle;
}
@keyframes grow {
  to {
    transform: scaleY(1);
  }
}
@keyframes arrow {
  0% {
    opacity: 0;
    transform: translateY(16px);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}
</style>
