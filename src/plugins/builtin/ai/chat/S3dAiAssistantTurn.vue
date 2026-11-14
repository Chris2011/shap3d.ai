<template>
  <div class="max-w-[92%] self-start border border-line bg-surface px-2.5 py-2 text-[0.8125rem]/[1.45] break-words whitespace-pre-wrap">
    <div class="mb-0.75 flex items-center gap-2 text-[0.65625rem] text-muted">
      <span>{{ clock(turn.createdAt) }}</span
      ><span v-if="turn.model" class="bg-surface-2 px-1.25">{{ turn.model.replace(/^hf\.co\/[^/]+\//, '') }}</span>
      <span v-if="working" class="font-bold text-blue tabular-nums">⏱ {{ elapsed(now - turn.createdAt) }}</span>
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
    <div v-if="working" class="mt-1 text-xs text-ink-2">
      <span class="after:animate-blink after:tracking-[0.125rem] after:text-blue after:content-['●●●']"></span>
      {{ turn.status === 'running' ? t('ai.chat.building') : turn.text ? t('ai.chat.writing') : t('ai.chat.thinking') }}
      <b class="text-blue tabular-nums">{{ elapsed(now - turn.createdAt) }}</b>
    </div>
    <S3dCodeBlock v-if="turn.code" :code="turn.code" :lang="turn.lang ?? 'js'" :start-collapsed="turn.lang === 'obj'" />
    <div v-if="turn.status === 'done' && turn.result" class="mt-1 text-xs text-ok">✓ {{ turn.result }}</div>
    <div v-if="turn.status === 'error'" class="mt-1 text-xs text-danger">✗ {{ turn.error }}</div>
    <div v-if="turn.status === 'stopped'" class="mt-1 text-xs text-ink-2">{{ t('ai.chat.stopped') }}</div>
    <div class="mt-1.5 flex flex-wrap gap-2.5">
      <S3dButton v-if="turn.status === 'pending'" small primary @click="run">{{ t('scriptEditor.run') }}</S3dButton>
      <button v-if="turn.code && (turn.status === 'error' || turn.status === 'done')" type="button" class="s3d-link" @click="run">
        {{ t('ai.chat.runAgain') }}
      </button>
      <button v-if="turn.code" type="button" class="s3d-link" @click="toEditor">{{ t('ai.chat.openInEditor') }}</button>
      <button v-if="turn.undoable && isLastDone && editor.ui.undoLabel === 'ai.undoLabel'" type="button" class="s3d-link" @click="undo">
        {{ t('commands.undo') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dButton from '../../../../components/ui/S3dButton.vue';
import S3dCodeBlock from '../S3dCodeBlock.vue';
import { useEditor } from '../../../../components/keys';
import { showPanel } from '../../../../components/panelState';
import { useScripts } from '../../../../composables/useScripts';
import { splitFences } from '../../../../scripting/highlight';
import { aiState, execute, type AiTurn } from '../agent';
import { clock, clockSec, elapsed } from '../history';
import { t } from '../../../../i18n';

/** An answer of the AI: timing, thoughts, text and code, result, and run / open in editor / undo. */
const props = defineProps<{ turn: AiTurn; now: number }>();
const editor = useEditor();
const scripts = useScripts();
const working = computed(() => props.turn.status === 'streaming' || props.turn.status === 'running');
/** only the newest built result can be undone from here */
const isLastDone = computed(() => {
  const done = aiState.turns.filter((candidate) => candidate.undoable);
  return done[done.length - 1] === props.turn;
});
const run = () => {
  if (props.turn.status !== 'running') {
    execute(editor, props.turn);
  }
};
const undo = () => {
  editor.undo();
  props.turn.undoable = false;
  props.turn.result = t('ai.chat.undone');
};
const toEditor = () => {
  scripts.draft.value = { lang: props.turn.lang ?? 'js', code: props.turn.code ?? '', size: props.turn.targetSize };
  showPanel('scripts');
};
</script>
