<template>
  <div class="overflow-auto px-4 py-3.5 select-text">
    <div class="mb-1.5 text-[0.9375rem] font-bold text-navy">{{ t(info.name) }}</div>
    <ol
      class="mb-2.5 list-decimal ps-5 [&_li]:my-1 [&_code]:bg-surface-2 [&_code]:px-1.25 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all"
    >
      <li v-for="(setupStep, i) in info.setup" :key="i"><span v-html="setupStepHtml(t(setupStep))"></span></li>
    </ol>
    <label for="s3d-ai-base-url" class="mt-2.5 mb-1 block text-xs font-semibold">{{ t('ai.wizard.baseUrl') }}</label>
    <input id="s3d-ai-base-url" v-model="draft.baseUrl" class="s3d-input" spellcheck="false" />
    <label for="s3d-ai-key" class="mt-2.5 mb-1 block text-xs font-semibold"
      >{{ t('ai.wizard.apiKey') }} <span v-if="!info.needsKey">{{ t('ai.wizard.optional') }}</span></label
    >
    <input
      id="s3d-ai-key"
      v-model="draft.apiKey"
      class="s3d-input"
      type="password"
      autocomplete="off"
      spellcheck="false"
      :placeholder="info.needsKey ? t('ai.wizard.pasteKey') : t('ai.wizard.leaveEmpty')"
    />
    <p class="my-1.5 text-xs text-ink-2">{{ t('ai.wizard.keyHint') }}</p>
    <div class="mt-3 flex flex-wrap items-center gap-2.5">
      <S3dButton primary :disabled="testing" @click="test">
        {{ testing ? t('ai.wizard.testing') : t('ai.wizard.test') }}
      </S3dButton>
      <span v-if="models.length" class="font-semibold text-ok">✓ {{ t('ai.wizard.connected', { count: models.length }) }}</span>
      <span v-else-if="error" class="text-xs text-danger">{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import S3dButton from '../../../../components/ui/S3dButton.vue';
import { setupStepHtml } from '../setupText';
import { useAiSetup } from './useAiSetup';
import { t } from '../../../../i18n';

/** Step 2: how to start the server, its address and key, and a connection test. */
const { draft, info, models, error, testing, test } = useAiSetup();
</script>
