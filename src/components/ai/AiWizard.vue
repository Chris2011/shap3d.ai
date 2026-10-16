<template>
  <div class="bg" @pointerdown.self="$emit('close')">
    <div class="wiz s3d-panel" @keydown.stop>
      <div class="head">
        <span class="t">KI-Assistent einrichten</span>
        <span class="steps"><span v-for="(s, i) in STEPS" :key="s" class="st" :class="{ on: i === step, past: i < step }"><span class="num">{{ i < step ? '✓' : i + 1 }}</span>{{ s }}</span></span>
        <button class="x" title="Schließen" @click="$emit('close')"><Icon name="close" :size="16" /></button>
      </div>

      <!-- 1: provider -->
      <div v-if="step === 0" class="body">
        <p class="lead">Welcher lokale KI-Server läuft auf deinem Rechner? Alles bleibt auf deinem Gerät – nichts geht ins Internet. Am einfachsten ist <b>Ollama</b>.</p>
        <div class="cards">
          <button v-for="p in PROVIDERS" :key="p.id" class="card" :class="{ on: draft.provider === p.id }" @click="choose(p.id)">
            <div class="cn">{{ p.name }}</div>
            <div class="tags"><span class="loc">lokal</span><span class="free">kostenlos</span></div>
            <div class="cb">{{ p.blurb }}</div>
          </button>
        </div>
      </div>

      <!-- 2: connect -->
      <div v-if="step === 1" class="body">
        <div class="cn big">{{ info.name }}</div>
        <ol class="setup"><li v-for="(s, i) in info.setup" :key="i"><span v-html="fmt(s)"></span></li></ol>
        <label class="lbl">Adresse (Basis-URL)</label>
        <input v-model="draft.baseUrl" class="s3d-input" spellcheck="false" />
        <label class="lbl">API-Key <span v-if="!info.needsKey">(optional)</span></label>
        <input v-model="draft.apiKey" class="s3d-input" type="password" autocomplete="off" spellcheck="false" :placeholder="info.needsKey ? 'Key hier einfügen' : 'leer lassen, falls nicht nötig'" />
        <p class="hint">Nur nötig, wenn dein Server einen Key verlangt (z. B. LiteLLM mit Master-Key).</p>
        <div class="row">
          <button class="s3d-btn primary" :disabled="testing" @click="test">{{ testing ? 'Teste …' : 'Verbindung testen' }}</button>
          <span v-if="models.length" class="ok">✓ Verbunden – {{ models.length }} Modelle gefunden</span>
          <span v-else-if="error" class="err">{{ error }}</span>
        </div>
      </div>

      <!-- 3: model -->
      <div v-if="step === 2" class="body">
        <p class="lead">Wähle ein freies Modell. <b>LLaMA-Mesh</b> ist speziell für 3D trainiert und erzeugt Meshes direkt; <b>Qwen</b>-Modelle schreiben Modellier-Code und können ganze Szenen mit Materialien und Texturen bauen.</p>
        <div class="presets">
          <div v-for="m in MODEL_PRESETS" :key="m.id" class="preset" :class="{ on: draft.model === m.id }" @click="installed(m.id) && (draft.model = m.id)">
            <div class="pt">
              <span class="pn">{{ m.label }}</span>
              <span class="mode" :class="m.mode">{{ m.mode === 'mesh' ? '3D-Mesh' : 'Code' }}</span>
              <span class="psz">{{ m.size }}</span>
              <span style="flex:1"></span>
              <span v-if="installed(m.id)" class="inst">✓ installiert</span>
              <template v-else-if="draft.provider === 'ollama'">
                <button v-if="downloads[m.id] && !downloads[m.id].error" class="s3d-btn small" @click.stop="cancelDownload(m.id)">Abbrechen</button>
                <button v-else class="s3d-btn small" :disabled="anyPulling" @click.stop="install(m.id)">{{ downloads[m.id]?.error ? 'Erneut versuchen' : 'Installieren' }}</button>
              </template>
            </div>
            <div class="pnote">{{ m.note }}</div>
            <div v-if="downloads[m.id]" class="dl" @click.stop>
              <template v-if="downloads[m.id].error"><span class="err">Fehler: {{ downloads[m.id].error }}</span></template>
              <template v-else>
                <div class="bar"><span :style="{ width: (downloads[m.id].frac * 100).toFixed(1) + '%' }"></span><b>{{ (downloads[m.id].frac * 100).toFixed(1).replace('.', ',') }} %</b></div>
                <div class="dlinfo">
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
          <label class="lbl">Weitere installierte Modelle</label>
          <div class="mlist">
            <button v-for="m in otherModels" :key="m" class="mopt" :class="{ on: draft.model === m }" @click="draft.model = m">{{ m }}</button>
          </div>
        </template>
        <label class="lbl">oder Modellname eingeben</label>
        <input v-model="draft.model" class="s3d-input" spellcheck="false" placeholder="z. B. qwen2.5-coder:7b" />
        <p class="hint">Installieren lädt das Modell einmalig über Ollama herunter (mehrere GB). Danach läuft alles offline auf deinem Rechner.</p>
      </div>

      <!-- 4: done -->
      <div v-if="step === 3" class="body">
        <div class="done-mark">✓</div>
        <p class="lead center">Fertig! <b>{{ info.name }}</b> mit <b>{{ draft.model }}</b> ist eingerichtet.</p>
        <label class="s3d-check"><input v-model="draft.autoRun" type="checkbox" /> Erzeugten Code automatisch ausführen (jede Antwort ist ein Rückgängig-Schritt)</label>
        <p class="hint">Probiere z. B.: „Erstelle einen Würfel mit 2 m Kantenlänge aus Holz“ oder „Baue eine Spinne“.</p>
      </div>

      <div class="foot">
        <button v-if="step > 0" class="s3d-btn" @click="step--">Zurück</button>
        <span style="flex:1"></span>
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

<style scoped>
.bg { position: fixed; inset: 0; background: rgba(20, 25, 30, .3); z-index: 95; display: flex; align-items: center; justify-content: center; }
.wiz { width: min(640px, 94vw); max-height: 90vh; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; gap: 12px; padding: 10px 8px 10px 16px; background: var(--s3d-panel-2); }
.t { font-weight: 700; font-size: 16px; color: var(--s3d-navy); letter-spacing: .5px; white-space: nowrap; }
.steps { display: flex; gap: 12px; font-size: 12px; color: #9a9db0; margin-left: auto; white-space: nowrap; }
.st { display: flex; align-items: center; gap: 5px; }
.num { width: 18px; height: 18px; border-radius: 50%; border: 1px solid currentColor; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
.steps .on { color: var(--s3d-navy); font-weight: 700; }
.steps .on .num { background: var(--s3d-navy-bg); color: #fff; border-color: var(--s3d-navy); }
.steps .past { color: #2e9b4b; }
.x { border: 0; background: transparent; cursor: pointer; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: var(--s3d-navy); }
.body { padding: 14px 16px; overflow: auto; user-select: text; }
.lead { margin: 0 0 12px; }
.center { text-align: center; }
.cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.card { text-align: left; border: 1px solid var(--s3d-line-2); background: var(--s3d-bg); padding: 10px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.card:hover { border-color: var(--s3d-line-2); }
.card.on { border-color: var(--s3d-navy); box-shadow: 0 0 0 1px var(--s3d-navy); background: var(--s3d-sel); }
.cn { font-weight: 700; color: var(--s3d-navy); }
.cn.big { font-size: 15px; margin-bottom: 6px; }
.cb { font-size: 12px; color: var(--s3d-text-2); }
.tags { display: flex; gap: 4px; }
.tags span { font-size: 10px; padding: 0 6px; border-radius: 8px; }
.loc { background: var(--s3d-ok-bg); color: var(--s3d-ok); } .cloud { background: var(--s3d-sel); color: #1e4f9b; } .key { background: var(--s3d-warn-bg); color: #9a5800; } .free { background: var(--s3d-bg-2); color: var(--s3d-text-2); }
.setup { margin: 0 0 10px; padding-left: 20px; } .setup li { margin: 4px 0; }
.setup :deep(code), .hint code { font: 12px Consolas, monospace; background: var(--s3d-bg-2); padding: 1px 5px; user-select: all; }
.lbl { display: block; font-size: 12px; font-weight: 600; margin: 10px 0 4px; }
.hint { font-size: 12px; color: var(--s3d-text-2); margin: 6px 0; }
.row { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.ok { color: var(--s3d-ok); font-weight: 600; } .err { color: var(--s3d-danger); font-size: 12px; }
.mlist { display: flex; flex-wrap: wrap; gap: 6px; max-height: 220px; overflow: auto; margin-bottom: 6px; }
.mopt { border: 1px solid var(--s3d-line-2); background: var(--s3d-bg); padding: 5px 9px; cursor: pointer; font: 12px Consolas, monospace; display: flex; gap: 6px; align-items: center; }
.mopt.on { border-color: var(--s3d-navy); background: var(--s3d-active); }
.rec { font: 10px "Open Sans", sans-serif; background: var(--s3d-ok-bg); color: var(--s3d-ok); padding: 0 5px; border-radius: 6px; }
.presets { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
.preset { border: 1px solid var(--s3d-line-2); background: var(--s3d-bg); padding: 8px 10px; cursor: pointer; }
.preset.on { border-color: var(--s3d-navy); box-shadow: 0 0 0 1px var(--s3d-navy); background: var(--s3d-sel); }
.pt { display: flex; align-items: center; gap: 8px; }
.pn { font-weight: 700; color: var(--s3d-navy); }
.mode { font-size: 10px; padding: 0 6px; border-radius: 8px; }
.mode.mesh { background: #f3e5f5; color: #6a1b9a; } .mode.code { background: var(--s3d-sel); color: #1e4f9b; }
.psz { font-size: 11px; color: var(--s3d-muted); }
.inst { font-size: 12px; color: var(--s3d-ok); font-weight: 600; }
.pnote { font-size: 12px; color: var(--s3d-text-2); margin-top: 3px; }
.dl { margin-top: 8px; }
.bar { position: relative; height: 18px; background: var(--s3d-line); overflow: hidden; }
.bar span { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #1e9bd7, var(--s3d-navy-bg)); transition: width .3s; }
.bar b { position: relative; display: block; text-align: center; font-size: 11px; line-height: 18px; color: #fff; mix-blend-mode: difference; }
.dlinfo { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: #374151; margin-top: 4px; font-variant-numeric: tabular-nums; }
.done-mark { font-size: 46px; color: #2e9b4b; text-align: center; }
.foot { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--s3d-line); }
</style>
