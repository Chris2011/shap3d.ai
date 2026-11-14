<template>
  <select class="s3d-input" :value="modelValue" @change="emit('update:modelValue', valueOf($event))">
    <slot />
  </select>
</template>

<script setup lang="ts">
import { valueOf } from '../../utils/inputEvent';

/** Drop-down in the shared look (v-model as string). The `<option>`s go in the slot. */
defineProps<{ modelValue?: string | number }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();
</script>
