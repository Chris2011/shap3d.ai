<template>
  <div class="s3d-lo-title s3d-lo-library-title">{{ t('layout.library.title') }}</div>
  <select v-model="category" class="s3d-input">
    <option v-for="entry in CATEGORIES" :key="entry" :value="entry">{{ t(`layout.library.categories.${entry}`) }}</option>
  </select>
  <div class="s3d-lo-library">
    <button
      v-for="symbol in symbols"
      :key="symbol.id"
      class="s3d-lo-symbol"
      :class="{ active: active === symbol.id }"
      :title="t(`layout.library.symbols.${symbol.id}`)"
      @click="emit('pick', symbol.id)"
    >
      <span class="s3d-lo-symbol-preview" v-html="preview(symbol)"></span>
      <span class="s3d-lo-symbol-name">{{ t(`layout.library.symbols.${symbol.id}`) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CATEGORIES, SYMBOLS, symbolMarkup, type SymbolCategory, type SymbolDefinition } from './symbols';
import { t } from './runtime';

/** The library of 2D symbols for plans: pick one, then click on the sheet to place it. */
defineProps<{ active: string | null }>();
const emit = defineEmits<{ (event: 'pick', symbol: string): void }>();

const category = ref<SymbolCategory>('openings');
const symbols = computed(() => SYMBOLS.filter((symbol) => symbol.category === category.value));

/** a small picture of the symbol, fitted into 40 × 40 */
const preview = (symbol: SymbolDefinition) => {
  const factor = 36 / Math.max(symbol.w, symbol.h);
  const offsetX = (40 - symbol.w * factor) / 2,
    offsetY = (40 - symbol.h * factor) / 2;
  return `<svg viewBox="0 0 40 40" width="40" height="40"><g transform="translate(${offsetX} ${offsetY})">${symbolMarkup(symbol, factor, 0.9).replaceAll('#000', 'currentColor')}</g></svg>`;
};
</script>
