<template>
  <div class="fixed inset-0 z-95 flex items-center justify-center bg-[rgba(20,25,30,.3)]" @pointerdown.self="$emit('close')">
    <div class="s3d-panel flex max-h-[90vh] w-[min(640px,94vw)] flex-col" @keydown.stop>
      <div class="flex items-center gap-3 bg-panel-2 py-2.5 pr-2 pl-4">
        <span class="whitespace-nowrap text-base font-bold tracking-[.5px] text-navy">KI-Assistent einrichten</span>
        <span class="ml-auto flex gap-3 whitespace-nowrap text-xs text-[#9a9db0]"><span v-for="(s, i) in STEPS" :key="s" class="flex items-center gap-[5px]" :class="i === step ? 'font-bold text-navy' : i < step ? 'text-[#2e9b4b]' : ''"><span class="inline-flex size-[18px] items-center justify-center rounded-full border border-current text-[10px] font-bold" :class="i === step && 'border-navy bg-navy-bg text-white'">{{ i < step ? '✓' : i + 1 }}</span>{{ s }}</span></span>
        <button class="flex size-7.5 items-center justify-center bg-transparent text-navy" title="Schließen" @click="$emit('close')"><Icon name="close" :size="16" /></button>
      </div>

      <!-- 1: provider -->
      <div v-if="step === 0" class="overflow-auto px-4 py-3.5 select-text">
        <p class="mb-3">Welcher lokale KI-Server läuft auf deinem Rechner? Alles bleibt auf deinem Gerät – nichts geht ins Internet. Am einfachsten ist <b>Ollama</b>.</p>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="p in PROVIDERS" :key="p.id" class="flex flex-col gap-1 border bg-surface p-2.5 text-left" :class="draft.provider === p.id ? 'border-navy bg-sel shadow-[0_0_0_1px_var(--s3d-navy)]' : 'border-line-2'" @click="choose(p.id)">
            <div class="font-bold text-navy">{{ p.name }}</div>
            <div class="flex gap-1 [&>span]:rounded-lg [&>span]:px-1.5 [&>span]:text-[10px]"><span class="bg-ok-bg text-ok">lokal</span><span class="bg-surface-2 text-ink-2">kostenlos</span></div>
            <div class="text-xs text-ink-2">{{ p.blurb }}</div>
          </button>
        </div>
      </div>

      <!-- 2: connect -->
      <div v-if="step === 1" class="overflow-auto px-4 py-3.5 select-text">
        <div class="mb-1.5 text-[15px] font-bold text-navy">{{ info.name }}</div>
        <ol class="mb-2.5 list-decimal pl-5 [&_li]:my-1 [&_code]:bg-surface-2 [&_code]:px-[5px] [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all"><li v-for="(s, i) in info.setup" :key="i"><span v-html="fmt(s)"></span></li></ol>
        <label class="mt-2.5 mb-1 block text-xs font-semibold">Adresse (Basis-URL)</label>
        <input v-model="draft.baseUrl" class="s3d-input" spellcheck="false" />
        <label class="mt-2.5 mb-1 block text-xs font-semibold">API-Key <span v-if="!info.needsKey">(optional)</span></label>
        <input v-model="draft.apiKey" class="s3d-input" type="password" autocomplete="off" spellcheck="false" :placeholder="info.needsKey ? 'Key hier einfügen' : 'leer lassen, falls nicht nötig'" />
        <p class="my-1.5 text-xs text-ink-2 [&_code]:bg-surface-2 [&_code]:px-[5px] [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all">Nur nötig, wenn dein Server einen Key verlangt (z. B. LiteLLM mit Master-Key).</p>
        <div class="mt-3 flex flex-wrap items-center gap-2.5">
          <button class="s3d-btn primary" :disabled="testing" @click="test">{{ testing ? 'Teste …' : 'Verbindung testen' }}</button>
          <span v-if="models.length" class="font-semibold text-ok">✓ Verbunden – {{ models.length }} Modelle gefunden</span>
          <span v-else-if="error" class="text-xs text-danger">{{ error }}</span>
        </div>
      </div>

      <!-- 3: model -->
      <div v-if="step === 2" class="overflow-auto px-4 py-3.5 select-text">
        <p class="mb-3">Wähle ein freies Modell. <b>LLaMA-Mesh</b> ist speziell für 3D trainiert und erzeugt Meshes direkt; <b>Qwen</b>-Modelle schreiben Modellier-Code und können ganze Szenen mit Materialien und Texturen bauen.</p>
        <div class="mb-1.5 flex flex-col gap-1.5">
          <div v-for="m in MODEL_PRESETS" :key="m.id" class="cursor-pointer border bg-surface px-2.5 py-2" :class="draft.model === m.id ? 'border-navy bg-sel shadow-[0_0_0_1px_var(--s3d-navy)]' : 'border-line-2'" @click="installed(m.id) && (draft.model = m.id)">
            <div class="flex items-center gap-2">
              <span class="font-bold text-navy">{{ m.label }}</span>
              <span class="rounded-lg px-1.5 text-[10px]" :class="m.mode === 'mesh' ? 'bg-[#f3e5f5] text-[#6a1b9a] dark:bg-[#2d1b36] dark:text-[#d2a8ff]' : 'bg-sel text-[#1e4f9b] dark:text-navy'">{{ m.mode === 'mesh' ? '3D-Mesh' : 'Code' }}</span>
              <span class="text-[11px] text-muted">{{ m.size }}</span>
              <span class="flex-1"></span>
              <span v-if="installed(m.id)" class="text-xs font-semibold text-ok">✓ installiert</span>
              <template v-else-if="draft.provider === 'ollama'">
                <button v-if="downloads[m.id] && !downloads[m.id].error" class="s3d-btn small" @click.stop="cancelDownload(m.id)">Abbrechen</button>
                <button v-else class="s3d-btn small" :disabled="anyPulling" @click.stop="install(m.id)">{{ downloads[m.id]?.error ? 'Erneut versuchen' : 'Installieren' }}</button>
              </template>
            </div>
            <div class="mt-[3px] text-xs text-ink-2">{{ m.note }}</div>
            <div v-if="downloads[m.id]" class="mt-2" @click.stop>
              <template v-if="downloads[m.id].error"><span class="text-xs text-danger">Fehler: {{ downloads[m.id].error }}</span></template>
              <template v-else>
                <div class="relative h-[18px] overflow-hidden bg-line"><span class="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,#1e9bd7,var(--s3d-navy-bg))] transition-[width] duration-300" :style="{ width: (downloads[m.id].frac * 100).toFixed(1) + '%' }"></span><b class="relative block text-center text-[11px]/[18px] text-white mix-blend-difference">{{ (downloads[m.id].frac * 100).toFixed(1).replace('.', ',') }} %</b></div>
                <div class="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[#374151] tabular-nums dark:text-ink-2">
                  <span>{{ downloads[m.id].status }}</span>
                  <span v-if="downloads[m.id].total">{{ fmtBytes(downloads[m.id].completed) }} von {{ fmtBytes(downloads[m.id].total) }}</span>
                  <span v-if="downloads[m.id].speed > 0 && downloads[m.id].phase === 'download'">{{ fmtBytes(downloads[m.id].speed) }}/s</span>
                  <span v-if="downloads[m.id].phase === 'download'">{{ fmtDuration(downloads[m.id].eta) }}</span>
                </div>
              </template>
            </div>
          </div>
        </div>
        <template v-if="otherModels.length">
          <label class="mt-2.5 mb-1 block text-xs font-semibold">Weitere installierte Modelle</label>
          <div class="mb-1.5 flex max-h-[220px] flex-wrap gap-1.5 overflow-auto">
            <button v-for="m in otherModels" :key="m" class="flex items-center gap-1.5 border px-[9px] py-[5px] font-mono text-xs" :class="draft.model === m ? 'border-navy bg-active' : 'border-line-2 bg-surface'" @click="draft.model = m">{{ m }}</button>
          </div>
        </template>
        <label class="mt-2.5 mb-1 block text-xs font-semibold">oder Modellname eingeben</label>
        <input v-model="draft.model" class="s3d-input" spellcheck="false" placeholder="z. B. qwen2.5-coder:7b" />
        <p class="my-1.5 text-xs text-ink-2 [&_code]:bg-surface-2 [&_code]:px-[5px] [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all">Installieren lädt das Modell einmalig über Ollama herunter (mehrere GB). Danach läuft alles offline auf deinem Rechner.</p>
      </div>

      <!-- 4: done -->
      <div v-if="step === 3" class="overflow-auto px-4 py-3.5 select-text">
        <div class="text-center text-[46px] text-[#2e9b4b]">✓</div>
        <p class="mb-3 text-center">Fertig! <b>{{ info.name }}</b> mit <b>{{ draft.model }}</b> ist eingerichtet.</p>
        <label class="s3d-check"><input v-model="draft.autoRun" type="checkbox" /> Erzeugten Code automatisch ausführen (jede Antwort ist ein Rückgängig-Schritt)</label>
        <p class="my-1.5 text-xs text-ink-2 [&_code]:bg-surface-2 [&_code]:px-[5px] [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all">Probiere z. B.: „Erstelle einen Würfel mit 2 m Kantenlänge aus Holz“ oder „Baue eine Spinne“.</p>
      </div>

      <div class="flex gap-2 border-t border-line px-4 py-2.5">
        <button v-if="step > 0" class="s3d-btn" @click="step--">Zurück</button>
        <span class="flex-1"></span>
        <button v-if="step < 3" class="s3d-btn primary" :disabled="!canNext" @click="next">Weiter</button>
        <button v-else class="s3d-btn primary" @click="finish">Los geht's</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import Icon from '../Icon.vue';
import { PROVIDERS, MODEL_PRESETS, aiConfig, providerInfo, listModels, describeError, downloads, startDownload, cancelDownload, fmtBytes, fmtDuration, ensureMeshModel, type ProviderId, type AiConfig } from '../../ai/providers';

const emit = defineEmits<{ (e: 'close'): void }>();
const STEPS = ['Anbieter', 'Verbinden', 'Modell', 'Fertig'];
const step = ref(0);
const draft = reactive<AiConfig>({ ...aiConfig });
const info = computed(() => providerInfo(draft.provider));
const models = ref<string[]>([]); const error = ref(''); const testing = ref(false);
const norm = (m: string) => m.toLowerCase().replace(/:latest$/, '');
const installed = (id: string) => models.value.some(m => norm(m) === norm(id));
const otherModels = computed(() => models.value.filter(m => !MODEL_PRESETS.some(p => norm(p.id) === norm(m))));
const anyPulling = computed(() => Object.values(downloads).some(d => !d.error));
async function install(id: string) {
  delete downloads[id];
  const preset = MODEL_PRESETS.find(p => p.id === id);
  if (await startDownload(draft, preset?.pull ?? id, id)) {
    if (preset?.mode === 'mesh') { try { await ensureMeshModel(draft); } catch (e) { downloads[id] = { ...(downloads[id] ?? {}), error: describeError(e) } as any; } }
    models.value = await listModels(draft); draft.model = id;
  }
}
const canNext = computed(() => step.value === 0 ? !!draft.provider : step.value === 1 ? !!draft.baseUrl && (!info.value.needsKey || !!draft.apiKey) : step.value === 2 ? !!draft.model : true);

function choose(id: ProviderId) {
  if (draft.provider !== id) { draft.provider = id; draft.baseUrl = providerInfo(id).baseUrl; draft.model = ''; models.value = []; error.value = ''; }
}
const fmt = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(ollama [a-z]+ [^\s]+|litellm [^\n]+|OLLAMA_ORIGINS="\*")/g, '<code>$1</code>');
async function test() {
  testing.value = true; error.value = ''; models.value = [];
  try { models.value = await listModels(draft); if (!models.value.length) error.value = 'Verbunden, aber keine Modelle gefunden.'; }
  catch (e) { error.value = describeError(e); }
  finally { testing.value = false; }
}
async function next() {
  if (step.value === 1 && !models.value.length && !error.value) await test();
  if (step.value === 1 && (!draft.model || !installed(draft.model))) draft.model = MODEL_PRESETS.find(p => installed(p.id))?.id ?? models.value[0] ?? '';
  step.value++;
}
function finish() { Object.assign(aiConfig, draft, { configured: true }); emit('close'); }
</script>
