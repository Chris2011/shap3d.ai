<template>
  <div
    class="cursor-pointer border bg-surface px-2.5 py-2"
    :class="chosen ? 'border-navy bg-sel shadow-[0_0_0_1px_var(--s3d-navy)]' : 'border-line-2'"
    @click="choosePreset(preset)"
  >
    <div class="flex items-center gap-2">
      <span class="font-bold text-navy">{{ localize(preset.label) }}</span>
      <span
        class="rounded-lg px-1.5 text-[0.625rem]"
        :class="
          preset.mode === 'mesh'
            ? 'bg-[#f3e5f5] text-[#6a1b9a] dark:bg-[#2d1b36] dark:text-[#d2a8ff]'
            : 'bg-sel text-[#1e4f9b] dark:text-navy'
        "
        >{{ preset.mode === 'mesh' ? t('ai.wizard.mesh') : t('ai.wizard.code') }}</span
      >
      <select
        v-if="variants.length > 1"
        class="s3d-input h-6 w-auto py-0 font-mono text-[0.6875rem]"
        :value="variant.quant"
        :title="t('ai.wizard.quantTitle')"
        :aria-label="t('ai.wizard.quantTitle')"
        @click.stop
        @change="chooseQuant(valueOf($event))"
      >
        <option v-for="option in variants" :key="option.quant" :value="option.quant">
          {{ option.quant }}{{ option.quant === RECOMMENDED_QUANT ? ' ★' : '' }}{{ variantInstalled(option) ? ' ✓' : '' }}
        </option>
      </select>
      <span class="text-[0.6875rem] text-muted"
        >{{ variant.estimated ? '≈ ' : ''
        }}{{ formatNumber(variant.size, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }} GB</span
      >
      <span class="flex-1"></span>
      <span v-if="variantInstalled(variant)" class="text-xs font-semibold text-ok">{{ t('ai.wizard.installed') }}</span>
      <template v-else-if="draft.provider === 'ollama'">
        <S3dButton v-if="download && !download.error" small @click.stop="cancelDownload(variant.pull)">{{ t('common.cancel') }}</S3dButton>
        <S3dButton v-else small @click.stop="install(preset)">
          {{ download?.error ? t('ai.wizard.retry') : t('pluginManager.install') }}
        </S3dButton>
      </template>
    </div>
    <div class="mt-0.75 text-xs text-ink-2">{{ t(preset.note) }}</div>
    <S3dPullProgress v-if="download" class="mt-2" :progress="download" @click.stop />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dButton from '../../../../components/ui/S3dButton.vue';
import S3dPullProgress from '../S3dPullProgress.vue';
import { valueOf } from '../../../../utils/inputEvent';
import { downloads, cancelDownload, presetVariants, type ModelPreset } from '../providers';
import { RECOMMENDED_QUANT } from '../hfsearch';
import { useAiSetup } from './useAiSetup';
import { t, localize, formatNumber } from '../../../../i18n';

/** One recommended model: code or mesh, quantization, size, install/cancel with Ollama; a click chooses it once installed. */
const props = defineProps<{ preset: ModelPreset }>();
const { draft, chosenQuants, variantInstalled, variantOf, choosePreset, install } = useAiSetup();
const variants = computed(() => presetVariants(props.preset));
const variant = computed(() => variantOf(props.preset));
const download = computed(() => downloads[variant.value.pull]);
const chosen = computed(() => draft.model === variant.value.name && variantInstalled(variant.value));
const chooseQuant = (quant: string) => {
  chosenQuants[props.preset.id] = quant;
  choosePreset(props.preset);
};
</script>
