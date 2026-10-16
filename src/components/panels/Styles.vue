<template>
  <div class="s3d-section-title">Vorlagen</div>
  <div class="presets">
    <button v-for="p in PRESETS" :key="p.name" class="preset" :class="{ on: p.name === active }" @click="apply(p)">
      <div class="thumb" :style="{ background: `linear-gradient(${p.s.skyColor} 0 55%, ${p.s.groundColor} 55% 100%)` }"><div class="cube" :style="{ background: p.s.frontColor, borderColor: p.s.edgeColor }"></div></div>
      <span>{{ p.name }}</span>
    </button>
  </div>
  <div class="s3d-section-title">Flächen</div>
  <div class="seg">
    <button v-for="f in FACES" :key="f.id" :class="{ on: st.faceStyle === f.id }" :title="f.label" @click="set('faceStyle', f.id)">{{ f.label }}</button>
  </div>
  <label class="s3d-check"><input type="checkbox" :checked="st.xray" @change="set('xray', !st.xray)" /> Röntgen (Alt+K)</label>
  <div class="s3d-row"><span class="s3d-label">Vorderseite</span><input type="color" :value="st.frontColor" @input="set('frontColor', val($event))" /></div>
  <div class="s3d-row"><span class="s3d-label">Rückseite</span><input type="color" :value="st.backColor" @input="set('backColor', val($event))" /></div>
  <div class="s3d-section-title">Kanten</div>
  <label class="s3d-check"><input type="checkbox" :checked="st.edges" @change="set('edges', !st.edges)" /> Kanten anzeigen</label>
  <div class="s3d-row"><span class="s3d-label">Kantenfarbe</span><input type="color" :value="st.edgeColor" @input="set('edgeColor', val($event))" /></div>
  <div class="s3d-section-title">Hintergrund</div>
  <label class="s3d-check"><input type="checkbox" :checked="st.sky" @change="set('sky', !st.sky)" /> Himmel</label>
  <div class="s3d-row"><span class="s3d-label">Himmelfarbe</span><input type="color" :value="st.skyColor" @input="set('skyColor', val($event))" /></div>
  <label class="s3d-check"><input type="checkbox" :checked="st.ground" @change="set('ground', !st.ground)" /> Boden</label>
  <div class="s3d-row"><span class="s3d-label">Bodenfarbe</span><input type="color" :value="st.groundColor" @input="set('groundColor', val($event))" /></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditor } from '../keys';
import { DEFAULT_STYLE, type StyleSettings, type FaceStyle } from '../../core/document';

const ed = useEditor();
const st = computed(() => { void ed.ui.rev; return ed.model.settings.style; });
const val = (e: Event) => (e.target as HTMLInputElement).value;
function set<K extends keyof StyleSettings>(k: K, v: StyleSettings[K]) { ed.model.settings.style[k] = v; ed.ui.saved = false; ed.invalidate(); }
const FACES: { id: FaceStyle; label: string }[] = [
  { id: 'wireframe', label: 'Draht' }, { id: 'hiddenline', label: 'Verdeckt' }, { id: 'shaded', label: 'Schattiert' }, { id: 'textured', label: 'Texturen' }, { id: 'monochrome', label: 'Mono' },
];
const PRESETS: { name: string; s: StyleSettings }[] = [
  { name: 'Standard', s: { ...DEFAULT_STYLE } },
  { name: 'Architektur', s: { ...DEFAULT_STYLE, skyColor: '#ffffff', groundColor: '#ffffff', sky: false, ground: false, backColor: '#d9d9d9' } },
  { name: 'Blaupause', s: { ...DEFAULT_STYLE, skyColor: '#1d3f78', groundColor: '#1d3f78', sky: false, ground: false, frontColor: '#2b5394', backColor: '#2b5394', edgeColor: '#ffffff', faceStyle: 'monochrome' } },
  { name: 'Skizze', s: { ...DEFAULT_STYLE, skyColor: '#f6f1e3', groundColor: '#efe8d4', frontColor: '#fffaf0', backColor: '#e8e0cc', edgeColor: '#3b3326', faceStyle: 'hiddenline' } },
  { name: 'Nacht', s: { ...DEFAULT_STYLE, skyColor: '#1f2a44', groundColor: '#2c2f33', edgeColor: '#111111' } },
  { name: 'Weiß', s: { ...DEFAULT_STYLE, sky: false, ground: false, skyColor: '#ffffff', groundColor: '#ffffff' } },
];
const active = computed(() => { void ed.ui.rev; const s = st.value; return PRESETS.find(p => Object.entries(p.s).every(([k, v]) => (s as any)[k] === v))?.name; });
function apply(p: { s: StyleSettings }) { ed.commit('Stil', () => Object.assign(ed.model.settings.style, p.s)); }
</script>

<style scoped>
.presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.preset { border: 1px solid var(--s3d-border); background: var(--s3d-bg); border-radius: 4px; padding: 4px; cursor: pointer; font-size: 11px; display: flex; flex-direction: column; gap: 4px; align-items: center; }
.preset.on { border-color: var(--s3d-blue); box-shadow: 0 0 0 1px var(--s3d-blue); }
.thumb { width: 100%; height: 44px; border-radius: 2px; position: relative; }
.cube { position: absolute; left: 35%; top: 30%; width: 30%; height: 50%; border: 1.5px solid; }
.seg { display: flex; border: 1px solid var(--s3d-border); border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
.seg button { flex: 1; border: 0; background: var(--s3d-bg); padding: 5px 2px; font-size: 11px; cursor: pointer; border-right: 1px solid var(--s3d-border); }
.seg button:last-child { border-right: 0; }
.seg button.on { background: var(--s3d-active); color: var(--s3d-blue); font-weight: 600; }
input[type=color] { width: 44px; height: 26px; border: 1px solid var(--s3d-border); border-radius: 3px; padding: 1px; background: var(--s3d-bg); }
</style>
