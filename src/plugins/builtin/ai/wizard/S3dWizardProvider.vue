<template>
  <div class="overflow-auto px-4 py-3.5 select-text">
    <p class="mb-3" v-html="richText(t('ai.wizard.providerIntro'))"></p>
    <div class="grid grid-cols-[repeat(2,1fr)] gap-2">
      <button
        v-for="provider in PROVIDERS"
        :key="provider.id"
        type="button"
        class="flex flex-col gap-1 border bg-surface p-2.5 text-start"
        :class="draft.provider === provider.id ? 'border-navy bg-sel shadow-[0_0_0_1px_var(--s3d-navy)]' : 'border-line-2'"
        :aria-pressed="draft.provider === provider.id"
        @click="chooseProvider(provider.id)"
      >
        <div class="font-bold text-navy">{{ t(provider.name) }}</div>
        <div class="flex gap-1 [&>span]:rounded-lg [&>span]:px-1.5 [&>span]:text-[0.625rem]">
          <span class="bg-ok-bg text-ok">{{ t('ai.wizard.local') }}</span
          ><span class="bg-surface-2 text-ink-2">{{ t('ai.wizard.free') }}</span>
        </div>
        <div class="text-xs text-ink-2">{{ t(provider.blurb) }}</div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { richText } from '../../../../utils/safeHtml';
import { PROVIDERS } from '../providers';
import { useAiSetup } from './useAiSetup';
import { t } from '../../../../i18n';

/** Step 1: which local AI server (Ollama, LM Studio …). */
const { draft, chooseProvider } = useAiSetup();
</script>
