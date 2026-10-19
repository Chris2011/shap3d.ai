<template>
  <S3dModalDialog title="KI-Assistent einrichten" panel-class="w-[min(40rem,94vw)]" @close="$emit('close')">
    <template #header>
        <span class="ml-auto flex gap-3 whitespace-nowrap text-xs text-[#9a9db0]"><span v-for="(stepLabel, i) in STEPS" :key="stepLabel" class="flex items-center gap-1.25" :class="i === step ? 'font-bold text-navy' : i < step ? 'text-[#2e9b4b]' : ''"><span class="inline-flex size-4.5 items-center justify-center rounded-full border border-current text-[0.625rem] font-bold" :class="i === step && 'border-navy bg-navy-bg text-white'">{{ i < step ? '✓' : i + 1 }}</span>{{ stepLabel }}</span></span>
    </template>

      <!-- 1: provider -->
      <div v-if="step === 0" class="overflow-auto px-4 py-3.5 select-text">
        <p class="mb-3">Welcher lokale KI-Server läuft auf deinem Rechner? Alles bleibt auf deinem Gerät – nichts geht ins Internet. Am einfachsten ist <b>Ollama</b>.</p>
        <div class="grid grid-cols-[repeat(2,1fr)] gap-2">
          <button v-for="provider in PROVIDERS" :key="provider.id" class="flex flex-col gap-1 border bg-surface p-2.5 text-left" :class="draft.provider === provider.id ? 'border-navy bg-sel shadow-[0_0_0_1px_var(--s3d-navy)]' : 'border-line-2'" @click="choose(provider.id)">
            <div class="font-bold text-navy">{{ provider.name }}</div>
            <div class="flex gap-1 [&>span]:rounded-lg [&>span]:px-1.5 [&>span]:text-[0.625rem]"><span class="bg-ok-bg text-ok">lokal</span><span class="bg-surface-2 text-ink-2">kostenlos</span></div>
            <div class="text-xs text-ink-2">{{ provider.blurb }}</div>
          </button>
        </div>
      </div>

      <!-- 2: connect -->
      <div v-if="step === 1" class="overflow-auto px-4 py-3.5 select-text">
        <div class="mb-1.5 text-[0.9375rem] font-bold text-navy">{{ info.name }}</div>
        <ol class="mb-2.5 list-decimal pl-5 [&_li]:my-1 [&_code]:bg-surface-2 [&_code]:px-1.25 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all"><li v-for="(setupStep, i) in info.setup" :key="i"><span v-html="fmt(setupStep)"></span></li></ol>
        <label class="mt-2.5 mb-1 block text-xs font-semibold">Adresse (Basis-URL)</label>
        <input v-model="draft.baseUrl" class="s3d-input" spellcheck="false" />
        <label class="mt-2.5 mb-1 block text-xs font-semibold">API-Key <span v-if="!info.needsKey">(optional)</span></label>
        <input v-model="draft.apiKey" class="s3d-input" type="password" autocomplete="off" spellcheck="false" :placeholder="info.needsKey ? 'Key hier einfügen' : 'leer lassen, falls nicht nötig'" />
        <p class="my-1.5 text-xs text-ink-2 [&_code]:bg-surface-2 [&_code]:px-1.25 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all">Nur nötig, wenn dein Server einen Key verlangt (z. B. LiteLLM mit Master-Key).</p>
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
          <div v-for="preset in MODEL_PRESETS" :key="preset.id" class="cursor-pointer border bg-surface px-2.5 py-2" :class="draft.model === preset.id ? 'border-navy bg-sel shadow-[0_0_0_1px_var(--s3d-navy)]' : 'border-line-2'" @click="installed(preset.id) && (draft.model = preset.id)">
            <div class="flex items-center gap-2">
              <span class="font-bold text-navy">{{ preset.label }}</span>
              <span class="rounded-lg px-1.5 text-[0.625rem]" :class="preset.mode === 'mesh' ? 'bg-[#f3e5f5] text-[#6a1b9a] dark:bg-[#2d1b36] dark:text-[#d2a8ff]' : 'bg-sel text-[#1e4f9b] dark:text-navy'">{{ preset.mode === 'mesh' ? '3D-Mesh' : 'Code' }}</span>
              <span class="text-[0.6875rem] text-muted">{{ preset.size }}</span>
              <span class="flex-1"></span>
              <span v-if="installed(preset.id)" class="text-xs font-semibold text-ok">✓ installiert</span>
              <template v-else-if="draft.provider === 'ollama'">
                <button v-if="downloads[preset.id] && !downloads[preset.id].error" class="s3d-btn small" @click.stop="cancelDownload(preset.id)">Abbrechen</button>
                <button v-else class="s3d-btn small" :disabled="anyPulling" @click.stop="install(preset.id)">{{ downloads[preset.id]?.error ? 'Erneut versuchen' : 'Installieren' }}</button>
              </template>
            </div>
            <div class="mt-0.75 text-xs text-ink-2">{{ preset.note }}</div>
            <div v-if="downloads[preset.id]" class="mt-2" @click.stop>
              <template v-if="downloads[preset.id].error"><span class="text-xs text-danger">Fehler: {{ downloads[preset.id].error }}</span></template>
              <template v-else>
                <S3dProgressBar :value="downloads[preset.id].frac" labeled />
                <div class="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[#374151] tabular-nums dark:text-ink-2">
                  <span>{{ downloads[preset.id].status }}</span>
                  <span v-if="downloads[preset.id].total">{{ fmtBytes(downloads[preset.id].completed) }} von {{ fmtBytes(downloads[preset.id].total) }}</span>
                  <span v-if="downloads[preset.id].speed > 0 && downloads[preset.id].phase === 'download'">{{ fmtBytes(downloads[preset.id].speed) }}/s</span>
                  <span v-if="downloads[preset.id].phase === 'download'">{{ fmtDuration(downloads[preset.id].eta) }}</span>
                </div>
              </template>
            </div>
          </div>
        </div>
        <template v-if="otherModels.length">
          <label class="mt-2.5 mb-1 block text-xs font-semibold">Weitere installierte Modelle</label>
          <div class="mb-1.5 flex max-h-55 flex-wrap gap-1.5 overflow-auto">
            <button v-for="modelName in otherModels" :key="modelName" class="flex items-center gap-1.5 border px-2.25 py-1.25 font-mono text-xs" :class="draft.model === modelName ? 'border-navy bg-active' : 'border-line-2 bg-surface'" @click="draft.model = modelName">{{ modelName }}</button>
          </div>
        </template>
        <label class="mt-2.5 mb-1 block text-xs font-semibold">oder Modellname eingeben</label>
        <input v-model="draft.model" class="s3d-input" spellcheck="false" placeholder="z. B. qwen2.5-coder:7b" />
        <p class="my-1.5 text-xs text-ink-2 [&_code]:bg-surface-2 [&_code]:px-1.25 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all">Installieren lädt das Modell einmalig über Ollama herunter (mehrere GB). Danach läuft alles offline auf deinem Rechner.</p>
      </div>

      <!-- 4: done -->
      <div v-if="step === 3" class="overflow-auto px-4 py-3.5 select-text">
        <div class="text-center text-[2.875rem] text-[#2e9b4b]">✓</div>
        <p class="mb-3 text-center">Fertig! <b>{{ info.name }}</b> mit <b>{{ draft.model }}</b> ist eingerichtet.</p>
        <label class="s3d-check"><input v-model="draft.autoRun" type="checkbox" /> Erzeugten Code automatisch ausführen (jede Antwort ist ein Rückgängig-Schritt)</label>
        <p class="my-1.5 text-xs text-ink-2 [&_code]:bg-surface-2 [&_code]:px-1.25 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all">Probiere z. B.: „Erstelle einen Würfel mit 2 m Kantenlänge aus Holz“ oder „Baue eine Spinne“.</p>
      </div>

    <template #footer>
        <button v-if="step > 0" class="s3d-btn" @click="step--">Zurück</button>
        <span class="flex-1"></span>
        <button v-if="step < 3" class="s3d-btn primary" :disabled="!canNext" @click="next">Weiter</button>
        <button v-else class="s3d-btn primary" @click="finish">Los geht's</button>
    </template>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import S3dProgressBar from '../../../components/ui/S3dProgressBar.vue';
import S3dModalDialog from '../../../components/ui/S3dModalDialog.vue';
import { reactive, ref, computed } from 'vue';
import S3dIcon from '../../../components/S3dIcon.vue';
import { PROVIDERS, MODEL_PRESETS, aiConfig, providerInfo, listModels, describeError, downloads, startDownload, cancelDownload, fmtBytes, fmtDuration, ensureMeshModel, type ProviderId, type AiConfig } from './providers';

const emit = defineEmits<{ (event: 'close'): void }>();
const STEPS = ['Anbieter', 'Verbinden', 'Modell', 'Fertig'];
const step = ref(0);
const draft = reactive<AiConfig>({ ...aiConfig });
const info = computed(() => providerInfo(draft.provider));
const models = ref<string[]>([]); const error = ref(''); const testing = ref(false);
const norm = (modelName: string) => modelName.toLowerCase().replace(/:latest$/, '');
const installed = (id: string) => models.value.some(model => norm(model) === norm(id));
const otherModels = computed(() => models.value.filter(model => !MODEL_PRESETS.some(preset => norm(preset.id) === norm(model))));
const anyPulling = computed(() => Object.values(downloads).some(download => !download.error));
const install = async (id: string) => {
  delete downloads[id];
  const preset = MODEL_PRESETS.find(entry => entry.id === id);
  if (await startDownload(draft, preset?.pull ?? id, id)) {
    if (preset?.mode === 'mesh') { try { await ensureMeshModel(draft); } catch (reason) { downloads[id] = { ...(downloads[id] ?? {}), error: describeError(reason) } as any; } }
    models.value = await listModels(draft); draft.model = id;
  }
};
const canNext = computed(() => step.value === 0 ? !!draft.provider : step.value === 1 ? !!draft.baseUrl && (!info.value.needsKey || !!draft.apiKey) : step.value === 2 ? !!draft.model : true);

const choose = (id: ProviderId) => {
  if (draft.provider !== id) { draft.provider = id; draft.baseUrl = providerInfo(id).baseUrl; draft.model = ''; models.value = []; error.value = ''; }
};
const fmt = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(ollama [a-z]+ [^\s]+|litellm [^\n]+|OLLAMA_ORIGINS="\*")/g, '<code>$1</code>');
const test = async () => {
  testing.value = true; error.value = ''; models.value = [];
  try { models.value = await listModels(draft); if (!models.value.length) error.value = 'Verbunden, aber keine Modelle gefunden.'; }
  catch (reason) { error.value = describeError(reason); }
  finally { testing.value = false; }
};
const next = async () => {
  if (step.value === 1 && !models.value.length && !error.value) await test();
  if (step.value === 1 && (!draft.model || !installed(draft.model))) draft.model = MODEL_PRESETS.find(preset => installed(preset.id))?.id ?? models.value[0] ?? '';
  step.value++;
};
const finish = () => { Object.assign(aiConfig, draft, { configured: true }); emit('close'); };
</script>
