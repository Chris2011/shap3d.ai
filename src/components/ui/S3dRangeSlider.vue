<template>
  <input type="range" :min="min" :max="max" :step="step" :value="modelValue" @input="emit('update:modelValue', numberOf($event))" />
</template>

<script setup lang="ts">
import { numberOf } from '../../utils/inputEvent';

/**
 * Slider for a number (v-model), updated while dragging. Give it an `aria-label` when no visible label names it.
 * The value text next to it is the caller's: units and rounding differ from panel to panel.
 */
defineProps<{ modelValue: number; min: number | string; max: number | string; step?: number | string }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: number): void }>();
</script>
