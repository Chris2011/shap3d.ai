<template>
  <S3dSectionTitle>{{ t('entityInfo.attributes') }}</S3dSectionTitle>
  <div v-for="(value, key) in attributes" :key="key" class="s3d-row">
    <span class="s3d-label truncate" :title="String(key)">{{ key }}</span
    ><S3dTextInput :model-value="value" :aria-label="String(key)" @commit="setSelectionAttribute(editor, String(key), $event)" />
    <S3dButton small :title="t('entityInfo.attributeRemove')" @click="setSelectionAttribute(editor, String(key), null)">×</S3dButton>
  </div>
  <S3dButton small @click="add">{{ t('entityInfo.attributeAdd') }}</S3dButton>
</template>

<script setup lang="ts">
import S3dButton from '../../ui/S3dButton.vue';
import S3dSectionTitle from '../../ui/S3dSectionTitle.vue';
import S3dTextInput from '../../ui/S3dTextInput.vue';
import { useEditor } from '../../keys';
import { setSelectionAttribute } from '../../../engine/selectionEdits';
import { t } from '../../../i18n';

/** The attributes (key → text) of the selected definition: edit, remove, add. */
defineProps<{ attributes: Record<string, string> }>();
const editor = useEditor();
const add = async () => {
  const key = (await editor.prompt(t('entityInfo.attributeName')))?.trim();
  if (key) {
    setSelectionAttribute(editor, key, '');
  }
};
</script>
