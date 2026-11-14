<template>
  <S3dModalDialog :title="t('ai.search.title')" panel-class="h-[min(42.5rem,90vh)] w-[min(52rem,94vw)]" @close="emit('close')">
    <template #header
      ><span class="cursor-help text-[0.6875rem] text-muted underline decoration-dotted" :title="t('ai.search.ggufInfo')">{{
        t('ai.search.subtitle')
      }}</span></template
    >
    <S3dHfSearchBar v-model:query="query" v-model:sort="sort" v-model:small-only="smallOnly" @search="run" />
    <p v-if="!isOllama" class="mx-4 mb-2 bg-warn-bg px-2.5 py-1.5 text-xs text-warn">{{ t('ai.search.ollamaOnly') }}</p>

    <div class="flex-1 overflow-auto border-t border-line select-text">
      <div v-if="loading" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">
        <span class="size-3.5 animate-spin rounded-full border-2 border-[#cfd8e3] border-t-blue"></span> {{ t('ai.search.searching') }}
      </div>
      <div v-else-if="error" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-danger">✗ {{ error }}</div>
      <div v-else-if="!shown.length" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">
        {{ smallOnly && results.length ? t('ai.search.onlyBigger') : t('ai.search.nothing') }}
      </div>

      <div v-for="model in shown" :key="model.id" class="border-b border-line" :class="{ 'bg-surface-2': files.openId.value === model.id }">
        <S3dHfResultRow
          :model="model"
          :open="files.openId.value === model.id"
          :installed="hasRepo(model.id)"
          @click="files.toggle(model)"
        />
        <S3dHfModelFiles
          v-if="files.openId.value === model.id"
          :model="model"
          :detail="files.detail.value"
          :loading="files.loading.value"
          :error="files.error.value"
          :installed="installed"
          :can-download="isOllama"
          @use="use"
          @download="download"
        />
      </div>
    </div>
    <div class="border-t border-line px-4 py-2 text-[0.6875rem] text-muted">{{ t('ai.search.privacy') }}</div>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import S3dModalDialog from '../../../components/ui/S3dModalDialog.vue';
import S3dHfModelFiles from './search/S3dHfModelFiles.vue';
import S3dHfResultRow from './search/S3dHfResultRow.vue';
import S3dHfSearchBar from './search/S3dHfSearchBar.vue';
import { useHfDetail } from './search/useHfDetail';
import { useHfSearch } from './search/useHfSearch';
import { useOllamaModels } from './search/useOllamaModels';
import { aiConfig, startDownload } from './providers';
import type { HfQuant } from './hfsearch';
import { t } from '../../../i18n';

/** Model search on Hugging Face: find a GGUF model, download it with Ollama and use it. */
const emit = defineEmits<{ (event: 'close'): void; (event: 'use', model: string): void }>();
const { query, smallOnly, sort, results, shown, loading, error, run } = useHfSearch();
const files = useHfDetail();
const { installed, isOllama, refresh, hasRepo } = useOllamaModels();
// new results close the opened one
watch(results, files.close);

const download = async (quant: HfQuant) => {
  if (await startDownload(aiConfig, quant.ollamaName)) {
    await refresh();
  }
};
const use = (name: string) => {
  aiConfig.model = name;
  aiConfig.configured = true;
  emit('use', name);
  emit('close');
};
onMounted(() => {
  void run();
  void refresh();
});
</script>
