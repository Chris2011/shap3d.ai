<template>
  <div class="flex h-full min-h-0 flex-col">
    <S3dAiChatHeader v-model:view="view" @search-models="hfSearch = true" @new-chat="newChat" @settings="wizard = true" />
    <S3dAiHistory v-if="view === 'history'" v-model:search="search" @open="open" />
    <S3dAiMessages v-show="view === 'chat'" :now="now" @ask="composer?.ask($event)" @set-up="wizard = true" />
    <S3dAiComposer ref="composer" @sent="onSent" />
    <S3dAiWizard v-if="wizard" @close="wizard = false" />
    <Teleport to="body"
      ><S3dModelSearch v-if="hfSearch" @close="hfSearch = false" @use="(model) => editor.toast(t('ai.chat.modelChanged', { model }))"
    /></Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import { useIntervalFn } from '@vueuse/core';
import S3dAiWizard from './S3dAiWizard.vue';
import S3dModelSearch from './S3dModelSearch.vue';
import S3dAiChatHeader from './chat/S3dAiChatHeader.vue';
import S3dAiComposer from './chat/S3dAiComposer.vue';
import S3dAiHistory from './chat/S3dAiHistory.vue';
import S3dAiMessages from './chat/S3dAiMessages.vue';
import { useEditor } from '../../../components/keys';
import { aiState, clearChat } from './agent';
import { openSession } from './history';
import { t } from '../../../i18n';

/** AI chat panel: header, chat or history, the message input, and the set-up wizard and model search. */
const editor = useEditor();
const wizard = ref(false);
const hfSearch = ref(false);
const view = ref<'chat' | 'history'>('chat');
const search = ref('');
const composer = useTemplateRef<InstanceType<typeof S3dAiComposer>>('composer');
// ticking clock for the live "thinking" timer
const now = ref(Date.now());
useIntervalFn(() => {
  if (aiState.busy || aiState.turns.some((turn) => turn.status === 'streaming')) {
    now.value = Date.now();
  }
}, 250);
const onSent = () => {
  view.value = 'chat';
  now.value = Date.now();
};
const open = (id: string) => {
  openSession(id);
  view.value = 'chat';
};
const newChat = () => {
  if (aiState.busy) {
    return;
  }
  clearChat();
  view.value = 'chat';
};
</script>
