<template>
  <div class="pt-0.5 pe-4 pb-3 ps-9">
    <div v-if="loading" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">
      <span class="size-3.5 animate-spin rounded-full border-2 border-[#cfd8e3] border-t-blue"></span>
      {{ t('ai.search.loadingFiles') }}
    </div>
    <div v-else-if="error" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-danger">✗ {{ error }}</div>
    <template v-else-if="detail">
      <div class="mb-1.5 flex flex-wrap gap-3.5 text-xs text-ink [&_a]:text-blue">
        <span v-if="detail.params">{{ t('ai.search.parameters', { count: formatParams(detail.params) }) }}</span>
        <span v-if="detail.arch">{{ t('ai.search.architecture', { arch: detail.arch }) }}</span>
        <span v-if="detail.context">{{ t('ai.search.context', { tokens: fmtCount(detail.context) }) }}</span>
        <a :href="'https://huggingface.co/' + model.id" target="_blank" rel="noopener noreferrer">{{ t('ai.search.viewOnHf') }}</a>
      </div>
      <p v-if="!model.chat" class="mb-1.5 bg-warn-bg px-2.5 py-1.5 text-xs text-warn">{{ t('ai.search.notChatTitle') }}</p>
      <p v-if="!detail.quants.length" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">
        {{ detail.split ? t('ai.search.onlySplit') : t('ai.search.noFiles') }}
      </p>
      <p v-else class="mt-1 mb-1.5 text-xs text-ink-2">
        {{ t('ai.search.quantHint') }} <b>{{ RECOMMENDED_QUANT }}</b> {{ t('ai.search.quantBest') }}
      </p>
      <div
        v-for="quant in detail.quants"
        :key="quant.quant"
        class="grid grid-cols-[minmax(11rem,auto)_5rem_minmax(7rem,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-line px-1.5 py-1 text-xs"
        :class="{ 'bg-ok-bg': quant.quant === RECOMMENDED_QUANT }"
      >
        <span class="font-mono font-bold"
          >{{ quant.quant
          }}<span v-if="quant.quant === RECOMMENDED_QUANT" class="font-sans text-[0.6875rem] font-semibold text-ok">
            {{ t('ai.search.recommended') }}</span
          ></span
        >
        <span class="text-end tabular-nums">{{ quant.size ? fmtBytes(quant.size) : '?' }}</span>
        <span :class="SPEED_TEXT[speedClass(quant.size, activeShare(model)).cls]">{{
          speedClass(quant.size, activeShare(model)).label
        }}</span>
        <span class="flex items-center justify-end gap-2">
          <S3dButton
            v-if="downloads[quant.ollamaName] && !downloads[quant.ollamaName].error"
            small
            @click="cancelDownload(quant.ollamaName)"
          >
            {{ t('common.cancel') }}
          </S3dButton>
          <S3dButton
            v-else-if="installed.has(quant.ollamaName.toLowerCase())"
            small
            primary
            :disabled="!model.chat"
            @click="emit('use', quant.ollamaName)"
          >
            {{ t('ai.search.use') }}
          </S3dButton>
          <S3dButton
            v-else
            small
            :disabled="!canDownload || model.gated || !model.chat"
            :title="
              !model.chat
                ? t('ai.search.notChatTitle')
                : model.gated
                  ? t('ai.search.needsLogin')
                  : t('ai.search.downloadTitle', { size: fmtBytes(quant.size) })
            "
            @click="emit('download', quant)"
          >
            {{ t('ai.search.download') }}
          </S3dButton>
        </span>
        <S3dPullProgress v-if="downloads[quant.ollamaName]" class="col-span-full pb-1" :progress="downloads[quant.ollamaName]" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import S3dButton from '../../../../components/ui/S3dButton.vue';
import S3dPullProgress from '../S3dPullProgress.vue';
import { downloads, cancelDownload, fmtBytes } from '../providers';
import { fmtCount, speedClass, RECOMMENDED_QUANT, type HfDetail, type HfModel, type HfQuant } from '../hfsearch';
import { SPEED_TEXT, activeShare, formatParams } from './hfFormat';
import { t } from '../../../../i18n';

/** The files of an opened result: one row per quantization with size, speed and download / use. */
defineProps<{
  model: HfModel;
  detail: HfDetail | null;
  loading: boolean;
  error: string;
  installed: ReadonlySet<string>;
  /** downloads need Ollama */
  canDownload: boolean;
}>();
const emit = defineEmits<{ (event: 'use', name: string): void; (event: 'download', quant: HfQuant): void }>();
</script>
