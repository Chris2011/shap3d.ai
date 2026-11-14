<template>
  <input
    class="s3d-input"
    :value="modelValue"
    @input="emit('update:modelValue', valueOf($event))"
    @change="emit('commit', valueOf($event))"
  />
</template>

<script setup lang="ts">
import { valueOf } from '../../utils/inputEvent';

/**
 * Text field in the shared look (`s3d-input`). `v-model` follows every key stroke; `@commit` fires once
 * on Enter or blur – use it for values that write into the model, so typing is not one undo step per key.
 */
defineProps<{ modelValue?: string | number }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void; (event: 'commit', value: string): void }>();
</script>
