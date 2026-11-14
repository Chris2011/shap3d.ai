<template>
  <div v-if="info.kind === 'none'">
    <div class="mt-1 mb-2.5 font-semibold">{{ t('editor.noSelection') }}</div>
    <S3dFieldRow :label="t('entityInfo.model')">{{ editor.model.name }}</S3dFieldRow>
    <S3dFieldRow :label="t('modelInfo.faces')">{{ stats.faces }}</S3dFieldRow>
    <S3dFieldRow :label="t('modelInfo.edges')">{{ stats.edges }}</S3dFieldRow>
    <S3dFieldRow :label="t('panels.components')">{{ editor.model.definitions.size }}</S3dFieldRow>
  </div>
  <div v-else>
    <div class="mt-1 mb-2.5 font-semibold">{{ info.title }}</div>
    <S3dMaterialSlot
      v-if="info.kind !== 'edge'"
      :label="t('entityInfo.material')"
      :material="info.material"
      :color="info.matColor"
      :swatch-title="info.material ?? t('names.defaultMaterial')"
      :button-title="t('entityInfo.assignTitle')"
      @assign="paint('material')"
    />
    <S3dMaterialSlot
      v-if="info.kind === 'face'"
      :label="t('styles.back')"
      :material="info.back"
      :color="info.backColor"
      @assign="paint('backMaterial')"
    />
    <S3dFieldRow :label="t('entityInfo.tag')">
      <S3dSelect :model-value="info.tag ?? 'Untagged'" :aria-label="t('entityInfo.tag')" @update:model-value="tagSelection(editor, $event)">
        <option v-for="tag in editor.model.tags" :key="tag.name" :value="tag.name">
          {{ tag.name === 'Untagged' ? t('tags.untagged') : tag.name }}
        </option>
      </S3dSelect>
    </S3dFieldRow>
    <S3dInstanceDetails v-if="info.kind === 'instance'" :info="info" />
    <S3dFieldRow v-if="info.kind === 'face'" :label="t('entityInfo.face')">{{ info.area }}</S3dFieldRow>
    <template v-if="info.kind === 'edge'">
      <S3dFieldRow :label="t('vcb.length')">{{ info.length }}</S3dFieldRow>
      <S3dCheckbox :model-value="info.soft" @update:model-value="setSelectionFlag(editor, 'soft', $event)">{{
        t('entityInfo.softened')
      }}</S3dCheckbox>
    </template>
    <template v-if="info.kind === 'multi'">
      <S3dFieldRow v-if="info.area" :label="t('entityInfo.totalArea')">{{ info.area }}</S3dFieldRow>
      <S3dFieldRow v-if="info.length" :label="t('entityInfo.totalLength')">{{ info.length }}</S3dFieldRow>
    </template>
    <S3dCheckbox :model-value="info.hidden" @update:model-value="setSelectionFlag(editor, 'hidden', $event)">{{
      t('entityInfo.hidden')
    }}</S3dCheckbox>
  </div>
</template>

<script setup lang="ts">
import S3dCheckbox from '../ui/S3dCheckbox.vue';
import S3dFieldRow from '../ui/S3dFieldRow.vue';
import S3dSelect from '../ui/S3dSelect.vue';
import S3dInstanceDetails from './entityInfo/S3dInstanceDetails.vue';
import S3dMaterialSlot from './entityInfo/S3dMaterialSlot.vue';
import { useEditor } from '../keys';
import { describeSelection } from '../../engine/selectionInfo';
import { paintSelection, setSelectionFlag, tagSelection } from '../../engine/selectionEdits';
import { useModel, useSelection } from '../../composables/useModel';
import { t } from '../../i18n';

/** Entity Info: what is selected and its material, tag, flags and details – or the model when nothing is. */
const editor = useEditor();
const stats = useModel(() => editor.model.root.stats());
const info = useSelection(() => describeSelection(editor));
const paint = (side: 'material' | 'backMaterial') => paintSelection(editor, side, editor.ui.currentMaterial ?? undefined);
</script>
