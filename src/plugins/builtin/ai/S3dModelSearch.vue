<template>
  <S3dModalDialog :title="t('ai.search.title')" panel-class="h-[min(42.5rem,90vh)] w-[min(52rem,94vw)]" @close="$emit('close')">
    <template #header
      ><span class="cursor-help text-[0.6875rem] text-muted underline decoration-dotted" :title="t('ai.search.ggufInfo')">{{
        t('ai.search.subtitle')
      }}</span></template
    >

    <div class="flex gap-2 px-4 pt-3 pb-1.5">
      <input
        ref="inp"
        v-model="query"
        class="s3d-input h-8 flex-1"
        :placeholder="t('ai.search.placeholder')"
        spellcheck="false"
        @keydown.enter="run"
      />
      <select v-model="sort" class="s3d-input h-8 w-42.5 flex-none" :title="t('ai.search.sort')">
        <option value="downloads">{{ t('ai.search.sortDownloads') }}</option>
        <option value="trendingScore">{{ t('ai.search.sortTrending') }}</option>
        <option value="likes">{{ t('ai.search.sortLikes') }}</option>
        <option value="lastModified">{{ t('ai.search.sortNewest') }}</option>
      </select>
    </div>
    <div class="flex flex-wrap gap-1.5 px-4 pt-0.5 pb-2">
      <button
        v-for="chip in CHIPS"
        :key="chip.q"
        class="s3d-chip"
        :class="{ on: query === chip.q }"
        :title="chip.hint && t(chip.hint)"
        @click="pick(chip)"
      >
        {{ localize(chip.label) }}
      </button>
      <label class="s3d-check ms-auto gap-1.25 text-xs" :title="t('ai.search.smallTitle')"
        ><input v-model="smallOnly" type="checkbox" /> {{ t('ai.search.smallOnly') }}</label
      >
    </div>
    <p v-if="!isOllama" class="mx-4 mb-2 bg-warn-bg px-2.5 py-1.5 text-xs text-warn">{{ t('ai.search.ollamaOnly') }}</p>

    <div class="flex-1 overflow-auto border-t border-line select-text">
      <div v-if="loading" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">
        <span class="size-3.5 animate-spin rounded-full border-2 border-[#cfd8e3] border-t-blue"></span> {{ t('ai.search.searching') }}
      </div>
      <div v-else-if="error" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-danger">✗ {{ error }}</div>
      <div v-else-if="!shown.length" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">
        {{ smallOnly && results.length ? t('ai.search.onlyBigger') : t('ai.search.nothing') }}
      </div>

      <div v-for="model in shown" :key="model.id" class="border-b border-line" :class="{ 'bg-surface-2': openId === model.id }">
        <div class="flex cursor-pointer items-start gap-2 px-4 py-2.25 hover:bg-hover" @click="toggle(model)">
          <span class="w-3 pt-px text-navy">{{ openId === model.id ? '▾' : '▸' }}</span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[0.8125rem]">
              <span
                v-if="model.params"
                class="me-1.5 inline-block min-w-7.5 rounded-[3px] px-1 text-center text-[0.65625rem] font-bold"
                :class="PARAM_BADGE[paramClass(model.active ?? model.params)]"
                :title="model.active ? t('ai.search.moeTitle', { active: formatNumber(model.active) }) : t('ai.search.paramsTitle')"
                >{{ formatNumber(model.params) }}B<template v-if="model.active"> · A{{ formatNumber(model.active) }}B</template></span
              ><span class="font-bold text-navy">{{ model.id.split('/')[1] }}</span
              ><span class="ms-1 text-muted">{{ t('pluginManager.by', { author: model.author }) }}</span
              ><span v-if="model.official" class="ms-2 text-[0.6875rem] font-semibold text-ok" :title="t('ai.search.officialTitle')">{{
                t('ai.search.official')
              }}</span
              ><span v-if="!model.chat" class="ms-2 text-[0.6875rem] text-danger" :title="t('ai.search.notChatTitle')">{{
                t('ai.search.notChat')
              }}</span
              ><span v-if="model.gated" class="ms-2 text-[0.6875rem] text-warn" :title="t('ai.search.gatedTitle')">{{
                t('ai.search.gated')
              }}</span>
            </div>
            <div class="mt-0.5 flex flex-wrap gap-3 text-[0.6875rem] text-muted">
              <span :title="t('ai.search.downloadsTitle')">⬇ {{ fmtCount(model.downloads) }}</span>
              <span title="Likes">♥ {{ fmtCount(model.likes) }}</span>
              <span v-if="model.updated" :title="t('ai.search.updated')">{{ fmtDate(model.updated) }}</span>
              <span v-if="model.license" class="bg-surface-2 px-1.25">{{ model.license }}</span>
              <span v-if="installedRepo(model.id)" class="font-bold text-ok">{{ t('ai.wizard.installed') }}</span>
            </div>
          </div>
        </div>

        <div v-if="openId === model.id" class="pt-0.5 pe-4 pb-3 ps-9">
          <div v-if="detailLoading" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">
            <span class="size-3.5 animate-spin rounded-full border-2 border-[#cfd8e3] border-t-blue"></span>
            {{ t('ai.search.loadingFiles') }}
          </div>
          <div v-else-if="detailError" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-danger">✗ {{ detailError }}</div>
          <template v-else-if="detail">
            <div class="mb-1.5 flex flex-wrap gap-3.5 text-xs text-ink [&_a]:text-blue">
              <span v-if="detail.params">{{ t('ai.search.parameters', { count: fmtParams(detail.params) }) }}</span>
              <span v-if="detail.arch">{{ t('ai.search.architecture', { arch: detail.arch }) }}</span>
              <span v-if="detail.context">{{ t('ai.search.context', { tokens: fmtCount(detail.context) }) }}</span>
              <a :href="'https://huggingface.co/' + model.id" target="_blank" rel="noopener noreferrer">{{ t('ai.search.viewOnHf') }}</a>
            </div>
            <p v-if="!model.chat" class="mb-1.5 bg-warn-bg px-2.5 py-1.5 text-xs text-warn">{{ t('ai.search.notChatTitle') }}</p>
            <p v-if="!detail.quants.length" class="flex items-center gap-2 px-4 py-3.5 text-[0.8125rem] text-ink-2">
              {{ detail.split ? t('ai.search.onlySplit') : t('ai.search.noFiles') }}
            </p>
            <p v-else class="mt-1 mb-1.5 text-xs text-ink-2">
              {{ t('ai.search.quantHint') }} <b>{{ RECOMMENDED_QUANT }}</b> {{ t('ai.search.quantBest') }}
            </p>
            <div
              v-for="quant in detail.quants"
              :key="quant.quant"
              class="grid grid-cols-[minmax(11rem,auto)_5rem_minmax(7rem,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-line px-1.5 py-1 text-xs"
              :class="{ 'bg-ok-bg': quant.quant === RECOMMENDED_QUANT }"
            >
              <span class="font-mono font-bold"
                >{{ quant.quant
                }}<span v-if="quant.quant === RECOMMENDED_QUANT" class="font-sans text-[0.6875rem] font-semibold text-ok">
                  {{ t('ai.search.recommended') }}</span
                ></span
              >
              <span class="text-end tabular-nums">{{ quant.size ? fmtBytes(quant.size) : '?' }}</span>
              <span :class="SPEED[speedClass(quant.size, share(model)).cls]">{{ speedClass(quant.size, share(model)).label }}</span>
              <span class="flex items-center justify-end gap-2">
                <button
                  v-if="downloads[quant.ollamaName] && !downloads[quant.ollamaName].error"
                  class="s3d-btn small"
                  @click="cancelDownload(quant.ollamaName)"
                >
                  {{ t('common.cancel') }}
                </button>
                <button
                  v-else-if="installed.has(quant.ollamaName.toLowerCase())"
                  class="s3d-btn small primary"
                  :disabled="!model.chat"
                  @click="use(quant.ollamaName)"
                >
                  {{ t('ai.search.use') }}
                </button>
                <button
                  v-else
                  class="s3d-btn small"
                  :disabled="!isOllama || model.gated || !model.chat"
                  :title="
                    !model.chat
                      ? t('ai.search.notChatTitle')
                      : model.gated
                        ? t('ai.search.needsLogin')
                        : t('ai.search.downloadTitle', { size: fmtBytes(quant.size) })
                  "
                  @click="download(quant)"
                >
                  {{ t('ai.search.download') }}
                </button>
              </span>
              <S3dPullProgress v-if="downloads[quant.ollamaName]" class="col-span-full pb-1" :progress="downloads[quant.ollamaName]" />
            </div>
          </template>
        </div>
      </div>
    </div>
    <div class="border-t border-line px-4 py-2 text-[0.6875rem] text-muted">{{ t('ai.search.privacy') }}</div>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import S3dModalDialog from '../../../components/ui/S3dModalDialog.vue';
import S3dPullProgress from './S3dPullProgress.vue';
import { ref, shallowRef, computed, watch, onMounted } from 'vue';
import S3dIcon from '../../../components/S3dIcon.vue';
import { aiConfig, listModels, downloads, startDownload, cancelDownload, fmtBytes } from './providers';
import {
  searchModels,
  modelDetail,
  speedClass,
  fmtCount,
  RECOMMENDED_QUANT,
  type HfModel,
  type HfDetail,
  type HfQuant,
  type HfSort,
} from './hfsearch';
import { t, localize, language, formatNumber } from '../../../i18n';

const emit = defineEmits<{ (event: 'close'): void; (event: 'use', model: string): void }>();

/** label: text or message key, hint: message key */
const CHIPS = [
  { label: 'ai.search.chipSmall', q: 'coder', hint: 'ai.search.chipSmallHint', small: true },
  { label: 'Code', q: 'qwen2.5 coder', hint: 'ai.search.chipCodeHint' },
  { label: '3D / Mesh', q: 'mesh', hint: 'ai.search.chipMeshHint' },
  { label: 'Qwen', q: 'qwen', hint: '' },
  { label: 'Llama', q: 'llama', hint: '' },
  { label: 'Gemma', q: 'gemma', hint: '' },
  { label: 'Phi', q: 'phi', hint: '' },
];

const query = ref('coder');
const smallOnly = ref(true);
const sort = ref<HfSort>('downloads');
const results = shallowRef<HfModel[]>([]);
const loading = ref(false);
const error = ref('');
const openId = ref<string | null>(null);
const detail = shallowRef<HfDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const installed = shallowRef(new Set<string>());
const inp = shallowRef<HTMLInputElement | null>(null);
/** Unknown sizes stay visible – only names that clearly say > 4B are hidden. */
const shown = computed(() => (smallOnly.value ? results.value.filter((model) => (model.active ?? model.params ?? 0) <= 4) : results.value));
const pick = (chip: { q: string; small?: boolean }) => {
  query.value = chip.q;
  smallOnly.value = !!chip.small;
};
const isOllama = computed(() => aiConfig.provider === 'ollama');

let ctrl: AbortController | null = null;
let timer = 0;
const run = async () => {
  clearTimeout(timer);
  ctrl?.abort();
  ctrl = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    results.value = await searchModels(query.value, sort.value, ctrl.signal);
    openId.value = null;
  } catch (reason: any) {
    if (reason?.name !== 'AbortError') {
      error.value = navigator.onLine ? (reason?.message ?? String(reason)) : t('ai.search.offline');
    }
  } finally {
    loading.value = false;
  }
};
watch(query, () => {
  clearTimeout(timer);
  timer = window.setTimeout(run, 400);
});
watch(sort, run);

const toggle = async (model: HfModel) => {
  if (openId.value === model.id) {
    openId.value = null;
    return;
  }
  openId.value = model.id;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try {
    const loaded = await modelDetail(model.id);
    if (openId.value === model.id) {
      detail.value = loaded;
    }
  } catch (reason: any) {
    detailError.value = reason?.message ?? String(reason);
  } finally {
    detailLoading.value = false;
  }
};

const refreshInstalled = async () => {
  if (!isOllama.value) {
    return;
  }
  try {
    installed.value = new Set((await listModels(aiConfig)).map((name) => name.toLowerCase()));
  } catch {
    /* server offline – buttons still work */
  }
};
const installedRepo = (id: string) => [...installed.value].some((name) => name.startsWith(`hf.co/${id.toLowerCase()}:`));

const download = async (quant: HfQuant) => {
  const ok = await startDownload(aiConfig, quant.ollamaName);
  if (ok) {
    await refreshInstalled();
  }
};
const use = (name: string) => {
  aiConfig.model = name;
  aiConfig.configured = true;
  emit('use', name);
  emit('close');
};

/** ≤ 4B fast, ≤ 9B okay, bigger is slow on a CPU */
/** mixture-of-experts: only the active part is computed per token */
const share = (model: HfModel) => (model.active && model.params ? model.active / model.params : 1);
const paramClass = (billions: number) => (billions <= 4 ? 'fast' : billions <= 9 ? 'mid' : 'slow');
const PARAM_BADGE = { fast: 'bg-warn-bg text-warn', mid: 'bg-surface-2 text-ink-2', slow: 'bg-warn-bg text-danger' };
const SPEED = { fast: 'font-bold text-warn', mid: 'text-ink-2', slow: 'text-danger' };
const fmtDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(language.value, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtParams = (count: number) =>
  count >= 1e9
    ? t('ai.search.billions', { count: formatNumber(count / 1e9, { maximumFractionDigits: 1 }) })
    : t('ai.search.millions', { count: Math.round(count / 1e6) });

onMounted(() => {
  inp.value?.focus();
  run();
  refreshInstalled();
});
</script>
