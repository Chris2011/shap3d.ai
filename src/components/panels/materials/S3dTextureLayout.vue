<template>
  <S3dFieldRow v-if="shown.image" label="">
    <S3dButton small @click="loadImage(material)">{{ t('materials.replaceImage') }}</S3dButton>
  </S3dFieldRow>
  <S3dFieldRow v-if="shown.texture || shown.image || shader" :label="shown.image ? t('materials.width') : t('materials.size')">
    <S3dTextInput
      :model-value="editor.fmt(size)"
      :aria-label="shown.image ? t('materials.width') : t('materials.size')"
      @commit="setSize($event)"
    />
  </S3dFieldRow>
  <S3dFieldRow v-if="shown.image" :label="t('materials.height')">
    <S3dTextInput
      :model-value="editor.fmt(size * (shown.imageAspect ?? 1))"
      :aria-label="t('materials.height')"
      @commit="setSize($event, shown.imageAspect ?? 1)"
    />
  </S3dFieldRow>
  <template v-if="!shader && (shown.texture || shown.image)">
    <S3dFieldRow :label="t('materials.offset')">
      <S3dTextInput
        :model-value="editor.fmt(shown.textureOffset?.[0] ?? 0)"
        :title="t('materials.offsetU')"
        :aria-label="t('materials.offsetU')"
        @commit="setOffset(0, $event)"
      /><S3dTextInput
        :model-value="editor.fmt(shown.textureOffset?.[1] ?? 0)"
        :title="t('materials.offsetV')"
        :aria-label="t('materials.offsetV')"
        @commit="setOffset(1, $event)"
      />
    </S3dFieldRow>
    <S3dFieldRow :label="t('materials.rotation')">
      <S3dRangeSlider
        min="-180"
        max="180"
        step="5"
        :aria-label="t('materials.rotation')"
        :model-value="shown.textureRotation ?? 0"
        @update:model-value="setRotation"
      /><span class="w-10 text-end">{{ formatNumber(shown.textureRotation ?? 0) }}°</span>
    </S3dFieldRow>
  </template>
</template>

<script setup lang="ts">
import S3dButton from '../../ui/S3dButton.vue';
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import S3dRangeSlider from '../../ui/S3dRangeSlider.vue';
import S3dTextInput from '../../ui/S3dTextInput.vue';
import type { MaterialDef } from '../../../core/document';
import { defaultTextureSize } from '../../../core/textures';
import { parseLength } from '../../../core/units';
import { shaderSize, type SurfaceShader } from '../../../engine/surfaceShaders';
import { useEditor } from '../../keys';
import { useModel } from '../../../composables/useModel';
import { useLiveEdit } from '../../../composables/useLiveEdit';
import { useMaterialImage } from '../../../composables/useMaterialImage';
import { t, formatNumber } from '../../../i18n';

/** How a texture, image or shader lies on the faces: size, offset and rotation. */
const props = defineProps<{ material: MaterialDef; shader: SurfaceShader | undefined }>();
const editor = useEditor();
const shown = useModel(() => ({ ...props.material }));
const size = useModel(() =>
  props.shader ? shaderSize(props.material, props.shader) : (props.material.textureSize ?? defaultTextureSize(props.material)),
);
const liveEdit = useLiveEdit();
const loadImage = useMaterialImage();
/** `per` – the entered length for one unit of width (the image's aspect, for its height) */
const setSize = (text: string, per = 1) => {
  const length = parseLength(text, editor.model.settings.units);
  if (length != null && length > 0) {
    liveEdit(() => (props.material.textureSize = length / per));
  }
};
const setOffset = (axis: 0 | 1, text: string) => {
  const offset = parseLength(text, editor.model.settings.units);
  if (offset == null) {
    return;
  }
  const material = props.material;
  const next: [number, number] = [material.textureOffset?.[0] ?? 0, material.textureOffset?.[1] ?? 0];
  next[axis] = offset;
  liveEdit(() => (material.textureOffset = next[0] || next[1] ? next : undefined));
};
const setRotation = (degrees: number) => {
  if (Number.isFinite(degrees)) {
    liveEdit(() => (props.material.textureRotation = degrees || undefined));
  }
};
</script>
