<template>
  <div class="s3d-row">
    <span v-if="label !== undefined" class="s3d-label">{{ label }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * One line of a panel form (`s3d-row`): a fixed-width label, then the controls in the slot.
 * An empty `label` keeps the column so a lone button lines up with the fields above.
 */
defineProps<{ label?: string }>();
</script>
