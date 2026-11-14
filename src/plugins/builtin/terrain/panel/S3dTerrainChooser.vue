<template>
  <div class="overflow-auto px-3 pt-2 pb-3 text-xs">
    <p class="mt-1 mb-2 leading-[1.4] text-ink-2" v-html="richText(t('terrain.panel.tip'))"></p>
    <div class="mb-1.5 grid grid-cols-[repeat(2,1fr)] gap-2 [&>label]:flex [&>label]:flex-col [&>label]:gap-0.75">
      <label
        >{{ t('terrain.panel.width') }}
        <span class="flex items-center gap-1"
          ><input v-model.number="terrainUi.newW" class="s3d-input h-6.5 w-full" type="number" min="1" max="500" /> m</span
        ></label
      >
      <label
        >{{ t('terrain.panel.depth') }}
        <span class="flex items-center gap-1"
          ><input v-model.number="terrainUi.newD" class="s3d-input h-6.5 w-full" type="number" min="1" max="500" /> m</span
        ></label
      >
    </div>
    <label class="flex flex-col gap-0.75"
      >{{ t('terrain.panel.detail') }}
      <select v-model="terrainUi.detail" class="s3d-input mb-1.5 h-6.5">
        <option value="grob">{{ t('terrain.panel.coarse') }}</option>
        <option value="mittel">{{ t('terrain.panel.medium') }}</option>
        <option value="fein">{{ t('terrain.panel.fine') }}</option>
      </select>
    </label>
    <S3dCheckbox v-model="terrainUi.startHills">{{ t('terrain.panel.startHills') }}</S3dCheckbox>
    <div class="mt-3 flex justify-end gap-2">
      <S3dButton primary @click="createNew(editor)">{{ t('terrain.panel.create') }}</S3dButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import S3dButton from '../../../../components/ui/S3dButton.vue';
import S3dCheckbox from '../../../../components/ui/S3dCheckbox.vue';
import { useEditor } from '../../../../components/keys';
import { richText } from '../../../../utils/safeHtml';
import { terrainUi, createNew } from '../session';
import { t } from '../../../../i18n';

/** A new terrain: width, depth, detail and whether it starts with hills. */
const editor = useEditor();
</script>
