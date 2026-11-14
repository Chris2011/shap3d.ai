<template>
  <button type="button" class="s3d-iconbtn" :class="{ active }" :title="label" :aria-label="label">
    <S3dIcon :name="icon" :size="iconSize" />
    <slot />
  </button>
</template>

<script setup lang="ts">
import S3dIcon from '../S3dIcon.vue';

/**
 * Square button that only shows an icon (`s3d-iconbtn`). `label` is required: it is the tooltip and the
 * accessible name. `active` marks the switched-on state. The slot is for a badge or a hover label.
 */
withDefaults(defineProps<{ icon: string; label: string; active?: boolean; iconSize?: number }>(), { iconSize: 24 });
</script>
