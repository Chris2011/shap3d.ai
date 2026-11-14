<template>
  <S3dTextInput v-model="filter" :placeholder="t('materials.search')" :aria-label="t('materials.search')" />
  <S3dButton v-for="panel in materialPanels" :key="panel.id" small class="mt-1.5" @click="showPanel(panel.id)">
    {{ panel.label }} …
  </S3dButton>
  <div class="mt-1.5 flex items-center justify-end gap-1 text-[0.6875rem]" :title="t('materials.previewTitle')">
    <S3dButton small :primary="!previewAsCube" @click="previewShape = 'flat'">{{ t('materials.previewFlat') }}</S3dButton>
    <S3dButton small :primary="previewAsCube" @click="previewShape = 'cube'">{{ t('materials.previewCube') }}</S3dButton>
  </div>
  <div class="my-2.5 grid grid-cols-[repeat(6,1fr)] gap-1.5">
    <div
      class="flex aspect-square cursor-pointer items-end justify-center rounded-[3px] border border-line-2 bg-[linear-gradient(135deg,var(--s3d-bg)_50%,#a4b2bf_50%)] text-[0.5625rem] text-[#333]"
      :class="{ 'outline-2 outline-offset-1 outline-blue': editor.ui.currentMaterial == null }"
      :title="t('names.defaultMaterial')"
      @click="choose(null)"
    >
      <span>{{ t('materials.defaultShort') }}</span>
    </div>
    <S3dMaterialSwatch
      v-for="material in list"
      :key="material.name"
      :material="material"
      :cube="previewAsCube"
      :selected="editor.ui.currentMaterial === material.name"
      @click="choose(material.name)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import S3dButton from '../../ui/S3dButton.vue';
import S3dTextInput from '../../ui/S3dTextInput.vue';
import S3dMaterialSwatch from './S3dMaterialSwatch.vue';
import { useEditor } from '../../keys';
import { PANEL_INFO, showPanel } from '../../panelState';
import { useModel } from '../../../composables/useModel';
import { useMaterialLibrary } from '../../../composables/useMaterialLibrary';
import { t } from '../../../i18n';

/** Search, flat/cube preview and the grid of the model's materials; a click picks the paint material. */
const editor = useEditor();
const { choose } = useMaterialLibrary();
const materialPanels = computed(() => PANEL_INFO.filter((panel) => panel.inMaterials));
/** the swatches as a flat square or a small cube – remembered in the browser */
const previewShape = useLocalStorage<'flat' | 'cube'>('s3d:material-preview', 'flat');
const previewAsCube = computed(() => previewShape.value === 'cube');
const filter = ref('');
const materials = useModel(() => editor.model.materials);
const list = computed(() =>
  materials.value.filter((material) => !filter.value || material.name.toLowerCase().includes(filter.value.toLowerCase())),
);
</script>
