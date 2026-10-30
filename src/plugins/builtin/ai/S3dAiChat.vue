<template>
  <div class="flex h-full min-h-0 flex-col">
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
        class="-ms-1 flex size-6 flex-none items-center justify-center bg-transparent p-0 text-navy hover:bg-hover"
        :title="t('ai.chat.searchModels')"
        @click="hfSearch = true"
      >
        <S3dIcon name="search" :size="16" />
      </button>
      <span class="min-w-0 flex-[1_1_0]"></span>
      <button
        class="flex-none whitespace-nowrap s3d-link"
        :class="{ 'font-bold underline': view === 'history' }"
        @click="view = view === 'history' ? 'chat' : 'history'"
      >
        {{ t('ai.chat.history', { count: aiHistory.sessions.filter((s) => s.turns.length).length }) }}
      </button>
      <button class="flex-none whitespace-nowrap s3d-link" @click="newChat">{{ t('ai.chat.newChat') }}</button>
      <button class="flex-none whitespace-nowrap s3d-link" @click="wizard = true">
        {{ aiConfig.configured ? t('ai.chat.settings') : t('ai.chat.setUp') }}
      </button>
    </div>

    <!-- history browser -->
    <div v-if="view === 'history'" class="flex-1 overflow-auto px-3 py-2.5 select-text">
      <input v-model="search" class="s3d-input" :placeholder="t('ai.chat.searchHistory')" @keydown.stop />
      <template v-for="(group, groupIndex) in historyGroups" :key="groupIndex">
        <div class="mt-3 mb-1 s3d-caption text-navy">{{ group.day }}</div>
        <div
          v-for="session in group.sessions"
          :key="session.id"
          class="relative mb-1.25 cursor-pointer border bg-surface py-1.75 pe-7.5 ps-2.5"
          :class="
            session.id === aiHistory.currentId ? 'border-navy shadow-[inset_3px_0_0_var(--s3d-navy)]' : 'border-line hover:border-line-2'
          "
          @click="open(session.id)"
        >
          <div class="truncate text-[0.8125rem]">{{ localize(session.title) }}</div>
          <div class="mt-0.5 text-[0.6875rem] text-muted">
            {{ clock(session.created)
            }}<template v-if="!sameDay(session.created, session.updated) || clock(session.created) !== clock(session.updated)">
              – {{ clock(session.updated) }}</template
            >
            · {{ t('ai.chat.requests', { count: reqCount(session) }) }} · {{ session.model || '—' }}
          </div>
          <button
            class="absolute top-2 right-1.5 bg-transparent opacity-50 hover:opacity-100"
            :title="t('commands.delete')"
            @click.stop="deleteSession(session.id)"
          >
            <S3dIcon name="trash" :size="14" />
          </button>
        </div>
      </template>
      <div v-if="!historyGroups.length" class="p-3 text-[0.6875rem] text-muted">
        {{ search ? t('ai.chat.noMatchingChats') : t('ai.chat.noChats') }}
      </div>
      <button v-if="aiHistory.sessions.length" class="mt-2.5 mb-1 bg-transparent p-0 text-xs text-danger hover:underline" @click="clearAll">
        {{ t('ai.chat.clearHistory') }}
      </button>
    </div>

    <div v-show="view === 'chat'" ref="list" class="flex flex-1 flex-col gap-2 overflow-auto px-3 py-2.5 select-text">
      <div v-if="!aiConfig.configured" class="flex flex-col items-center gap-2 px-2.5 py-5 text-center text-ink">
        <S3dIcon name="sparkle" :size="40" />
        <p>{{ t('ai.chat.intro') }}</p>
        <button class="s3d-btn primary" @click="wizard = true">{{ t('ai.chat.setUpAi') }}</button>
        <p class="text-[0.6875rem] text-muted">{{ t('ai.chat.local') }}</p>
      </div>
      <div v-else-if="!aiState.turns.length" class="flex flex-col items-center gap-2 px-2.5 py-5 text-center text-ink">
        <S3dIcon name="sparkle" :size="34" />
        <p>{{ t('ai.chat.whatToBuild') }}</p>
        <p v-if="isMesh" class="text-[0.6875rem] text-muted">{{ t('ai.chat.meshHint') }}</p>
        <div class="flex flex-wrap justify-center gap-1.5">
          <button v-for="question in QUICK" :key="question" class="s3d-chip" @click="ask(question)">{{ question }}</button>
        </div>
      </div>

      <template v-for="(turn, i) in aiState.turns" :key="turn.id">
        <div
          v-if="i === 0 || !sameDay(aiState.turns[i - 1].createdAt, turn.createdAt)"
          class="my-1 flex items-center gap-2 text-[0.6875rem] text-muted before:h-px before:flex-1 before:bg-line before:content-[''] after:h-px after:flex-1 after:bg-line after:content-['']"
        >
          <span>{{ dayLabel(turn.createdAt) }}</span>
        </div>
        <div
          v-if="turn.role === 'user'"
          class="max-w-[92%] self-end px-2.5 py-2 text-[0.8125rem]/[1.45] break-words whitespace-pre-wrap"
          :class="turn.auto ? 'bg-warn-bg text-xs text-warn' : 'bg-navy-bg text-white'"
        >
          {{ turn.auto ? t('ai.chat.autoFix') : turn.text
          }}<span class="mt-0.75 block text-end text-[0.625rem] opacity-70">{{ clock(turn.createdAt) }}</span>
        </div>
        <div
          v-else
          class="max-w-[92%] self-start border border-line bg-surface px-2.5 py-2 text-[0.8125rem]/[1.45] break-words whitespace-pre-wrap"
        >
          <div class="mb-0.75 flex items-center gap-2 text-[0.65625rem] text-muted">
            <span>{{ clock(turn.createdAt) }}</span
            ><span v-if="turn.model" class="bg-surface-2 px-1.25">{{ turn.model.replace(/^hf\.co\/[^/]+\//, '') }}</span>
            <span v-if="turn.status === 'streaming' || turn.status === 'running'" class="font-bold text-blue tabular-nums"
              >⏱ {{ elapsed(now - turn.createdAt) }}</span
            >
            <span
              v-else-if="turn.endedAt"
              class="tabular-nums"
              :title="t('ai.chat.startEnd', { start: clockSec(turn.createdAt), end: clockSec(turn.endedAt) })"
              >⏱ {{ elapsed(turn.endedAt - turn.createdAt) }}</span
            >
          </div>
          <details v-if="turn.thinking" class="mb-1 text-xs text-ink-2">
            <summary class="cursor-pointer select-none hover:text-ink">
              {{ t('ai.chat.thoughts', { count: turn.thinking.split(/\s+/).length }) }}
            </summary>
            <div class="mt-1 max-h-60 overflow-auto border-s-2 border-line ps-2 text-[0.6875rem]/[1.45] text-muted">
              {{ turn.thinking }}
            </div>
          </details>
          <template v-if="turn.text">
            <template v-for="(part, partIndex) in splitFences(turn.text)" :key="partIndex">
              <div v-if="part.kind === 'text'">{{ part.text.trim() }}</div>
              <S3dCodeBlock v-else :code="part.code" :lang="part.lang" :streaming="part.open && turn.status === 'streaming'" />
            </template>
          </template>
          <div v-if="turn.status === 'streaming'" class="mt-1 text-xs text-ink-2">
            <span class="after:animate-blink after:tracking-[0.125rem] after:text-blue after:content-['●●●']"></span>
            {{ turn.text ? t('ai.chat.writing') : t('ai.chat.thinking') }}
            <b class="text-blue tabular-nums">{{ elapsed(now - turn.createdAt) }}</b>
          </div>
          <div v-if="turn.status === 'running'" class="mt-1 text-xs text-ink-2">
            <span class="after:animate-blink after:tracking-[0.125rem] after:text-blue after:content-['●●●']"></span>
            {{ t('ai.chat.building') }}
            <b class="text-blue tabular-nums">{{ elapsed(now - turn.createdAt) }}</b>
          </div>
          <S3dCodeBlock v-if="turn.code" :code="turn.code" :lang="turn.lang ?? 'js'" :start-collapsed="turn.lang === 'obj'" />
          <div v-if="turn.status === 'done' && turn.result" class="mt-1 text-xs text-ok">✓ {{ turn.result }}</div>
          <div v-if="turn.status === 'error'" class="mt-1 text-xs text-danger">✗ {{ turn.error }}</div>
          <div v-if="turn.status === 'stopped'" class="mt-1 text-xs text-ink-2">{{ t('ai.chat.stopped') }}</div>
          <div class="mt-1.5 flex flex-wrap gap-2.5">
            <button v-if="turn.status === 'pending'" class="s3d-btn small primary" @click="run(turn)">{{ t('scriptEditor.run') }}</button>
            <button v-if="turn.code && (turn.status === 'error' || turn.status === 'done')" class="s3d-link" @click="run(turn)">
              {{ t('ai.chat.runAgain') }}
            </button>
            <button v-if="turn.code" class="s3d-link" @click="toEditor(turn)">{{ t('ai.chat.openInEditor') }}</button>
            <button v-if="turn.undoable && isLastDone(turn) && editor.ui.undoLabel === 'ai.undoLabel'" class="s3d-link" @click="undo(turn)">
              {{ t('commands.undo') }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="flex gap-1.5 border-t border-line px-3 pt-2 pb-1">
      <textarea
        ref="ta"
        class="flex-1 resize-none border border-line-2 bg-surface px-2 py-1.5 font-sans text-[0.8125rem] outline-none focus:border-navy"
        v-model="prompt"
        rows="2"
        :disabled="!aiConfig.configured"
        :placeholder="isMesh ? t('ai.chat.placeholderMesh') : t('ai.chat.placeholder')"
        @keydown.stop
        @keydown.enter.exact.prevent="submit"
      ></textarea>
      <button
        v-if="aiState.busy"
        class="flex w-9.5 items-center justify-center bg-[#c62828] text-white"
        :title="t('scenes.stop')"
        @click="stop"
      >
        <S3dIcon name="stop" :size="16" />
      </button>
      <button
        v-else
        class="flex w-9.5 items-center justify-center bg-navy-bg text-white disabled:cursor-default disabled:opacity-40"
        :title="t('ai.chat.send')"
        :disabled="!prompt.trim() || !aiConfig.configured"
        @click="submit"
      >
        <S3dIcon name="send" :size="16" />
      </button>
    </div>
    <div
      class="flex items-center gap-3.5 px-3 pt-0.5 pb-2 text-[0.6875rem] text-ink-2 [&_label]:flex [&_label]:cursor-pointer [&_label]:items-center [&_label]:gap-1.5"
    >
      <label><input v-model="aiConfig.autoRun" type="checkbox" /> {{ t('ai.chat.autoRun') }}</label>
      <label v-if="!isMesh" :class="{ 'font-bold text-warn': aiConfig.fast }" :title="t('ai.chat.fastTitle')"
        ><input v-model="aiConfig.fast" type="checkbox" /> {{ t('ai.chat.fast') }}</label
      >
    </div>
    <S3dAiWizard v-if="wizard" @close="wizard = false" />
    <Teleport to="body"
      ><S3dModelSearch v-if="hfSearch" @close="hfSearch = false" @use="(model) => editor.toast(t('ai.chat.modelChanged', { model }))"
    /></Teleport>
  </div>
</template>

<script setup lang="ts">
import { useScripts } from '../../../composables/useScripts';
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import S3dIcon from '../../../components/S3dIcon.vue';
import S3dAiWizard from './S3dAiWizard.vue';
import S3dModelSearch from './S3dModelSearch.vue';
import S3dCodeBlock from './S3dCodeBlock.vue';
import { splitFences } from '../../../scripting/highlight';
import { useEditor } from '../../../components/keys';
import { aiConfig, providerInfo, modeFor } from './providers';
import { aiState, send, stop, clearChat, execute, type AiTurn } from './agent';
import {
  aiHistory,
  openSession,
  deleteSession,
  clearHistory,
  dayLabel,
  sameDay,
  clock,
  clockSec,
  elapsed,
  type AiSession,
} from './history';
import { useIntervalFn } from '@vueuse/core';
import { showPanel } from '../../../components/panelState';
import { t, localize } from '../../../i18n';

const editor = useEditor();
const scripts = useScripts();
const wizard = ref(false);
const hfSearch = ref(false);
const view = ref<'chat' | 'history'>('chat');
const search = ref('');
// ticking clock for the live "thinking" timer
const now = ref(Date.now());
useIntervalFn(() => {
  if (aiState.busy || aiState.turns.some((turn) => turn.status === 'streaming')) {
    now.value = Date.now();
  }
}, 250);
const historyGroups = computed(() => {
  const term = search.value.trim().toLowerCase();
  const list = aiHistory.sessions.filter(
    (session) =>
      session.turns.length &&
      (!term ||
        localize(session.title).toLowerCase().includes(term) ||
        session.turns.some((turn) => turn.text.toLowerCase().includes(term) || (turn.code ?? '').toLowerCase().includes(term))),
  );
  const groups: { day: string; sessions: AiSession[] }[] = [];
  for (const session of [...list].sort((first, second) => second.updated - first.updated)) {
    const day = dayLabel(session.updated);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.day === day) {
      lastGroup.sessions.push(session);
    } else {
      groups.push({ day: day, sessions: [session] });
    }
  }
  return groups;
});
const reqCount = (session: AiSession) => session.turns.filter((turn) => turn.role === 'user' && !turn.auto).length;
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
const clearAll = async () => {
  if (await editor.confirm(t('ai.chat.confirmClear'))) {
    clearHistory();
  }
};
const prompt = ref('');
const list = shallowRef<HTMLElement | null>(null);
const info = computed(() => providerInfo(aiConfig.provider));
const isMesh = computed(() => modeFor(aiConfig.model) === 'mesh');
const QUICK = computed(() => [1, 2, 3, 4, 5, 6].map((index) => t(`ai.chat.quick${index}`)));

const ask = (question: string) => {
  prompt.value = question;
  submit();
};
const submit = () => {
  const text = prompt.value;
  if (!text.trim() || aiState.busy) {
    return;
  }
  prompt.value = '';
  view.value = 'chat';
  now.value = Date.now();
  send(editor, text);
};
const run = (turn: AiTurn) => {
  if (turn.status === 'running') {
    return; // a run is already in progress for this code
  }
  execute(editor, turn);
};
const undo = (turn: AiTurn) => {
  editor.undo();
  turn.undoable = false;
  turn.result = t('ai.chat.undone');
};
const isLastDone = (turn: AiTurn) => {
  const done = aiState.turns.filter((candidate) => candidate.undoable);
  return done[done.length - 1] === turn;
};
const toEditor = (turn: AiTurn) => {
  scripts.draft.value = { lang: turn.lang ?? 'js', code: turn.code ?? '', size: turn.targetSize };
  showPanel('scripts');
};
watch(
  () => aiState.turns.map((turn) => turn.text.length + (turn.status ?? '')).join(),
  () =>
    nextTick(() => {
      if (list.value) {
        list.value.scrollTop = list.value.scrollHeight;
      }
    }),
);
</script>
