<template>
  <div class="bg" @pointerdown.self="$emit('close')">
    <div class="win s3d-panel" @keydown.stop>
      <div class="head">
        <span class="t">Modelle suchen</span>
        <span class="src">Hugging Face · nur GGUF (läuft lokal mit Ollama)</span>
        <button class="x" title="Schließen" @click="$emit('close')"><Icon name="close" :size="16" /></button>
      </div>

      <div class="bar">
        <input ref="inp" v-model="query" class="s3d-input q" placeholder="z. B. qwen coder, llama mesh, phi, gemma …" spellcheck="false" @keydown.enter="run" />
        <select v-model="sort" class="s3d-input sort" title="Sortierung">
          <option value="downloads">Meiste Downloads</option>
          <option value="trendingScore">Gerade beliebt</option>
          <option value="likes">Meiste Likes</option>
          <option value="lastModified">Neueste</option>
        </select>
      </div>
      <div class="chips">
        <button v-for="c in CHIPS" :key="c.q" class="chip" :class="{ on: query === c.q }" :title="c.hint" @click="pick(c)">{{ c.label }}</button>
        <label class="s3d-check small" title="Blendet Modelle mit mehr als 4 Milliarden Parametern aus – die antworten ohne Grafikkarte nur langsam"><input v-model="smallOnly" type="checkbox" /> nur kleine (≤ 4B)</label>
      </div>
      <p v-if="!isOllama" class="warn">Herunterladen geht nur mit Ollama als Anbieter – du kannst aber suchen und dir die Modelle ansehen.</p>

      <div class="list">
        <div v-if="loading" class="info"><span class="spin"></span> Suche läuft …</div>
        <div v-else-if="error" class="info err">✗ {{ error }}</div>
        <div v-else-if="!shown.length" class="info">Keine GGUF-Modelle gefunden{{ smallOnly && results.length ? ' – nur größere. Nimm den Haken bei „nur kleine“ raus.' : '. Versuch einen kürzeren Suchbegriff.' }}</div>

        <div v-for="m in shown" :key="m.id" class="item" :class="{ open: openId === m.id }">
          <div class="row" @click="toggle(m)">
            <span class="arrow">{{ openId === m.id ? '▾' : '▸' }}</span>
            <div class="main">
              <div class="name"><span v-if="m.params" class="pb" :class="paramClass(m.params)" title="Größe des Modells (Milliarden Parameter)">{{ String(m.params).replace('.', ',') }}B</span><span class="repo">{{ m.id.split('/')[1] }}</span><span class="by"> von {{ m.author }}</span><span v-if="m.gated" class="gated" title="Der Anbieter verlangt eine Anmeldung bei Hugging Face">🔒 Anmeldung nötig</span></div>
              <div class="meta">
                <span title="Downloads (letzte 30 Tage)">⬇ {{ fmtCount(m.downloads) }}</span>
                <span title="Likes">♥ {{ fmtCount(m.likes) }}</span>
                <span v-if="m.updated" title="Zuletzt aktualisiert">{{ fmtDate(m.updated) }}</span>
                <span v-if="m.license" class="lic">{{ m.license }}</span>
                <span v-if="installedRepo(m.id)" class="inst">✓ installiert</span>
              </div>
            </div>
          </div>

          <div v-if="openId === m.id" class="detail">
            <div v-if="detailLoading" class="info"><span class="spin"></span> Lade Dateien …</div>
            <div v-else-if="detailError" class="info err">✗ {{ detailError }}</div>
            <template v-else-if="detail">
              <div class="facts">
                <span v-if="detail.params">{{ fmtParams(detail.params) }} Parameter</span>
                <span v-if="detail.arch">Architektur: {{ detail.arch }}</span>
                <span v-if="detail.context">Kontext: {{ fmtCount(detail.context) }} Tokens</span>
                <a :href="'https://huggingface.co/' + m.id" target="_blank" rel="noopener noreferrer">Auf Hugging Face ansehen ↗</a>
              </div>
              <p v-if="!detail.quants.length" class="info">Keine einzelnen GGUF-Dateien gefunden{{ detail.split ? ' – nur aufgeteilte Dateien, die Ollama nicht direkt laden kann' : '' }}.</p>
              <p v-else class="hint">Kleinere Varianten sind schneller, aber ungenauer. <b>{{ RECOMMENDED_QUANT }}</b> ist meist der beste Kompromiss.</p>
              <div v-for="q in detail.quants" :key="q.quant" class="quant" :class="{ rec: q.quant === RECOMMENDED_QUANT }">
                <span class="qn">{{ q.quant }}<span v-if="q.quant === RECOMMENDED_QUANT" class="star"> ★ empfohlen</span></span>
                <span class="qs">{{ q.size ? fmtBytes(q.size) : '?' }}</span>
                <span class="speed" :class="speedClass(q.size).cls">{{ speedClass(q.size).label }}</span>
                <span class="act">
                  <template v-if="downloads[q.ollamaName] && !downloads[q.ollamaName].error">
                    <span class="dl">
                      <span class="minibar"><span :style="{ width: (downloads[q.ollamaName].frac * 100).toFixed(1) + '%' }"></span></span>
                      {{ (downloads[q.ollamaName].frac * 100).toFixed(0) }} % · {{ fmtDuration(downloads[q.ollamaName].eta) }}
                    </span>
                    <button class="lnk" @click="cancelDownload(q.ollamaName)">Abbrechen</button>
                  </template>
                  <button v-else-if="installed.has(q.ollamaName.toLowerCase())" class="s3d-btn small primary" @click="use(q.ollamaName)">Verwenden</button>
                  <button v-else class="s3d-btn small" :disabled="!isOllama || m.gated" :title="m.gated ? 'Nur mit Hugging-Face-Anmeldung' : 'Mit Ollama herunterladen (' + fmtBytes(q.size) + ')'" @click="download(q)">Herunterladen</button>
                </span>
                <span v-if="downloads[q.ollamaName]?.error" class="qerr">✗ {{ downloads[q.ollamaName].error }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
      <div class="foot">Nur die Suche geht ins Internet. Heruntergeladene Modelle laufen komplett auf deinem Rechner.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import Icon from '../Icon.vue';
import { aiConfig, listModels, downloads, startDownload, cancelDownload, fmtBytes, fmtDuration } from '../../ai/providers';
import { searchModels, modelDetail, speedClass, fmtCount, RECOMMENDED_QUANT, type HfModel, type HfDetail, type HfQuant, type HfSort } from '../../ai/hfsearch';

const emit = defineEmits<{ (e: 'close'): void; (e: 'use', model: string): void }>();

const CHIPS = [
  { label: '⚡ Klein & schnell', q: 'coder', hint: 'Kleine Code-Modelle – schnelle Antworten', small: true },
  { label: 'Code', q: 'qwen2.5 coder', hint: 'Schreiben gute Shap3D-Skripte' },
  { label: '3D / Mesh', q: 'mesh', hint: 'Modelle, die direkt 3D-Meshes erzeugen' },
  { label: 'Qwen', q: 'qwen', hint: '' },
  { label: 'Llama', q: 'llama', hint: '' },
  { label: 'Gemma', q: 'gemma', hint: '' },
  { label: 'Phi', q: 'phi', hint: '' },
];

const query = ref('coder'); const smallOnly = ref(true); const sort = ref<HfSort>('downloads');
const results = ref<HfModel[]>([]); const loading = ref(false); const error = ref('');
const openId = ref<string | null>(null); const detail = ref<HfDetail | null>(null); const detailLoading = ref(false); const detailError = ref('');
const installed = ref(new Set<string>());
const inp = ref<HTMLInputElement | null>(null);
/** Unknown sizes stay visible – only names that clearly say > 4B are hidden. */
const shown = computed(() => (smallOnly.value ? results.value.filter(m => m.params == null || m.params <= 4) : results.value));
function pick(c: { q: string; small?: boolean }) { query.value = c.q; smallOnly.value = !!c.small; }
const isOllama = computed(() => aiConfig.provider === 'ollama');

let ctrl: AbortController | null = null; let timer = 0;
async function run() {
  clearTimeout(timer); ctrl?.abort(); ctrl = new AbortController();
  loading.value = true; error.value = '';
  try { results.value = await searchModels(query.value, sort.value, ctrl.signal); openId.value = null; }
  catch (e: any) { if (e?.name !== 'AbortError') error.value = navigator.onLine ? (e?.message ?? String(e)) : 'Keine Internetverbindung – die Suche braucht Internet.'; }
  finally { loading.value = false; }
}
watch(query, () => { clearTimeout(timer); timer = window.setTimeout(run, 400); });
watch(sort, run);

async function toggle(m: HfModel) {
  if (openId.value === m.id) { openId.value = null; return; }
  openId.value = m.id; detail.value = null; detailError.value = ''; detailLoading.value = true;
  try { const d = await modelDetail(m.id); if (openId.value === m.id) detail.value = d; }
  catch (e: any) { detailError.value = e?.message ?? String(e); }
  finally { detailLoading.value = false; }
}

async function refreshInstalled() {
  if (!isOllama.value) return;
  try { installed.value = new Set((await listModels(aiConfig)).map(n => n.toLowerCase())); } catch { /* server offline – buttons still work */ }
}
const installedRepo = (id: string) => [...installed.value].some(n => n.startsWith(`hf.co/${id.toLowerCase()}:`));

async function download(q: HfQuant) {
  const ok = await startDownload(aiConfig, q.ollamaName);
  if (ok) await refreshInstalled();
}
function use(name: string) { aiConfig.model = name; aiConfig.configured = true; emit('use', name); emit('close'); }

/** ≤ 4B fast, ≤ 9B okay, bigger is slow on a CPU */
const paramClass = (b: number) => (b <= 4 ? 'fast' : b <= 9 ? 'mid' : 'slow');
const fmtDate = (t: number) => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtParams = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' Mrd.' : Math.round(n / 1e6) + ' Mio.');

onMounted(() => { inp.value?.focus(); run(); refreshInstalled(); });
</script>

<style scoped>
.bg { position: fixed; inset: 0; background: rgba(20, 25, 30, .3); z-index: 95; display: flex; align-items: center; justify-content: center; }
.win { width: min(720px, 94vw); height: min(680px, 90vh); display: flex; flex-direction: column; }
.head { display: flex; align-items: center; gap: 12px; padding: 10px 8px 10px 16px; background: var(--s3d-panel-2); }
.t { font-weight: 700; color: var(--s3d-navy); font-size: 15px; }
.src { flex: 1; font-size: 11px; color: var(--s3d-muted); }
.x { border: 0; background: transparent; cursor: pointer; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: var(--s3d-navy); }
.bar { display: flex; gap: 8px; padding: 12px 16px 6px; }
.q { flex: 1; height: 32px; }
.sort { width: 170px; flex: none; height: 32px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 16px 8px; }
.chip { border: 1px solid var(--s3d-line-2); background: var(--s3d-bg); border-radius: 14px; padding: 3px 10px; cursor: pointer; font-size: 12px; }
.chip:hover, .chip.on { border-color: var(--s3d-navy); color: var(--s3d-navy); }
.chip.on { background: var(--s3d-sel); font-weight: 600; }
.chips .small { font-size: 12px; margin-left: auto; display: flex; align-items: center; gap: 5px; }
.warn { margin: 0 16px 8px; padding: 6px 10px; background: var(--s3d-warn-bg); color: var(--s3d-warn); font-size: 12px; }
.list { flex: 1; overflow: auto; border-top: 1px solid var(--s3d-line); user-select: text; }
.info { padding: 14px 16px; font-size: 13px; color: var(--s3d-text-2); display: flex; align-items: center; gap: 8px; }
.info.err { color: var(--s3d-danger); }
.spin { width: 14px; height: 14px; border: 2px solid #cfd8e3; border-top-color: var(--s3d-blue); border-radius: 50%; animation: sp .8s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); } }
.item { border-bottom: 1px solid var(--s3d-line); }
.item.open { background: var(--s3d-bg-2); }
.row { display: flex; gap: 8px; padding: 9px 16px; cursor: pointer; align-items: flex-start; }
.row:hover { background: var(--s3d-hover); }
.arrow { width: 12px; color: var(--s3d-navy); padding-top: 1px; }
.main { flex: 1; min-width: 0; }
.name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.repo { font-weight: 700; color: var(--s3d-navy); }
.pb { display: inline-block; min-width: 30px; text-align: center; font-size: 10.5px; font-weight: 700; padding: 0 4px; margin-right: 6px; border-radius: 3px; background: var(--s3d-bg-2); color: var(--s3d-text-2); }
.pb.fast { background: var(--s3d-warn-bg); color: var(--s3d-warn); }
.pb.slow { background: var(--s3d-warn-bg); color: var(--s3d-danger); }
.by { color: var(--s3d-muted); }
.gated { margin-left: 8px; font-size: 11px; color: var(--s3d-warn); }
.meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: var(--s3d-muted); margin-top: 2px; }
.lic { background: var(--s3d-bg-2); padding: 0 5px; }
.inst { color: var(--s3d-ok); font-weight: 700; }
.detail { padding: 2px 16px 12px 36px; }
.facts { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--s3d-text); margin-bottom: 6px; }
.facts a { color: var(--s3d-blue); }
.hint { font-size: 12px; color: var(--s3d-text-2); margin: 4px 0 6px; }
.quant { display: grid; grid-template-columns: 150px 80px 150px 1fr; align-items: center; gap: 8px; padding: 4px 6px; font-size: 12px; border-top: 1px solid var(--s3d-line); }
.quant.rec { background: var(--s3d-ok-bg); }
.qn { font-family: Consolas, monospace; font-weight: 700; }
.star { font-family: "Open Sans", sans-serif; font-weight: 600; color: var(--s3d-ok); font-size: 11px; }
.qs { font-variant-numeric: tabular-nums; text-align: right; }
.speed.fast { color: var(--s3d-warn); font-weight: 700; }
.speed.mid { color: var(--s3d-text-2); }
.speed.slow { color: var(--s3d-danger); }
.act { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
.dl { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; color: var(--s3d-text); white-space: nowrap; }
.minibar { width: 70px; height: 6px; background: var(--s3d-line); display: inline-block; }
.minibar span { display: block; height: 100%; background: var(--s3d-navy-bg); transition: width .3s; }
.qerr { grid-column: 1 / -1; color: var(--s3d-danger); }
.lnk { border: 0; background: transparent; color: var(--s3d-blue); cursor: pointer; font-size: 12px; padding: 0; }
.foot { padding: 8px 16px; border-top: 1px solid var(--s3d-line); font-size: 11px; color: var(--s3d-muted); }
</style>
