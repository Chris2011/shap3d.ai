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
        ref="inp"
        class="min-w-0 flex-1 border-0 bg-transparent text-[0.90625rem] text-ink outline-none"
        v-model="palette.query"
        spellcheck="false"
        autocomplete="off"
        :placeholder="placeholder"
        :aria-label="t('palette.search')"
        @keydown="key"
      />
      <span class="text-[0.6875rem] text-muted">{{ rows.length }}{{ rows.length >= LIMIT ? '+' : '' }}</span>
    </div>
    <div ref="listEl" class="min-h-0 overflow-auto py-1" role="listbox">
      <template v-for="(row, i) in rows" :key="row.item.id">
        <div v-if="row.header" class="px-3.5 pt-2 pb-0.75 text-[0.65625rem] font-bold tracking-[0.0375rem] text-muted uppercase">
          {{ row.header }}
        </div>
        <div
          class="flex cursor-pointer items-center gap-2.5 px-3.5 py-1.25 text-[0.8125rem] text-ink"
          role="option"
          :aria-selected="i === sel"
          :class="[i === sel && 'bg-active', row.disabled && 'cursor-default opacity-45']"
          :data-i="i"
          @mousemove="sel = i"
          @click="run(row, $event.shiftKey)"
        >
          <S3dIcon :name="row.item.icon ?? 'chevron'" :size="18" />
          <span class="min-w-0 flex-1 truncate"
            ><template v-for="(segment, segmentIndex) in row.segs" :key="segmentIndex"
              ><b v-if="segment.hit" class="font-bold text-brand-deep dark:text-brand">{{ segment.t }}</b
              ><template v-else>{{ segment.t }}</template></template
            ></span
          >
          <span class="whitespace-nowrap text-[0.6875rem] text-ink-2 max-[35rem]:hidden">{{ row.item.group }}</span>
          <S3dToggleSwitch v-if="row.item.checked" :model-value="row.state" small readonly />
          <kbd v-if="row.item.shortcut" class="s3d-kbd">{{ row.item.shortcut }}</kbd>
        </div>
      </template>
      <div v-if="!rows.length" class="p-3.5 text-ink-2">{{ t('palette.noMatches', { query: palette.query }) }}</div>
    </div>
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
        class="whitespace-nowrap rounded-[10px] border px-1.75 py-px text-[0.6875rem]"
        :class="prefix === '>' ? 'border-brand-deep bg-active text-ink' : 'border-line-2 bg-transparent text-ink-2'"
        @click="setPrefix('>')"
      >
        &gt; {{ t('palette.commands') }}
      </button>
      <button
        class="whitespace-nowrap rounded-[10px] border px-1.75 py-px text-[0.6875rem]"
        :class="prefix === '@' ? 'border-brand-deep bg-active text-ink' : 'border-line-2 bg-transparent text-ink-2'"
        @click="setPrefix('@')"
      >
        @ {{ t('palette.objects') }}
      </button>
      <button
        class="whitespace-nowrap rounded-[10px] border px-1.75 py-px text-[0.6875rem]"
        :class="prefix === '#' ? 'border-brand-deep bg-active text-ink' : 'border-line-2 bg-transparent text-ink-2'"
        @click="setPrefix('#')"
      >
        # {{ t('palette.materials') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import S3dToggleSwitch from './ui/S3dToggleSwitch.vue';
import { ref, shallowRef, computed, onMounted, watch, nextTick } from 'vue';
import S3dIcon from './S3dIcon.vue';
import { useEditor } from './keys';
import { paletteItems, fuzzy, type PaletteItem } from '../engine/palette';
import { palette, closePalette, recentIds, pushRecent } from './paletteState';
import { t, shortcutLabel } from '../i18n';

const LIMIT = 120;
const editor = useEditor();
const inp = shallowRef<HTMLInputElement | null>(null);
const listEl = shallowRef<HTMLDivElement | null>(null);
const sel = ref(0);
const tick = ref(0); // bumps after a toggle so switch states refresh
const items = paletteItems(editor);
const recent = recentIds();

const prefix = computed(() => {
  const first = palette.query.trimStart()[0];
  return first === '>' || first === '@' || first === '#' ? first : '';
});
const text = computed(() => (prefix.value ? palette.query.trimStart().slice(1) : palette.query).trim());
const placeholder = computed(() => t('palette.placeholder'));

interface Row {
  item: PaletteItem;
  segs: { t: string; hit: boolean }[];
  header?: string;
  state: boolean;
  disabled: boolean;
}

const segments = (label: string, hits: number[]) => {
  const set = new Set(hits);
  const out: { t: string; hit: boolean }[] = [];
  for (let i = 0; i < label.length; i++) {
    const hit = set.has(i);
    const last = out[out.length - 1];
    if (last && last.hit === hit) {
      last.t += label[i];
    } else {
      out.push({ t: label[i], hit });
    }
  }
  return out;
};
const kindOk = (item: PaletteItem) => {
  const kind = item.kind ?? 'action';
  if (prefix.value === '>') {
    return kind === 'action';
  }
  if (prefix.value === '@') {
    return kind === 'object';
  }
  if (prefix.value === '#') {
    return kind === 'material';
  }
  return true;
};

const rows = computed<Row[]>(() => {
  void tick.value;
  void editor.ui.revision;
  const query = text.value;
  const make = (item: PaletteItem, hits: number[] = [], header?: string): Row => ({
    item: item,
    segs: segments(item.label, hits),
    header,
    state: !!item.checked?.(),
    disabled: !!item.enabled && !item.enabled(),
  });
  const pool = items.filter(kindOk);
  if (!query) {
    // empty query: recently used first, then actions (objects/materials only behind their prefix)
    const byId = new Map(pool.map((item) => [item.id, item]));
    const rec = recent.map((id) => byId.get(id)).filter((entry): entry is PaletteItem => !!entry);
    const rest = pool.filter((item) => !recent.includes(item.id) && (prefix.value || (item.kind ?? 'action') === 'action'));
    return [
      ...rec.map((item, index) => make(item, [], index === 0 ? t('palette.recent') : undefined)),
      ...rest
        .slice(0, LIMIT)
        .map((item, index) =>
          make(
            item,
            [],
            index === 0
              ? prefix.value === '@'
                ? t('palette.objectsInModel')
                : prefix.value === '#'
                  ? t('palette.materials')
                  : t('palette.allCommands')
              : undefined,
          ),
        ),
    ];
  }
  const scored: { it: PaletteItem; score: number; hits: number[] }[] = [];
  for (const item of pool) {
    const match = fuzzy(query, item.label);
    const extra = !match && `${item.group} ${item.keywords ?? ''}`.toLowerCase().includes(query.toLowerCase());
    if (!match && !extra) {
      continue;
    }
    let score = match ? match.score : 200 - item.label.length * 0.5;
    if (recent.includes(item.id)) {
      score += 40 - recent.indexOf(item.id) * 4;
    }
    if (item.enabled && !item.enabled()) {
      score -= 30;
    }
    scored.push({ it: item, score, hits: match?.hits ?? [] });
  }
  scored.sort((first, second) => second.score - first.score);
  return scored.slice(0, LIMIT).map((scoredItem) => make(scoredItem.it, scoredItem.hits));
});

watch(
  () => palette.query,
  () => {
    sel.value = 0;
    listEl.value?.scrollTo({ top: 0 });
  },
);
watch(sel, async (index) => {
  await nextTick();
  listEl.value?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' });
});

const run = (row: Row | undefined, keepOpen = false) => {
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
    nextTick(() => inp.value?.focus());
  }
};
const setPrefix = (nextPrefix: string) => {
  palette.query = (prefix.value === nextPrefix ? '' : nextPrefix) + text.value;
  inp.value?.focus();
};

const key = (event: KeyboardEvent) => {
  const count = rows.value.length;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    sel.value = count ? (sel.value + 1) % count : 0;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    sel.value = count ? (sel.value - 1 + count) % count : 0;
  } else if (event.key === 'PageDown') {
    event.preventDefault();
    sel.value = Math.min(count - 1, sel.value + 8);
  } else if (event.key === 'PageUp') {
    event.preventDefault();
    sel.value = Math.max(0, sel.value - 8);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    run(rows.value[sel.value], event.shiftKey);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePalette();
  }
};
onMounted(() => {
  inp.value?.focus();
  inp.value?.select();
});
</script>
