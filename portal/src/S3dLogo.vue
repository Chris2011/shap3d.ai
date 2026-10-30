<template>
  <span class="logo" :aria-label="BRAND.name" role="img">
    <!-- the same mark as the app's S3dLogo.vue -->
    <svg class="mark" :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" :fill="BRAND.tile" />
      <g fill="none" :stroke="BRAND.light" stroke-linejoin="round">
        <path d="M32 12 L49 22 V42 L32 52 L15 42 V22 Z" stroke-width="2.2" />
        <path d="M15 22 L32 32 L49 22 M32 32 V52" stroke-width="1.4" stroke-opacity=".55" />
      </g>
      <circle cx="32" cy="32" r="6.5" fill="none" :stroke="BRAND.accent" stroke-width="1.2" stroke-opacity=".45" />
      <circle cx="32" cy="32" r="3.4" :fill="BRAND.accent" />
    </svg>
    <span class="word" :style="{ fontSize: wordSize / 16 + 'rem' }">Shap<b>3D</b>.<b>ai</b></span>
  </span>
</template>

<script setup lang="ts">
import { BRAND } from './brand';

/** the Shap3D.ai logo: the mark and the wordmark, as in the app – the wordmark's colours follow light and dark */
withDefaults(defineProps<{ size?: number; wordSize?: number }>(), { size: 40, wordSize: 26 });
</script>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  line-height: 1;
}

.mark {
  flex: none;
}

/* as the app's wordmark: Segoe UI semibold, "3D" and "ai" bold in the accent */
.word {
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-weight: 600;
  letter-spacing: 0.025rem;
  color: v-bind('BRAND.tile');
}

.word b {
  font-weight: 700;
  color: v-bind('BRAND.accentDeep');
}

@media (prefers-color-scheme: dark) {
  .word {
    color: v-bind('BRAND.light');
  }

  .word b {
    color: v-bind('BRAND.accent');
  }
}
</style>
