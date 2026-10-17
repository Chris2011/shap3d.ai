<template>
  <div class="backdrop" @pointerdown="closePalette()"></div>
  <div class="palette s3d-panel" role="dialog" aria-label="Befehlspalette">
    <div class="inp">
      <Icon name="search" :size="18" />
      <input ref="inp" v-model="palette.query" spellcheck="false" autocomplete="off" :placeholder="placeholder" aria-label="Suchen"
        @keydown="key" />
      <span class="count">{{ rows.length }}{{ rows.length >= LIMIT ? '+' : '' }}</span>
    </div>
    <div ref="listEl" class="list" role="listbox">
      <template v-for="(r, i) in rows" :key="r.item.id">
        <div v-if="r.header" class="hdr">{{ r.header }}</div>
        <div class="row" role="option" :aria-selected="i === sel" :class="{ on: i === sel, off: r.disabled }" :data-i="i"
          @mousemove="sel = i" @click="run(r, $event.shiftKey)">
          <Icon :name="r.item.icon ?? 'chevron'" :size="18" />
          <span class="lbl"><template v-for="(seg, k) in r.segs" :key="k"><b v-if="seg.hit">{{ seg.t }}</b><template v-else>{{ seg.t }}</template></template></span>
          <span class="grp">{{ r.item.group }}</span>
          <span v-if="r.item.checked" class="sw" :class="{ on: r.state }" :title="r.state ? 'An' : 'Aus'"><i></i></span>
          <kbd v-if="r.item.shortcut">{{ r.item.shortcut }}</kbd>
        </div>
      </template>
      <div v-if="!rows.length" class="empty">Keine Treffer für „{{ palette.query }}“</div>
    </div>
    <div class="foot">
      <span><kbd>↑↓</kbd> wählen</span>
      <span><kbd>Enter</kbd> ausführen</span>
      <span title="Ausführen bzw. umschalten, Palette bleibt offen"><kbd>Umschalt+Enter</kbd> offen lassen</span>
      <span class="sp"></span>
      <button class="pre" :class="{ on: prefix === '>' }" @click="setPrefix('>')">&gt; Befehle</button>
      <button class="pre" :class="{ on: prefix === '@' }" @click="setPrefix('@')">@ Objekte</button>
      <button class="pre" :class="{ on: prefix === '#' }" @click="setPrefix('#')"># Materialien</button>
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
    const extra = m ? null : fuzzy(q, `${it.group} ${it.keywords ?? ''}`);
    if (!m && !extra) continue;
    let score = m ? m.score : extra!.score * 0.4 - 50;
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

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 109; background: rgba(8, 12, 18, .18); }
.palette { position: fixed; left: 50%; top: 56px; transform: translateX(-50%); width: min(660px, calc(100vw - 32px)); z-index: 110; overflow: hidden; display: flex; flex-direction: column; max-height: calc(100vh - 90px); border-radius: 8px; }
.inp { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid var(--s3d-line); color: var(--s3d-text-2); }
.inp input { flex: 1; min-width: 0; border: 0; outline: none; font-size: 14.5px; background: transparent; color: var(--s3d-text); }
.count { font-size: 11px; color: var(--s3d-muted); }
.list { overflow: auto; padding: 4px 0; min-height: 0; }
.hdr { padding: 8px 14px 3px; font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--s3d-muted); }
.row { display: flex; align-items: center; gap: 10px; padding: 5px 14px; cursor: pointer; color: var(--s3d-text); font-size: 13px; }
.row.on { background: var(--s3d-active); }
.row.off { opacity: .45; cursor: default; }
.lbl { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lbl b { color: #0e8ca0; font-weight: 700; }
:root[data-theme="dark"] .lbl b { color: #5fd4e6; }
.grp { color: var(--s3d-text-2); font-size: 11px; white-space: nowrap; }
kbd { font: 10.5px Consolas, monospace; color: var(--s3d-text-2); background: var(--s3d-bg-2); border: 1px solid var(--s3d-line-2); border-bottom-width: 2px; border-radius: 3px; padding: 0 4px; white-space: nowrap; }
.sw { width: 26px; height: 14px; border-radius: 7px; background: var(--s3d-line-2); position: relative; flex: none; transition: background .15s; }
.sw i { position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: #fff; transition: transform .15s; }
.sw.on { background: #0e8ca0; }
.sw.on i { transform: translateX(12px); }
.empty { padding: 14px; color: var(--s3d-text-2); }
.foot { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; padding: 6px 12px; border-top: 1px solid var(--s3d-line); font-size: 11px; color: var(--s3d-text-2); }
.foot .sp { flex: 1; }
.pre { border: 1px solid var(--s3d-line-2); background: transparent; color: var(--s3d-text-2); border-radius: 10px; padding: 1px 7px; white-space: nowrap; font-size: 11px; cursor: pointer; }
.pre.on { border-color: #0e8ca0; color: var(--s3d-text); background: var(--s3d-active); }
@media (max-width: 560px) { .foot > span:not(.sp) { display: none; } .grp { display: none; } }
</style>
