<template>
  <label class="mt-1.5 grid grid-cols-[4.5rem_1fr_4.625rem] items-center gap-1.5"
    ><slot name="label">{{ label }}</slot>
    <input
      class="w-full"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      @input="emit('update:modelValue', numberOf($event))"
    /><span class="whitespace-nowrap text-end text-ink tabular-nums">{{ valueText }}</span></label
  >
</template>

<script setup lang="ts">
import { numberOf } from '../../../../utils/inputEvent';

/** A terrain setting: label (or the `label` slot, e.g. with an on/off box), slider (v-model) and its value. */
defineProps<{
  label?: string;
  modelValue: number;
  min: number | string;
  max: number | string;
  step: number | string;
  valueText: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ (event: 'update:modelValue', value: number): void }>();
</script>
