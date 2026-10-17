<template>
  <span class="inline-flex items-center gap-[9px] leading-none" :aria-label="BRAND.name" :title="BRAND.name + ' – sprich „' + BRAND.pronounced + '“'" role="img">
    <svg v-if="mark" class="flex-none" :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" :fill="BRAND.tile" />
      <g fill="none" :stroke="BRAND.light" stroke-linejoin="round">
        <path d="M32 12 L49 22 V42 L32 52 L15 42 V22 Z" stroke-width="2.2" />
        <path d="M15 22 L32 32 L49 22 M32 32 V52" stroke-width="1.4" stroke-opacity=".55" />
      </g>
      <circle cx="32" cy="32" r="6.5" fill="none" :stroke="BRAND.accent" stroke-width="1.2" stroke-opacity=".45" />
      <circle cx="32" cy="32" r="3.4" :fill="BRAND.accent" />
    </svg>
    <span v-if="word" class="font-[Segoe_UI,Inter,system-ui,sans-serif] font-semibold tracking-[.4px]" :class="onLight ? 'text-brand-tile' : 'text-brand-ice'" :style="{ fontSize: wordSize + 'px' }">Shap<b :class="acc">3D</b>.<b :class="acc">ai</b></span>
  </span>
</template>

<script setup lang="ts">
import { BRAND } from '../brand';
import { computed } from 'vue';
const props = withDefaults(defineProps<{ size?: number; wordSize?: number; mark?: boolean; word?: boolean; onLight?: boolean }>(), { size: 28, wordSize: 17, mark: true, word: true, onLight: false });
/** on light UI surfaces the pale accent needs more contrast */
const acc = computed(() => (props.onLight ? 'font-bold text-brand-deep' : 'font-bold text-brand'));
</script>
