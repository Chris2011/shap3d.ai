<template>
  <S3dModalDialog title="Modelle suchen" panel-class="h-[min(42.5rem,90vh)] w-[min(45rem,94vw)]" @close="$emit('close')">
    <template #header><span class="text-[0.6875rem] text-muted">Hugging Face · nur GGUF (läuft lokal mit Ollama)</span></template>

      <div class="flex gap-2 px-4 pt-3 pb-1.5">
        <input ref="inp" v-model="query" class="s3d-input h-8 flex-1" placeholder="z. B. qwen coder, llama mesh, phi, gemma …" spellcheck="false" @keydown.enter="run" />
        <select v-model="sort" class="s3d-input h-8 w-42.5 flex-none" title="Sortierung">
          <option value="downloads">Meiste Downloads</option>
          <option value="trendingScore">Gerade beliebt</option>
          <option value="likes">Meiste Likes</option>
          <option value="lastModified">Neueste</option>
        </select>
      </div>
      <div class="flex flex-wrap gap-1.5 px-4 pt-0.5 pb-2">
        <button v-for="chip in CHIPS" :key="chip.q" class="s3d-chip" :class="{ on: query === chip.q }" :title="chip.hint" @click="pick(chip)">{{ chip.label }}</button>
        <label class="s3d-check ml-auto gap-1.25 text-xs" title="Blendet Modelle mit mehr als 4 Milliarden Parametern aus – die antworten ohne Grafikkarte nur langsam"><input v-model="smallOnly" type="checkbox" /> nur kleine (≤ 4B)</label>
      </div>
      <p v-if="!isOllama" class="mx-4 mb-2 bg-warn-bg px-2.5 py-1.5 text-xs text-warn">Herunterladen geht nur mit Ollama als Anbieter – du kannst aber suchen und dir die Modelle ansehen.</p>

      <div class="flex-1 overflow-auto border-t border-line select-text">
        <div v-if="loading" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2"><span class="size-3.5 animate-spin rounded-full border-2 border-[#cfd8e3] border-t-blue"></span> Suche läuft …</div>
        <div v-else-if="error" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-danger">✗ {{ error }}</div>
        <div v-else-if="!shown.length" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">Keine GGUF-Modelle gefunden{{ smallOnly && results.length ? ' – nur größere. Nimm den Haken bei „nur kleine“ raus.' : '. Versuch einen kürzeren Suchbegriff.' }}</div>

        <div v-for="model in shown" :key="model.id" class="border-b border-line" :class="{ 'bg-surface-2': openId === model.id }">
          <div class="flex cursor-pointer items-start gap-2 px-4 py-2.25 hover:bg-hover" @click="toggle(model)">
            <span class="w-3 pt-px text-navy">{{ openId === model.id ? '▾' : '▸' }}</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[0.8125rem]"><span v-if="model.params" class="mr-1.5 inline-block min-w-7.5 rounded-[3px] px-1 text-center text-[0.65625rem] font-bold" :class="PARAM_BADGE[paramClass(model.params)]" title="Größe des Modells (Milliarden Parameter)">{{ String(model.params).replace('.', ',') }}B</span><span class="font-bold text-navy">{{ model.id.split('/')[1] }}</span><span class="text-muted"> von {{ model.author }}</span><span v-if="model.gated" class="ml-2 text-[0.6875rem] text-warn" title="Der Anbieter verlangt eine Anmeldung bei Hugging Face">🔒 Anmeldung nötig</span></div>
              <div class="mt-0.5 flex flex-wrap gap-3 text-[0.6875rem] text-muted">
                <span title="Downloads (letzte 30 Tage)">⬇ {{ fmtCount(model.downloads) }}</span>
                <span title="Likes">♥ {{ fmtCount(model.likes) }}</span>
                <span v-if="model.updated" title="Zuletzt aktualisiert">{{ fmtDate(model.updated) }}</span>
                <span v-if="model.license" class="bg-surface-2 px-1.25">{{ model.license }}</span>
                <span v-if="installedRepo(model.id)" class="font-bold text-ok">✓ installiert</span>
              </div>
            </div>
          </div>

          <div v-if="openId === model.id" class="pt-0.5 pr-4 pb-3 pl-9">
            <div v-if="detailLoading" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2"><span class="size-3.5 animate-spin rounded-full border-2 border-[#cfd8e3] border-t-blue"></span> Lade Dateien …</div>
            <div v-else-if="detailError" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-danger">✗ {{ detailError }}</div>
            <template v-else-if="detail">
              <div class="mb-1.5 flex flex-wrap gap-3.5 text-xs text-ink [&_a]:text-blue">
                <span v-if="detail.params">{{ fmtParams(detail.params) }} Parameter</span>
                <span v-if="detail.arch">Architektur: {{ detail.arch }}</span>
                <span v-if="detail.context">Kontext: {{ fmtCount(detail.context) }} Tokens</span>
                <a :href="'https://huggingface.co/' + model.id" target="_blank" rel="noopener noreferrer">Auf Hugging Face ansehen ↗</a>
              </div>
              <p v-if="!detail.quants.length" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">Keine einzelnen GGUF-Dateien gefunden{{ detail.split ? ' – nur aufgeteilte Dateien, die Ollama nicht direkt laden kann' : '' }}.</p>
              <p v-else class="mt-1 mb-1.5 text-xs text-ink-2">Kleinere Varianten sind schneller, aber ungenauer. <b>{{ RECOMMENDED_QUANT }}</b> ist meist der beste Kompromiss.</p>
              <div v-for="quant in detail.quants" :key="quant.quant" class="grid grid-cols-[9.375rem_5rem_9.375rem_1fr] items-center gap-2 border-t border-line px-1.5 py-1 text-xs" :class="{ 'bg-ok-bg': quant.quant === RECOMMENDED_QUANT }">
                <span class="font-mono font-bold">{{ quant.quant }}<span v-if="quant.quant === RECOMMENDED_QUANT" class="font-sans text-[0.6875rem] font-semibold text-ok"> ★ empfohlen</span></span>
                <span class="text-right tabular-nums">{{ quant.size ? fmtBytes(quant.size) : '?' }}</span>
                <span :class="SPEED[speedClass(quant.size).cls]">{{ speedClass(quant.size).label }}</span>
                <span class="flex items-center justify-end gap-2">
                  <template v-if="downloads[quant.ollamaName] && !downloads[quant.ollamaName].error">
                    <span class="flex items-center gap-1.5 whitespace-nowrap text-ink tabular-nums">
                      <S3dProgressBar class="w-17.5" :value="downloads[quant.ollamaName].frac" />
                      {{ (downloads[quant.ollamaName].frac * 100).toFixed(0) }} % · {{ fmtDuration(downloads[quant.ollamaName].eta) }}
                    </span>
                    <button class="s3d-link" @click="cancelDownload(quant.ollamaName)">Abbrechen</button>
                  </template>
                  <button v-else-if="installed.has(quant.ollamaName.toLowerCase())" class="s3d-btn small primary" @click="use(quant.ollamaName)">Verwenden</button>
                  <button v-else class="s3d-btn small" :disabled="!isOllama || model.gated" :title="model.gated ? 'Nur mit Hugging-Face-Anmeldung' : 'Mit Ollama herunterladen (' + fmtBytes(quant.size) + ')'" @click="download(quant)">Herunterladen</button>
                </span>
                <span v-if="downloads[quant.ollamaName]?.error" class="col-span-full text-danger">✗ {{ downloads[quant.ollamaName].error }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
      <div class="border-t border-line px-4 py-2 text-[0.6875rem] text-muted">Nur die Suche geht ins Internet. Heruntergeladene Modelle laufen komplett auf deinem Rechner.</div>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import S3dProgressBar from '../../../components/ui/S3dProgressBar.vue';
import S3dModalDialog from '../../../components/ui/S3dModalDialog.vue';
import { ref, computed, watch, onMounted } from 'vue';
import S3dIcon from '../../../components/S3dIcon.vue';
import { aiConfig, listModels, downloads, startDownload, cancelDownload, fmtBytes, fmtDuration } from './providers';
import { searchModels, modelDetail, speedClass, fmtCount, RECOMMENDED_QUANT, type HfModel, type HfDetail, type HfQuant, type HfSort } from './hfsearch';

const emit = defineEmits<{ (event: 'close'): void; (event: 'use', model: string): void }>();

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
const shown = computed(() => (smallOnly.value ? results.value.filter(model => model.params == null || model.params <= 4) : results.value));
const pick = (chip: { q: string; small?: boolean }) => { query.value = chip.q; smallOnly.value = !!chip.small; };
const isOllama = computed(() => aiConfig.provider === 'ollama');

let ctrl: AbortController | null = null; let timer = 0;
const run = async () => {
  clearTimeout(timer); ctrl?.abort(); ctrl = new AbortController();
  loading.value = true; error.value = '';
  try { results.value = await searchModels(query.value, sort.value, ctrl.signal); openId.value = null; }
  catch (reason: any) { if (reason?.name !== 'AbortError') error.value = navigator.onLine ? (reason?.message ?? String(reason)) : 'Keine Internetverbindung – die Suche braucht Internet.'; }
  finally { loading.value = false; }
};
watch(query, () => { clearTimeout(timer); timer = window.setTimeout(run, 400); });
watch(sort, run);

const toggle = async (model: HfModel) => {
  if (openId.value === model.id) { openId.value = null; return; }
  openId.value = model.id; detail.value = null; detailError.value = ''; detailLoading.value = true;
  try { const loaded = await modelDetail(model.id); if (openId.value === model.id) detail.value = loaded; }
  catch (reason: any) { detailError.value = reason?.message ?? String(reason); }
  finally { detailLoading.value = false; }
};

const refreshInstalled = async () => {
  if (!isOllama.value) return;
  try { installed.value = new Set((await listModels(aiConfig)).map(name => name.toLowerCase())); } catch { /* server offline – buttons still work */ }
};
const installedRepo = (id: string) => [...installed.value].some(name => name.startsWith(`hf.co/${id.toLowerCase()}:`));

const download = async (quant: HfQuant) => {
  const ok = await startDownload(aiConfig, quant.ollamaName);
  if (ok) await refreshInstalled();
};
const use = (name: string) => { aiConfig.model = name; aiConfig.configured = true; emit('use', name); emit('close'); };

/** ≤ 4B fast, ≤ 9B okay, bigger is slow on a CPU */
const paramClass = (billions: number) => (billions <= 4 ? 'fast' : billions <= 9 ? 'mid' : 'slow');
const PARAM_BADGE = { fast: 'bg-warn-bg text-warn', mid: 'bg-surface-2 text-ink-2', slow: 'bg-warn-bg text-danger' };
const SPEED = { fast: 'font-bold text-warn', mid: 'text-ink-2', slow: 'text-danger' };
const fmtDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtParams = (count: number) => (count >= 1e9 ? (count / 1e9).toFixed(1).replace('.', ',') + ' Mrd.' : Math.round(count / 1e6) + ' Mio.');

onMounted(() => { inp.value?.focus(); run(); refreshInstalled(); });
</script>
