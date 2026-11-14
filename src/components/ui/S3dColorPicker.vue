<template>
  <input
    type="color"
    class="flex-none rounded-[3px] border border-edge bg-surface p-px"
    :class="wide ? 'h-6.5 w-11' : 'h-7 w-9'"
    :value="modelValue"
    @input="emit('update:modelValue', valueOf($event))"
  />
</template>

<script setup lang="ts">
import { valueOf } from '../../utils/inputEvent';

/** Small colour well (v-model as "#rrggbb"), updated while the picker is open. Give it an `aria-label`. `wide`: the flatter, wider well of the Styles panel. */
defineProps<{ modelValue: string; wide?: boolean }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();
</script>
