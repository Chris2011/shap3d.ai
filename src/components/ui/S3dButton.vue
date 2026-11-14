<template>
  <button type="button" class="s3d-btn" :class="{ primary, small }"><slot /></button>
</template>

<script setup lang="ts">
/**
 * Text button in the shared look (`s3d-btn`). `primary` is the blue main action, `small` the compact size.
 * `title`, `disabled`, `class` and `@click` fall through to the `<button>`.
 */
defineProps<{ primary?: boolean; small?: boolean }>();
</script>
