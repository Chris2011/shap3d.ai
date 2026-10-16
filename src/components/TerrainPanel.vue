<template>
  <div v-if="terrainUi.active || terrainUi.chooser" class="tp s3d-panel" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @keydown.stop @pointerdown.stop>
    <div class="head" @pointerdown="startDrag">
      <Icon name="terrain" :size="18" />
      <span class="t">{{ terrainUi.active ? 'Gelände formen' : 'Neues Gelände' }}</span>
      <button class="x" title="Verwerfen und schließen" @pointerdown.stop @click="terrainUi.active ? discardTerrain() : closeChooser(ed)"><Icon name="close" :size="14" /></button>
    </div>

    <!-- chooser -->
    <div v-if="!terrainUi.active" class="body">
      <p class="hint">Tipp: Zeichne ein <b>Rechteck</b>, wähle es aus und starte dann „Gelände“ – das Gelände übernimmt Größe und Lage. Oder lege hier eines an:</p>
      <div class="row2">
        <label>Breite <span class="unit"><input v-model.number="terrainUi.newW" class="s3d-input num" type="number" min="1" max="500" /> m</span></label>
        <label>Tiefe <span class="unit"><input v-model.number="terrainUi.newD" class="s3d-input num" type="number" min="1" max="500" /> m</span></label>
      </div>
      <label class="line">Detail
        <select v-model="terrainUi.detail" class="s3d-input sel">
          <option value="grob">Grob (schnell)</option><option value="mittel">Mittel</option><option value="fein">Fein (mehr Flächen)</option>
        </select>
      </label>
      <label class="s3d-check"><input v-model="terrainUi.startHills" type="checkbox" /> Mit zufälligen Hügeln starten</label>
      <div class="btns"><button class="s3d-btn primary" @click="createNew(ed)">Gelände erstellen</button></div>
    </div>

    <!-- sculpting -->
    <div v-else class="body">
      <div class="info" v-if="st">{{ fmtM(st.w) }} × {{ fmtM(st.d) }} · Raster {{ st.nx }}×{{ st.ny }} ({{ fmtM(st.cell) }}) · Höhe {{ fmtM(st.lo) }} … {{ fmtM(st.hi) }}</div>

      <div class="sect">Pinsel</div>
      <div class="modes">
        <button v-for="(m, i) in MODES" :key="m.id" class="mode" :class="{ on: terrainUi.brush.mode === m.id }" :title="m.tip + ` (Taste ${i + 1})`" @click="setMode(m.id)">
          <span class="mi">{{ m.icon }}</span><span>{{ m.label }}</span>
        </button>
      </div>
      <label class="slider">Größe <input v-model.number="terrainUi.brush.radius" type="range" :min="0.2" :max="maxR" :step="0.1" /><span class="v">Ø {{ fmtM(terrainUi.brush.radius * 2) }}</span></label>
      <label class="slider">Stärke <input v-model.number="terrainUi.brush.strength" type="range" min="0.05" max="1" step="0.05" /><span class="v">{{ Math.round(terrainUi.brush.strength * 100) }} %</span></label>
      <p class="hint small">Maustaste halten = wirkt weiter · <b>Umschalt</b> kehrt Anheben/Absenken um · <b>[ ]</b> Größe · <b>Strg+Z</b> letzter Strich</p>

      <div class="sect">Schnell-Formen</div>
      <div class="gen">
        <button class="s3d-btn small" title="Sanfte Hügel" @click="generate('hills')">〰 Hügel</button>
        <button class="s3d-btn small" title="Hohe Berge" @click="generate('mountains')">⛰ Berge</button>
        <button class="s3d-btn small" title="Alles wieder flach" @click="generate('flat')">▭ Flach</button>
        <button class="s3d-btn small" :disabled="!terrainUi.canUndo" title="Letzten Pinselstrich zurücknehmen (Strg+Z)" @click="undoStroke()">↶</button>
      </div>

      <template v-if="L">
        <div class="sect">Oberflächen <label class="s3d-check inl"><input v-model="L.auto" type="checkbox" @change="refreshLook()" /> automatisch</label></div>
        <div class="layers">
          <div v-for="l in LAYERS" :key="l.key" class="layer" :class="{ dim: !L.auto && l.key !== 'grass' }">
            <span class="sw"><span :style="swatch(L[l.key])"></span></span>
            <span class="ln">{{ l.label }}</span>
            <select v-model="L[l.key]" class="s3d-input lsel" @change="refreshLook()">
              <option v-for="n in matChoices(L[l.key])" :key="n" :value="n">{{ n }}</option>
            </select>
          </div>
        </div>
        <template v-if="L.auto">
          <label class="slider">Fels ab <input v-model.number="L.rockHeight" type="range" :min="0.3" :max="maxH" step="0.1" @input="refreshLook()" /><span class="v">{{ fmtM(L.rockHeight) }}</span></label>
          <label class="slider">Erde ab <input v-model.number="L.earthSlope" type="range" min="10" max="60" step="1" @input="refreshLook()" /><span class="v">{{ L.earthSlope }}° Hang</span></label>
          <label class="slider"><span class="cb"><input type="checkbox" :checked="L.snowHeight != null" @change="toggleSnow" /> Schnee ab</span>
            <input v-model.number="snowH" type="range" :min="0.5" :max="maxH" step="0.1" :disabled="L.snowHeight == null" @input="refreshLook()" /><span class="v">{{ L.snowHeight != null ? fmtM(L.snowHeight) : 'aus' }}</span></label>
        </template>
      </template>

      <div class="sect">Extras</div>
      <label class="s3d-check"><input v-model="d!.skirt" type="checkbox" /> Erdsockel (Seitenwände bis unter das tiefste Tal)</label>
      <label class="slider"><span class="cb"><input type="checkbox" :checked="d!.water != null" @change="toggleWater" /> Wasser</span>
        <input v-model.number="waterH" type="range" :min="minH" :max="maxH" step="0.05" :disabled="d!.water == null" @input="refreshLook()" /><span class="v">{{ d!.water != null ? fmtM(d!.water) : 'aus' }}</span></label>

      <div class="btns">
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

<style scoped>
.tp { position: fixed; width: 290px; max-height: calc(100vh - 110px); display: flex; flex-direction: column; z-index: 60; box-shadow: 0 4px 18px rgba(0, 0, 0, .18); }
.head { display: flex; align-items: center; gap: 8px; padding: 7px 6px 7px 10px; background: var(--s3d-panel-2); cursor: move; color: var(--s3d-navy); user-select: none; }
.t { flex: 1; font-weight: 700; font-size: 13px; }
.x { border: 0; background: transparent; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: var(--s3d-navy); }
.body { padding: 8px 12px 12px; overflow: auto; font-size: 12px; }
.info { font-size: 11px; color: var(--s3d-text-2); margin-bottom: 4px; font-variant-numeric: tabular-nums; }
.sect { font-size: 11px; font-weight: 700; color: var(--s3d-navy); text-transform: uppercase; letter-spacing: .4px; margin: 10px 0 5px; display: flex; align-items: center; gap: 8px; }
.sect .inl { text-transform: none; font-weight: 400; letter-spacing: 0; color: var(--s3d-text); margin-left: auto; }
.modes { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; }
.mode { display: flex; flex-direction: column; align-items: center; gap: 1px; border: 1px solid var(--s3d-line-2); background: var(--s3d-bg); padding: 4px 0; cursor: pointer; font-size: 10.5px; color: var(--s3d-text); }
.mode:hover { border-color: var(--s3d-navy); }
.mode.on { background: var(--s3d-sel); border-color: var(--s3d-navy); color: var(--s3d-navy); font-weight: 700; }
.mi { font-size: 15px; line-height: 16px; }
.slider { display: grid; grid-template-columns: 72px 1fr 74px; align-items: center; gap: 6px; margin-top: 6px; }
.slider input[type=range] { width: 100%; }
.v { text-align: right; font-variant-numeric: tabular-nums; color: var(--s3d-text); white-space: nowrap; }
.cb { display: flex; align-items: center; gap: 4px; }
.hint { color: var(--s3d-text-2); line-height: 1.4; margin: 4px 0 8px; }
.hint.small { font-size: 11px; margin-top: 6px; }
.gen { display: flex; gap: 4px; flex-wrap: wrap; }
.layers { display: flex; flex-direction: column; gap: 3px; }
.layer { display: grid; grid-template-columns: 20px 82px 1fr; align-items: center; gap: 6px; }
.layer.dim { opacity: .45; }
.sw { width: 20px; height: 20px; border: 1px solid rgba(0, 0, 0, .15); position: relative; overflow: hidden; }
.sw > span { position: absolute; inset: 0; }
.lsel { height: 24px; font-size: 12px; padding: 0 4px; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 6px; }
.row2 label, .line { display: flex; flex-direction: column; gap: 3px; }
.unit { display: flex; align-items: center; gap: 4px; }
.num { width: 100%; height: 26px; }
.sel { height: 26px; margin-bottom: 6px; }
.btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
