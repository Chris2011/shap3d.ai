<template>
  <div class="s3d-sh">
    <p class="s3d-sh-hint">{{ t('shaders.panel.hint') }}</p>
    <section v-for="group in groups" :key="group.shader" class="s3d-sh-section">
      <div class="s3d-sh-heading">{{ t(`shaders.shader.${group.shader}`) }}</div>
      <div class="s3d-sh-items">
        <button
          v-for="preset in group.presets"
          :key="preset.id"
          class="s3d-sh-item"
          :class="{ active: currentMaterial === presetName(preset) }"
          :title="t('shaders.panel.paint', { name: presetName(preset) })"
          @click="paintWith(preset)"
        >
          <span class="s3d-sh-preview" :style="{ background: presetPreview(preset) }"></span>
          <span class="s3d-sh-name">{{ t(`shaders.preset.${preset.id}`) }}</span>
        </button>
      </div>
    </section>
    <p class="s3d-sh-hint">{{ t('shaders.panel.edit') }}</p>
    <p class="s3d-sh-hint">{{ t('shaders.panel.script') }}</p>
    <code class="s3d-sh-code">s3d.shaderMaterial('oak')</code>
    <code class="s3d-sh-code">s3d.material('…', '#c9a36b', { shader: 'shaders.wood', params: { rings: 20 } })</code>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PRESETS, SHADERS, type Preset } from './library';
import { paintWith, presetName, presetPreview } from './presets';
import { pluginContext, t } from './runtime';

const editor = pluginContext().editor;
const currentMaterial = computed(() => editor.ui.currentMaterial);
/** the presets under the shader they use, in the order of the shaders */
const groups = SHADERS.map((shader) => ({
  shader: shader.id,
  presets: PRESETS.filter((preset: Preset) => preset.shader === shader.id),
})).filter((group) => group.presets.length);
</script>
