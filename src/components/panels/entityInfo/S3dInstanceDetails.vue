<template>
  <S3dFieldRow :label="t('entityInfo.instance')">
    <S3dTextInput :model-value="info.name" :aria-label="t('entityInfo.instance')" @commit="nameSelection(editor, $event)" />
  </S3dFieldRow>
  <S3dFieldRow :label="t('entityInfo.definition')">
    <S3dTextInput :model-value="info.defName" :aria-label="t('entityInfo.definition')" @commit="nameSelectedDefinitions(editor, $event)" />
  </S3dFieldRow>
  <S3dFieldRow :label="t('entityInfo.type')">{{
    info.isComponent ? t('entityInfo.componentCopies', { count: info.count }) : t('names.group')
  }}</S3dFieldRow>
  <S3dFieldRow :label="t('entityInfo.position')">
    <S3dTextInput
      v-for="(coord, axis) in info.pos"
      :key="axis"
      class="w-1/3 px-1 text-xs"
      :model-value="editor.fmt(coord)"
      :aria-label="`${t('entityInfo.position')} ${AXES[axis]}`"
      @commit="placeSelection(editor, axis, $event)"
    />
  </S3dFieldRow>
  <S3dFieldRow :label="t('materials.size')">{{ info.size }}</S3dFieldRow>
  <S3dFieldRow v-if="info.volume" :label="t('entityInfo.volume')">{{ info.volume }}</S3dFieldRow>
  <S3dCheckbox :model-value="info.locked" @update:model-value="setSelectionFlag(editor, 'locked', $event)">{{
    t('toast.locked')
  }}</S3dCheckbox>
  <S3dCheckbox :model-value="info.hole" @update:model-value="setSelectionFlag(editor, 'hole', $event)">{{
    t('entityInfo.hole')
  }}</S3dCheckbox>
  <S3dAttributeList :attributes="info.attributes" />
  <S3dProcedureInfo />
</template>

<script setup lang="ts">
import S3dCheckbox from '../../ui/S3dCheckbox.vue';
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import S3dTextInput from '../../ui/S3dTextInput.vue';
import S3dProcedureInfo from '../S3dProcedureInfo.vue';
import S3dAttributeList from './S3dAttributeList.vue';
import { useEditor } from '../../keys';
import type { InstanceInfo } from '../../../engine/selectionInfo';
import { nameSelection, nameSelectedDefinitions, placeSelection, setSelectionFlag } from '../../../engine/selectionEdits';
import { t } from '../../../i18n';

/** A selected group or component: names, type, position, size, volume, lock, attributes, procedure. */
defineProps<{ info: InstanceInfo }>();
const editor = useEditor();
const AXES = ['X', 'Y', 'Z'];
</script>
