<template>
  <div class="flex overflow-hidden rounded border border-line-2" role="radiogroup">
    <button v-for="option in options" :key="String(option.value)" type="button" role="radio" :aria-checked="option.value === modelValue" :title="option.title"
      class="flex flex-1 items-center justify-center gap-1 px-0.5 py-1.5 text-xs whitespace-nowrap not-first:border-l not-first:border-line-2"
      :class="option.value === modelValue ? 'bg-sel font-bold text-navy' : 'bg-surface text-ink hover:bg-hover'"
      @click="emit('update:modelValue', option.value)">
      <S3dIcon v-if="option.icon" :name="option.icon" :size="14" />{{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
import S3dIcon from '../S3dIcon.vue';

/** A row of mutually exclusive buttons (v-model), e.g. Hell | Dunkel | System. */
interface Segment<V> { value: V; label: string; icon?: string; title?: string }
defineProps<{ modelValue: T; options: readonly Segment<T>[] }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: T): void }>();
</script>
