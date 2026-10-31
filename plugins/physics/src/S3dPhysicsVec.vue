<template>
  <!-- three numbers x, y, z – empty fields count as 0, all empty removes the value -->
  <label class="s3d-ph-field">
    <span>{{ label }}</span>
    <span class="s3d-ph-vec">
      <input
        v-for="axis in 3"
        :key="axis"
        class="s3d-input"
        type="number"
        step="any"
        :placeholder="['x', 'y', 'z'][axis - 1]"
        :value="modelValue?.[axis - 1] ?? ''"
        @change="change(axis - 1, ($event.target as HTMLInputElement).value)"
      />
    </span>
  </label>
</template>

<script setup lang="ts">
import type { Vec } from './data';

const props = defineProps<{ label: string; modelValue?: Vec }>();
const emit = defineEmits<{ change: [value: Vec | undefined] }>();

const change = (axis: number, text: string) => {
  const next: Vec = [...(props.modelValue ?? [0, 0, 0])] as Vec;
  next[axis] = Number(text) || 0;
  emit('change', next.every((value) => value === 0) && !props.modelValue ? undefined : next);
};
</script>
