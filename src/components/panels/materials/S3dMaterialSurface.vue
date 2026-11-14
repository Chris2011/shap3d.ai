<template>
  <S3dFieldRow :label="t('materials.texture')">
    <select class="s3d-input" :value="surfaceValue" :aria-label="t('materials.texture')" @change="choose">
      <option value="">{{ t('materials.noTexture') }}</option>
      <option :value="IMAGE_VALUE">{{ t('materials.image') }}</option>
      <option v-for="(label, kind) in TEXTURES" :key="kind" :value="kind">{{ label }}</option>
      <optgroup v-if="SURFACE_SHADERS.length || shown.shader" :label="t('materials.shaders')">
        <option v-for="entry in SURFACE_SHADERS" :key="entry.id" :value="SHADER_PREFIX + entry.id">
          {{ t('materials.shaderOption', { name: localize(entry.label) }) }}
        </option>
        <option v-if="shader && !SURFACE_SHADERS.includes(shader)" :value="SHADER_PREFIX + shader.id">
          {{ t('materials.shaderOption', { name: localize(shader.label) }) }}
        </option>
        <option v-if="shown.shader && !shader" :value="SHADER_PREFIX + shown.shader">
          {{ t('materials.shaderMissing', { shader: shown.shader }) }}
        </option>
      </optgroup>
    </select>
  </S3dFieldRow>
</template>

<script setup lang="ts">
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import type { MaterialDef } from '../../../core/document';
import { TEXTURES } from '../../../core/textures';
import { SURFACE_SHADERS, type SurfaceShader } from '../../../engine/surfaceShaders';
import { IMAGE_VALUE, SHADER_PREFIX, applySurface, surfaceValueOf } from '../../../utils/materialSurface';
import { useModel } from '../../../composables/useModel';
import { useLiveEdit } from '../../../composables/useLiveEdit';
import { useMaterialImage } from '../../../composables/useMaterialImage';
import { t, localize } from '../../../i18n';

/** What covers a material: plain colour, own image, a procedural texture or a plugin's shader. */
const props = defineProps<{ material: MaterialDef; shader: SurfaceShader | undefined }>();
const shown = useModel(() => ({ ...props.material }));
const surfaceValue = useModel(() => surfaceValueOf(props.material));
const liveEdit = useLiveEdit();
const loadImage = useMaterialImage();
const choose = (event: Event) => {
  const select = event.target as HTMLSelectElement;
  if (select.value === IMAGE_VALUE) {
    // the list shows the image only once one is loaded
    select.value = surfaceValue.value;
    void loadImage(props.material);
    return;
  }
  liveEdit(() => applySurface(props.material, select.value));
};
</script>
