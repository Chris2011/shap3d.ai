<template>
  <div class="fixed inset-0 z-109 bg-[rgba(8,12,18,.18)]" @pointerdown="closePalette()"></div>
  <div class="s3d-panel fixed top-14 left-1/2 z-110 flex max-h-[calc(100vh-90px)] w-[min(660px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-lg" role="dialog" aria-label="Befehlspalette">
    <div class="flex items-center gap-2 border-b border-line px-3 py-[9px] text-ink-2">
      <Icon name="search" :size="18" />
      <input ref="inp" class="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] text-ink outline-none" v-model="palette.query" spellcheck="false" autocomplete="off" :placeholder="placeholder" aria-label="Suchen"
        @keydown="key" />
      <span class="text-[11px] text-muted">{{ rows.length }}{{ rows.length >= LIMIT ? '+' : '' }}</span>
    </div>
    <div ref="listEl" class="min-h-0 overflow-auto py-1" role="listbox">
      <template v-for="(r, i) in rows" :key="r.item.id">
        <div v-if="r.header" class="px-3.5 pt-2 pb-[3px] text-[10.5px] font-bold tracking-[.6px] text-muted uppercase">{{ r.header }}</div>
        <div class="flex cursor-pointer items-center gap-2.5 px-3.5 py-[5px] text-[13px] text-ink" role="option" :aria-selected="i === sel" :class="[i === sel && 'bg-active', r.disabled && 'cursor-default opacity-45']" :data-i="i"
          @mousemove="sel = i" @click="run(r, $event.shiftKey)">
          <Icon :name="r.item.icon ?? 'chevron'" :size="18" />
          <span class="min-w-0 flex-1 truncate"><template v-for="(seg, k) in r.segs" :key="k"><b v-if="seg.hit" class="font-bold text-brand-deep dark:text-brand">{{ seg.t }}</b><template v-else>{{ seg.t }}</template></template></span>
          <span class="whitespace-nowrap text-[11px] text-ink-2 max-[560px]:hidden">{{ r.item.group }}</span>
          <span v-if="r.item.checked" class="relative h-3.5 w-[26px] flex-none rounded-[7px] transition-colors" :class="r.state ? 'bg-brand-deep' : 'bg-line-2'" :title="r.state ? 'An' : 'Aus'"><i class="absolute top-0.5 left-0.5 size-2.5 rounded-full bg-white transition-transform" :class="r.state && 'translate-x-3'"></i></span>
          <kbd v-if="r.item.shortcut" class="s3d-kbd">{{ r.item.shortcut }}</kbd>
        </div>
      </template>
      <div v-if="!rows.length" class="p-3.5 text-ink-2">Keine Treffer für „{{ palette.query }}“</div>
    </div>
    <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-line px-3 py-1.5 text-[11px] text-ink-2 max-[560px]:[&>span:not(.flex-1)]:hidden">
      <span><kbd class="s3d-kbd">↑↓</kbd> wählen</span>
      <span><kbd class="s3d-kbd">Enter</kbd> ausführen</span>
      <span title="Ausführen bzw. umschalten, Palette bleibt offen"><kbd class="s3d-kbd">Umschalt+Enter</kbd> offen lassen</span>
      <span class="flex-1"></span>
      <button class="whitespace-nowrap rounded-[10px] border px-[7px] py-px text-[11px]" :class="prefix === '>' ? 'border-brand-deep bg-active text-ink' : 'border-line-2 bg-transparent text-ink-2'" @click="setPrefix('>')">&gt; Befehle</button>
      <button class="whitespace-nowrap rounded-[10px] border px-[7px] py-px text-[11px]" :class="prefix === '@' ? 'border-brand-deep bg-active text-ink' : 'border-line-2 bg-transparent text-ink-2'" @click="setPrefix('@')">@ Objekte</button>
      <button class="whitespace-nowrap rounded-[10px] border px-[7px] py-px text-[11px]" :class="prefix === '#' ? 'border-brand-deep bg-active text-ink' : 'border-line-2 bg-transparent text-ink-2'" @click="setPrefix('#')"># Materialien</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import { useEditor } from './keys';
import { paletteItems, fuzzy, type PaletteItem } from '../engine/palette';
import { palette, closePalette, recentIds, pushRecent } from './paletteState';

const LIMIT = 120;
const ed = useEditor();
const inp = ref<HTMLInputElement | null>(null); const listEl = ref<HTMLDivElement | null>(null);
const sel = ref(0);
const tick = ref(0); // bumps after a toggle so switch states refresh
const items = paletteItems(ed);
const recent = recentIds();

const prefix = computed(() => { const c = palette.query.trimStart()[0]; return c === '>' || c === '@' || c === '#' ? c : ''; });
const text = computed(() => (prefix.value ? palette.query.trimStart().slice(1) : palette.query).trim());
const placeholder = 'Alles suchen: Werkzeuge, Befehle, Panels, Schalter, Materialien …';

interface Row { item: PaletteItem; segs: { t: string; hit: boolean }[]; header?: string; state: boolean; disabled: boolean }

function segments(label: string, hits: number[]) {
  const set = new Set(hits); const out: { t: string; hit: boolean }[] = [];
  for (let i = 0; i < label.length; i++) {
    const hit = set.has(i); const last = out[out.length - 1];
    if (last && last.hit === hit) last.t += label[i]; else out.push({ t: label[i], hit });
  }
  return out;
}
function kindOk(it: PaletteItem) {
  const k = it.kind ?? 'action';
  if (prefix.value === '>') return k === 'action';
  if (prefix.value === '@') return k === 'object';
  if (prefix.value === '#') return k === 'material';
  return true;
}

const rows = computed<Row[]>(() => {
  void tick.value; void ed.ui.rev;
  const q = text.value;
  const make = (it: PaletteItem, hits: number[] = [], header?: string): Row =>
    ({ item: it, segs: segments(it.label, hits), header, state: !!it.checked?.(), disabled: !!it.enabled && !it.enabled() });
  const pool = items.filter(kindOk);
  if (!q) {
    // empty query: recently used first, then actions (objects/materials only behind their prefix)
    const byId = new Map(pool.map(i => [i.id, i]));
    const rec = recent.map(id => byId.get(id)).filter((x): x is PaletteItem => !!x);
    const rest = pool.filter(i => !recent.includes(i.id) && (prefix.value || (i.kind ?? 'action') === 'action'));
    return [
      ...rec.map((it, k) => make(it, [], k === 0 ? 'Zuletzt verwendet' : undefined)),
      ...rest.slice(0, LIMIT).map((it, k) => make(it, [], k === 0 ? (prefix.value === '@' ? 'Objekte im Modell' : prefix.value === '#' ? 'Materialien' : 'Alle Befehle') : undefined)),
    ];
  }
  const scored: { it: PaletteItem; score: number; hits: number[] }[] = [];
  for (const it of pool) {
    const m = fuzzy(q, it.label);
    const extra = !m && `${it.group} ${it.keywords ?? ''}`.toLowerCase().includes(q.toLowerCase());
    if (!m && !extra) continue;
    let score = m ? m.score : 200 - (it.label.length * 0.5);
    if (recent.includes(it.id)) score += 40 - recent.indexOf(it.id) * 4;
    if (it.enabled && !it.enabled()) score -= 30;
    scored.push({ it, score, hits: m?.hits ?? [] });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, LIMIT).map(s => make(s.it, s.hits));
});

watch(() => palette.query, () => { sel.value = 0; listEl.value?.scrollTo({ top: 0 }); });
watch(sel, async i => { await nextTick(); listEl.value?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }); });

function run(r: Row | undefined, keepOpen = false) {
  if (!r || r.disabled) return;
  pushRecent(r.item.id);
  if (!keepOpen) closePalette();
  r.item.run();
  if (keepOpen) { tick.value++; nextTick(() => inp.value?.focus()); }
}
function setPrefix(p: string) { palette.query = (prefix.value === p ? '' : p) + text.value; inp.value?.focus(); }

function key(e: KeyboardEvent) {
  const n = rows.value.length;
  if (e.key === 'ArrowDown') { e.preventDefault(); sel.value = n ? (sel.value + 1) % n : 0; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel.value = n ? (sel.value - 1 + n) % n : 0; }
  else if (e.key === 'PageDown') { e.preventDefault(); sel.value = Math.min(n - 1, sel.value + 8); }
  else if (e.key === 'PageUp') { e.preventDefault(); sel.value = Math.max(0, sel.value - 8); }
  else if (e.key === 'Enter') { e.preventDefault(); run(rows.value[sel.value], e.shiftKey); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
}
onMounted(() => { inp.value?.focus(); inp.value?.select(); });
</script>
