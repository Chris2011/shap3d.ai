<template>
  <S3dModalDialog :title="t('ai.wizard.title')" panel-class="w-[min(40rem,94vw)]" @close="$emit('close')">
    <template #header>
      <span class="ms-auto flex gap-3 whitespace-nowrap text-xs text-[#9a9db0]"
        ><span
          v-for="(stepLabel, i) in STEPS"
          :key="stepLabel"
          class="flex items-center gap-1.25"
          :class="i === step ? 'font-bold text-navy' : i < step ? 'text-[#2e9b4b]' : ''"
          ><span
            class="inline-flex size-4.5 items-center justify-center rounded-full border border-current text-[0.625rem] font-bold"
            :class="i === step && 'border-navy bg-navy-bg text-white'"
            >{{ i < step ? '✓' : i + 1 }}</span
          >{{ stepLabel }}</span
        ></span
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
          :class="draft.model === preset.id ? 'border-navy bg-sel shadow-[0_0_0_1px_var(--s3d-navy)]' : 'border-line-2'"
          @click="installed(preset.id) && (draft.model = preset.id)"
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
            <span class="text-[0.6875rem] text-muted"
              >{{ formatNumber(preset.size, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }} GB</span
            >
            <span class="flex-1"></span>
            <span v-if="installed(preset.id)" class="text-xs font-semibold text-ok">{{ t('ai.wizard.installed') }}</span>
            <template v-else-if="draft.provider === 'ollama'">
              <button
                v-if="downloads[preset.id] && !downloads[preset.id].error"
                class="s3d-btn small"
                @click.stop="cancelDownload(preset.id)"
              >
                {{ t('common.cancel') }}
              </button>
              <button v-else class="s3d-btn small" :disabled="anyPulling" @click.stop="install(preset.id)">
                {{ downloads[preset.id]?.error ? t('ai.wizard.retry') : t('pluginManager.install') }}
              </button>
            </template>
          </div>
          <div class="mt-0.75 text-xs text-ink-2">{{ t(preset.note) }}</div>
          <div v-if="downloads[preset.id]" class="mt-2" @click.stop>
            <template v-if="downloads[preset.id].error"
              ><span class="text-xs text-danger">{{ t('pluginManager.error', { error: downloads[preset.id].error }) }}</span></template
            >
            <template v-else>
              <S3dProgressBar :value="downloads[preset.id].frac" labeled />
              <div class="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[#374151] tabular-nums dark:text-ink-2">
                <span>{{ downloads[preset.id].status }}</span>
                <span v-if="downloads[preset.id].total">{{
                  t('ai.chat.progress', { done: fmtBytes(downloads[preset.id].completed), total: fmtBytes(downloads[preset.id].total) })
                }}</span>
                <span v-if="downloads[preset.id].speed > 0 && downloads[preset.id].phase === 'download'"
                  >{{ fmtBytes(downloads[preset.id].speed) }}/s</span
                >
                <span v-if="downloads[preset.id].phase === 'download'">{{ fmtDuration(downloads[preset.id].eta) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
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
            {{ modelName }}
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
      <button v-if="step > 0" class="s3d-btn" @click="step--">{{ t('tour.back') }}</button>
      <span class="flex-1"></span>
      <button v-if="step < 3" class="s3d-btn primary" :disabled="!canNext" @click="next">{{ t('tour.next') }}</button>
      <button v-else class="s3d-btn primary" @click="finish">{{ t('tour.start') }}</button>
    </template>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import S3dProgressBar from '../../../components/ui/S3dProgressBar.vue';
import S3dModalDialog from '../../../components/ui/S3dModalDialog.vue';
import { reactive, ref, shallowRef, computed } from 'vue';
import S3dIcon from '../../../components/S3dIcon.vue';
import {
  PROVIDERS,
  MODEL_PRESETS,
  aiConfig,
  providerInfo,
  listModels,
  describeError,
  downloads,
  startDownload,
  cancelDownload,
  fmtBytes,
  fmtDuration,
  ensureMeshModel,
  type ProviderId,
  type AiConfig,
} from './providers';
import { t, localize, formatNumber } from '../../../i18n';

const emit = defineEmits<{ (event: 'close'): void }>();
const STEPS = computed(() => [t('ai.wizard.stepProvider'), t('ai.wizard.stepConnect'), t('ai.wizard.stepModel'), t('ai.wizard.stepDone')]);
const step = ref(0);
const draft = reactive<AiConfig>({ ...aiConfig });
const info = computed(() => providerInfo(draft.provider));
const models = shallowRef<string[]>([]);
const error = ref('');
const testing = ref(false);
const norm = (modelName: string) => modelName.toLowerCase().replace(/:latest$/, '');
const installed = (id: string) => models.value.some((model) => norm(model) === norm(id));
const otherModels = computed(() => models.value.filter((model) => !MODEL_PRESETS.some((preset) => norm(preset.id) === norm(model))));
const anyPulling = computed(() => Object.values(downloads).some((download) => !download.error));
const install = async (id: string) => {
  delete downloads[id];
  const preset = MODEL_PRESETS.find((entry) => entry.id === id);
  if (await startDownload(draft, preset?.pull ?? id, id)) {
    if (preset?.mode === 'mesh') {
      try {
        await ensureMeshModel(draft);
      } catch (reason) {
        downloads[id] = { ...downloads[id], error: describeError(reason) } as any;
      }
    }
    models.value = await listModels(draft);
    draft.model = id;
  }
};
const canNext = computed(() =>
  step.value === 0
    ? !!draft.provider
    : step.value === 1
      ? !!draft.baseUrl && (!info.value.needsKey || !!draft.apiKey)
      : step.value === 2
        ? !!draft.model
        : true,
);

const choose = (id: ProviderId) => {
  if (draft.provider !== id) {
    draft.provider = id;
    draft.baseUrl = providerInfo(id).baseUrl;
    draft.model = '';
    models.value = [];
    error.value = '';
  }
};
const fmt = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/(ollama [a-z]+ [^\s]+|litellm [^\n]+|OLLAMA_ORIGINS="\*")/g, '<code>$1</code>');
const test = async () => {
  testing.value = true;
  error.value = '';
  models.value = [];
  try {
    models.value = await listModels(draft);
    if (!models.value.length) {
      error.value = t('ai.wizard.noModels');
    }
  } catch (reason) {
    error.value = describeError(reason);
  } finally {
    testing.value = false;
  }
};
const next = async () => {
  if (step.value === 1 && !models.value.length && !error.value) {
    await test();
  }
  if (step.value === 1 && (!draft.model || !installed(draft.model))) {
    draft.model = MODEL_PRESETS.find((preset) => installed(preset.id))?.id ?? models.value[0] ?? '';
  }
  step.value++;
};
const finish = () => {
  Object.assign(aiConfig, draft, { configured: true });
  emit('close');
};
</script>
