<template>
  <div class="fixed inset-0 z-95 flex items-center justify-center bg-[rgba(20,25,30,.3)]" @pointerdown.self="emit('close')">
    <div class="s3d-panel flex max-h-[90vh] flex-col" :class="panelClass" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc="emit('close')" @keydown.stop>
      <div v-if="title" class="flex flex-none items-center gap-3 bg-panel-2 py-2.5 pr-2 pl-4">
        <span class="text-[0.9375rem] font-bold whitespace-nowrap text-navy">{{ title }}</span>
        <div class="flex min-w-0 flex-1 items-center gap-3"><slot name="header" /></div>
        <S3dCloseButton @click="emit('close')" />
      </div>
      <slot />
      <div v-if="$slots.footer" class="flex flex-none gap-2 border-t border-line px-4 py-2.5"><slot name="footer" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core';
import S3dCloseButton from './S3dCloseButton.vue';

/**
 * Centered window with backdrop: title bar with ✕, content, optional footer.
 * Closes on ✕, Esc and a click on the backdrop. Without a title it is a plain box (used by S3dDialogs.vue).
 */
defineProps<{ title?: string; panelClass?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
onKeyStroke('Escape', () => emit('close'));
</script>
