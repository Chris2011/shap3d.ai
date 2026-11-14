<template>
  <div class="flex-1 overflow-auto px-3 py-2.5 select-text">
    <S3dTextInput
      :model-value="search"
      @update:model-value="emit('update:search', $event)"
      :placeholder="t('ai.chat.searchHistory')"
      :aria-label="t('ai.chat.searchHistory')"
      @keydown.stop
    />
    <template v-for="(group, groupIndex) in groups" :key="groupIndex">
      <div class="mt-3 mb-1 s3d-caption text-navy">{{ group.day }}</div>
      <div
        v-for="session in group.sessions"
        :key="session.id"
        class="relative mb-1.25 cursor-pointer border bg-surface py-1.75 pe-7.5 ps-2.5"
        :class="
          session.id === aiHistory.currentId ? 'border-navy shadow-[inset_3px_0_0_var(--s3d-navy)]' : 'border-line hover:border-line-2'
        "
        @click="emit('open', session.id)"
      >
        <div class="truncate text-[0.8125rem]">{{ localize(session.title) }}</div>
        <div class="mt-0.5 text-[0.6875rem] text-muted">
          {{ clock(session.created)
          }}<template v-if="!sameDay(session.created, session.updated) || clock(session.created) !== clock(session.updated)">
            – {{ clock(session.updated) }}</template
          >
          · {{ t('ai.chat.requests', { count: requestCount(session) }) }} · {{ session.model || '—' }}
        </div>
        <button
          type="button"
          class="absolute top-2 end-1.5 bg-transparent opacity-50 hover:opacity-100"
          :title="t('commands.delete')"
          :aria-label="t('commands.delete')"
          @click.stop="deleteSession(session.id)"
        >
          <S3dIcon name="trash" :size="14" />
        </button>
      </div>
    </template>
    <div v-if="!groups.length" class="p-3 text-[0.6875rem] text-muted">
      {{ search ? t('ai.chat.noMatchingChats') : t('ai.chat.noChats') }}
    </div>
    <button
      v-if="aiHistory.sessions.length"
      type="button"
      class="mt-2.5 mb-1 bg-transparent p-0 text-xs text-danger hover:underline"
      @click="clearAll"
    >
      {{ t('ai.chat.clearHistory') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dIcon from '../../../../components/S3dIcon.vue';
import S3dTextInput from '../../../../components/ui/S3dTextInput.vue';
import { useEditor } from '../../../../components/keys';
import { aiHistory, deleteSession, clearHistory, sameDay, clock } from '../history';
import { groupSessionsByDay, requestCount } from '../historyGroups';
import { t, localize } from '../../../../i18n';

/** Earlier chats by day, searchable (v-model:search); a click opens one. */
const props = defineProps<{ search: string }>();
const emit = defineEmits<{ (event: 'open', id: string): void; (event: 'update:search', search: string): void }>();
const editor = useEditor();
const groups = computed(() => groupSessionsByDay(aiHistory.sessions, props.search));
const clearAll = async () => {
  if (await editor.confirm(t('ai.chat.confirmClear'))) {
    clearHistory();
  }
};
</script>
