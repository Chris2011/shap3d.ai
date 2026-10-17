<template>
  <div v-if="terrainUi.active || terrainUi.chooser" class="s3d-panel fixed z-60 flex max-h-[calc(100vh-110px)] w-[290px] flex-col shadow-[0_4px_18px_rgba(0,0,0,.18)]" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @keydown.stop @pointerdown.stop>
    <div class="flex cursor-move items-center gap-2 bg-panel-2 py-[7px] pr-1.5 pl-2.5 text-navy select-none" @pointerdown="startDrag">
      <Icon name="terrain" :size="18" />
      <span class="flex-1 text-[13px] font-bold">{{ terrainUi.active ? 'Gelände formen' : 'Neues Gelände' }}</span>
      <button class="flex size-6 items-center justify-center bg-transparent text-navy" title="Verwerfen und schließen" @pointerdown.stop @click="terrainUi.active ? discardTerrain() : closeChooser(ed)"><Icon name="close" :size="14" /></button>
    </div>

    <!-- chooser -->
    <div v-if="!terrainUi.active" class="overflow-auto px-3 pt-2 pb-3 text-xs">
      <p class="mt-1 mb-2 leading-[1.4] text-ink-2">Tipp: Zeichne ein <b>Rechteck</b>, wähle es aus und starte dann „Gelände“ – das Gelände übernimmt Größe und Lage. Oder lege hier eines an:</p>
      <div class="mb-1.5 grid grid-cols-[repeat(2,1fr)] gap-2 [&>label]:flex [&>label]:flex-col [&>label]:gap-[3px]">
        <label>Breite <span class="flex items-center gap-1"><input v-model.number="terrainUi.newW" class="s3d-input h-6.5 w-full" type="number" min="1" max="500" /> m</span></label>
        <label>Tiefe <span class="flex items-center gap-1"><input v-model.number="terrainUi.newD" class="s3d-input h-6.5 w-full" type="number" min="1" max="500" /> m</span></label>
      </div>
      <label class="flex flex-col gap-[3px]">Detail
        <select v-model="terrainUi.detail" class="s3d-input mb-1.5 h-6.5">
          <option value="grob">Grob (schnell)</option><option value="mittel">Mittel</option><option value="fein">Fein (mehr Flächen)</option>
        </select>
      </label>
      <label class="s3d-check"><input v-model="terrainUi.startHills" type="checkbox" /> Mit zufälligen Hügeln starten</label>
      <div class="mt-3 flex justify-end gap-2"><button class="s3d-btn primary" @click="createNew(ed)">Gelände erstellen</button></div>
    </div>

    <!-- sculpting -->
    <div v-else class="overflow-auto px-3 pt-2 pb-3 text-xs">
      <div v-if="st" class="mb-1 text-[11px] text-ink-2 tabular-nums">{{ fmtM(st.w) }} × {{ fmtM(st.d) }} · Raster {{ st.nx }}×{{ st.ny }} ({{ fmtM(st.cell) }}) · Höhe {{ fmtM(st.lo) }} … {{ fmtM(st.hi) }}</div>

      <div class="mt-2.5 mb-[5px] flex items-center gap-2 text-[11px] font-bold tracking-[.4px] text-navy uppercase">Pinsel</div>
      <div class="grid grid-cols-[repeat(5,1fr)] gap-[3px]">
        <button v-for="(m, i) in MODES" :key="m.id" class="flex flex-col items-center gap-px border py-1 text-[10.5px]" :class="terrainUi.brush.mode === m.id ? 'border-navy bg-sel font-bold text-navy' : 'border-line-2 bg-surface text-ink hover:border-navy'" :title="m.tip + ` (Taste ${i + 1})`" @click="setMode(m.id)">
          <span class="text-[15px]/4">{{ m.icon }}</span><span>{{ m.label }}</span>
        </button>
      </div>
      <label class="mt-1.5 grid grid-cols-[72px_1fr_74px] items-center gap-1.5 [&_input[type=range]]:w-full">Größe <input v-model.number="terrainUi.brush.radius" type="range" :min="0.2" :max="maxR" :step="0.1" /><span class="whitespace-nowrap text-right text-ink tabular-nums">Ø {{ fmtM(terrainUi.brush.radius * 2) }}</span></label>
      <label class="mt-1.5 grid grid-cols-[72px_1fr_74px] items-center gap-1.5 [&_input[type=range]]:w-full">Stärke <input v-model.number="terrainUi.brush.strength" type="range" min="0.05" max="1" step="0.05" /><span class="whitespace-nowrap text-right text-ink tabular-nums">{{ Math.round(terrainUi.brush.strength * 100) }} %</span></label>
      <p class="mt-1.5 mb-2 text-[11px]/[1.4] text-ink-2">Maustaste halten = wirkt weiter · <b>Umschalt</b> kehrt Anheben/Absenken um · <b>[ ]</b> Größe · <b>Strg+Z</b> letzter Strich</p>

      <div class="mt-2.5 mb-[5px] flex items-center gap-2 text-[11px] font-bold tracking-[.4px] text-navy uppercase">Schnell-Formen</div>
      <div class="flex flex-wrap gap-1">
        <button class="s3d-btn small" title="Sanfte Hügel" @click="generate('hills')">〰 Hügel</button>
        <button class="s3d-btn small" title="Hohe Berge" @click="generate('mountains')">⛰ Berge</button>
        <button class="s3d-btn small" title="Alles wieder flach" @click="generate('flat')">▭ Flach</button>
        <button class="s3d-btn small" :disabled="!terrainUi.canUndo" title="Letzten Pinselstrich zurücknehmen (Strg+Z)" @click="undoStroke()">↶</button>
      </div>

      <template v-if="L">
        <div class="mt-2.5 mb-[5px] flex items-center gap-2 text-[11px] font-bold tracking-[.4px] text-navy uppercase">Oberflächen <label class="s3d-check ml-auto font-normal tracking-normal text-ink normal-case"><input v-model="L.auto" type="checkbox" @change="refreshLook()" /> automatisch</label></div>
        <div class="flex flex-col gap-[3px]">
          <div v-for="l in LAYERS" :key="l.key" class="grid grid-cols-[20px_82px_1fr] items-center gap-1.5" :class="{ 'opacity-45': !L.auto && l.key !== 'grass' }">
            <span class="relative size-5 overflow-hidden border border-black/15"><span class="absolute inset-0" :style="swatch(L[l.key])"></span></span>
            <span>{{ l.label }}</span>
            <select v-model="L[l.key]" class="s3d-input h-6 px-1 text-xs" @change="refreshLook()">
              <option v-for="n in matChoices(L[l.key])" :key="n" :value="n">{{ n }}</option>
            </select>
          </div>
        </div>
        <template v-if="L.auto">
          <label class="mt-1.5 grid grid-cols-[72px_1fr_74px] items-center gap-1.5 [&_input[type=range]]:w-full">Fels ab <input v-model.number="L.rockHeight" type="range" :min="0.3" :max="maxH" step="0.1" @input="refreshLook()" /><span class="whitespace-nowrap text-right text-ink tabular-nums">{{ fmtM(L.rockHeight) }}</span></label>
          <label class="mt-1.5 grid grid-cols-[72px_1fr_74px] items-center gap-1.5 [&_input[type=range]]:w-full">Erde ab <input v-model.number="L.earthSlope" type="range" min="10" max="60" step="1" @input="refreshLook()" /><span class="whitespace-nowrap text-right text-ink tabular-nums">{{ L.earthSlope }}° Hang</span></label>
          <label class="mt-1.5 grid grid-cols-[72px_1fr_74px] items-center gap-1.5 [&_input[type=range]]:w-full"><span class="flex items-center gap-1"><input type="checkbox" :checked="L.snowHeight != null" @change="toggleSnow" /> Schnee ab</span>
            <input v-model.number="snowH" type="range" :min="0.5" :max="maxH" step="0.1" :disabled="L.snowHeight == null" @input="refreshLook()" /><span class="whitespace-nowrap text-right text-ink tabular-nums">{{ L.snowHeight != null ? fmtM(L.snowHeight) : 'aus' }}</span></label>
        </template>
      </template>

      <div class="mt-2.5 mb-[5px] flex items-center gap-2 text-[11px] font-bold tracking-[.4px] text-navy uppercase">Extras</div>
      <label class="s3d-check"><input v-model="d!.skirt" type="checkbox" /> Erdsockel (Seitenwände bis unter das tiefste Tal)</label>
      <label class="mt-1.5 grid grid-cols-[72px_1fr_74px] items-center gap-1.5 [&_input[type=range]]:w-full"><span class="flex items-center gap-1"><input type="checkbox" :checked="d!.water != null" @change="toggleWater" /> Wasser</span>
        <input v-model.number="waterH" type="range" :min="minH" :max="maxH" step="0.05" :disabled="d!.water == null" @input="refreshLook()" /><span class="whitespace-nowrap text-right text-ink tabular-nums">{{ d!.water != null ? fmtM(d!.water) : 'aus' }}</span></label>

      <div class="mt-3 flex justify-end gap-2">
        <button class="s3d-btn" title="Alles verwerfen" @click="discardTerrain()">Verwerfen</button>
        <button class="s3d-btn primary" title="Als Gruppe ins Modell übernehmen (Enter) – später per Rechtsklick wieder bearbeitbar" @click="applyTerrain()">Übernehmen</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import Icon from './Icon.vue';
import { useEditor } from './keys';
import { terrainUi, terrainData, createNew, applyTerrain, discardTerrain, closeChooser, generate, undoStroke, refreshLook, stats } from '../terrain/session';
import type { BrushMode, TerrainLayers } from '../core/terrain';
import { MATERIAL_LIBRARY, libraryMaterial } from '../core/materialLibrary';
import { makeTexture, isTextureKind } from '../core/textures';

const ed = useEditor();
const MODES: { id: BrushMode; label: string; icon: string; tip: string }[] = [
  { id: 'raise', label: 'Anheben', icon: '▲', tip: 'Hügel und Berge aufschütten' },
  { id: 'lower', label: 'Absenken', icon: '▼', tip: 'Täler, Mulden und Seen graben' },
  { id: 'smooth', label: 'Glätten', icon: '≈', tip: 'Kanten und Spitzen weich machen' },
  { id: 'flatten', label: 'Ebnen', icon: '▬', tip: 'Auf die Höhe des Klickpunkts einebnen (Bauplatz, Plateau)' },
  { id: 'rough', label: 'Zerklüften', icon: '✶', tip: 'Unebenheiten für Felsen und Geröll' },
];
const LAYERS: { key: 'grass' | 'earth' | 'rock' | 'snow'; label: string }[] = [
  { key: 'grass', label: 'Ebene' }, { key: 'earth', label: 'Hang / Tal' }, { key: 'rock', label: 'Berg / Klippe' }, { key: 'snow', label: 'Gipfel' },
];

const d = computed(() => { void terrainUi.rev; return terrainData(); });
const L = computed<TerrainLayers | null>(() => d.value?.layers ?? null);
const st = computed(() => { void terrainUi.rev; return stats(); });
const maxR = computed(() => (d.value ? +(Math.max(d.value.w, d.value.d) / 2).toFixed(1) : 10));
const maxH = computed(() => (d.value ? Math.max(5, Math.ceil(Math.max(d.value.w, d.value.d) * 0.5)) : 10));
const minH = computed(() => -maxH.value / 2);

const snowH = computed({ get: () => L.value?.snowHeight ?? maxH.value * 0.6, set: v => { if (L.value && L.value.snowHeight != null) L.value.snowHeight = v; } });
const waterH = computed({ get: () => d.value?.water ?? 0, set: v => { if (d.value && d.value.water != null) d.value.water = v; } });
function toggleSnow(e: Event) { if (!L.value) return; L.value.snowHeight = (e.target as HTMLInputElement).checked ? +(maxH.value * 0.6).toFixed(1) : null; refreshLook(); }
function toggleWater(e: Event) { if (!d.value) return; d.value.water = (e.target as HTMLInputElement).checked ? Math.min(0, (st.value?.lo ?? 0) + 0.3) : null; refreshLook(); }
function setMode(m: BrushMode) { terrainUi.brush.mode = m; ed.refreshStatus(); }

// terrain works at landscape scale – always metres, whatever the model unit is
const fmtM = (v: number) => `${(Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)).replace('.', ',').replace(/,?0+$/, '') || '0'} m`;

/** Natural surfaces first, then whatever the model already has. */
function matChoices(current: string) {
  const nat = MATERIAL_LIBRARY.filter(m => m.category === 'Natur' || m.category === 'Stein & Mineral').map(m => m.name);
  const own = ed.model.materials.map(m => m.name);
  return [...new Set([current, ...nat, ...own])];
}
const urls = new Map<string, string>();
function swatch(name: string) {
  const m = ed.model.materials.find(x => x.name === name); const lib = libraryMaterial(name);
  const color = m?.color ?? lib?.color ?? '#888888'; const kind = m?.texture ?? lib?.texture;
  const s: Record<string, string> = { backgroundColor: color };
  if (kind && isTextureKind(kind)) {
    const key = kind + color; let u = urls.get(key);
    if (!u) { u = (makeTexture(kind, color).image as HTMLCanvasElement).toDataURL('image/jpeg', 0.8); urls.set(key, u); }
    s.backgroundImage = `url(${u})`; s.backgroundSize = 'cover';
  }
  return s;
}

// draggable window
const pos = reactive({ x: 60, y: 56 });
function startDrag(e: PointerEvent) {
  const sx = e.clientX - pos.x, sy = e.clientY - pos.y;
  const mv = (ev: PointerEvent) => { pos.x = Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - sx)); pos.y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - sy)); };
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
</script>
