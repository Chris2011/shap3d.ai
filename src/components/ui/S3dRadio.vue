<template>
  <label class="s3d-check">
    <input type="radio" :name="name" :checked="checked" @change="emit('select')" />
    <slot />
  </label>
</template>

<script setup lang="ts">
/** One radio button of the group `name`, its text in the slot. Emits `select` when chosen. */
defineProps<{ name: string; checked: boolean }>();
const emit = defineEmits<{ (event: 'select'): void }>();
</script>
