<template>
  <span v-if="plugin.preview" class="badge preview" title="Not released yet – built from the main branch">Preview</span>
  <span v-if="plugin.source === 'community'" class="badge" title="Built and published by its author, listed after a review">Community</span>
</template>

<script setup lang="ts">
import type { PortalPlugin } from './catalog';

/** what kind of plugin it is: not released yet, from the community */
defineProps<{ plugin: PortalPlugin }>();
</script>

<style scoped>
.badge {
  margin-left: 0.35rem;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 0.72rem;
  font-weight: 500;
  vertical-align: middle;
}

.badge.preview {
  background: var(--line);
  color: var(--muted);
}
</style>
