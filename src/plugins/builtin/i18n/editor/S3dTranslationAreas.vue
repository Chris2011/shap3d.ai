<template>
  <!-- areas -->
  <nav class="w-46 flex-none overflow-auto border-e border-line py-1">
    <button
      v-for="area in areas"
      :key="area.id"
      type="button"
      class="flex w-full items-center gap-2 bg-transparent px-2.5 py-1 text-start"
      :class="editorState.area === area.id ? 'bg-active font-semibold text-navy' : 'text-ink hover:bg-hover'"
      :aria-current="editorState.area === area.id || undefined"
      @click="editorState.area = area.id"
    >
      <S3dIcon :name="area.icon" :size="16" />
      <span class="min-w-0 flex-1 truncate">{{ area.label }}</span>
      <span
        v-if="area.missing"
        class="rounded-full bg-warn-bg px-1.5 text-[0.625rem] font-bold text-warn tabular-nums"
        :title="t('i18n.editor.missingCount', { count: area.missing })"
        >{{ area.missing }}</span
      >
      <span v-else class="text-[0.625rem] text-ok">✓</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dIcon from '../../../../components/S3dIcon.vue';
import { t } from '../../../../i18n';
import { areaOrder } from '../areas';
import { editorState } from '../state';
import { missingPerArea, type TranslationRow } from '../translationRows';

/** The areas of the app (menus, tools, panels …) with how many texts are missing; a click shows only that one. */
const props = defineProps<{ rows: readonly TranslationRow[] }>();
const areas = computed(() => {
  const list = missingPerArea(props.rows).sort(
    (first, second) => areaOrder(first.id) - areaOrder(second.id) || first.label.localeCompare(second.label),
  );
  const total = list.reduce((sum, area) => sum + area.missing, 0);
  return [{ id: 'all', icon: 'menu', label: t('i18n.areas.all'), missing: total }, ...list];
});
</script>
