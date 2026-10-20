<template>
  <Teleport to="body">
    <div ref="popup" class="fixed z-[1000] flex overflow-hidden rounded border border-edge bg-panel text-xs text-ink shadow-[var(--s3d-shadow)]" :class="placement.above ? 'flex-col-reverse' : 'flex-col'" :style="placement.style" role="listbox" aria-label="Vorschläge" @mousedown.prevent>
      <div ref="list" class="min-h-0 flex-none overflow-y-auto py-0.5" :style="{ maxHeight: `${ROW_HEIGHT * VISIBLE_ROWS + 4}px` }">
        <div v-for="(item, index) in items" :key="index + item.label" class="flex cursor-pointer items-center gap-1.5 px-1.5" :class="index === selected ? 'bg-sel' : 'hover:bg-hover'" :style="{ height: `${ROW_HEIGHT}px` }" role="option" :aria-selected="index === selected" :data-selected="index === selected || undefined" @mousemove="index !== selected && emit('select', index)" @click="emit('accept', index)">
          <span v-if="item.color" class="size-3 flex-none rounded-full border border-line-2" :style="{ background: item.color }"></span>
          <span v-else class="w-3 flex-none text-center font-mono text-[0.625rem] font-semibold" :class="KIND_STYLE[item.kind].class" :title="KIND_STYLE[item.kind].title">{{ KIND_STYLE[item.kind].glyph }}</span>
          <span class="min-w-0 flex-1 truncate font-mono"><b class="font-semibold">{{ item.label.slice(0, prefixLength(item.label)) }}</b>{{ item.label.slice(prefixLength(item.label)) }}</span>
          <span v-if="item.detail" class="max-w-[45%] flex-none truncate text-[0.6875rem] text-ink-2">{{ item.detail }}</span>
        </div>
      </div>
      <div v-if="current && (current.signature || current.description || current.example)" class="flex-none border-line px-2 py-1.5 select-text" :class="placement.above ? 'border-b' : 'border-t'">
        <div v-if="current.signature" class="font-mono text-[0.6875rem] break-words text-syn-k">{{ current.signature }}</div>
        <div v-if="current.description" class="mt-0.5 text-ink-2">{{ current.description }}</div>
        <pre v-if="current.example" class="mt-1 mb-0 max-h-16 overflow-hidden rounded-[3px] bg-surface-2 px-1.5 py-1 font-mono text-[0.6875rem]/[1.4] whitespace-pre-wrap">{{ current.example }}</pre>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import type { CompletionItem } from '../../scripting/completion';
import type { CompletionKind } from '../../scripting/languages';
import type { CompletionAnchor } from '../../composables/useCodeCompletion';

const props = defineProps<{ items: CompletionItem[]; selected: number; anchor: CompletionAnchor; word: string }>();
const emit = defineEmits<{ select: [index: number]; accept: [index: number] }>();

const ROW_HEIGHT = 22;
const VISIBLE_ROWS = 9;
const WIDTH = 380;
const MARGIN = 6;
const KIND_STYLE: Record<CompletionKind, { glyph: string; title: string; class: string }> = {
  method: { glyph: 'ƒ', title: 'Methode', class: 'text-syn-api' },
  property: { glyph: '•', title: 'Eigenschaft', class: 'text-syn-k' },
  option: { glyph: '{}', title: 'Option', class: 'text-syn-k' },
  value: { glyph: '"', title: 'Wert', class: 'text-syn-s' },
  material: { glyph: '◼', title: 'Material', class: 'text-syn-s' },
  keyword: { glyph: 'k', title: 'Schlüsselwort', class: 'text-syn-b' },
  variable: { glyph: 'x', title: 'Variable', class: 'text-syn-n' },
  unit: { glyph: 'm', title: 'Einheit', class: 'text-syn-n' },
  type: { glyph: 'T', title: 'Typ', class: 'text-syn-b' },
};

const popup = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const current = computed(() => props.items[props.selected]);
/** how many leading characters match what was typed (shown bold) */
const prefixLength = (label: string) => (props.word && label.toLowerCase().startsWith(props.word.toLowerCase()) ? props.word.length : 0);

const height = ref(0);
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const onResize = () => { viewport.value = { width: window.innerWidth, height: window.innerHeight }; };
onMounted(() => window.addEventListener('resize', onResize));
onBeforeUnmount(() => window.removeEventListener('resize', onResize));

/** below the line if it fits (or fits better), otherwise above – always inside the window */
const placement = computed(() => {
  const { width: viewWidth, height: viewHeight } = viewport.value;
  const width = Math.min(WIDTH, viewWidth - 2 * MARGIN);
  const left = Math.max(MARGIN, Math.min(props.anchor.x - 22, viewWidth - width - MARGIN));
  const spaceBelow = viewHeight - props.anchor.bottom - MARGIN, spaceAbove = props.anchor.top - MARGIN;
  const above = height.value > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(80, above ? spaceAbove - 2 : spaceBelow - 2);
  const style: Record<string, string> = { left: `${left}px`, width: `${width}px`, maxHeight: `${maxHeight}px` };
  if (above) style.bottom = `${viewHeight - props.anchor.top + 2}px`; else style.top = `${props.anchor.bottom + 2}px`;
  return { above, style };
});

const measure = () => { if (popup.value) height.value = popup.value.scrollHeight; };
watch(() => [props.items, props.selected], () => nextTick(() => {
  measure();
  list.value?.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' });
}), { immediate: true });
</script>
