<template>
  <S3dFieldRow :label="label">
    <S3dColorPicker wide :model-value="style[field]" :aria-label="label" @update:model-value="setStyle(field, $event)" />
  </S3dFieldRow>
</template>

<script setup lang="ts">
import S3dColorPicker from '../../ui/S3dColorPicker.vue';
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import { useStyleSettings } from '../../../composables/useStyleSettings';

/** A style colour with its label. */
defineProps<{ field: 'frontColor' | 'backColor' | 'edgeColor' | 'skyColor' | 'groundColor' | 'aoColor'; label: string }>();
const { style, setStyle } = useStyleSettings();
</script>
