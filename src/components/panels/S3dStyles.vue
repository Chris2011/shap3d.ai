<template>
  <div class="s3d-section-title">Vorlagen</div>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-2">
    <button v-for="preset in PRESETS" :key="preset.name" class="flex flex-col items-center gap-1 rounded border bg-surface p-1 text-[0.6875rem]" :class="preset.name === active ? 'border-blue shadow-[0_0_0_1px_var(--s3d-blue)]' : 'border-edge'" @click="apply(preset)">
      <div class="relative h-11 w-full rounded-[2px]" :style="{ background: `linear-gradient(${preset.s.skyColor} 0 55%, ${preset.s.groundColor} 55% 100%)` }"><div class="absolute top-[30%] left-[35%] h-1/2 w-[30%] border-[1.5px]" :style="{ background: preset.s.frontColor, borderColor: preset.s.edgeColor }"></div></div>
      <span>{{ preset.name }}</span>
    </button>
  </div>
  <div class="s3d-section-title">Flächen</div>
  <S3dSegmentedControl class="mb-1.5" :model-value="styleSettings.faceStyle" :options="FACES" @update:model-value="faceStyle => set('faceStyle', faceStyle)" />
  <label class="s3d-check"><input type="checkbox" :checked="styleSettings.xray" @change="set('xray', !styleSettings.xray)" /> Röntgen (Alt+K)</label>
  <div class="s3d-row"><span class="s3d-label">Vorderseite</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="styleSettings.frontColor" @input="set('frontColor', val($event))" /></div>
  <div class="s3d-row"><span class="s3d-label">Rückseite</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="styleSettings.backColor" @input="set('backColor', val($event))" /></div>
  <div class="s3d-section-title">Kanten</div>
  <label class="s3d-check"><input type="checkbox" :checked="styleSettings.edges" @change="set('edges', !styleSettings.edges)" /> Kanten anzeigen</label>
  <div class="s3d-row"><span class="s3d-label">Kantenfarbe</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="styleSettings.edgeColor" @input="set('edgeColor', val($event))" /></div>
  <div class="s3d-section-title">Hintergrund</div>
  <label class="s3d-check"><input type="checkbox" :checked="styleSettings.sky" @change="set('sky', !styleSettings.sky)" /> Himmel</label>
  <div class="s3d-row"><span class="s3d-label">Himmelfarbe</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="styleSettings.skyColor" @input="set('skyColor', val($event))" /></div>
  <label class="s3d-check"><input type="checkbox" :checked="styleSettings.ground" @change="set('ground', !styleSettings.ground)" /> Boden</label>
  <div class="s3d-row"><span class="s3d-label">Bodenfarbe</span><input class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px" type="color" :value="styleSettings.groundColor" @input="set('groundColor', val($event))" /></div>
</template>

<script setup lang="ts">
import S3dSegmentedControl from '../ui/S3dSegmentedControl.vue';
import { useEditor } from '../keys';
import { DEFAULT_STYLE, type StyleSettings, type FaceStyle } from '../../core/document';
import { useModel } from '../../composables/useModel';

const editor = useEditor();
const styleSettings = useModel(() => editor.model.settings.style);
const val = (event: Event) => (event.target as HTMLInputElement).value;
const set = <K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) => { editor.model.settings.style[key] = value; editor.ui.saved = false; editor.invalidate(); };
const FACES: { value: FaceStyle; label: string }[] = [
  { value: 'wireframe', label: 'Draht' }, { value: 'hiddenline', label: 'Verdeckt' }, { value: 'shaded', label: 'Schattiert' }, { value: 'textured', label: 'Texturen' }, { value: 'monochrome', label: 'Mono' },
];
const PRESETS: { name: string; s: StyleSettings }[] = [
  { name: 'Standard', s: { ...DEFAULT_STYLE } },
  { name: 'Architektur', s: { ...DEFAULT_STYLE, skyColor: '#ffffff', groundColor: '#ffffff', sky: false, ground: false, backColor: '#d9d9d9' } },
  { name: 'Blaupause', s: { ...DEFAULT_STYLE, skyColor: '#1d3f78', groundColor: '#1d3f78', sky: false, ground: false, frontColor: '#2b5394', backColor: '#2b5394', edgeColor: '#ffffff', faceStyle: 'monochrome' } },
  { name: 'Skizze', s: { ...DEFAULT_STYLE, skyColor: '#f6f1e3', groundColor: '#efe8d4', frontColor: '#fffaf0', backColor: '#e8e0cc', edgeColor: '#3b3326', faceStyle: 'hiddenline' } },
  { name: 'Nacht', s: { ...DEFAULT_STYLE, skyColor: '#1f2a44', groundColor: '#2c2f33', edgeColor: '#111111' } },
  { name: 'Weiß', s: { ...DEFAULT_STYLE, sky: false, ground: false, skyColor: '#ffffff', groundColor: '#ffffff' } },
];
const active = useModel(() => { const current = styleSettings.value; return PRESETS.find(preset => Object.entries(preset.s).every(([k, value]) => (current as any)[k] === value))?.name; });
const apply = (preset: { s: StyleSettings }) => { editor.commit('Stil', () => Object.assign(editor.model.settings.style, preset.s)); };
</script>
