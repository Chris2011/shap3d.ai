<template>
  <label class="s3d-check">
    <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', !modelValue)" />
    <slot />
  </label>
</template>

<script setup lang="ts">
/** Checkbox with its text in the slot (v-model). The whole line is clickable. */
defineProps<{ modelValue: boolean; disabled?: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>();
</script>
