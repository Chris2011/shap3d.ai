<template>
  <label class="s3d-nz-slider" :title="label">
    <span>{{ label }}</span>
    <input type="range" :min="min" :max="max" :step="step" :value="modelValue" @input="change(($event.target as HTMLInputElement).value)" />
    <input
      class="s3d-input"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @change="change(($event.target as HTMLInputElement).value)"
    />
  </label>
</template>

<script setup lang="ts">
/** A labelled slider with a number field next to it – both edit the same value. */
const props = withDefaults(defineProps<{ label: string; modelValue: number; min: number; max: number; step?: number }>(), { step: 1 });
const emit = defineEmits<{ (event: 'update:modelValue', value: number): void }>();

const change = (text: string) => {
  const value = Number(text);
  if (Number.isFinite(value)) {
    emit('update:modelValue', Math.min(props.max * 10, Math.max(props.min, value)));
  }
};
</script>
