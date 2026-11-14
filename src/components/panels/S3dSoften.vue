<template>
  <p class="s3d-label my-3">{{ t('soften.hint') }}</p>
  <S3dFieldRow :label="t('vcb.angle')">
    <S3dRangeSlider v-model="angle" class="flex-1" min="0" max="180" step="1" :aria-label="t('vcb.angle')" /><span class="w-10.5 text-end"
      >{{ angle }}°</span
    >
  </S3dFieldRow>
  <S3dCheckbox v-model="coplanar">{{ t('soften.coplanar') }}</S3dCheckbox>
  <div class="mt-2 flex gap-1.5">
    <S3dButton small :disabled="!hasSelection" :title="hasSelection ? '' : t('soften.selectFirst')" @click="apply">
      {{ t('soften.apply') }}</S3dButton
    ><S3dButton small :disabled="!hasSelection" :title="hasSelection ? '' : t('soften.selectFirst')" @click="clear">
      {{ t('soften.reset') }}
    </S3dButton>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import S3dButton from '../ui/S3dButton.vue';
import S3dCheckbox from '../ui/S3dCheckbox.vue';
import S3dFieldRow from '../ui/S3dFieldRow.vue';
import S3dRangeSlider from '../ui/S3dRangeSlider.vue';
import { useEditor } from '../keys';
import { softenSelectionByAngle, unsoftenSelection } from '../../engine/softenEdges';
import { t } from '../../i18n';

const editor = useEditor();
const angle = ref(20);
const coplanar = ref(true);
const hasSelection = computed(() => {
  void editor.ui.selRev;
  return editor.selection.size > 0;
});
const apply = () => softenSelectionByAngle(editor, angle.value, coplanar.value);
const clear = () => unsoftenSelection(editor);
</script>
