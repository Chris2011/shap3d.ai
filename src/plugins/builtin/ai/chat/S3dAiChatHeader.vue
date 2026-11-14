<template>
  <div class="flex items-center gap-2 border-b border-line px-3 py-2 text-xs">
    <template v-if="aiConfig.configured">
      <span
        class="max-w-70 min-w-0 flex-[0_1_auto] truncate border border-line-2 bg-surface px-2 py-0.5"
        :title="t(info.name) + ' · ' + aiConfig.model"
        >{{ t(info.name).replace(/ \(.*\)/, '') }} · <b>{{ aiConfig.model }}</b></span
      >
    </template>
    <span v-else class="max-w-70 min-w-0 flex-[0_1_auto] truncate border border-line-2 bg-surface px-2 py-0.5 text-muted">{{
      t('ai.chat.notConfigured')
    }}</span>
    <button
      type="button"
      class="-ms-1 flex size-6 flex-none items-center justify-center bg-transparent p-0 text-navy hover:bg-hover"
      :title="t('ai.chat.searchModels')"
      :aria-label="t('ai.chat.searchModels')"
      @click="emit('searchModels')"
    >
      <S3dIcon name="search" :size="16" />
    </button>
    <span class="min-w-0 flex-[1_1_0]"></span>
    <button
      type="button"
      class="flex-none whitespace-nowrap s3d-link"
      :class="{ 'font-bold underline': view === 'history' }"
      :aria-pressed="view === 'history'"
      @click="emit('update:view', view === 'history' ? 'chat' : 'history')"
    >
      {{ t('ai.chat.history', { count: chatCount }) }}
    </button>
    <button type="button" class="flex-none whitespace-nowrap s3d-link" @click="emit('newChat')">{{ t('ai.chat.newChat') }}</button>
    <button type="button" class="flex-none whitespace-nowrap s3d-link" @click="emit('settings')">
      {{ aiConfig.configured ? t('ai.chat.settings') : t('ai.chat.setUp') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dIcon from '../../../../components/S3dIcon.vue';
import { aiConfig, providerInfo } from '../providers';
import { aiHistory } from '../history';
import { t } from '../../../../i18n';

/** Top bar of the chat: provider and model, model search, history ⇄ chat, new chat, settings. */
defineProps<{ view: 'chat' | 'history' }>();
const emit = defineEmits<{
  (event: 'update:view', view: 'chat' | 'history'): void;
  (event: 'searchModels'): void;
  (event: 'newChat'): void;
  (event: 'settings'): void;
}>();
const info = computed(() => providerInfo(aiConfig.provider));
const chatCount = computed(() => aiHistory.sessions.filter((session) => session.turns.length).length);
</script>
