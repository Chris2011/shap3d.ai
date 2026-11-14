<template>
  <S3dSectionTitle>{{ t('styles.presets') }}</S3dSectionTitle>
  <div class="grid grid-cols-[repeat(3,1fr)] gap-2">
    <button
      v-for="preset in STYLE_PRESETS"
      :key="preset.id"
      type="button"
      class="flex flex-col items-center gap-1 rounded border bg-surface p-1 text-[0.6875rem]"
      :class="preset.id === active ? 'border-blue shadow-[0_0_0_1px_var(--s3d-blue)]' : 'border-edge'"
      :aria-pressed="preset.id === active"
      @click="apply(preset)"
    >
      <div class="relative h-11 w-full rounded-[2px]" :style="{ background: previewBackground(preset) }">
        <div
          class="absolute top-[30%] left-[35%] h-1/2 w-[30%] border-[1.5px]"
          :style="{ background: preset.style.frontColor, borderColor: preset.style.edgeColor }"
        ></div>
      </div>
      <span>{{ t(`styles.preset.${preset.id}`) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import S3dSectionTitle from '../../ui/S3dSectionTitle.vue';
import { useEditor } from '../../keys';
import { STYLE_PRESETS, matchingPreset, presetValues, type StylePreset } from '../../../core/stylePresets';
import { useModel } from '../../../composables/useModel';
import { t } from '../../../i18n';

/** Ready-made looks with a small preview; the one the model matches is marked. One undo step each. */
const editor = useEditor();
const active = useModel(() => matchingPreset(editor.model.settings.style));
/** sky above, ground below */
const previewBackground = (preset: StylePreset) => `linear-gradient(${preset.style.skyColor} 0 55%, ${preset.style.groundColor} 55% 100%)`;
const apply = (preset: StylePreset) => {
  editor.commit('undo.style', () => Object.assign(editor.model.settings.style, presetValues(preset)));
};
</script>
