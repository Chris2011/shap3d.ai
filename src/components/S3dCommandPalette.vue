<template>
  <div class="fixed inset-0 z-109 bg-[rgba(8,12,18,.18)]" @pointerdown="closePalette()"></div>
  <div
    class="s3d-panel fixed top-14 left-1/2 z-110 flex max-h-[calc(100vh-5.625rem)] w-[min(41.25rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg"
    role="dialog"
    :aria-label="t('palette.title')"
  >
    <div class="flex items-center gap-2 border-b border-line px-3 py-2.25 text-ink-2">
      <S3dIcon name="search" :size="18" />
      <input
        ref="input"
        v-model="palette.query"
        class="min-w-0 flex-1 border-0 bg-transparent text-[0.90625rem] text-ink outline-none"
        spellcheck="false"
        autocomplete="off"
        :placeholder="t('palette.placeholder')"
        :aria-label="t('palette.search')"
        @keydown="key"
      />
      <span class="text-[0.6875rem] text-muted">{{ rows.length }}{{ rows.length >= PALETTE_LIMIT ? '+' : '' }}</span>
    </div>
    <div ref="list" class="min-h-0 overflow-auto py-1" role="listbox">
      <template v-for="(row, i) in rows" :key="row.item.id">
        <div v-if="row.header" class="px-3.5 pt-2 pb-0.75 text-[0.65625rem] font-bold tracking-[0.0375rem] text-muted uppercase">
          {{ row.header }}
        </div>
        <S3dPaletteRow :row="row" :selected="i === selected" :data-i="i" @mousemove="selected = i" @click="run(row, $event.shiftKey)" />
      </template>
      <div v-if="!rows.length" class="p-3.5 text-ink-2">{{ t('palette.noMatches', { query: palette.query }) }}</div>
    </div>
    <S3dPaletteFooter :prefix="prefix" @prefix="setPrefix" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, useTemplateRef } from 'vue';
import S3dIcon from './S3dIcon.vue';
import S3dPaletteFooter from './palette/S3dPaletteFooter.vue';
import S3dPaletteRow from './palette/S3dPaletteRow.vue';
import { useEditor } from './keys';
import { paletteItems } from '../engine/palette';
import { PALETTE_LIMIT, paletteRows, splitPrefix, type PalettePrefix, type PaletteRow } from '../engine/paletteRows';
import { moveSelection } from '../utils/listNavigation';
import { palette, closePalette, recentIds, pushRecent } from './paletteState';
import { t } from '../i18n';

/** Command palette: search commands, objects and materials, run with Enter (Shift+Enter keeps it open). */
const editor = useEditor();
const input = useTemplateRef<HTMLInputElement>('input');
const list = useTemplateRef<HTMLDivElement>('list');
const selected = ref(0);
const tick = ref(0); // bumps after a toggle so switch states refresh
const items = paletteItems(editor);
const recent = recentIds();
const prefix = computed(() => splitPrefix(palette.query).prefix);
const rows = computed(() => {
  void tick.value;
  void editor.ui.revision;
  return paletteRows(items, palette.query, recent);
});

watch(
  () => palette.query,
  () => {
    selected.value = 0;
    list.value?.scrollTo({ top: 0 });
  },
);
watch(selected, async (index) => {
  await nextTick();
  list.value?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' });
});

const run = (row: PaletteRow | undefined, keepOpen = false) => {
  if (!row || row.disabled) {
    return;
  }
  pushRecent(row.item.id);
  if (!keepOpen) {
    closePalette();
  }
  row.item.run();
  if (keepOpen) {
    tick.value++;
    nextTick(() => input.value?.focus());
  }
};
/** a click on the active filter removes it */
const setPrefix = (nextPrefix: PalettePrefix) => {
  palette.query = (prefix.value === nextPrefix ? '' : nextPrefix) + splitPrefix(palette.query).text;
  input.value?.focus();
};
const key = (event: KeyboardEvent) => {
  const moved = moveSelection(event.key, selected.value, rows.value.length);
  if (moved !== undefined) {
    event.preventDefault();
    selected.value = moved;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    run(rows.value[selected.value], event.shiftKey);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePalette();
  }
};
onMounted(() => {
  input.value?.focus();
  input.value?.select();
});
</script>
