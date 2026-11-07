<template>
  <section class="s3d-bk-section">
    <div class="s3d-bk-heading">{{ t('bricks.models.title') }}</div>
    <p class="s3d-bk-hint">{{ t('bricks.models.intro') }}</p>

    <div class="s3d-bk-grid">
      <button
        v-for="name in OWN_MODEL_NAMES"
        :key="name"
        class="s3d-bk-card"
        :class="{ active: OWN_PREFIX + name === state.placing }"
        @click="chooseOwn(name)"
      >
        <span class="s3d-bk-thumb" v-html="ownPicture(name)"></span>
        <span class="s3d-bk-name">{{ t(`bricks.models.own.${name}`) }}</span>
      </button>
    </div>

    <div class="s3d-bk-heading">{{ t('bricks.models.onlineTitle') }}</div>
    <div class="s3d-bk-chips">
      <button v-for="entry in MODEL_THEMES" :key="entry" class="s3d-bk-chip" :class="{ active: entry === theme }" @click="theme = entry">
        {{ t(`bricks.models.themes.${entry}`) }}
      </button>
    </div>
    <div class="s3d-bk-results">
      <button v-for="model in shown" :key="model.id" class="s3d-bk-result" :disabled="!!loading" @click="loadOnline(model)">
        <span>{{ model.title }}</span>
        <span class="s3d-bk-number">{{ isLoaded(model.id) ? '✓ ' : '' }}{{ t('bricks.models.pieces', { count: model.pieces }) }}</span>
      </button>
    </div>

    <label class="s3d-btn small s3d-bk-file">
      {{ t('bricks.models.openFile') }}
      <input type="file" accept=".ldr,.mpd,.l3b" :disabled="!!loading" @change="openFile" />
    </label>
    <p class="s3d-bk-hint">
      {{ t('bricks.models.fileHint') }}
      <a :href="COLLECTION_URL" target="_blank" rel="noopener noreferrer">{{ t('bricks.models.collection') }}</a>
    </p>

    <template v-if="loading">
      <p class="s3d-bk-hint strong">{{ t('bricks.models.loading', { title: loading, files: progress.files }) }}</p>
      <button class="s3d-btn small" @click="cancel">{{ t('bricks.online.cancel') }}</button>
    </template>
    <p v-if="problem" class="s3d-bk-warn" role="alert">{{ problem }}</p>
    <p v-if="notice" class="s3d-bk-warn">{{ notice }}</p>
    <p class="s3d-bk-credit">{{ t('bricks.models.credit') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { MODEL_THEMES, ONLINE_MODELS, type OnlineModel } from './ldrawModels';
import { loadModel, openModelFile, OWN_PREFIX, ownModelSpec, type ModelProgress } from './models';
import { OnlineError } from './online';
import { OWN_MODEL_NAMES, type OwnModelName } from './ownModels';
import { modelSpec, type ModelSpec } from './parts';
import { previewSvg } from './preview';
import { t } from './runtime';
import { useBrickState } from './state';

/** Finished models: the plugin's own without a network, more from LDraw's collection, or a model file of the user's. */

// i18n-ignore-next-line – an address
const COLLECTION_URL = 'https://library.ldraw.org/omr';

const emit = defineEmits<{ loaded: [id: string] }>();
const state = useBrickState();

const theme = ref<(typeof MODEL_THEMES)[number]>('city');
const shown = computed(() => ONLINE_MODELS.filter((model) => model.theme === theme.value));
const loading = ref('');
const progress = reactive<ModelProgress>({ files: 0 });
const problem = ref('');
const notice = ref('');
const loadedRevision = ref(0);

let controller: AbortController | null = null;
onBeforeUnmount(() => controller?.abort());

const ownPicture = (name: OwnModelName) => previewSvg(ownModelSpec(name).id, '');
const isLoaded = (id: string) => {
  void loadedRevision.value;
  return !!modelSpec(id);
};

const chooseOwn = (name: OwnModelName) => emit('loaded', ownModelSpec(name).id);

const run = async (title: string, job: (signal: AbortSignal) => Promise<ModelSpec>) => {
  controller?.abort();
  controller = new AbortController();
  loading.value = title;
  progress.files = 0;
  problem.value = '';
  notice.value = '';
  try {
    const spec = await job(controller.signal);
    loadedRevision.value++;
    if (spec.missing) {
      notice.value = t('bricks.models.missing', { count: spec.missing });
    }
    emit('loaded', spec.id);
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      const code = error instanceof OnlineError ? error.code : (error as Error).message === 'tooLarge' ? 'tooLarge' : 'network';
      problem.value = t(`bricks.errors.${code}`);
    }
  } finally {
    loading.value = '';
  }
};

const onProgress = ({ files }: ModelProgress) => (progress.files = files);

const loadOnline = (model: OnlineModel) =>
  run(model.title, (signal) => loadModel({ id: model.id, title: model.title, url: model.url }, signal, onProgress));

const openFile = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    void run(file.name, (signal) => openModelFile(file, signal, onProgress));
  }
  // the same file may be chosen again
  input.value = '';
};

const cancel = () => controller?.abort();
</script>
