<template>
  <div class="overflow-auto px-4 py-3.5 select-text">
    <p class="mb-3" v-html="richText(t('ai.wizard.modelIntro'))"></p>
    <div class="mb-1.5 flex flex-col gap-1.5">
      <S3dModelPresetCard v-for="preset in MODEL_PRESETS" :key="preset.id" :preset="preset" />
    </div>
    <template v-if="otherDownloads.length">
      <div class="mt-2.5 mb-1 block text-xs font-semibold">{{ t('ai.wizard.runningDownloads') }}</div>
      <div v-for="name in otherDownloads" :key="name" class="mb-1.5 border border-line-2 bg-surface px-2.5 py-2">
        <div class="mb-1.5 flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate font-mono text-xs" :title="name">{{ name }}</span>
          <S3dButton v-if="!downloads[name].error" small @click="cancelDownload(name)">{{ t('common.cancel') }}</S3dButton>
        </div>
        <S3dPullProgress :progress="downloads[name]" />
      </div>
    </template>
    <template v-if="otherModels.length">
      <div class="mt-2.5 mb-1 block text-xs font-semibold">{{ t('ai.wizard.otherModels') }}</div>
      <div class="mb-1.5 flex max-h-55 flex-wrap gap-1.5 overflow-auto">
        <button
          v-for="modelName in otherModels"
          :key="modelName"
          type="button"
          class="flex items-center gap-1.5 border px-2.25 py-1.25 font-mono text-xs"
          :class="draft.model === modelName ? 'border-navy bg-active' : 'border-line-2 bg-surface'"
          :aria-pressed="draft.model === modelName"
          @click="draft.model = modelName"
        >
          {{ modelName
          }}<span v-if="quants[normModel(modelName)] && !quantFromName(modelName)" class="text-[0.625rem] text-muted">{{
            quants[normModel(modelName)]
          }}</span>
        </button>
      </div>
    </template>
    <label for="s3d-ai-model" class="mt-2.5 mb-1 block text-xs font-semibold">{{ t('ai.wizard.enterModel') }}</label>
    <input id="s3d-ai-model" v-model="draft.model" class="s3d-input" spellcheck="false" :placeholder="t('ai.wizard.modelPlaceholder')" />
    <p class="my-1.5 text-xs text-ink-2">{{ t('ai.wizard.installHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dButton from '../../../../components/ui/S3dButton.vue';
import S3dPullProgress from '../S3dPullProgress.vue';
import S3dModelPresetCard from './S3dModelPresetCard.vue';
import { richText } from '../../../../utils/safeHtml';
import { MODEL_PRESETS, downloads, cancelDownload, normModel, presetVariants, quantFromName } from '../providers';
import { useAiSetup } from './useAiSetup';
import { t } from '../../../../i18n';

/** Step 3: a recommended model (installed with one click), another model on the server, or one typed in. */
const { draft, models, quants } = useAiSetup();
/** every name a preset is pulled or used under – those are not listed again as "other models" */
const presetNames = computed(
  () => new Set(MODEL_PRESETS.flatMap(presetVariants).flatMap((variant) => [normModel(variant.name), normModel(variant.pull)])),
);
const otherModels = computed(() => models.value.filter((model) => !presetNames.value.has(normModel(model))));
/** Downloads started elsewhere (model search) – shown so a running pull is never invisible here. */
const otherDownloads = computed(() => Object.keys(downloads).filter((name) => !presetNames.value.has(normModel(name))));
</script>
