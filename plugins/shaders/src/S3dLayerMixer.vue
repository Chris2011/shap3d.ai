<template>
  <section class="s3d-sh-section">
    <div class="s3d-sh-heading">{{ t('shaders.mix.title') }}</div>
    <p class="s3d-sh-hint">{{ t('shaders.mix.hint') }}</p>
    <div class="s3d-sh-mixer">
      <span class="s3d-sh-mix-preview" :style="{ background: preview }" role="img" :aria-label="t('shaders.mix.preview')"></span>
      <div class="s3d-sh-layers">
        <div v-for="(layer, index) in layers" :key="index" class="s3d-sh-layer">
          <div class="s3d-sh-row">
            <span class="s3d-sh-label">{{ index ? t('shaders.mix.layer', { number: index + 1 }) : t('shaders.mix.base') }}</span>
            <select v-model="layer.shader" class="s3d-input s3d-sh-grow" :aria-label="t('shaders.mix.pattern')">
              <option v-for="shader in SHADERS" :key="shader.id" :value="shader.id">{{ t(`shaders.shader.${shader.id}`) }}</option>
            </select>
            <button
              v-if="index"
              class="s3d-btn small"
              :title="t('shaders.mix.remove')"
              :aria-label="t('shaders.mix.remove')"
              @click="layers.splice(index, 1)"
            >
              ×
            </button>
          </div>
          <template v-if="index">
            <label class="s3d-sh-row">
              <span class="s3d-sh-label">{{ t('shaders.mix.strength') }}</span>
              <input v-model.number="layer.mix" class="s3d-sh-grow" type="range" min="0" max="1" step="0.05" />
            </label>
            <label class="s3d-sh-row">
              <span class="s3d-sh-label">{{ t('shaders.mix.size') }}</span>
              <input v-model.number="layer.size" class="s3d-sh-grow" type="range" min="0.1" max="4" step="0.1" />
            </label>
          </template>
        </div>
        <button v-if="layers.length < MAX_LAYERS" class="s3d-btn small" @click="addLayer">{{ t('shaders.mix.add') }}</button>
      </div>
    </div>
    <label class="s3d-sh-row">
      <span class="s3d-sh-label">{{ t('shaders.mix.color') }}</span>
      <input v-model="color" type="color" class="s3d-sh-color" />
      <input v-model="name" class="s3d-input s3d-sh-grow" :aria-label="t('shaders.mix.name')" :placeholder="t('shaders.mix.name')" />
    </label>
    <button class="s3d-btn" @click="create">{{ t('shaders.mix.create') }}</button>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { MAX_LAYERS, mixId } from './layers';
import { SHADERS } from './library';
import { shaderId } from './presets';
import { pluginContext, t } from './runtime';

const context = pluginContext();
const editor = context.editor;

const layers = reactive([
  { shader: 'bricks', mix: 1, size: 1 },
  { shader: 'rust', mix: 0.5, size: 1 },
]);
const color = ref('#9e4a2e');
const name = ref('');

const addLayer = () => layers.push({ shader: 'concrete', mix: 0.5, size: 1 });

/** the material as the layers stand: the shader comes from its id, strength and size are its parameters */
const material = computed(() => ({
  color: color.value,
  shader: shaderId(mixId(layers.map((layer) => layer.shader))),
  params: Object.fromEntries(
    layers.slice(1).flatMap((layer, index) => [
      [`l${index + 1}_mix`, layer.mix],
      [`l${index + 1}_size`, layer.size],
    ]),
  ),
}));
const preview = computed(() => context.materials.preview(material.value));

/** a name the model has no material of yet */
const freeName = () => {
  const wanted = name.value.trim() || layers.map((layer) => t(`shaders.shader.${layer.shader}`)).join(' + ');
  const taken = new Set(editor.model.materials.map((entry) => entry.name));
  let candidate = wanted;
  for (let number = 2; taken.has(candidate); number++) {
    candidate = `${wanted} ${number}`;
  }
  return candidate;
};

/** puts the mix into the model and picks it for the paint bucket – like a click in the Materials panel */
const create = () => {
  const materialName = freeName();
  editor.commit(materialName, () => context.materials.ensure(materialName, material.value));
  editor.ui.currentMaterial = materialName;
  if (editor.ui.tool !== 'paint') {
    editor.setTool('paint');
  } else {
    editor.refreshStatus();
  }
  context.ui.toast(t('shaders.mix.created', { name: materialName }));
};
</script>
