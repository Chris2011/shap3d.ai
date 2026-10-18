<template>
  <div class="relative overflow-hidden bg-line" :class="labeled ? 'h-4.5' : 'h-1.5'" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(pct)">
    <span class="absolute inset-y-0 left-0 transition-[width] duration-300" :class="labeled ? 'bg-[linear-gradient(90deg,#1e9bd7,var(--s3d-navy-bg))]' : 'bg-navy-bg'" :style="{ width: pct + '%' }"></span>
    <b v-if="labeled" class="relative block text-center text-[0.6875rem]/4.5 text-white mix-blend-difference">{{ pct.toFixed(1).replace('.', ',') }} %</b>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** Download/progress bar for a 0…1 value; `labeled` makes it taller with the percentage inside. */
const props = defineProps<{ value: number; labeled?: boolean }>();
const pct = computed(() => Math.max(0, Math.min(100, props.value * 100)));
</script>
