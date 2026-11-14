<template>
  <div class="overflow-auto px-4 py-3.5 select-text">
    <div class="text-center text-[2.875rem] text-[#2e9b4b]" aria-hidden="true">✓</div>
    <p class="mb-3 text-center">
      {{ t('ai.wizard.done') }} <b>{{ t(info.name) }}</b> {{ t('ai.wizard.with') }} <b>{{ draft.model }}</b> {{ t('ai.wizard.isSetUp') }}
    </p>
    <S3dCheckbox v-model="draft.autoRun">{{ t('ai.wizard.autoRun') }}</S3dCheckbox>
    <p class="my-1.5 text-xs text-ink-2">{{ t('ai.wizard.tryHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import S3dCheckbox from '../../../../components/ui/S3dCheckbox.vue';
import { useAiSetup } from './useAiSetup';
import { t } from '../../../../i18n';

/** Step 4: what is set up, and whether generated code runs by itself. */
const { draft, info } = useAiSetup();
</script>
