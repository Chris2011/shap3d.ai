<template>
  <div class="s3d-section-title">Vorlagen</div>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-2">
    <button v-for="p in PRESETS" :key="p.name" class="flex flex-col items-center gap-1 rounded border bg-surface p-1 text-[0.6875rem]" :class="p.name === active ? 'border-blue shadow-[0_0_0_1px_var(--s3d-blue)]' : 'border-edge'" @click="apply(p)">
      <div class="relative h-11 w-full rounded-[2px]" :style="{ background: `linear-gradient(${p.s.skyColor} 0 55%, ${p.s.groundColor} 55% 100%)` }"><div class="absolute top-[30%] left-[35%] h-1/2 w-[30%] border-[1.5px]" :style="{ background: p.s.frontColor, borderColor: p.s.edgeColor }"></div></div>
      <span>{{ p.name }}</span>
    </button>
  </div>
  <div class="s3d-section-title">Flächen</div>
  <div class="mb-1.5 flex overflow-hidden rounded-[3px] border border-edge">
    <button v-for="f in FACES" :key="f.id" class="flex-1 border-r border-edge px-0.5 py-1.25 text-[0.6875rem] last:border-r-0" :class="st.faceStyle === f.id ? 'bg-active font-semibold text-blue' : 'bg-surface'" :title="f.label" @click="set('faceStyle', f.id)">{{ f.label }}</button>
  </div>
  <label class="s3d-check"><input type="checkbox" :checked="st.xray" @change="set('xray', !st.xray)" /> Röntgen (Alt+K)</label>
  <div class="s3d-row"><span class="s3d-label">Vorderseite</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="st.frontColor" @input="set('frontColor', val($event))" /></div>
  <div class="s3d-row"><span class="s3d-label">Rückseite</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="st.backColor" @input="set('backColor', val($event))" /></div>
  <div class="s3d-section-title">Kanten</div>
  <label class="s3d-check"><input type="checkbox" :checked="st.edges" @change="set('edges', !st.edges)" /> Kanten anzeigen</label>
  <div class="s3d-row"><span class="s3d-label">Kantenfarbe</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="st.edgeColor" @input="set('edgeColor', val($event))" /></div>
  <div class="s3d-section-title">Hintergrund</div>
  <label class="s3d-check"><input type="checkbox" :checked="st.sky" @change="set('sky', !st.sky)" /> Himmel</label>
  <div class="s3d-row"><span class="s3d-label">Himmelfarbe</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="st.skyColor" @input="set('skyColor', val($event))" /></div>
  <label class="s3d-check"><input type="checkbox" :checked="st.ground" @change="set('ground', !st.ground)" /> Boden</label>
  <div class="s3d-row"><span class="s3d-label">Bodenfarbe</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="st.groundColor" @input="set('groundColor', val($event))" /></div>
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
