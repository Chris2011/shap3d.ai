<template>
  <span class="ms-auto flex gap-3 whitespace-nowrap text-xs text-[#9a9db0]"
    ><button
      v-for="(label, i) in labels"
      :key="label"
      type="button"
      class="flex items-center gap-1.25 enabled:cursor-pointer enabled:hover:underline"
      :class="i === step ? 'font-bold text-navy' : done(i) ? 'text-[#2e9b4b]' : ''"
      :disabled="i === step || !reachable(i)"
      :aria-current="i === step ? 'step' : undefined"
      @click="emit('go', i)"
    >
      <span
        class="inline-flex size-4.5 items-center justify-center rounded-full border border-current text-[0.625rem] font-bold"
        :class="i === step && 'border-navy bg-navy-bg text-white'"
        >{{ done(i) ? '✓' : i + 1 }}</span
      >{{ label }}
    </button></span
  >
</template>

<script setup lang="ts">
/** The wizard's steps in the title bar: done ones ticked, reachable ones clickable. */
defineProps<{ labels: readonly string[]; step: number; done: (index: number) => boolean; reachable: (index: number) => boolean }>();
const emit = defineEmits<{ (event: 'go', index: number): void }>();
</script>
