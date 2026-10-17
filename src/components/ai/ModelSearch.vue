<template>
  <div class="fixed inset-0 z-95 flex items-center justify-center bg-[rgba(20,25,30,.3)]" @pointerdown.self="$emit('close')">
    <div class="s3d-panel flex h-[min(680px,90vh)] w-[min(720px,94vw)] flex-col" @keydown.stop>
      <div class="flex items-center gap-3 bg-panel-2 py-2.5 pr-2 pl-4">
        <span class="text-[15px] font-bold text-navy">Modelle suchen</span>
        <span class="flex-1 text-[11px] text-muted">Hugging Face · nur GGUF (läuft lokal mit Ollama)</span>
        <button class="flex size-7.5 items-center justify-center bg-transparent text-navy" title="Schließen" @click="$emit('close')"><Icon name="close" :size="16" /></button>
      </div>

      <div class="flex gap-2 px-4 pt-3 pb-1.5">
        <input ref="inp" v-model="query" class="s3d-input h-8 flex-1" placeholder="z. B. qwen coder, llama mesh, phi, gemma …" spellcheck="false" @keydown.enter="run" />
        <select v-model="sort" class="s3d-input h-8 w-[170px] flex-none" title="Sortierung">
          <option value="downloads">Meiste Downloads</option>
          <option value="trendingScore">Gerade beliebt</option>
          <option value="likes">Meiste Likes</option>
          <option value="lastModified">Neueste</option>
        </select>
      </div>
      <div class="flex flex-wrap gap-1.5 px-4 pt-0.5 pb-2">
        <button v-for="c in CHIPS" :key="c.q" class="rounded-[14px] border px-2.5 py-[3px] text-xs" :class="query === c.q ? 'border-navy bg-sel font-semibold text-navy' : 'border-line-2 bg-surface hover:border-navy hover:text-navy'" :title="c.hint" @click="pick(c)">{{ c.label }}</button>
        <label class="s3d-check ml-auto gap-[5px] text-xs" title="Blendet Modelle mit mehr als 4 Milliarden Parametern aus – die antworten ohne Grafikkarte nur langsam"><input v-model="smallOnly" type="checkbox" /> nur kleine (≤ 4B)</label>
      </div>
      <p v-if="!isOllama" class="mx-4 mb-2 bg-warn-bg px-2.5 py-1.5 text-xs text-warn">Herunterladen geht nur mit Ollama als Anbieter – du kannst aber suchen und dir die Modelle ansehen.</p>

      <div class="flex-1 overflow-auto border-t border-line select-text">
        <div v-if="loading" class="flex items-center gap-2 px-4 py-3.5 text-[13px] text-ink-2"><span class="size-3.5 animate-spin rounded-full border-2 border-[#cfd8e3] border-t-blue"></span> Suche läuft …</div>
        <div v-else-if="error" class="flex items-center gap-2 px-4 py-3.5 text-[13px] text-danger">✗ {{ error }}</div>
        <div v-else-if="!shown.length" class="flex items-center gap-2 px-4 py-3.5 text-[13px] text-ink-2">Keine GGUF-Modelle gefunden{{ smallOnly && results.length ? ' – nur größere. Nimm den Haken bei „nur kleine“ raus.' : '. Versuch einen kürzeren Suchbegriff.' }}</div>

        <div v-for="m in shown" :key="m.id" class="border-b border-line" :class="{ 'bg-surface-2': openId === m.id }">
          <div class="flex cursor-pointer items-start gap-2 px-4 py-[9px] hover:bg-hover" @click="toggle(m)">
            <span class="w-3 pt-px text-navy">{{ openId === m.id ? '▾' : '▸' }}</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px]"><span v-if="m.params" class="mr-1.5 inline-block min-w-[30px] rounded-[3px] px-1 text-center text-[10.5px] font-bold" :class="PB[paramClass(m.params)]" title="Größe des Modells (Milliarden Parameter)">{{ String(m.params).replace('.', ',') }}B</span><span class="font-bold text-navy">{{ m.id.split('/')[1] }}</span><span class="text-muted"> von {{ m.author }}</span><span v-if="m.gated" class="ml-2 text-[11px] text-warn" title="Der Anbieter verlangt eine Anmeldung bei Hugging Face">🔒 Anmeldung nötig</span></div>
              <div class="mt-0.5 flex flex-wrap gap-3 text-[11px] text-muted">
                <span title="Downloads (letzte 30 Tage)">⬇ {{ fmtCount(m.downloads) }}</span>
                <span title="Likes">♥ {{ fmtCount(m.likes) }}</span>
                <span v-if="m.updated" title="Zuletzt aktualisiert">{{ fmtDate(m.updated) }}</span>
                <span v-if="m.license" class="bg-surface-2 px-[5px]">{{ m.license }}</span>
                <span v-if="installedRepo(m.id)" class="font-bold text-ok">✓ installiert</span>
              </div>
            </div>
          </div>

          <div v-if="openId === m.id" class="pt-0.5 pr-4 pb-3 pl-9">
            <div v-if="detailLoading" class="flex items-center gap-2 px-4 py-3.5 text-[13px] text-ink-2"><span class="size-3.5 animate-spin rounded-full border-2 border-[#cfd8e3] border-t-blue"></span> Lade Dateien …</div>
            <div v-else-if="detailError" class="flex items-center gap-2 px-4 py-3.5 text-[13px] text-danger">✗ {{ detailError }}</div>
            <template v-else-if="detail">
              <div class="mb-1.5 flex flex-wrap gap-3.5 text-xs text-ink [&_a]:text-blue">
                <span v-if="detail.params">{{ fmtParams(detail.params) }} Parameter</span>
                <span v-if="detail.arch">Architektur: {{ detail.arch }}</span>
                <span v-if="detail.context">Kontext: {{ fmtCount(detail.context) }} Tokens</span>
                <a :href="'https://huggingface.co/' + m.id" target="_blank" rel="noopener noreferrer">Auf Hugging Face ansehen ↗</a>
              </div>
              <p v-if="!detail.quants.length" class="flex items-center gap-2 px-4 py-3.5 text-[13px] text-ink-2">Keine einzelnen GGUF-Dateien gefunden{{ detail.split ? ' – nur aufgeteilte Dateien, die Ollama nicht direkt laden kann' : '' }}.</p>
              <p v-else class="mt-1 mb-1.5 text-xs text-ink-2">Kleinere Varianten sind schneller, aber ungenauer. <b>{{ RECOMMENDED_QUANT }}</b> ist meist der beste Kompromiss.</p>
              <div v-for="q in detail.quants" :key="q.quant" class="grid grid-cols-[150px_80px_150px_1fr] items-center gap-2 border-t border-line px-1.5 py-1 text-xs" :class="{ 'bg-ok-bg': q.quant === RECOMMENDED_QUANT }">
                <span class="font-mono font-bold">{{ q.quant }}<span v-if="q.quant === RECOMMENDED_QUANT" class="font-sans text-[11px] font-semibold text-ok"> ★ empfohlen</span></span>
                <span class="text-right tabular-nums">{{ q.size ? fmtBytes(q.size) : '?' }}</span>
                <span :class="SPEED[speedClass(q.size).cls]">{{ speedClass(q.size).label }}</span>
                <span class="flex items-center justify-end gap-2">
                  <template v-if="downloads[q.ollamaName] && !downloads[q.ollamaName].error">
                    <span class="flex items-center gap-1.5 whitespace-nowrap text-ink tabular-nums">
                      <span class="inline-block h-1.5 w-[70px] bg-line"><span class="block h-full bg-navy-bg transition-[width] duration-300" :style="{ width: (downloads[q.ollamaName].frac * 100).toFixed(1) + '%' }"></span></span>
                      {{ (downloads[q.ollamaName].frac * 100).toFixed(0) }} % · {{ fmtDuration(downloads[q.ollamaName].eta) }}
                    </span>
                    <button class="bg-transparent p-0 text-xs text-blue" @click="cancelDownload(q.ollamaName)">Abbrechen</button>
                  </template>
                  <button v-else-if="installed.has(q.ollamaName.toLowerCase())" class="s3d-btn small primary" @click="use(q.ollamaName)">Verwenden</button>
                  <button v-else class="s3d-btn small" :disabled="!isOllama || m.gated" :title="m.gated ? 'Nur mit Hugging-Face-Anmeldung' : 'Mit Ollama herunterladen (' + fmtBytes(q.size) + ')'" @click="download(q)">Herunterladen</button>
                </span>
                <span v-if="downloads[q.ollamaName]?.error" class="col-span-full text-danger">✗ {{ downloads[q.ollamaName].error }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
      <div class="border-t border-line px-4 py-2 text-[11px] text-muted">Nur die Suche geht ins Internet. Heruntergeladene Modelle laufen komplett auf deinem Rechner.</div>
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
const PB = { fast: 'bg-warn-bg text-warn', mid: 'bg-surface-2 text-ink-2', slow: 'bg-warn-bg text-danger' };
const SPEED = { fast: 'font-bold text-warn', mid: 'text-ink-2', slow: 'text-danger' };
const fmtDate = (t: number) => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtParams = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' Mrd.' : Math.round(n / 1e6) + ' Mio.');

onMounted(() => { inp.value?.focus(); run(); refreshInstalled(); });
</script>
