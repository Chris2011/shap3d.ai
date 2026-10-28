<template>
  <div class="s3d-nz">
    <div class="s3d-nz-tabs">
      <button v-for="name in TABS" :key="name" :class="{ active: tab === name }" @click="tab = name">{{ t(`noise.tabs.${name}`) }}</button>
    </div>

    <section v-if="tab === 'terrain'" class="s3d-nz-section">
      <p v-if="editing" class="s3d-nz-status">{{ t('noise.terrain.editing', { name: editing.name || editing.definition.name }) }}</p>
      <p v-else class="s3d-nz-hint">{{ t('noise.terrain.hint') }}</p>
      <div class="s3d-nz-presets">
        <button v-for="preset in PRESET_NAMES" :key="preset" :title="t(`noise.presets.${preset}Title`)" @click="applyPreset(preset)">
          {{ t(`noise.presets.${preset}`) }}
        </button>
      </div>

      <div class="s3d-nz-heading">{{ t('noise.terrain.size') }}</div>
      <S3dNoiseSlider v-model="settings.width" :label="t('noise.terrain.width')" :min="2" :max="300" />
      <S3dNoiseSlider v-model="settings.depth" :label="t('noise.terrain.depth')" :min="2" :max="300" />
      <S3dNoiseSlider v-model="settings.detail" :label="t('noise.terrain.detail')" :min="8" :max="120" />

      <div class="s3d-nz-heading">{{ t('noise.terrain.noise') }}</div>
      <label class="s3d-nz-slider">
        <span>{{ t('noise.terrain.mode') }}</span>
        <select v-model="settings.mode" class="s3d-input" style="grid-column: span 2">
          <option v-for="mode in MODES" :key="mode" :value="mode">{{ t(`noise.modes.${mode}`) }}</option>
        </select>
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="settings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="settings.seed = randomSeed()">🎲</button>
      </div>
      <S3dNoiseSlider v-model="settings.scale" :label="t('noise.terrain.scale')" :min="1" :max="150" :step="0.5" />
      <S3dNoiseSlider v-model="settings.height" :label="t('noise.terrain.height')" :min="0" :max="60" :step="0.1" />
      <S3dNoiseSlider v-model="settings.octaves" :label="t('noise.terrain.octaves')" :min="1" :max="10" />
      <S3dNoiseSlider v-model="settings.persistence" :label="t('noise.terrain.persistence')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="settings.lacunarity" :label="t('noise.terrain.lacunarity')" :min="1" :max="4" :step="0.05" />
      <S3dNoiseSlider v-model="settings.exponent" :label="t('noise.terrain.exponent')" :min="0.3" :max="3" :step="0.05" />
      <S3dNoiseSlider v-model="settings.warp" :label="t('noise.terrain.warp')" :min="0" :max="1.5" :step="0.05" />

      <div class="s3d-nz-heading">{{ t('noise.terrain.shape') }}</div>
      <S3dNoiseSlider v-model="settings.falloff" :label="t('noise.terrain.falloff')" :min="0" :max="1" :step="0.05" />
      <S3dNoiseSlider v-model="settings.terraces" :label="t('noise.terrain.terraces')" :min="0" :max="10" :step="0.1" />
      <S3dNoiseSlider
        v-if="settings.terraces > 0"
        v-model="settings.terraceSharpness"
        :label="t('noise.terrain.terraceSharpness')"
        :min="0"
        :max="1"
        :step="0.05"
      />
      <label class="s3d-check">
        <input v-model="hasWater" type="checkbox" />
        {{ t('noise.terrain.water') }}
      </label>
      <S3dNoiseSlider v-if="hasWater" v-model="waterLevel" :label="t('noise.terrain.waterLevel')" :min="-5" :max="30" :step="0.1" />
      <label class="s3d-check">
        <input v-model="hasSnow" type="checkbox" />
        {{ t('noise.terrain.snow') }}
      </label>
      <S3dNoiseSlider v-if="hasSnow" v-model="snowLine" :label="t('noise.terrain.snowLine')" :min="0" :max="60" :step="0.1" />
      <label class="s3d-check">
        <input v-model="settings.skirt" type="checkbox" />
        {{ t('noise.terrain.skirt') }}
      </label>

      <label class="s3d-check">
        <input v-model="live" type="checkbox" />
        {{ t('noise.terrain.preview') }}
      </label>
      <p class="s3d-nz-hint">{{ stats }}</p>
      <div class="s3d-nz-row">
        <button class="s3d-btn primary" @click="create(!!editing)">
          {{ editing ? t('noise.terrain.apply') : t('noise.terrain.create') }}
        </button>
        <button v-if="editing" class="s3d-btn" @click="create(false)">{{ t('noise.terrain.createNew') }}</button>
      </div>
      <p class="s3d-nz-hint">{{ t('noise.terrain.sculptHint') }}</p>
    </section>

    <section v-else-if="tab === 'scatter'" class="s3d-nz-section">
      <p class="s3d-nz-hint">{{ t('noise.scatter.hint') }}</p>
      <p class="s3d-nz-status">{{ t(`noise.scatter.target.${scatterTarget.kind}`, { count: scatterTarget.count }) }}</p>
      <div class="s3d-nz-checks">
        <label v-for="kind in OBJECT_KINDS" :key="kind" class="s3d-check">
          <input v-model="scatterSettings.objects" type="checkbox" :value="kind" />
          {{ t(`noise.objects.${kind}`) }}
        </label>
      </div>
      <label class="s3d-nz-slider">
        <span>{{ t('noise.scatter.component') }}</span>
        <select v-model="scatterSettings.component" class="s3d-input" style="grid-column: span 2">
          <option value="">–</option>
          <option v-for="name in componentNames" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <S3dNoiseSlider v-model="scatterSettings.spacing" :label="t('noise.scatter.spacing')" :min="0.5" :max="20" :step="0.1" />
      <S3dNoiseSlider v-model="scatterSettings.density" :label="t('noise.scatter.density')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="scatterSettings.clumping" :label="t('noise.scatter.clumping')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="scatterSettings.clumpSize" :label="t('noise.scatter.clumpSize')" :min="2" :max="100" :step="0.5" />
      <S3dNoiseSlider v-model="scatterSettings.maxSlope" :label="t('noise.scatter.maxSlope')" :min="0" :max="90" />
      <S3dNoiseSlider v-model="scatterSettings.sizeMin" :label="t('noise.scatter.sizeMin')" :min="0.1" :max="3" :step="0.05" />
      <S3dNoiseSlider v-model="scatterSettings.sizeMax" :label="t('noise.scatter.sizeMax')" :min="0.1" :max="3" :step="0.05" />
      <template v-if="scatterTarget.kind === 'path'">
        <S3dNoiseSlider v-model="scatterSettings.offset" :label="t('noise.scatter.offset')" :min="0" :max="20" :step="0.1" />
        <label class="s3d-check">
          <input v-model="scatterSettings.alongPath" type="checkbox" />
          {{ t('noise.scatter.alongPath') }}
        </label>
      </template>
      <label v-if="scatterTarget.kind === 'faces'" class="s3d-check">
        <input v-model="scatterSettings.align" type="checkbox" />
        {{ t('noise.scatter.align') }}
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="scatterSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="scatterSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" @click="runScatter">{{ t('noise.scatter.run') }}</button>
    </section>

    <section v-else-if="tab === 'paving'" class="s3d-nz-section">
      <p class="s3d-nz-hint">{{ t('noise.paving.hint') }}</p>
      <p class="s3d-nz-status">
        {{ selectedFaces ? t('noise.paving.onFaces', { count: selectedFaces }) : t('noise.paving.onArea') }}
      </p>
      <div class="s3d-nz-presets">
        <button
          v-for="preset in PAVING_PRESET_NAMES"
          :key="preset"
          :title="t(`noise.paving.presets.${preset}Title`)"
          @click="applyPavingPreset(preset)"
        >
          {{ t(`noise.paving.presets.${preset}`) }}
        </button>
      </div>
      <template v-if="!selectedFaces">
        <S3dNoiseSlider v-model="pavingSettings.width" :label="t('noise.terrain.width')" :min="0.5" :max="50" :step="0.1" />
        <S3dNoiseSlider v-model="pavingSettings.depth" :label="t('noise.terrain.depth')" :min="0.5" :max="50" :step="0.1" />
      </template>
      <S3dNoiseSlider v-model="pavingSettings.size" :label="t('noise.paving.size')" :min="0.05" :max="2" :step="0.01" />
      <S3dNoiseSlider v-model="pavingSettings.gap" :label="t('noise.paving.gap')" :min="0.002" :max="0.1" :step="0.001" />
      <S3dNoiseSlider v-model="pavingSettings.jitter" :label="t('noise.paving.jitter')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="pavingSettings.stretch" :label="t('noise.paving.stretch')" :min="0.5" :max="4" :step="0.05" />
      <S3dNoiseSlider v-model="pavingSettings.thickness" :label="t('noise.paving.thickness')" :min="0.005" :max="0.4" :step="0.005" />
      <S3dNoiseSlider v-model="pavingSettings.variation" :label="t('noise.paving.variation')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="pavingSettings.bevel" :label="t('noise.paving.bevel')" :min="0" :max="0.08" :step="0.001" />
      <S3dNoiseSlider v-model="pavingSettings.shades" :label="t('noise.paving.shades')" :min="1" :max="6" />
      <label class="s3d-nz-slider">
        <span>{{ t('noise.paving.color') }}</span>
        <input v-model="pavingSettings.color" class="s3d-input" type="color" style="grid-column: span 2" />
      </label>
      <label class="s3d-check">
        <input v-model="pavingSettings.joint" type="checkbox" />
        {{ t('noise.paving.joint') }}
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="pavingSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="pavingSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" @click="runPaving">{{ t('noise.paving.run') }}</button>
    </section>

    <section v-else-if="tab === 'deform'" class="s3d-nz-section">
      <p class="s3d-nz-hint">{{ t('noise.deform.hint') }}</p>
      <S3dNoiseSlider v-model="deformSettings.amount" :label="t('noise.deform.amount')" :min="0" :max="3" :step="0.01" />
      <S3dNoiseSlider v-model="deformSettings.scale" :label="t('noise.deform.scale')" :min="0.05" :max="20" :step="0.05" />
      <S3dNoiseSlider v-model="deformSettings.detail" :label="t('noise.deform.detail')" :min="0.02" :max="5" :step="0.01" />
      <div class="s3d-nz-heading">{{ t('noise.deform.shape') }}</div>
      <S3dNoiseSlider v-model="deformSettings.twist" :label="t('noise.deform.twist')" :min="-360" :max="360" />
      <S3dNoiseSlider v-model="deformSettings.taper" :label="t('noise.deform.taper')" :min="0" :max="2" :step="0.01" />
      <S3dNoiseSlider v-model="deformSettings.bend" :label="t('noise.deform.bend')" :min="-180" :max="180" />
      <div class="s3d-nz-heading">{{ t('noise.terrain.noise') }}</div>
      <S3dNoiseSlider v-model="deformSettings.octaves" :label="t('noise.terrain.octaves')" :min="1" :max="8" />
      <label class="s3d-nz-slider">
        <span>{{ t('noise.terrain.mode') }}</span>
        <select v-model="deformSettings.mode" class="s3d-input" style="grid-column: span 2">
          <option v-for="mode in MODES" :key="mode" :value="mode">{{ t(`noise.modes.${mode}`) }}</option>
        </select>
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="deformSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="deformSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" :disabled="!selectedGroups" @click="runDeform">
        {{ t('noise.deform.run', { count: selectedGroups }) }}
      </button>
    </section>

    <section v-else class="s3d-nz-section">
      <p class="s3d-nz-hint">{{ t('noise.script.hint') }}</p>
      <code v-for="line in SCRIPT_LINES" :key="line" class="s3d-nz-code">{{ line }}</code>
      <p class="s3d-nz-hint">{{ t('noise.script.shader') }}</p>
      <code class="s3d-nz-code">s3d.material('…', '#6f8f3a', { shader: 'noise.noise', params: { color2: '#2f3a2c', mode: 1 } })</code>
      <code class="s3d-nz-code">s3d.material('…', '#a39a8c', { shader: 'noise.cells', params: { joint: 0.08 } })</code>
      <button class="s3d-btn" @click="openExample">{{ t('noise.script.open') }}</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import type * as THREE from 'three';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { Instance } from '../../../src/core/model';
import S3dNoiseSlider from './S3dNoiseSlider.vue';
import { lastCreated, type NoiseTerrainData } from './actions';
import { EXAMPLE } from './example';
import { OBJECT_KINDS } from './objects';
import { hidePreview, showPreview } from './preview';
import { PAVING_DEFAULTS } from './paving';
import { PAVING_PRESETS, PAVING_PRESET_NAMES, PRESETS, PRESET_NAMES, type PavingPresetName, type PresetName } from './presets';
import { pluginContext, t } from './runtime';
import { TABS, onTabRequest, type PanelTab } from './tabs';
import { TERRAIN_DEFAULTS, gridRange, normaliseSettings, type TerrainSettings } from './terrain';

const MODES = ['fbm', 'ridged', 'billow'] as const;
const SCRIPT_LINES = [
  's3d.noiseTerrain({ width: 80, depth: 60, height: 12, mode: "ridged", water: 1.5, seed: 7 })',
  's3d.scatter({ objects: ["conifer", "tree", "rock"], spacing: 4, clumping: 0.7 })',
  's3d.paving({ area: [0, 0, 6, 4], size: 0.5, joint: true })',
  's3d.noiseDeform({ amount: 0.1, scale: 0.6, twist: 90 })',
  's3d.cellNoise(x, y)  →  { f1, f2, id, site }',
  's3d.noise(x, y)  ·  s3d.fbm(x, y, { octaves: 5, mode: "ridged" })',
];

const context = pluginContext();
const editor = context.editor;
const tab = ref<PanelTab>(context.storage.get('tab', 'terrain'));
watch(tab, (value) => context.storage.set('tab', value));
// the context menu entries open the panel on a tab
onTabRequest((requested) => (tab.value = requested));

// ------------------------------------------------------------ terrain
const settings = reactive<TerrainSettings>(normaliseSettings(context.storage.get('terrain', {})));
const live = ref(context.storage.get('live', true));
watch(live, (value) => context.storage.set('live', value));
// water and snow keep their height while switched off
const waterLevel = ref(settings.water ?? 0.5),
  snowLine = ref(settings.snow ?? settings.height * 0.85);
const hasWater = ref(settings.water != null),
  hasSnow = ref(settings.snow != null);
watch([hasWater, waterLevel], () => (settings.water = hasWater.value ? waterLevel.value : null));
watch([hasSnow, snowLine], () => (settings.snow = hasSnow.value ? snowLine.value : null));

/** the selected noise terrain – the panel shows and changes its settings */
const editing = computed<Instance | null>(() => {
  void editor.ui.selRev;
  void editor.ui.revision;
  const selection = editor.selected();
  if (selection.length !== 1 || selection[0].kind !== 'instance') {
    return null;
  }
  const instance = editor.entities.instances.get(selection[0].id);
  return instance && context.data.get<NoiseTerrainData>(instance.definition)?.settings ? instance : null;
});
const storedSettings = (instance: Instance) => context.data.get<NoiseTerrainData>(instance.definition)!.settings;
// a terrain selected when the panel opens counts too
watch(
  editing,
  (instance) => {
    if (!instance) {
      return;
    }
    const stored = normaliseSettings(storedSettings(instance));
    Object.assign(settings, stored);
    hasWater.value = stored.water != null;
    waterLevel.value = stored.water ?? waterLevel.value;
    hasSnow.value = stored.snow != null;
    snowLine.value = stored.snow ?? snowLine.value;
  },
  { immediate: true },
);

/** where a new terrain goes: centred on the origin in an empty model, else beside the model */
const newOrigin = (): THREE.Vector3 => {
  const box = editor.model.bounds();
  const { Vector3 } = context.THREE;
  return box.isEmpty() ? new Vector3(-settings.width / 2, -settings.depth / 2, 0) : new Vector3(box.max.x + 2, box.min.y, 0);
};
const originOf = (instance: Instance) =>
  new context.THREE.Vector3().setFromMatrixPosition(editor.contextMatrix.clone().multiply(instance.matrix));

const stats = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
const refreshPreview = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const current = normaliseSettings({ ...settings });
    context.storage.set('terrain', current);
    const instance = editing.value;
    // the terrain as it is in the model needs no preview
    const unchanged = instance && JSON.stringify(normaliseSettings(storedSettings(instance))) === JSON.stringify(current);
    // only the terrain tab shows it
    if (!live.value || unchanged || tab.value !== 'terrain') {
      hidePreview();
      stats.value = '';
      return;
    }
    const grid = showPreview(current, instance ? originOf(instance) : newOrigin(), instance);
    const { low, high } = gridRange(grid);
    stats.value = t('noise.terrain.stats', {
      columns: grid.columns,
      rows: grid.rows,
      faces: grid.columns * grid.rows * 2,
      low: low.toFixed(1),
      high: high.toFixed(1),
    });
  }, 60);
};
watch([settings, live, editing, tab], refreshPreview, { deep: true, immediate: true });
onBeforeUnmount(() => {
  clearTimeout(timer);
  hidePreview();
});

const randomSeed = () => Math.floor(Math.random() * 1000);
const applyPreset = (name: PresetName) => {
  const preset: Partial<TerrainSettings> = PRESETS[name];
  Object.assign(
    settings,
    { ...TERRAIN_DEFAULTS, width: settings.width, depth: settings.depth, detail: settings.detail, seed: settings.seed },
    preset,
  );
  hasWater.value = preset.water != null;
  if (preset.water != null) {
    waterLevel.value = preset.water;
  }
  hasSnow.value = preset.snow != null;
  if (preset.snow != null) {
    snowLine.value = preset.snow;
  }
};

/** runs a script line as one undo step; shows the error as a toast */
const run = (code: string) => {
  const result = context.script.run(code);
  if (!result.ok) {
    context.ui.toast(String(result.error ?? ''));
  }
  return result.ok;
};
const selectCreated = () => {
  const instance = lastCreated();
  if (instance) {
    editor.select([{ kind: 'instance', id: instance.id }]);
  }
};

const create = (replace: boolean) => {
  const instance = replace ? editing.value : null;
  hidePreview();
  const at = instance ? undefined : editor.toLocal(newOrigin()).toArray();
  const call = { ...normaliseSettings({ ...settings }), at, replace: instance?.id };
  if (run(`s3d.noiseTerrain(${JSON.stringify(call)});`)) {
    selectCreated();
    if (!instance) {
      editor.zoomExtents();
    }
  }
  refreshPreview();
};

// ------------------------------------------------------------ scatter
const scatterSettings = reactive({
  objects: ['conifer', 'tree', 'rock'] as string[],
  component: '',
  spacing: 4,
  density: 0.7,
  clumping: 0.6,
  clumpSize: 25,
  maxSlope: 32,
  sizeMin: 0.75,
  sizeMax: 1.3,
  seed: 1,
  offset: 0,
  alongPath: false,
  align: false,
  ...context.storage.get('scatter', {}),
});
watch(scatterSettings, (value) => context.storage.set('scatter', value), { deep: true });
const componentNames = computed(() => {
  void editor.ui.revision;
  return [...editor.model.definitions.values()]
    .filter((definition) => definition.isComponent && !context.data.get(definition))
    .map((definition) => definition.name)
    .sort();
});
/** what Scatter works on: the selected edges (a path), faces, or a terrain */
const scatterTarget = computed(() => {
  void editor.ui.selRev;
  const selection = editor.selected();
  const edges = selection.filter((entityRef) => entityRef.kind === 'edge').length,
    faces = selection.filter((entityRef) => entityRef.kind === 'face').length;
  if (edges) {
    return { kind: 'path', count: edges };
  }
  if (faces) {
    return { kind: 'faces', count: faces };
  }
  return { kind: 'terrain', count: 0 };
});
const runScatter = () => {
  const { component, objects, ...rest } = scatterSettings;
  const chosen = [...objects, ...(component ? [component] : [])];
  if (!chosen.length) {
    context.ui.toast(t('noise.scatter.nothingChosen'));
    return;
  }
  const { offset, alongPath, align, ...common } = rest;
  const target = scatterTarget.value.kind;
  const options = {
    ...common,
    objects: chosen,
    on: editing.value?.id ?? 'selection',
    ...(target === 'path' ? { offset, alongPath } : {}),
    ...(target === 'faces' ? { align } : {}),
  };
  if (run(`s3d.scatter(${JSON.stringify(options)});`)) {
    context.ui.toast(t('noise.scatter.done', { count: lastCreated()?.definition.entities.instances.size ?? 0 }));
  }
};

// ------------------------------------------------------------ deform
const deformSettings = reactive({
  amount: 0.15,
  scale: 1,
  detail: 0.3,
  octaves: 4,
  mode: 'fbm',
  seed: 1,
  twist: 0,
  taper: 1,
  bend: 0,
  ...context.storage.get('deform', {}),
});
watch(deformSettings, (value) => context.storage.set('deform', value), { deep: true });
const selectedGroups = computed(() => {
  void editor.ui.selRev;
  return editor.selected().filter((entityRef) => entityRef.kind === 'instance').length;
});
const runDeform = () => {
  if (run(`s3d.noiseDeform(${JSON.stringify(deformSettings)});`)) {
    context.ui.toast(t('noise.deform.done'));
  }
};

// ------------------------------------------------------------ paving
const pavingSettings = reactive({
  ...PAVING_DEFAULTS,
  width: 6,
  depth: 4,
  color: '#9a948a',
  joint: true,
  ...context.storage.get('paving', {}),
});
watch(pavingSettings, (value) => context.storage.set('paving', value), { deep: true });
const selectedFaces = computed(() => {
  void editor.ui.selRev;
  return editor.selected().filter((entityRef) => entityRef.kind === 'face').length;
});
const applyPavingPreset = (name: PavingPresetName) => Object.assign(pavingSettings, PAVING_PRESETS[name]);
const runPaving = () => {
  const { width, depth, ...options } = pavingSettings;
  let area: number[] | undefined;
  if (!selectedFaces.value) {
    // beside the model, like a new terrain
    const box = editor.model.bounds();
    const corner = box.isEmpty() ? [-width / 2, -depth / 2] : [box.max.x + 1, box.min.y];
    const local = editor.toLocal(new context.THREE.Vector3(corner[0], corner[1], 0));
    area = [local.x, local.y, local.x + width, local.y + depth];
  }
  if (run(`s3d.paving(${JSON.stringify({ ...options, area })});`)) {
    selectCreated();
    context.ui.toast(t('noise.paving.done', { count: lastCreated()?.definition.entities.faces.size ?? 0 }));
  }
};

// ------------------------------------------------------------ script
const openExample = () => context.script.openInEditor('js', EXAMPLE);
</script>
