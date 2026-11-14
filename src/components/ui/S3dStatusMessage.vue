<template>
  <p
    class="rounded-[3px] border px-2 py-1.5"
    :class="error ? 'border-danger/40 bg-danger/8 text-danger' : 'border-line bg-surface text-ink-2'"
    :role="error ? 'alert' : 'status'"
  >
    {{ text }}
  </p>
</template>

<script setup lang="ts">
/** What an action did, in a framed line – red when it failed. Spacing comes from the caller. */
defineProps<{ text: string; error?: boolean }>();
</script>
