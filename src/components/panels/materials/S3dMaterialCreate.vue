<template>
  <S3dSectionTitle>{{ t('materials.new') }}</S3dSectionTitle>
  <S3dFieldRow>
    <S3dTextInput v-model="name" :placeholder="t('materials.name')" :aria-label="t('materials.name')" /><S3dColorPicker
      v-model="color"
      :aria-label="t('materials.color')"
    />
  </S3dFieldRow>
  <S3dButton small @click="submit">{{ t('materials.create') }}</S3dButton>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import S3dButton from '../../ui/S3dButton.vue';
import S3dColorPicker from '../../ui/S3dColorPicker.vue';
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import S3dSectionTitle from '../../ui/S3dSectionTitle.vue';
import S3dTextInput from '../../ui/S3dTextInput.vue';
import { useMaterialLibrary } from '../../../composables/useMaterialLibrary';
import { t } from '../../../i18n';

/** Name and colour for a new material; it becomes the paint material right away. */
const name = ref('');
const color = ref('#c08040');
const { create } = useMaterialLibrary();
const submit = () => {
  create(name.value, color.value);
  name.value = '';
};
</script>
