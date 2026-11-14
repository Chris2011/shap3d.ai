<template>
  <div class="flex gap-2 px-4 pt-3 pb-1.5">
    <input
      ref="input"
      :value="query"
      class="s3d-input h-8 flex-1"
      :placeholder="t('ai.search.placeholder')"
      :aria-label="t('ai.search.placeholder')"
      spellcheck="false"
      @input="emit('update:query', valueOf($event))"
      @keydown.enter="emit('search')"
    />
    <S3dSelect
      :model-value="sort"
      class="h-8 w-42.5 flex-none"
      :title="t('ai.search.sort')"
      :aria-label="t('ai.search.sort')"
      @update:model-value="emit('update:sort', $event as HfSort)"
    >
      <option value="downloads">{{ t('ai.search.sortDownloads') }}</option>
      <option value="trendingScore">{{ t('ai.search.sortTrending') }}</option>
      <option value="likes">{{ t('ai.search.sortLikes') }}</option>
      <option value="lastModified">{{ t('ai.search.sortNewest') }}</option>
    </S3dSelect>
  </div>
  <div class="flex flex-wrap gap-1.5 px-4 pt-0.5 pb-2">
    <button
      v-for="chip in CHIPS"
      :key="chip.q"
      type="button"
      class="s3d-chip"
      :class="{ on: query === chip.q }"
      :aria-pressed="query === chip.q"
      :title="chip.hint && t(chip.hint)"
      @click="pick(chip)"
    >
      {{ localize(chip.label) }}
    </button>
    <S3dCheckbox
      :model-value="smallOnly"
      class="ms-auto gap-1.25 text-xs"
      :title="t('ai.search.smallTitle')"
      @update:model-value="emit('update:smallOnly', $event)"
      >{{ t('ai.search.smallOnly') }}</S3dCheckbox
    >
  </div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue';
import S3dCheckbox from '../../../../components/ui/S3dCheckbox.vue';
import S3dSelect from '../../../../components/ui/S3dSelect.vue';
import { valueOf } from '../../../../utils/inputEvent';
import type { HfSort } from '../hfsearch';
import { t, localize } from '../../../../i18n';

/** Search text, sort order, quick searches and "small models only" (v-model:query, v-model:sort, v-model:small-only). */
defineProps<{ query: string; sort: HfSort; smallOnly: boolean }>();
const emit = defineEmits<{
  (event: 'update:query', query: string): void;
  (event: 'update:sort', sort: HfSort): void;
  (event: 'update:smallOnly', smallOnly: boolean): void;
  (event: 'search'): void;
}>();
/** label: text or message key, hint: message key */
const CHIPS = [
  { label: 'ai.search.chipSmall', q: 'coder', hint: 'ai.search.chipSmallHint', small: true },
  { label: 'Code', q: 'qwen2.5 coder', hint: 'ai.search.chipCodeHint' },
  { label: '3D / Mesh', q: 'mesh', hint: 'ai.search.chipMeshHint' },
  { label: 'Qwen', q: 'qwen', hint: '' },
  { label: 'Llama', q: 'llama', hint: '' },
  { label: 'Gemma', q: 'gemma', hint: '' },
  { label: 'Phi', q: 'phi', hint: '' },
];
const pick = (chip: { q: string; small?: boolean }) => {
  emit('update:query', chip.q);
  emit('update:smallOnly', !!chip.small);
};
const input = useTemplateRef<HTMLInputElement>('input');
onMounted(() => input.value?.focus());
</script>
