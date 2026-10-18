<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center gap-2 border-b border-line px-3 py-2 text-xs">
      <template v-if="aiConfig.configured">
        <span class="max-w-70 min-w-0 flex-[0_1_auto] truncate border border-line-2 bg-surface px-2 py-0.5" :title="info.name + ' · ' + aiConfig.model">{{ info.name.replace(/ \(.*\)/, '') }} · <b>{{ aiConfig.model }}</b></span>
      </template>
      <span v-else class="max-w-70 min-w-0 flex-[0_1_auto] truncate border border-line-2 bg-surface px-2 py-0.5 text-muted">Nicht eingerichtet</span>
      <button class="-ml-1 flex size-6 flex-none items-center justify-center bg-transparent p-0 text-navy hover:bg-hover" title="Modelle auf Hugging Face suchen und herunterladen" @click="hfSearch = true"><Icon name="search" :size="16" /></button>
      <span class="min-w-0 flex-[1_1_0]"></span>
      <button class="flex-none whitespace-nowrap bg-transparent p-0 text-xs text-blue hover:underline" :class="{ 'font-bold underline': view === 'history' }" @click="view = view === 'history' ? 'chat' : 'history'">Verlauf ({{ aiHistory.sessions.filter(s => s.turns.length).length }})</button>
      <button class="flex-none whitespace-nowrap bg-transparent p-0 text-xs text-blue hover:underline" @click="newChat">Neuer Chat</button>
      <button class="flex-none whitespace-nowrap bg-transparent p-0 text-xs text-blue hover:underline" @click="wizard = true">{{ aiConfig.configured ? 'Einstellungen' : 'Einrichten' }}</button>
    </div>

    <!-- history browser -->
    <div v-if="view === 'history'" class="flex-1 overflow-auto px-3 py-2.5 select-text">
      <input v-model="search" class="s3d-input" placeholder="Verlauf durchsuchen …" @keydown.stop />
      <template v-for="(g, gi) in historyGroups" :key="gi">
        <div class="mt-3 mb-1 text-[0.6875rem] font-bold tracking-[0.03125rem] text-navy uppercase">{{ g.day }}</div>
        <div v-for="s in g.sessions" :key="s.id" class="relative mb-1.25 cursor-pointer border bg-surface py-1.75 pr-7.5 pl-2.5" :class="s.id === aiHistory.currentId ? 'border-navy shadow-[inset_3px_0_0_var(--s3d-navy)]' : 'border-line hover:border-line-2'" @click="open(s.id)">
          <div class="truncate text-[0.8125rem]">{{ s.title }}</div>
          <div class="mt-0.5 text-[0.6875rem] text-muted">{{ clock(s.created) }}<template v-if="!sameDay(s.created, s.updated) || clock(s.created) !== clock(s.updated)"> – {{ clock(s.updated) }}</template> · {{ reqCount(s) }} {{ reqCount(s) === 1 ? 'Anfrage' : 'Anfragen' }} · {{ s.model || '—' }}</div>
          <button class="absolute top-2 right-1.5 bg-transparent opacity-50 hover:opacity-100" title="Löschen" @click.stop="deleteSession(s.id)"><Icon name="trash" :size="14" /></button>
        </div>
      </template>
      <div v-if="!historyGroups.length" class="p-3 text-[0.6875rem] text-muted">Noch keine Gespräche{{ search ? ' mit diesem Suchbegriff' : '' }}.</div>
      <button v-if="aiHistory.sessions.length" class="mt-2.5 mb-1 bg-transparent p-0 text-xs text-danger hover:underline" @click="clearAll">Gesamten Verlauf löschen</button>
    </div>

    <div v-for="(d, name) in downloads" :key="name" class="border-b border-line bg-surface-2 px-3 py-1.5 text-xs">
      <div class="flex items-center gap-2"><b class="flex-1 truncate text-navy">{{ String(name).replace(/^hf\.co\/[^/]+\//, '') }}</b><span v-if="!d.error">{{ (d.frac * 100).toFixed(1).replace('.', ',') }} %</span><button v-if="!d.error" class="bg-transparent p-0 text-xs text-blue hover:underline" @click="cancelDownload(String(name))">Abbrechen</button></div>
      <div v-if="d.error" class="mt-1 text-xs text-danger">Fehler: {{ d.error }}</div>
      <template v-else>
        <div class="my-1 h-1.5 bg-line"><span class="block h-full bg-navy-bg transition-[width] duration-300" :style="{ width: (d.frac * 100) + '%' }"></span></div>
        <div class="text-ink-2 tabular-nums">{{ d.status }}<template v-if="d.total"> · {{ fmtBytes(d.completed) }} von {{ fmtBytes(d.total) }}</template><template v-if="d.speed > 0 && d.phase === 'download'"> · {{ fmtBytes(d.speed) }}/s · {{ fmtDuration(d.eta) }}</template></div>
      </template>
    </div>
    <div v-show="view === 'chat'" ref="list" class="flex flex-1 flex-col gap-2 overflow-auto px-3 py-2.5 select-text">
      <div v-if="!aiConfig.configured" class="flex flex-col items-center gap-2 px-2.5 py-5 text-center text-ink">
        <Icon name="sparkle" :size="40" />
        <p>Beschreibe, was du bauen möchtest, und der Assistent modelliert es für dich: Würfel, Möbel, Häuser, Tiere – mit Farben und Texturen.</p>
        <button class="s3d-btn primary" @click="wizard = true">KI einrichten</button>
        <p class="text-[0.6875rem] text-muted">Läuft komplett lokal mit Ollama, LM Studio, LiteLLM oder einem anderen OpenAI-kompatiblen Server auf deinem Rechner.</p>
      </div>
      <div v-else-if="!aiState.turns.length" class="flex flex-col items-center gap-2 px-2.5 py-5 text-center text-ink">
        <Icon name="sparkle" :size="34" />
        <p>Was soll ich bauen?</p>
        <p v-if="isMesh" class="text-[0.6875rem] text-muted">LLaMA-Mesh erzeugt einzelne Objekte als Mesh. Für ganze Szenen mit Materialien eignet sich ein Code-Modell wie Qwen2.5-Coder besser.</p>
        <div class="flex flex-wrap justify-center gap-1.5"><button v-for="q in QUICK" :key="q" class="rounded-[14px] border border-line-2 bg-surface px-2.5 py-1 text-xs hover:border-navy hover:text-navy" @click="ask(q)">{{ q }}</button></div>
      </div>

      <template v-for="(t, i) in aiState.turns" :key="t.id">
        <div v-if="i === 0 || !sameDay(aiState.turns[i - 1].ts, t.ts)" class="my-1 flex items-center gap-2 text-[0.6875rem] text-muted before:h-px before:flex-1 before:bg-line before:content-[''] after:h-px after:flex-1 after:bg-line after:content-['']"><span>{{ dayLabel(t.ts) }}</span></div>
        <div v-if="t.role === 'user'" class="max-w-[92%] self-end px-2.5 py-2 text-[0.8125rem]/[1.45] break-words whitespace-pre-wrap" :class="t.auto ? 'bg-warn-bg text-xs text-warn' : 'bg-navy-bg text-white'">{{ t.auto ? '↻ Fehler zurückgemeldet – Assistent korrigiert …' : t.text }}<span class="mt-0.75 block text-right text-[0.625rem] opacity-70">{{ clock(t.ts) }}</span></div>
        <div v-else class="max-w-[92%] self-start border border-line bg-surface px-2.5 py-2 text-[0.8125rem]/[1.45] break-words whitespace-pre-wrap">
          <div class="mb-0.75 flex items-center gap-2 text-[0.65625rem] text-muted"><span>{{ clock(t.ts) }}</span><span v-if="t.model" class="bg-surface-2 px-1.25">{{ t.model.replace(/^hf\.co\/[^/]+\//, '') }}</span>
            <span v-if="t.status === 'streaming' || t.status === 'running'" class="font-bold text-blue tabular-nums">⏱ {{ elapsed(now - t.ts) }}</span>
            <span v-else-if="t.endTs" class="tabular-nums" :title="'Start ' + clockSec(t.ts) + ' · Ende ' + clockSec(t.endTs)">⏱ {{ elapsed(t.endTs - t.ts) }}</span>
          </div>
          <template v-if="t.text">
            <template v-for="(p, pi) in splitFences(t.text)" :key="pi">
              <div v-if="p.kind === 'text'">{{ p.text.trim() }}</div>
              <CodeBlock v-else :code="p.code" :lang="p.lang" :streaming="p.open && t.status === 'streaming'" />
            </template>
          </template>
          <div v-if="t.status === 'streaming'" class="mt-1 text-xs text-ink-2"><span class="after:animate-blink after:tracking-[0.125rem] after:text-blue after:content-['●●●']"></span> {{ t.text ? 'schreibt …' : 'denkt nach …' }} <b class="text-blue tabular-nums">{{ elapsed(now - t.ts) }}</b></div>
          <CodeBlock v-if="t.code" :code="t.code" :lang="t.lang ?? 'js'" :start-collapsed="t.lang === 'obj'" />
          <div v-if="t.status === 'done' && t.result" class="mt-1 text-xs text-ok">✓ {{ t.result }}</div>
          <div v-if="t.status === 'error'" class="mt-1 text-xs text-danger">✗ {{ t.error }}</div>
          <div v-if="t.status === 'stopped'" class="mt-1 text-xs text-ink-2">Abgebrochen.</div>
          <div class="mt-1.5 flex flex-wrap gap-2.5">
            <button v-if="t.status === 'pending'" class="s3d-btn small primary" @click="run(t)">Ausführen</button>
            <button v-if="t.code && (t.status === 'error' || t.status === 'done')" class="bg-transparent p-0 text-xs text-blue hover:underline" @click="run(t)">Erneut ausführen</button>
            <button v-if="t.code" class="bg-transparent p-0 text-xs text-blue hover:underline" @click="toEditor(t)">Im Skript-Editor öffnen</button>
            <button v-if="t.undoable && isLastDone(t) && ed.ui.undoLabel === 'KI-Assistent'" class="bg-transparent p-0 text-xs text-blue hover:underline" @click="undo(t)">Rückgängig</button>
          </div>
        </div>
      </template>
    </div>

    <div class="flex gap-1.5 border-t border-line px-3 pt-2 pb-1">
      <textarea ref="ta" class="flex-1 resize-none border border-line-2 bg-surface px-2 py-1.5 font-sans text-[0.8125rem] outline-none focus:border-navy" v-model="prompt" rows="2" :disabled="!aiConfig.configured" :placeholder="isMesh ? 'Ein einzelnes Objekt, am besten auf Englisch, z. B. „a wooden chair“ (Enter = senden)' : 'z. B. „Erstelle eine Spinne mit roten Augen“ (Enter = senden)'" @keydown.stop @keydown.enter.exact.prevent="submit"></textarea>
      <button v-if="aiState.busy" class="flex w-9.5 items-center justify-center bg-[#c62828] text-white" title="Stopp" @click="stop"><Icon name="stop" :size="16" /></button>
      <button v-else class="flex w-9.5 items-center justify-center bg-navy-bg text-white disabled:cursor-default disabled:opacity-40" title="Senden" :disabled="!prompt.trim() || !aiConfig.configured" @click="submit"><Icon name="send" :size="16" /></button>
    </div>
    <div class="flex items-center gap-3.5 px-3 pt-0.5 pb-2 text-[0.6875rem] text-ink-2 [&_label]:flex [&_label]:cursor-pointer [&_label]:items-center [&_label]:gap-1.5">
      <label><input v-model="aiConfig.autoRun" type="checkbox" /> Code automatisch ausführen</label>
      <label v-if="!isMesh" :class="{ 'font-bold text-warn': aiConfig.fast }" title="Kurzer Systemprompt, kleiner Kontext, kurze Antworten – deutlich schneller auf Rechnern ohne Grafikkarte, dafür einfachere Objekte"><input v-model="aiConfig.fast" type="checkbox" /> ⚡ Schnellmodus</label>
    </div>
    <AiWizard v-if="wizard" @close="wizard = false" />
    <Teleport to="body"><ModelSearch v-if="hfSearch" @close="hfSearch = false" @use="m => ed.toast('Modell gewechselt: ' + m)" /></Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import Icon from '../Icon.vue';
import AiWizard from '../ai/AiWizard.vue';
import ModelSearch from '../ai/ModelSearch.vue';
import CodeBlock from './CodeBlock.vue';
import { splitFences } from '../../scripting/highlight';
import { useEditor } from '../keys';
import { aiConfig, providerInfo, modeFor, downloads, cancelDownload, fmtBytes, fmtDuration } from '../../ai/providers';
import { aiState, send, stop, clearChat, execute, type AiTurn } from '../../ai/agent';
import { aiHistory, openSession, deleteSession, clearHistory, dayLabel, sameDay, clock, clockSec, elapsed, type AiSession } from '../../ai/history';
import { onUnmounted } from 'vue';
import { showPanel } from '../panelState';

const ed = useEditor();
const wizard = ref(false);
const hfSearch = ref(false);
const view = ref<'chat' | 'history'>('chat');
const search = ref('');
// ticking clock for the live "thinking" timer
const now = ref(Date.now());
const tick = window.setInterval(() => { if (aiState.busy || aiState.turns.some(t => t.status === 'streaming')) now.value = Date.now(); }, 250);
onUnmounted(() => clearInterval(tick));
const historyGroups = computed(() => {
  const q = search.value.trim().toLowerCase();
  const list = aiHistory.sessions.filter(s => s.turns.length && (!q || s.title.toLowerCase().includes(q) || s.turns.some(t => t.text.toLowerCase().includes(q) || (t.code ?? '').toLowerCase().includes(q))));
  const groups: { day: string; sessions: AiSession[] }[] = [];
  for (const s of [...list].sort((a, b) => b.updated - a.updated)) {
    const d = dayLabel(s.updated); const g = groups[groups.length - 1];
    if (g && g.day === d) g.sessions.push(s); else groups.push({ day: d, sessions: [s] });
  }
  return groups;
});
const reqCount = (s: AiSession) => s.turns.filter(t => t.role === 'user' && !t.auto).length;
function open(id: string) { openSession(id); view.value = 'chat'; }
function newChat() { if (aiState.busy) return; clearChat(); view.value = 'chat'; }
async function clearAll() { if (await ed.confirm('Gesamten KI-Verlauf löschen?')) clearHistory(); }
const prompt = ref(''); const list = ref<HTMLElement | null>(null);
const info = computed(() => providerInfo(aiConfig.provider));
const isMesh = computed(() => modeFor(aiConfig.model) === 'mesh');
const QUICK = ['Würfel 1 m aus Holz', 'Eine Spinne', 'Kleines Haus mit Ziegeldach', 'Tisch mit 4 Stühlen', 'Baum', 'Steinmauer 5 m lang'];

function ask(q: string) { prompt.value = q; submit(); }
function submit() { const p = prompt.value; if (!p.trim() || aiState.busy) return; prompt.value = ''; view.value = 'chat'; now.value = Date.now(); send(ed, p); }
function run(t: AiTurn) { execute(ed, t); }
function undo(t: AiTurn) { ed.undo(); t.undoable = false; t.result = 'rückgängig gemacht'; }
function isLastDone(t: AiTurn) { const done = aiState.turns.filter(x => x.undoable); return done[done.length - 1] === t; }
function toEditor(t: AiTurn) {
  try { localStorage.setItem('s3d:script-draft', JSON.stringify({ lang: t.lang ?? 'js', code: t.code, size: t.targetSize })); } catch { /* ignore */ }
  showPanel('scripts');
}
watch(() => aiState.turns.map(t => t.text.length + (t.status ?? '')).join(), () => nextTick(() => { if (list.value) list.value.scrollTop = list.value.scrollHeight; }));
</script>
