<template>
  <S3dFieldRow :label="label">
    <div class="size-6.5 flex-none rounded-[3px] border border-line-2" :style="{ background: color }" :title="swatchTitle"></div>
    <span class="flex-1 truncate text-xs">{{ material ?? t('names.defaultMaterial') }}</span>
    <S3dButton small :title="buttonTitle" @click="emit('assign')">{{ t('tags.assign') }}</S3dButton>
  </S3dFieldRow>
</template>

<script setup lang="ts">
import S3dButton from '../../ui/S3dButton.vue';
import S3dFieldRow from '../../ui/S3dFieldRow.vue';
import { t } from '../../../i18n';

/** A material of the selection (front or back) with its swatch, and "Assign" for the paint material. */
defineProps<{ label: string; material?: string; color: string; swatchTitle?: string; buttonTitle?: string }>();
const emit = defineEmits<{ (event: 'assign'): void }>();
</script>
