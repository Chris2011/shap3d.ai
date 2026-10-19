<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center gap-2 border-b border-line px-3 py-2 text-xs">
      <template v-if="aiConfig.configured">
        <span class="max-w-70 min-w-0 flex-[0_1_auto] truncate border border-line-2 bg-surface px-2 py-0.5" :title="info.name + ' · ' + aiConfig.model">{{ info.name.replace(/ \(.*\)/, '') }} · <b>{{ aiConfig.model }}</b></span>
      </template>
      <span v-else class="max-w-70 min-w-0 flex-[0_1_auto] truncate border border-line-2 bg-surface px-2 py-0.5 text-muted">Nicht eingerichtet</span>
      <button class="-ml-1 flex size-6 flex-none items-center justify-center bg-transparent p-0 text-navy hover:bg-hover" title="Modelle auf Hugging Face suchen und herunterladen" @click="hfSearch = true"><S3dIcon name="search" :size="16" /></button>
      <span class="min-w-0 flex-[1_1_0]"></span>
      <button class="flex-none whitespace-nowrap s3d-link" :class="{ 'font-bold underline': view === 'history' }" @click="view = view === 'history' ? 'chat' : 'history'">Verlauf ({{ aiHistory.sessions.filter(s => s.turns.length).length }})</button>
      <button class="flex-none whitespace-nowrap s3d-link" @click="newChat">Neuer Chat</button>
      <button class="flex-none whitespace-nowrap s3d-link" @click="wizard = true">{{ aiConfig.configured ? 'Einstellungen' : 'Einrichten' }}</button>
    </div>

    <!-- history browser -->
    <div v-if="view === 'history'" class="flex-1 overflow-auto px-3 py-2.5 select-text">
      <input v-model="search" class="s3d-input" placeholder="Verlauf durchsuchen …" @keydown.stop />
      <template v-for="(group, groupIndex) in historyGroups" :key="groupIndex">
        <div class="mt-3 mb-1 s3d-caption text-navy">{{ group.day }}</div>
        <div v-for="session in group.sessions" :key="session.id" class="relative mb-1.25 cursor-pointer border bg-surface py-1.75 pr-7.5 pl-2.5" :class="session.id === aiHistory.currentId ? 'border-navy shadow-[inset_3px_0_0_var(--s3d-navy)]' : 'border-line hover:border-line-2'" @click="open(session.id)">
          <div class="truncate text-[0.8125rem]">{{ session.title }}</div>
          <div class="mt-0.5 text-[0.6875rem] text-muted">{{ clock(session.created) }}<template v-if="!sameDay(session.created, session.updated) || clock(session.created) !== clock(session.updated)"> – {{ clock(session.updated) }}</template> · {{ reqCount(session) }} {{ reqCount(session) === 1 ? 'Anfrage' : 'Anfragen' }} · {{ session.model || '—' }}</div>
          <button class="absolute top-2 right-1.5 bg-transparent opacity-50 hover:opacity-100" title="Löschen" @click.stop="deleteSession(session.id)"><S3dIcon name="trash" :size="14" /></button>
        </div>
      </template>
      <div v-if="!historyGroups.length" class="p-3 text-[0.6875rem] text-muted">Noch keine Gespräche{{ search ? ' mit diesem Suchbegriff' : '' }}.</div>
      <button v-if="aiHistory.sessions.length" class="mt-2.5 mb-1 bg-transparent p-0 text-xs text-danger hover:underline" @click="clearAll">Gesamten Verlauf löschen</button>
    </div>

    <div v-for="(download, name) in downloads" :key="name" class="border-b border-line bg-surface-2 px-3 py-1.5 text-xs">
      <div class="flex items-center gap-2"><b class="flex-1 truncate text-navy">{{ String(name).replace(/^hf\.co\/[^/]+\//, '') }}</b><span v-if="!download.error">{{ (download.frac * 100).toFixed(1).replace('.', ',') }} %</span><button v-if="!download.error" class="s3d-link" @click="cancelDownload(String(name))">Abbrechen</button></div>
      <div v-if="download.error" class="mt-1 text-xs text-danger">Fehler: {{ download.error }}</div>
      <template v-else>
        <S3dProgressBar class="my-1" :value="download.frac" />
        <div class="text-ink-2 tabular-nums">{{ download.status }}<template v-if="download.total"> · {{ fmtBytes(download.completed) }} von {{ fmtBytes(download.total) }}</template><template v-if="download.speed > 0 && download.phase === 'download'"> · {{ fmtBytes(download.speed) }}/s · {{ fmtDuration(download.eta) }}</template></div>
      </template>
    </div>
    <div v-show="view === 'chat'" ref="list" class="flex flex-1 flex-col gap-2 overflow-auto px-3 py-2.5 select-text">
      <div v-if="!aiConfig.configured" class="flex flex-col items-center gap-2 px-2.5 py-5 text-center text-ink">
        <S3dIcon name="sparkle" :size="40" />
        <p>Beschreibe, was du bauen möchtest, und der Assistent modelliert es für dich: Würfel, Möbel, Häuser, Tiere – mit Farben und Texturen.</p>
        <button class="s3d-btn primary" @click="wizard = true">KI einrichten</button>
        <p class="text-[0.6875rem] text-muted">Läuft komplett lokal mit Ollama, LM Studio, LiteLLM oder einem anderen OpenAI-kompatiblen Server auf deinem Rechner.</p>
      </div>
      <div v-else-if="!aiState.turns.length" class="flex flex-col items-center gap-2 px-2.5 py-5 text-center text-ink">
        <S3dIcon name="sparkle" :size="34" />
        <p>Was soll ich bauen?</p>
        <p v-if="isMesh" class="text-[0.6875rem] text-muted">LLaMA-Mesh erzeugt einzelne Objekte als Mesh. Für ganze Szenen mit Materialien eignet sich ein Code-Modell wie Qwen2.5-Coder besser.</p>
        <div class="flex flex-wrap justify-center gap-1.5"><button v-for="question in QUICK" :key="question" class="s3d-chip" @click="ask(question)">{{ question }}</button></div>
      </div>

      <template v-for="(turn, i) in aiState.turns" :key="turn.id">
        <div v-if="i === 0 || !sameDay(aiState.turns[i - 1].createdAt, turn.createdAt)" class="my-1 flex items-center gap-2 text-[0.6875rem] text-muted before:h-px before:flex-1 before:bg-line before:content-[''] after:h-px after:flex-1 after:bg-line after:content-['']"><span>{{ dayLabel(turn.createdAt) }}</span></div>
        <div v-if="turn.role === 'user'" class="max-w-[92%] self-end px-2.5 py-2 text-[0.8125rem]/[1.45] break-words whitespace-pre-wrap" :class="turn.auto ? 'bg-warn-bg text-xs text-warn' : 'bg-navy-bg text-white'">{{ turn.auto ? '↻ Fehler zurückgemeldet – Assistent korrigiert …' : turn.text }}<span class="mt-0.75 block text-right text-[0.625rem] opacity-70">{{ clock(turn.createdAt) }}</span></div>
        <div v-else class="max-w-[92%] self-start border border-line bg-surface px-2.5 py-2 text-[0.8125rem]/[1.45] break-words whitespace-pre-wrap">
          <div class="mb-0.75 flex items-center gap-2 text-[0.65625rem] text-muted"><span>{{ clock(turn.createdAt) }}</span><span v-if="turn.model" class="bg-surface-2 px-1.25">{{ turn.model.replace(/^hf\.co\/[^/]+\//, '') }}</span>
            <span v-if="turn.status === 'streaming' || turn.status === 'running'" class="font-bold text-blue tabular-nums">⏱ {{ elapsed(now - turn.createdAt) }}</span>
            <span v-else-if="turn.endedAt" class="tabular-nums" :title="'Start ' + clockSec(turn.createdAt) + ' · Ende ' + clockSec(turn.endedAt)">⏱ {{ elapsed(turn.endedAt - turn.createdAt) }}</span>
          </div>
          <template v-if="turn.text">
            <template v-for="(part, partIndex) in splitFences(turn.text)" :key="partIndex">
              <div v-if="part.kind === 'text'">{{ part.text.trim() }}</div>
              <S3dCodeBlock v-else :code="part.code" :lang="part.lang" :streaming="part.open && turn.status === 'streaming'" />
            </template>
          </template>
          <div v-if="turn.status === 'streaming'" class="mt-1 text-xs text-ink-2"><span class="after:animate-blink after:tracking-[0.125rem] after:text-blue after:content-['●●●']"></span> {{ turn.text ? 'schreibt …' : 'denkt nach …' }} <b class="text-blue tabular-nums">{{ elapsed(now - turn.createdAt) }}</b></div>
          <S3dCodeBlock v-if="turn.code" :code="turn.code" :lang="turn.lang ?? 'js'" :start-collapsed="turn.lang === 'obj'" />
          <div v-if="turn.status === 'done' && turn.result" class="mt-1 text-xs text-ok">✓ {{ turn.result }}</div>
          <div v-if="turn.status === 'error'" class="mt-1 text-xs text-danger">✗ {{ turn.error }}</div>
          <div v-if="turn.status === 'stopped'" class="mt-1 text-xs text-ink-2">Abgebrochen.</div>
          <div class="mt-1.5 flex flex-wrap gap-2.5">
            <button v-if="turn.status === 'pending'" class="s3d-btn small primary" @click="run(turn)">Ausführen</button>
            <button v-if="turn.code && (turn.status === 'error' || turn.status === 'done')" class="s3d-link" @click="run(turn)">Erneut ausführen</button>
            <button v-if="turn.code" class="s3d-link" @click="toEditor(turn)">Im Skript-Editor öffnen</button>
            <button v-if="turn.undoable && isLastDone(turn) && editor.ui.undoLabel === 'KI-Assistent'" class="s3d-link" @click="undo(turn)">Rückgängig</button>
          </div>
        </div>
      </template>
    </div>

    <div class="flex gap-1.5 border-t border-line px-3 pt-2 pb-1">
      <textarea ref="ta" class="flex-1 resize-none border border-line-2 bg-surface px-2 py-1.5 font-sans text-[0.8125rem] outline-none focus:border-navy" v-model="prompt" rows="2" :disabled="!aiConfig.configured" :placeholder="isMesh ? 'Ein einzelnes Objekt, am besten auf Englisch, z. B. „a wooden chair“ (Enter = senden)' : 'z. B. „Erstelle eine Spinne mit roten Augen“ (Enter = senden)'" @keydown.stop @keydown.enter.exact.prevent="submit"></textarea>
      <button v-if="aiState.busy" class="flex w-9.5 items-center justify-center bg-[#c62828] text-white" title="Stopp" @click="stop"><S3dIcon name="stop" :size="16" /></button>
      <button v-else class="flex w-9.5 items-center justify-center bg-navy-bg text-white disabled:cursor-default disabled:opacity-40" title="Senden" :disabled="!prompt.trim() || !aiConfig.configured" @click="submit"><S3dIcon name="send" :size="16" /></button>
    </div>
    <div class="flex items-center gap-3.5 px-3 pt-0.5 pb-2 text-[0.6875rem] text-ink-2 [&_label]:flex [&_label]:cursor-pointer [&_label]:items-center [&_label]:gap-1.5">
      <label><input v-model="aiConfig.autoRun" type="checkbox" /> Code automatisch ausführen</label>
      <label v-if="!isMesh" :class="{ 'font-bold text-warn': aiConfig.fast }" title="Kurzer Systemprompt, kleiner Kontext, kurze Antworten – deutlich schneller auf Rechnern ohne Grafikkarte, dafür einfachere Objekte"><input v-model="aiConfig.fast" type="checkbox" /> ⚡ Schnellmodus</label>
    </div>
    <S3dAiWizard v-if="wizard" @close="wizard = false" />
    <Teleport to="body"><S3dModelSearch v-if="hfSearch" @close="hfSearch = false" @use="model => editor.toast('Modell gewechselt: ' + model)" /></Teleport>
  </div>
</template>

<script setup lang="ts">
import S3dProgressBar from '../../../components/ui/S3dProgressBar.vue';
import { useScripts } from '../../../composables/useScripts';
import { ref, computed, watch, nextTick } from 'vue';
import S3dIcon from '../../../components/S3dIcon.vue';
import S3dAiWizard from './S3dAiWizard.vue';
import S3dModelSearch from './S3dModelSearch.vue';
import S3dCodeBlock from './S3dCodeBlock.vue';
import { splitFences } from '../../../scripting/highlight';
import { useEditor } from '../../../components/keys';
import { aiConfig, providerInfo, modeFor, downloads, cancelDownload, fmtBytes, fmtDuration } from './providers';
import { aiState, send, stop, clearChat, execute, type AiTurn } from './agent';
import { aiHistory, openSession, deleteSession, clearHistory, dayLabel, sameDay, clock, clockSec, elapsed, type AiSession } from './history';
import { useIntervalFn } from '@vueuse/core';
import { showPanel } from '../../../components/panelState';

const editor = useEditor(); const scripts = useScripts();
const wizard = ref(false);
const hfSearch = ref(false);
const view = ref<'chat' | 'history'>('chat');
const search = ref('');
// ticking clock for the live "thinking" timer
const now = ref(Date.now());
useIntervalFn(() => { if (aiState.busy || aiState.turns.some(turn => turn.status === 'streaming')) now.value = Date.now(); }, 250);
const historyGroups = computed(() => {
  const term = search.value.trim().toLowerCase();
  const list = aiHistory.sessions.filter(session => session.turns.length && (!term || session.title.toLowerCase().includes(term) || session.turns.some(turn => turn.text.toLowerCase().includes(term) || (turn.code ?? '').toLowerCase().includes(term))));
  const groups: { day: string; sessions: AiSession[] }[] = [];
  for (const session of [...list].sort((first, second) => second.updated - first.updated)) {
    const day = dayLabel(session.updated); const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.day === day) lastGroup.sessions.push(session); else groups.push({ day: day, sessions: [session] });
  }
  return groups;
});
const reqCount = (session: AiSession) => session.turns.filter(turn => turn.role === 'user' && !turn.auto).length;
const open = (id: string) => { openSession(id); view.value = 'chat'; };
const newChat = () => { if (aiState.busy) return; clearChat(); view.value = 'chat'; };
const clearAll = async () => { if (await editor.confirm('Gesamten KI-Verlauf löschen?')) clearHistory(); };
const prompt = ref(''); const list = ref<HTMLElement | null>(null);
const info = computed(() => providerInfo(aiConfig.provider));
const isMesh = computed(() => modeFor(aiConfig.model) === 'mesh');
const QUICK = ['Würfel 1 m aus Holz', 'Eine Spinne', 'Kleines Haus mit Ziegeldach', 'Tisch mit 4 Stühlen', 'Baum', 'Steinmauer 5 m lang'];

const ask = (question: string) => { prompt.value = question; submit(); };
const submit = () => { const text = prompt.value; if (!text.trim() || aiState.busy) return; prompt.value = ''; view.value = 'chat'; now.value = Date.now(); send(editor, text); };
const run = (turn: AiTurn) => { execute(editor, turn); };
const undo = (turn: AiTurn) => { editor.undo(); turn.undoable = false; turn.result = 'rückgängig gemacht'; };
const isLastDone = (turn: AiTurn) => { const done = aiState.turns.filter(candidate => candidate.undoable); return done[done.length - 1] === turn; };
const toEditor = (turn: AiTurn) => {
  scripts.draft.value = { lang: turn.lang ?? 'js', code: turn.code ?? '', size: turn.targetSize };
  showPanel('scripts');
};
watch(() => aiState.turns.map(turn => turn.text.length + (turn.status ?? '')).join(), () => nextTick(() => { if (list.value) list.value.scrollTop = list.value.scrollHeight; }));
</script>
