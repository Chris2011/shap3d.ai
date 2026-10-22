<template>
  <S3dModalDialog :title="t('ai.wizard.title')" panel-class="w-[min(40rem,94vw)]" @close="$emit('close')">
    <template #header>
      <span class="ms-auto flex gap-3 whitespace-nowrap text-xs text-[#9a9db0]"
        ><button
          v-for="(stepLabel, i) in STEPS"
          :key="stepLabel"
          class="flex items-center gap-1.25 enabled:cursor-pointer enabled:hover:underline"
          :class="i === step ? 'font-bold text-navy' : stepDone(i) ? 'text-[#2e9b4b]' : ''"
          :disabled="i === step || !reachable(i)"
          @click="goTo(i)"
        >
          <span
            class="inline-flex size-4.5 items-center justify-center rounded-full border border-current text-[0.625rem] font-bold"
            :class="i === step && 'border-navy bg-navy-bg text-white'"
            >{{ stepDone(i) ? '✓' : i + 1 }}</span
          >{{ stepLabel }}
        </button></span
      >
    </template>

    <!-- 1: provider -->
    <div v-if="step === 0" class="overflow-auto px-4 py-3.5 select-text">
      <p class="mb-3" v-html="t('ai.wizard.providerIntro')"></p>
      <div class="grid grid-cols-[repeat(2,1fr)] gap-2">
        <button
          v-for="provider in PROVIDERS"
          :key="provider.id"
          class="flex flex-col gap-1 border bg-surface p-2.5 text-start"
          :class="draft.provider === provider.id ? 'border-navy bg-sel shadow-[0_0_0_1px_var(--s3d-navy)]' : 'border-line-2'"
          @click="choose(provider.id)"
        >
          <div class="font-bold text-navy">{{ t(provider.name) }}</div>
          <div class="flex gap-1 [&>span]:rounded-lg [&>span]:px-1.5 [&>span]:text-[0.625rem]">
            <span class="bg-ok-bg text-ok">{{ t('ai.wizard.local') }}</span
            ><span class="bg-surface-2 text-ink-2">{{ t('ai.wizard.free') }}</span>
          </div>
          <div class="text-xs text-ink-2">{{ t(provider.blurb) }}</div>
        </button>
      </div>
    </div>

    <!-- 2: connect -->
    <div v-if="step === 1" class="overflow-auto px-4 py-3.5 select-text">
      <div class="mb-1.5 text-[0.9375rem] font-bold text-navy">{{ t(info.name) }}</div>
      <ol
        class="mb-2.5 list-decimal ps-5 [&_li]:my-1 [&_code]:bg-surface-2 [&_code]:px-1.25 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all"
      >
        <li v-for="(setupStep, i) in info.setup" :key="i"><span v-html="fmt(t(setupStep))"></span></li>
      </ol>
      <label class="mt-2.5 mb-1 block text-xs font-semibold">{{ t('ai.wizard.baseUrl') }}</label>
      <input v-model="draft.baseUrl" class="s3d-input" spellcheck="false" />
      <label class="mt-2.5 mb-1 block text-xs font-semibold"
        >{{ t('ai.wizard.apiKey') }} <span v-if="!info.needsKey">{{ t('ai.wizard.optional') }}</span></label
      >
      <input
        v-model="draft.apiKey"
        class="s3d-input"
        type="password"
        autocomplete="off"
        spellcheck="false"
        :placeholder="info.needsKey ? t('ai.wizard.pasteKey') : t('ai.wizard.leaveEmpty')"
      />
      <p
        class="my-1.5 text-xs text-ink-2 [&_code]:bg-surface-2 [&_code]:px-1.25 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all"
      >
        {{ t('ai.wizard.keyHint') }}
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-2.5">
        <button class="s3d-btn primary" :disabled="testing" @click="test">
          {{ testing ? t('ai.wizard.testing') : t('ai.wizard.test') }}
        </button>
        <span v-if="models.length" class="font-semibold text-ok">✓ {{ t('ai.wizard.connected', { count: models.length }) }}</span>
        <span v-else-if="error" class="text-xs text-danger">{{ error }}</span>
      </div>
    </div>

    <!-- 3: model -->
    <div v-if="step === 2" class="overflow-auto px-4 py-3.5 select-text">
      <p class="mb-3" v-html="t('ai.wizard.modelIntro')"></p>
      <div class="mb-1.5 flex flex-col gap-1.5">
        <div
          v-for="preset in MODEL_PRESETS"
          :key="preset.id"
          class="cursor-pointer border bg-surface px-2.5 py-2"
          :class="isChosen(preset) ? 'border-navy bg-sel shadow-[0_0_0_1px_var(--s3d-navy)]' : 'border-line-2'"
          @click="choosePreset(preset)"
        >
          <div class="flex items-center gap-2">
            <span class="font-bold text-navy">{{ localize(preset.label) }}</span>
            <span
              class="rounded-lg px-1.5 text-[0.625rem]"
              :class="
                preset.mode === 'mesh'
                  ? 'bg-[#f3e5f5] text-[#6a1b9a] dark:bg-[#2d1b36] dark:text-[#d2a8ff]'
                  : 'bg-sel text-[#1e4f9b] dark:text-navy'
              "
              >{{ preset.mode === 'mesh' ? t('ai.wizard.mesh') : t('ai.wizard.code') }}</span
            >
            <select
              v-if="presetVariants(preset).length > 1"
              class="s3d-input h-6 w-auto py-0 font-mono text-[0.6875rem]"
              :value="variantOf(preset).quant"
              :title="t('ai.wizard.quantTitle')"
              @click.stop
              @change="chooseQuant(preset, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="variant in presetVariants(preset)" :key="variant.quant" :value="variant.quant">
                {{ variant.quant }}{{ variant.quant === RECOMMENDED_QUANT ? ' ★' : '' }}{{ variantInstalled(variant) ? ' ✓' : '' }}
              </option>
            </select>
            <span class="text-[0.6875rem] text-muted"
              >{{ variantOf(preset).estimated ? '≈ ' : ''
              }}{{ formatNumber(variantOf(preset).size, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }} GB</span
            >
            <span class="flex-1"></span>
            <span v-if="variantInstalled(variantOf(preset))" class="text-xs font-semibold text-ok">{{ t('ai.wizard.installed') }}</span>
            <template v-else-if="draft.provider === 'ollama'">
              <button
                v-if="downloads[variantOf(preset).pull] && !downloads[variantOf(preset).pull].error"
                class="s3d-btn small"
                @click.stop="cancelDownload(variantOf(preset).pull)"
              >
                {{ t('common.cancel') }}
              </button>
              <button v-else class="s3d-btn small" @click.stop="install(preset)">
                {{ downloads[variantOf(preset).pull]?.error ? t('ai.wizard.retry') : t('pluginManager.install') }}
              </button>
            </template>
          </div>
          <div class="mt-0.75 text-xs text-ink-2">{{ t(preset.note) }}</div>
          <S3dPullProgress
            v-if="downloads[variantOf(preset).pull]"
            class="mt-2"
            :progress="downloads[variantOf(preset).pull]"
            @click.stop
          />
        </div>
      </div>
      <template v-if="otherDownloads.length">
        <label class="mt-2.5 mb-1 block text-xs font-semibold">{{ t('ai.wizard.runningDownloads') }}</label>
        <div v-for="name in otherDownloads" :key="name" class="mb-1.5 border border-line-2 bg-surface px-2.5 py-2">
          <div class="mb-1.5 flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate font-mono text-xs" :title="name">{{ name }}</span>
            <button v-if="!downloads[name].error" class="s3d-btn small" @click="cancelDownload(name)">{{ t('common.cancel') }}</button>
          </div>
          <S3dPullProgress :progress="downloads[name]" />
        </div>
      </template>
      <template v-if="otherModels.length">
        <label class="mt-2.5 mb-1 block text-xs font-semibold">{{ t('ai.wizard.otherModels') }}</label>
        <div class="mb-1.5 flex max-h-55 flex-wrap gap-1.5 overflow-auto">
          <button
            v-for="modelName in otherModels"
            :key="modelName"
            class="flex items-center gap-1.5 border px-2.25 py-1.25 font-mono text-xs"
            :class="draft.model === modelName ? 'border-navy bg-active' : 'border-line-2 bg-surface'"
            @click="draft.model = modelName"
          >
            {{ modelName
            }}<span v-if="quants[normModel(modelName)] && !quantFromName(modelName)" class="text-[0.625rem] text-muted">{{
              quants[normModel(modelName)]
            }}</span>
          </button>
        </div>
      </template>
      <label class="mt-2.5 mb-1 block text-xs font-semibold">{{ t('ai.wizard.enterModel') }}</label>
      <input v-model="draft.model" class="s3d-input" spellcheck="false" :placeholder="t('ai.wizard.modelPlaceholder')" />
      <p
        class="my-1.5 text-xs text-ink-2 [&_code]:bg-surface-2 [&_code]:px-1.25 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all"
      >
        {{ t('ai.wizard.installHint') }}
      </p>
    </div>

    <!-- 4: done -->
    <div v-if="step === 3" class="overflow-auto px-4 py-3.5 select-text">
      <div class="text-center text-[2.875rem] text-[#2e9b4b]">✓</div>
      <p class="mb-3 text-center">
        {{ t('ai.wizard.done') }} <b>{{ t(info.name) }}</b> {{ t('ai.wizard.with') }} <b>{{ draft.model }}</b> {{ t('ai.wizard.isSetUp') }}
      </p>
      <label class="s3d-check"><input v-model="draft.autoRun" type="checkbox" /> {{ t('ai.wizard.autoRun') }}</label>
      <p
        class="my-1.5 text-xs text-ink-2 [&_code]:bg-surface-2 [&_code]:px-1.25 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:select-all"
      >
        {{ t('ai.wizard.tryHint') }}
      </p>
    </div>

    <template #footer>
      <button v-if="step > 0" class="s3d-btn" @click="goTo(step - 1)">{{ t('tour.back') }}</button>
      <span class="flex-1"></span>
      <button v-if="wasConfigured && step < LAST_STEP" class="s3d-btn" :disabled="!canSave" @click="finish">
        {{ t('ai.wizard.save') }}
      </button>
      <button v-if="step < LAST_STEP" class="s3d-btn primary" :disabled="!canNext" @click="goTo(step + 1)">{{ t('tour.next') }}</button>
      <button v-else class="s3d-btn primary" @click="finish">{{ t('tour.start') }}</button>
    </template>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import S3dModalDialog from '../../../components/ui/S3dModalDialog.vue';
import S3dPullProgress from './S3dPullProgress.vue';
import { reactive, ref, shallowRef, computed, onMounted } from 'vue';
import {
  PROVIDERS,
  MODEL_PRESETS,
  aiConfig,
  providerInfo,
  listModels,
  listQuants,
  quantFromName,
  normModel,
  presetVariants,
  describeError,
  downloads,
  startDownload,
  cancelDownload,
  ensureMeshModel,
  type ProviderId,
  type AiConfig,
  type ModelPreset,
  type PresetVariant,
} from './providers';
import { RECOMMENDED_QUANT } from './hfsearch';
import { t, localize, formatNumber } from '../../../i18n';

const emit = defineEmits<{ (event: 'close'): void }>();
const STEPS = computed(() => [t('ai.wizard.stepProvider'), t('ai.wizard.stepConnect'), t('ai.wizard.stepModel'), t('ai.wizard.stepDone')]);
const LAST_STEP = 3;
/** Set up before: every step can be clicked right away, and changes can be saved from any step. */
const wasConfigured = aiConfig.configured;
const step = ref(0);
/** furthest step reached so far – the steps up to it can be clicked */
const furthest = ref(wasConfigured ? LAST_STEP : 0);
const draft = reactive<AiConfig>({ ...aiConfig });
const info = computed(() => providerInfo(draft.provider));
const models = shallowRef<string[]>([]);
/** quantization of the installed models (Ollama only) */
const quants = shallowRef<Record<string, string>>({});
const error = ref('');
const testing = ref(false);
const installed = (name: string) => models.value.some((model) => normModel(model) === normModel(name));

// ------------------------------------------------------------------ quantization of the presets
/** quantization picked in the list (until then: the installed one or Q4_K_M) */
const chosenQuants = reactive<Record<string, string>>({});
/** LLaMA-Mesh keeps one alias for every quantization – which one it is shows the quant Ollama reports for it. */
const variantInstalled = (variant: PresetVariant) => {
  const quant = quants.value[normModel(variant.name)];
  return installed(variant.name) && (!quant || quant === variant.quant);
};
const variantOf = (preset: ModelPreset): PresetVariant => {
  const variants = presetVariants(preset);
  return (
    variants.find((variant) => variant.quant === chosenQuants[preset.id]) ??
    variants.find((variant) => variant.name === draft.model && variantInstalled(variant)) ??
    variants.find(variantInstalled) ??
    variants.find((variant) => variant.quant === RECOMMENDED_QUANT) ??
    variants[0]
  );
};
const isChosen = (preset: ModelPreset) => {
  const variant = variantOf(preset);
  return draft.model === variant.name && variantInstalled(variant);
};
const choosePreset = (preset: ModelPreset) => {
  const variant = variantOf(preset);
  if (variantInstalled(variant)) {
    draft.model = variant.name;
  }
};
const chooseQuant = (preset: ModelPreset, quant: string) => {
  chosenQuants[preset.id] = quant;
  choosePreset(preset);
};
/** every name a preset is pulled or used under – those are not listed again as "other models" */
const presetNames = computed(
  () => new Set(MODEL_PRESETS.flatMap(presetVariants).flatMap((variant) => [normModel(variant.name), normModel(variant.pull)])),
);
const otherModels = computed(() => models.value.filter((model) => !presetNames.value.has(normModel(model))));
/** Downloads started elsewhere (model search) – shown so a running pull is never invisible here. */
const otherDownloads = computed(() => Object.keys(downloads).filter((name) => !presetNames.value.has(normModel(name))));

const refreshModels = async () => {
  models.value = await listModels(draft);
  quants.value = await listQuants(draft);
};
const install = async (preset: ModelPreset) => {
  const variant = variantOf(preset);
  delete downloads[variant.pull];
  if (await startDownload(draft, variant.pull)) {
    if (preset.mode === 'mesh') {
      try {
        await ensureMeshModel(draft, variant.pull);
      } catch (reason) {
        downloads[variant.pull] = { ...downloads[variant.pull], error: describeError(reason) } as any;
      }
    }
    await refreshModels();
    draft.model = variant.name;
  }
};

// ------------------------------------------------------------------ steps
const stepValid = (index: number) =>
  index === 0
    ? !!draft.provider
    : index === 1
      ? !!draft.baseUrl && (!info.value.needsKey || !!draft.apiKey)
      : index === 2
        ? !!draft.model
        : true;
const canNext = computed(() => stepValid(step.value));
const canSave = computed(() => [0, 1, 2].every(stepValid));
const stepDone = (index: number) => index !== step.value && index < LAST_STEP && index <= furthest.value && stepValid(index);
/** a step can be clicked once it was reached and every step before it is filled in */
const reachable = (index: number) => index <= furthest.value && Array.from({ length: index }, (_, before) => before).every(stepValid);

const goTo = async (index: number) => {
  if (index >= 2 && step.value < 2) {
    if (pendingTest || (!models.value.length && !error.value)) {
      await test();
    }
    // a model that is not listed stays while the server is offline
    if (models.value.length && (!draft.model || !installed(draft.model))) {
      draft.model = MODEL_PRESETS.flatMap(presetVariants).find(variantInstalled)?.name ?? models.value[0];
    }
  }
  step.value = index;
  furthest.value = Math.max(furthest.value, index);
};

const choose = (id: ProviderId) => {
  if (draft.provider !== id) {
    draft.provider = id;
    draft.baseUrl = providerInfo(id).baseUrl;
    draft.model = '';
    models.value = [];
    quants.value = {};
    error.value = '';
  }
};
const fmt = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/(ollama [a-z]+ [^\s]+|litellm [^\n]+|OLLAMA_ORIGINS="\*")/g, '<code>$1</code>');
/** a running connection test – a jump to the model step waits for it instead of starting a second one */
let pendingTest: Promise<void> | null = null;
const test = () => (pendingTest ??= runTest().finally(() => (pendingTest = null)));
const runTest = async () => {
  testing.value = true;
  error.value = '';
  models.value = [];
  try {
    await refreshModels();
    if (!models.value.length) {
      error.value = t('ai.wizard.noModels');
    }
  } catch (reason) {
    error.value = describeError(reason);
  } finally {
    testing.value = false;
  }
};
const finish = () => {
  Object.assign(aiConfig, draft, { configured: true });
  emit('close');
};

// already set up: load the models right away, so a jump to the model step shows what is installed
onMounted(() => {
  if (wasConfigured) {
    void test();
  }
});
</script>
