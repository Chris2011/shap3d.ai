<template>
  <div class="ill nav">
    <div class="scene">
      <div class="cube">
        <span class="f1"></span><span class="f2"></span><span class="f3"></span><span class="f4"></span><span class="f5"></span
        ><span class="f6"></span>
      </div>
    </div>
    <svg viewBox="0 0 60 90" class="mouse">
      <rect x="6" y="4" width="48" height="80" rx="24" fill="none" stroke="currentColor" stroke-width="2.4" />
      <path d="M30 4 V36 M6 36 H54" stroke="currentColor" stroke-width="2" />
      <rect class="wheel" x="26" y="14" width="8" height="14" rx="4" />
    </svg>
  </div>
</template>

<script setup lang="ts">
/** Step 3 – navigation: orbiting cube + mouse wheel. Shared animation classes come from S3dTourArt.vue. */
</script>

<style scoped>
.nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 46px;
  color: #e6ebf1;
}
.scene {
  width: 90px;
  height: 90px;
  perspective: 420px;
}
.cube {
  position: relative;
  width: 90px;
  height: 90px;
  transform-style: preserve-3d;
  animation: spin 6s linear infinite;
}
.cube span {
  position: absolute;
  inset: 0;
  border: 2px solid #0b0f14;
}
.f1 {
  background: #e7e9ec;
  transform: translateZ(45px);
}
.f2 {
  background: #9ea5ad;
  transform: rotateY(180deg) translateZ(45px);
}
.f3 {
  background: #c9cdd2;
  transform: rotateY(90deg) translateZ(45px);
}
.f4 {
  background: #b4bac1;
  transform: rotateY(-90deg) translateZ(45px);
}
.f5 {
  background: #5fd4e6;
  transform: rotateX(90deg) translateZ(45px);
}
.f6 {
  background: #6b737c;
  transform: rotateX(-90deg) translateZ(45px);
}
.mouse {
  width: 52px;
  height: 78px;
}
.wheel {
  fill: #5fd4e6;
  animation: wheel 1.2s ease-in-out infinite;
}
@keyframes spin {
  from {
    transform: rotateX(-24deg) rotateY(0);
  }
  to {
    transform: rotateX(-24deg) rotateY(360deg);
  }
}
@keyframes wheel {
  50% {
    transform: translateY(5px);
    opacity: 0.5;
  }
}
</style>
