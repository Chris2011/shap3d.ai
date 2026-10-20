<template>
  <button
    type="button"
    class="flex flex-none items-center justify-center rounded bg-transparent text-navy hover:bg-hover"
    :class="size === 'sm' ? 'size-6' : 'size-7.5'"
    :title="title ?? t('common.close')"
    :aria-label="title ?? t('common.close')"
  >
    <S3dIcon name="close" :size="size === 'sm' ? 14 : 16" />
  </button>
</template>

<script setup lang="ts">
import S3dIcon from '../S3dIcon.vue';
import { t } from '../../i18n';

/** ✕ in the title bar of panels, windows and dialogs. */
withDefaults(defineProps<{ title?: string; size?: 'sm' | 'md' }>(), { title: undefined, size: 'md' });
</script>
