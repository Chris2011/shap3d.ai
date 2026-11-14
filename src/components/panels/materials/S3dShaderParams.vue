<template>
  <S3dFieldRow v-for="{ param, value } in params" :key="param.name" :label="localize(param.label)">
    <S3dColorPicker
      v-if="param.type === 'color'"
      :model-value="String(value)"
      :aria-label="localize(param.label)"
      @update:model-value="setParam(param, $event)"
    />
    <template v-else
      ><S3dRangeSlider
        :min="param.min ?? 0"
        :max="param.max ?? 1"
        :step="param.step ?? 0.01"
        :aria-label="localize(param.label)"
        :model-value="+value"
        @update:model-value="setParam(param, $event)"
      /><span class="w-10 text-end">{{ formatNumber(+value, { maximumFractionDigits: 2 }) }}</span></template
    >
  </S3dFieldRow>
  <S3dButton v-if="hasOwnParams" small class="mb-1.5" @click="liveEdit(() => (material.shaderParams = undefined))">{{
    t('materials.resetShader')
  }}</S3dButton>
</template>

<script setup lang="ts">
import S3dButton from '../../ui/S3dButton.vue';
import S3dColorPicker from '../../ui/S3dColorPicker.vue';
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import S3dRangeSlider from '../../ui/S3dRangeSlider.vue';
import type { MaterialDef } from '../../../core/document';
import { shaderParam, type SurfaceShader, type SurfaceShaderParam } from '../../../engine/surfaceShaders';
import { useModel } from '../../../composables/useModel';
import { useLiveEdit } from '../../../composables/useLiveEdit';
import { t, localize, formatNumber } from '../../../i18n';

/** The parameters of a plugin's surface shader (numbers and colours) and a reset to its defaults. */
const props = defineProps<{ material: MaterialDef; shader: SurfaceShader }>();
const params = useModel(() => (props.shader.params ?? []).map((param) => ({ param, value: shaderParam(props.material, param) })));
const hasOwnParams = useModel(() => !!props.material.shaderParams);
const liveEdit = useLiveEdit();
const setParam = (param: SurfaceShaderParam, value: number | string) => {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return;
  }
  liveEdit(() => (props.material.shaderParams = { ...props.material.shaderParams, [param.name]: value }));
};
</script>
