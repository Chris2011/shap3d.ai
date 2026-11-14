<template>
  <div
    class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-line px-3 py-1.5 text-[0.6875rem] text-ink-2 max-[35rem]:[&>span:not(.flex-1)]:hidden"
  >
    <span><kbd class="s3d-kbd">↑↓</kbd> {{ t('palette.choose') }}</span>
    <span
      ><kbd class="s3d-kbd">{{ shortcutLabel('Enter') }}</kbd> {{ t('palette.run') }}</span
    >
    <span :title="t('palette.keepOpenTitle')"
      ><kbd class="s3d-kbd">{{ shortcutLabel('Shift+Enter') }}</kbd> {{ t('palette.keepOpen') }}</span
    >
    <span class="flex-1"></span>
    <button
      v-for="filter in FILTERS"
      :key="filter.prefix"
      type="button"
      class="whitespace-nowrap rounded-[10px] border px-1.75 py-px text-[0.6875rem]"
      :class="prefix === filter.prefix ? 'border-brand-deep bg-active text-ink' : 'border-line-2 bg-transparent text-ink-2'"
      :aria-pressed="prefix === filter.prefix"
      @click="emit('prefix', filter.prefix)"
    >
      {{ filter.prefix }} {{ t(filter.label) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { PalettePrefix } from '../../engine/paletteRows';
import { t, shortcutLabel } from '../../i18n';

/** Key hints of the palette and the filters: commands (>), objects (@), materials (#). */
defineProps<{ prefix: PalettePrefix }>();
const emit = defineEmits<{ (event: 'prefix', prefix: PalettePrefix): void }>();
const FILTERS = [
  { prefix: '>', label: 'palette.commands' },
  { prefix: '@', label: 'palette.objects' },
  { prefix: '#', label: 'palette.materials' },
] as const;
</script>
