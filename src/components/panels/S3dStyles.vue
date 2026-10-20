<template>
  <div class="s3d-section-title">{{ t('styles.presets') }}</div>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-2">
    <button
      v-for="preset in PRESETS"
      :key="preset.id"
      class="flex flex-col items-center gap-1 rounded border bg-surface p-1 text-[0.6875rem]"
      :class="preset.id === active ? 'border-blue shadow-[0_0_0_1px_var(--s3d-blue)]' : 'border-edge'"
      @click="apply(preset)"
    >
      <div
        class="relative h-11 w-full rounded-[2px]"
        :style="{ background: `linear-gradient(${preset.s.skyColor} 0 55%, ${preset.s.groundColor} 55% 100%)` }"
      >
        <div
          class="absolute top-[30%] left-[35%] h-1/2 w-[30%] border-[1.5px]"
          :style="{ background: preset.s.frontColor, borderColor: preset.s.edgeColor }"
        ></div>
      </div>
      <span>{{ t(`styles.preset.${preset.id}`) }}</span>
    </button>
  </div>
  <div class="s3d-section-title">{{ t('styles.faces') }}</div>
  <S3dSegmentedControl
    class="mb-1.5"
    :model-value="styleSettings.faceStyle"
    :options="FACES"
    @update:model-value="(faceStyle) => set('faceStyle', faceStyle)"
  />
  <label class="s3d-check"
    ><input type="checkbox" :checked="styleSettings.xray" @change="set('xray', !styleSettings.xray)" /> {{ t('styles.xray') }}</label
  >
  <div class="s3d-row">
    <span class="s3d-label">{{ t('styles.front') }}</span
    ><input
      class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px"
      type="color"
      :value="styleSettings.frontColor"
      @input="set('frontColor', val($event))"
    />
  </div>
  <div class="s3d-row">
    <span class="s3d-label">{{ t('styles.back') }}</span
    ><input
      class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px"
      type="color"
      :value="styleSettings.backColor"
      @input="set('backColor', val($event))"
    />
  </div>
  <div class="s3d-section-title">{{ t('styles.edges') }}</div>
  <label class="s3d-check"
    ><input type="checkbox" :checked="styleSettings.edges" @change="set('edges', !styleSettings.edges)" />
    {{ t('styles.showEdges') }}</label
  >
  <div class="s3d-row">
    <span class="s3d-label">{{ t('styles.edgeColor') }}</span
    ><input
      class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px"
      type="color"
      :value="styleSettings.edgeColor"
      @input="set('edgeColor', val($event))"
    />
  </div>
  <div class="s3d-section-title">{{ t('styles.background') }}</div>
  <label class="s3d-check"
    ><input type="checkbox" :checked="styleSettings.sky" @change="set('sky', !styleSettings.sky)" /> {{ t('styles.sky') }}</label
  >
  <div class="s3d-row">
    <span class="s3d-label">{{ t('styles.skyColor') }}</span
    ><input
      class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px"
      type="color"
      :value="styleSettings.skyColor"
      @input="set('skyColor', val($event))"
    />
  </div>
  <label class="s3d-check"
    ><input type="checkbox" :checked="styleSettings.ground" @change="set('ground', !styleSettings.ground)" />
    {{ t('styles.ground') }}</label
  >
  <div class="s3d-row">
    <span class="s3d-label">{{ t('styles.groundColor') }}</span
    ><input
      class="h-6.5 w-11 rounded-[3px] border border-edge bg-surface p-px"
      type="color"
      :value="styleSettings.groundColor"
      @input="set('groundColor', val($event))"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dSegmentedControl from '../ui/S3dSegmentedControl.vue';
import { useEditor } from '../keys';
import { DEFAULT_STYLE, type StyleSettings, type FaceStyle } from '../../core/document';
import { useModel } from '../../composables/useModel';
import { t } from '../../i18n';

const editor = useEditor();
const styleSettings = useModel(() => editor.model.settings.style);
const val = (event: Event) => (event.target as HTMLInputElement).value;
const set = <K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) => {
  editor.model.settings.style[key] = value;
  editor.ui.saved = false;
  editor.invalidate();
};
const FACES = computed((): { value: FaceStyle; label: string }[] => [
  { value: 'wireframe', label: t('styles.wireframe') },
  { value: 'hiddenline', label: t('styles.hiddenline') },
  { value: 'shaded', label: t('styles.shaded') },
  { value: 'textured', label: t('styles.textured') },
  { value: 'monochrome', label: t('styles.monochrome') },
]);
/** name = message `styles.preset.<id>` */
const PRESETS: { id: string; s: StyleSettings }[] = [
  { id: 'standard', s: { ...DEFAULT_STYLE } },
  {
    id: 'architecture',
    s: { ...DEFAULT_STYLE, skyColor: '#ffffff', groundColor: '#ffffff', sky: false, ground: false, backColor: '#d9d9d9' },
  },
  {
    id: 'blueprint',
    s: {
      ...DEFAULT_STYLE,
      skyColor: '#1d3f78',
      groundColor: '#1d3f78',
      sky: false,
      ground: false,
      frontColor: '#2b5394',
      backColor: '#2b5394',
      edgeColor: '#ffffff',
      faceStyle: 'monochrome',
    },
  },
  {
    id: 'sketch',
    s: {
      ...DEFAULT_STYLE,
      skyColor: '#f6f1e3',
      groundColor: '#efe8d4',
      frontColor: '#fffaf0',
      backColor: '#e8e0cc',
      edgeColor: '#3b3326',
      faceStyle: 'hiddenline',
    },
  },
  { id: 'night', s: { ...DEFAULT_STYLE, skyColor: '#1f2a44', groundColor: '#2c2f33', edgeColor: '#111111' } },
  { id: 'white', s: { ...DEFAULT_STYLE, sky: false, ground: false, skyColor: '#ffffff', groundColor: '#ffffff' } },
];
const active = useModel(() => {
  const current = styleSettings.value;
  return PRESETS.find((preset) => Object.entries(preset.s).every(([k, value]) => (current as any)[k] === value))?.id;
});
const apply = (preset: { s: StyleSettings }) => {
  editor.commit('undo.style', () => Object.assign(editor.model.settings.style, preset.s));
};
</script>
