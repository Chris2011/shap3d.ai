<template>
  <button type="button" class="flex flex-none items-center justify-center rounded bg-transparent text-navy hover:bg-hover" :class="size === 'sm' ? 'size-6' : 'size-7.5'" :title="title" :aria-label="title">
    <S3dIcon name="close" :size="size === 'sm' ? 14 : 16" />
  </button>
</template>

<script setup lang="ts">
import S3dIcon from '../S3dIcon.vue';

/** ✕ in the title bar of panels, windows and dialogs. */
withDefaults(defineProps<{ title?: string; size?: 'sm' | 'md' }>(), { title: 'Schließen', size: 'md' });
</script>
