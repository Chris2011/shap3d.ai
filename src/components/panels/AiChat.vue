<template>
  <div class="ai">
    <div class="bar">
      <template v-if="aiConfig.configured">
        <span class="badge" :title="info.name + ' · ' + aiConfig.model">{{ info.name.replace(/ \(.*\)/, '') }} · <b>{{ aiConfig.model }}</b></span>
      </template>
      <span v-else class="badge muted">Nicht eingerichtet</span>
      <button class="ico" title="Modelle auf Hugging Face suchen und herunterladen" @click="hfSearch = true"><Icon name="search" :size="16" /></button>
      <span class="grow"></span>
      <button class="lnk" :class="{ on: view === 'history' }" @click="view = view === 'history' ? 'chat' : 'history'">Verlauf ({{ aiHistory.sessions.filter(s => s.turns.length).length }})</button>
      <button class="lnk" @click="newChat">Neuer Chat</button>
      <button class="lnk" @click="wizard = true">{{ aiConfig.configured ? 'Einstellungen' : 'Einrichten' }}</button>
    </div>

    <!-- history browser -->
    <div v-if="view === 'history'" class="hist">
      <input v-model="search" class="s3d-input" placeholder="Verlauf durchsuchen …" @keydown.stop />
      <template v-for="(g, gi) in historyGroups" :key="gi">
        <div class="day">{{ g.day }}</div>
        <div v-for="s in g.sessions" :key="s.id" class="sess" :class="{ cur: s.id === aiHistory.currentId }" @click="open(s.id)">
          <div class="stitle">{{ s.title }}</div>
          <div class="smeta">{{ clock(s.created) }}<template v-if="!sameDay(s.created, s.updated) || clock(s.created) !== clock(s.updated)"> – {{ clock(s.updated) }}</template> · {{ reqCount(s) }} {{ reqCount(s) === 1 ? 'Anfrage' : 'Anfragen' }} · {{ s.model || '—' }}</div>
          <button class="sdel" title="Löschen" @click.stop="deleteSession(s.id)"><Icon name="trash" :size="14" /></button>
        </div>
      </template>
      <div v-if="!historyGroups.length" class="small" style="padding: 12px">Noch keine Gespräche{{ search ? ' mit diesem Suchbegriff' : '' }}.</div>
      <button v-if="aiHistory.sessions.length" class="lnk danger" @click="clearAll">Gesamten Verlauf löschen</button>
    </div>

    <div v-for="(d, name) in downloads" :key="name" class="dlrow">
      <div class="dlhead"><b>{{ String(name).replace(/^hf\.co\/[^/]+\//, '') }}</b><span v-if="!d.error">{{ (d.frac * 100).toFixed(1).replace('.', ',') }} %</span><button v-if="!d.error" class="lnk" @click="cancelDownload(String(name))">Abbrechen</button></div>
      <div v-if="d.error" class="st err">Fehler: {{ d.error }}</div>
      <template v-else>
        <div class="minibar"><span :style="{ width: (d.frac * 100) + '%' }"></span></div>
        <div class="dlinfo">{{ d.status }}<template v-if="d.total"> · {{ fmtBytes(d.completed) }} von {{ fmtBytes(d.total) }}</template><template v-if="d.speed > 0 && d.phase === 'download'"> · {{ fmtBytes(d.speed) }}/s · {{ fmtDuration(d.eta) }}</template></div>
      </template>
    </div>
    <div v-show="view === 'chat'" ref="list" class="list">
      <div v-if="!aiConfig.configured" class="intro">
        <Icon name="sparkle" :size="40" />
        <p>Beschreibe, was du bauen möchtest, und der Assistent modelliert es für dich: Würfel, Möbel, Häuser, Tiere – mit Farben und Texturen.</p>
        <button class="s3d-btn primary" @click="wizard = true">KI einrichten</button>
        <p class="small">Läuft komplett lokal mit Ollama, LM Studio, LiteLLM oder einem anderen OpenAI-kompatiblen Server auf deinem Rechner.</p>
      </div>
      <div v-else-if="!aiState.turns.length" class="intro">
        <Icon name="sparkle" :size="34" />
        <p>Was soll ich bauen?</p>
        <p v-if="isMesh" class="small">LLaMA-Mesh erzeugt einzelne Objekte als Mesh. Für ganze Szenen mit Materialien eignet sich ein Code-Modell wie Qwen2.5-Coder besser.</p>
        <div class="chips"><button v-for="q in QUICK" :key="q" class="chip" @click="ask(q)">{{ q }}</button></div>
      </div>

      <template v-for="(t, i) in aiState.turns" :key="t.id">
        <div v-if="i === 0 || !sameDay(aiState.turns[i - 1].ts, t.ts)" class="daysep"><span>{{ dayLabel(t.ts) }}</span></div>
        <div v-if="t.role === 'user'" class="msg user" :class="{ auto: t.auto }">{{ t.auto ? '↻ Fehler zurückgemeldet – Assistent korrigiert …' : t.text }}<span class="time">{{ clock(t.ts) }}</span></div>
        <div v-else class="msg bot">
          <div class="meta"><span>{{ clock(t.ts) }}</span><span v-if="t.model" class="mdl">{{ t.model.replace(/^hf\.co\/[^/]+\//, '') }}</span>
            <span v-if="t.status === 'streaming' || t.status === 'running'" class="timer">⏱ {{ elapsed(now - t.ts) }}</span>
            <span v-else-if="t.endTs" class="took" :title="'Start ' + clockSec(t.ts) + ' · Ende ' + clockSec(t.endTs)">⏱ {{ elapsed(t.endTs - t.ts) }}</span>
          </div>
          <template v-if="t.text">
            <template v-for="(p, pi) in splitFences(t.text)" :key="pi">
              <div v-if="p.kind === 'text'" class="txt">{{ p.text.trim() }}</div>
              <CodeBlock v-else :code="p.code" :lang="p.lang" :streaming="p.open && t.status === 'streaming'" />
            </template>
          </template>
          <div v-if="t.status === 'streaming'" class="st"><span class="dots"></span> {{ t.text ? 'schreibt …' : 'denkt nach …' }} <b class="live">{{ elapsed(now - t.ts) }}</b></div>
          <CodeBlock v-if="t.code" :code="t.code" :lang="t.lang ?? 'js'" :start-collapsed="t.lang === 'obj'" />
          <div v-if="t.status === 'done' && t.result" class="st ok">✓ {{ t.result }}</div>
          <div v-if="t.status === 'error'" class="st err">✗ {{ t.error }}</div>
          <div v-if="t.status === 'stopped'" class="st">Abgebrochen.</div>
          <div class="acts">
            <button v-if="t.status === 'pending'" class="s3d-btn small primary" @click="run(t)">Ausführen</button>
            <button v-if="t.code && (t.status === 'error' || t.status === 'done')" class="lnk" @click="run(t)">Erneut ausführen</button>
            <button v-if="t.code" class="lnk" @click="toEditor(t)">Im Skript-Editor öffnen</button>
            <button v-if="t.undoable && isLastDone(t) && ed.ui.undoLabel === 'KI-Assistent'" class="lnk" @click="undo(t)">Rückgängig</button>
          </div>
        </div>
      </template>
    </div>

    <div class="input">
      <textarea ref="ta" v-model="prompt" rows="2" :disabled="!aiConfig.configured" :placeholder="isMesh ? 'Ein einzelnes Objekt, am besten auf Englisch, z. B. „a wooden chair“ (Enter = senden)' : 'z. B. „Erstelle eine Spinne mit roten Augen“ (Enter = senden)'" @keydown.stop @keydown.enter.exact.prevent="submit"></textarea>
      <button v-if="aiState.busy" class="send stop" title="Stopp" @click="stop"><Icon name="stop" :size="16" /></button>
      <button v-else class="send" title="Senden" :disabled="!prompt.trim() || !aiConfig.configured" @click="submit"><Icon name="send" :size="16" /></button>
    </div>
    <div class="opts">
      <label><input v-model="aiConfig.autoRun" type="checkbox" /> Code automatisch ausführen</label>
      <label v-if="!isMesh" class="fast" :class="{ on: aiConfig.fast }" title="Kurzer Systemprompt, kleiner Kontext, kurze Antworten – deutlich schneller auf Rechnern ohne Grafikkarte, dafür einfachere Objekte"><input v-model="aiConfig.fast" type="checkbox" /> ⚡ Schnellmodus</label>
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

<style scoped>
.ai { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--s3d-line); font-size: 12px; }
.badge { background: var(--s3d-bg); border: 1px solid var(--s3d-line-2); padding: 2px 8px; max-width: 280px; min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar .grow { flex: 1 1 0; min-width: 0; }
.bar .lnk { flex: none; white-space: nowrap; }
.ico { flex: none; border: 0; background: transparent; cursor: pointer; width: 24px; height: 24px; margin-left: -4px; display: flex; align-items: center; justify-content: center; color: var(--s3d-navy); padding: 0; }
.ico:hover { background: var(--s3d-hover); }
.badge.muted { color: var(--s3d-muted); }
.lnk { border: 0; background: transparent; color: var(--s3d-blue); cursor: pointer; font-size: 12px; padding: 0; }
.lnk:hover { text-decoration: underline; }
.dlrow { padding: 6px 12px; border-bottom: 1px solid var(--s3d-line); font-size: 12px; background: var(--s3d-bg-2); }
.dlhead { display: flex; gap: 8px; align-items: center; }
.dlhead b { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--s3d-navy); }
.minibar { height: 6px; background: var(--s3d-line); margin: 4px 0; }
.minibar span { display: block; height: 100%; background: var(--s3d-navy-bg); transition: width .3s; }
.dlinfo { color: var(--s3d-text-2); font-variant-numeric: tabular-nums; }
.lnk.on { font-weight: 700; text-decoration: underline; }
.lnk.danger { color: var(--s3d-danger); margin: 10px 0 4px; }
.hist { flex: 1; overflow: auto; padding: 10px 12px; user-select: text; }
.day { font-size: 11px; font-weight: 700; color: var(--s3d-navy); letter-spacing: .5px; margin: 12px 0 4px; text-transform: uppercase; }
.sess { position: relative; background: var(--s3d-bg); border: 1px solid var(--s3d-line); padding: 7px 30px 7px 10px; margin-bottom: 5px; cursor: pointer; }
.sess:hover { border-color: var(--s3d-line-2); }
.sess.cur { border-color: var(--s3d-navy); box-shadow: inset 3px 0 0 var(--s3d-navy); }
.stitle { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.smeta { font-size: 11px; color: var(--s3d-muted); margin-top: 2px; }
.sdel { position: absolute; right: 6px; top: 8px; border: 0; background: transparent; cursor: pointer; opacity: .5; }
.sdel:hover { opacity: 1; }
.daysep { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--s3d-muted); margin: 4px 0; }
.daysep::before, .daysep::after { content: ''; flex: 1; height: 1px; background: var(--s3d-line); }
.time { display: block; text-align: right; font-size: 10px; opacity: .7; margin-top: 3px; }
.meta { display: flex; gap: 8px; font-size: 10.5px; color: var(--s3d-muted); margin-bottom: 3px; align-items: center; }
.mdl { background: var(--s3d-bg-2); padding: 0 5px; }
.timer { color: var(--s3d-blue); font-weight: 700; font-variant-numeric: tabular-nums; }
.took { font-variant-numeric: tabular-nums; }
.live { font-variant-numeric: tabular-nums; color: var(--s3d-blue); }
.list { flex: 1; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; user-select: text; }
.intro { text-align: center; color: var(--s3d-text); padding: 20px 10px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.small { font-size: 11px; color: var(--s3d-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.chip { border: 1px solid var(--s3d-line-2); background: var(--s3d-bg); border-radius: 14px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
.chip:hover { border-color: var(--s3d-navy); color: var(--s3d-navy); }
.msg { max-width: 92%; padding: 8px 10px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.user { align-self: flex-end; background: var(--s3d-navy-bg); color: #fff; }
.user.auto { background: var(--s3d-warn-bg); color: var(--s3d-warn); font-size: 12px; }
.bot { align-self: flex-start; background: var(--s3d-bg); border: 1px solid var(--s3d-line); }
.st { font-size: 12px; color: var(--s3d-text-2); margin-top: 4px; }
.st.ok { color: var(--s3d-ok); } .st.err { color: var(--s3d-danger); }
.dots::after { content: '●●●'; letter-spacing: 2px; animation: blink 1s infinite; color: var(--s3d-blue); }
@keyframes blink { 50% { opacity: .3; } }
.acts { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
.input { display: flex; gap: 6px; padding: 8px 12px 4px; border-top: 1px solid var(--s3d-line); }
.input textarea { flex: 1; resize: none; border: 1px solid var(--s3d-line-2); padding: 6px 8px; font: 13px "Open Sans", sans-serif; outline: none; background: var(--s3d-bg); }
.input textarea:focus { border-color: var(--s3d-navy); }
.send { width: 38px; border: 0; background: var(--s3d-navy-bg); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.send:disabled { opacity: .4; cursor: default; }
.send.stop { background: #c62828; }
.opts { display: flex; align-items: center; gap: 14px; font-size: 11px; color: var(--s3d-text-2); padding: 2px 12px 8px; }
.opts label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.opts .fast.on { color: var(--s3d-warn); font-weight: 700; }
</style>
