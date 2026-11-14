<template>
  <div class="mt-1 mb-2.5 flex items-center gap-2.5">
    <div class="size-12 flex-none rounded-[3px] border border-line-2" :style="swatchStyle(cur)"></div>
    <div>
      <div class="font-semibold">{{ editor.ui.currentMaterial ?? t('names.defaultMaterial') }}</div>
      <div class="s3d-label">{{ t('materials.hint') }}</div>
    </div>
  </div>
  <S3dMaterialPicker />

  <template v-if="cur">
    <S3dSectionTitle>{{ t('materials.edit') }}</S3dSectionTitle>
    <S3dMaterialBasics :material="cur" />
    <S3dMaterialSurface :material="cur" :shader="shader" />
    <S3dMaterialPbr v-if="!shader" :material="cur" />
    <S3dTextureLayout :material="cur" :shader="shader" />
    <S3dShaderParams v-if="shader" :material="cur" :shader="shader" />
    <S3dFieldRow :label="t('materials.used')">{{ usage }}×</S3dFieldRow>
    <S3dButton small @click="remove(cur)">{{ t('materials.delete') }}</S3dButton>
  </template>

  <S3dMaterialCreate />
</template>

<script setup lang="ts">
import S3dButton from '../ui/S3dButton.vue';
import S3dFieldRow from '../ui/S3dFieldRow.vue';
import S3dSectionTitle from '../ui/S3dSectionTitle.vue';
import S3dMaterialBasics from './materials/S3dMaterialBasics.vue';
import S3dMaterialCreate from './materials/S3dMaterialCreate.vue';
import S3dMaterialPbr from './materials/S3dMaterialPbr.vue';
import S3dMaterialPicker from './materials/S3dMaterialPicker.vue';
import S3dMaterialSurface from './materials/S3dMaterialSurface.vue';
import S3dShaderParams from './materials/S3dShaderParams.vue';
import S3dTextureLayout from './materials/S3dTextureLayout.vue';
import { useEditor } from '../keys';
import { materialShader } from '../../engine/surfaceShaders';
import { swatchStyle } from '../../utils/materialSwatch';
import { useModel } from '../../composables/useModel';
import { useMaterialLibrary } from '../../composables/useMaterialLibrary';
import { t } from '../../i18n';

/** Materials panel: pick the paint material, edit the current one, create new ones. */
const editor = useEditor();
const { remove, usesOf } = useMaterialLibrary();
const cur = useModel(() => editor.model.material(editor.ui.currentMaterial ?? undefined) ?? null);
// the material object stays the same when it changes – so these re-read it on every model change
const shader = useModel(() => materialShader(cur.value ?? undefined));
const usage = useModel(() => (cur.value ? usesOf(cur.value.name) : 0));
</script>
