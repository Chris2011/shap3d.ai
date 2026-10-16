<template>
  <span class="logo" :class="{ onLight: onLight }" :aria-label="BRAND.name" :title="BRAND.name + ' – sprich „' + BRAND.pronounced + '“'" role="img">
    <svg v-if="mark" class="mark" :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" :fill="BRAND.tile" />
      <g fill="none" :stroke="BRAND.light" stroke-linejoin="round">
        <path d="M32 12 L49 22 V42 L32 52 L15 42 V22 Z" stroke-width="2.2" />
        <path d="M15 22 L32 32 L49 22 M32 32 V52" stroke-width="1.4" stroke-opacity=".55" />
      </g>
      <circle cx="32" cy="32" r="6.5" fill="none" :stroke="BRAND.accent" stroke-width="1.2" stroke-opacity=".45" />
      <circle cx="32" cy="32" r="3.4" :fill="BRAND.accent" />
    </svg>
    <span v-if="word" class="word" :style="{ fontSize: wordSize + 'px' }">Shap<b>3D</b>.<b>ai</b></span>
  </span>
</template>

<script setup lang="ts">
import { BRAND } from '../brand';
withDefaults(defineProps<{ size?: number; wordSize?: number; mark?: boolean; word?: boolean; onLight?: boolean }>(), { size: 28, wordSize: 17, mark: true, word: true, onLight: false });
</script>

<style scoped>
.logo { display: inline-flex; align-items: center; gap: 9px; line-height: 1; }
.mark { flex: none; }
.word { font-family: 'Segoe UI', 'Inter', system-ui, sans-serif; font-weight: 600; letter-spacing: .4px; color: #e6ebf1; }
.word b { font-weight: 700; color: #5fd4e6; }
/* on light UI surfaces the off-white letters and the pale accent need more contrast */
.onLight .word { color: #0d1218; }
.onLight .word b { color: #0e8ca0; }
</style>
