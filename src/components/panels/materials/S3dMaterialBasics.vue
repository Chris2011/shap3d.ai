<template>
  <S3dFieldRow :label="t('materials.name')">
    <S3dTextInput :model-value="shown.name" :aria-label="t('materials.name')" @commit="rename(material, $event)" />
  </S3dFieldRow>
  <S3dFieldRow :label="t('materials.color')">
    <S3dColorPicker :model-value="shown.color" :aria-label="t('materials.color')" @update:model-value="setColor" /><S3dTextInput
      :model-value="shown.color"
      :aria-label="t('materials.color')"
      @commit="setColor"
    />
  </S3dFieldRow>
  <S3dFieldRow :label="t('materials.opacity')">
    <S3dRangeSlider
      min="0.05"
      max="1"
      step="0.05"
      :aria-label="t('materials.opacity')"
      :model-value="shown.opacity"
      @update:model-value="liveEdit(() => (material.opacity = $event))"
    /><span class="w-10 text-end">{{ Math.round(shown.opacity * 100) }} %</span>
  </S3dFieldRow>
  <S3dFieldRow :label="t('materials.density')">
    <S3dTextInput
      :model-value="shown.density === undefined ? '' : formatNumber(shown.density)"
      :aria-label="t('materials.density')"
      :placeholder="t('materials.densityUnknown')"
      @commit="setDensity"
      @keydown.stop
    /><span class="w-10 text-end">kg/m³</span>
  </S3dFieldRow>
</template>

<script setup lang="ts">
import S3dColorPicker from '../../ui/S3dColorPicker.vue';
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import S3dRangeSlider from '../../ui/S3dRangeSlider.vue';
import S3dTextInput from '../../ui/S3dTextInput.vue';
import type { MaterialDef } from '../../../core/document';
import { useModel } from '../../../composables/useModel';
import { useLiveEdit } from '../../../composables/useLiveEdit';
import { useMaterialLibrary } from '../../../composables/useMaterialLibrary';
import { t, formatNumber, normalizeNumberInput } from '../../../i18n';

/** Name, colour and opacity of a material. */
const props = defineProps<{ material: MaterialDef }>();
// the material object stays the same when it changes – a copy per model change re-renders the values
const shown = useModel(() => ({ ...props.material }));
const liveEdit = useLiveEdit();
const { rename } = useMaterialLibrary();
/** kg/m³; empty takes it away – solids with this material then show no mass */
const setDensity = (text: string) => {
  const value = text.trim() ? parseFloat(normalizeNumberInput(text).replace(',', '.')) : undefined;
  if (value === undefined || (Number.isFinite(value) && value > 0)) {
    liveEdit(() => (props.material.density = value));
  }
};
const setColor = (color: string) => {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    liveEdit(() => (props.material.color = color));
  }
};
</script>
