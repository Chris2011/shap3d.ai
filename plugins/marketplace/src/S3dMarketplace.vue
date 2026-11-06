<template>
  <div class="s3d-mk">
    <div class="s3d-mk-chips" role="tablist">
      <button
        class="s3d-mk-chip"
        :class="{ active: view === 'search' }"
        role="tab"
        :aria-selected="view === 'search'"
        @click="view = 'search'"
      >
        {{ t('marketplace.panel.search') }}
      </button>
      <button
        class="s3d-mk-chip"
        :class="{ active: view === 'credits' }"
        role="tab"
        :aria-selected="view === 'credits'"
        @click="showCredits"
      >
        {{ t('marketplace.credits.tab') }}
      </button>
    </div>

    <template v-if="view === 'credits'">
      <p class="s3d-mk-hint">{{ t('marketplace.credits.hint') }}</p>
      <p v-if="!credits.length" class="s3d-mk-hint">{{ t('marketplace.credits.empty') }}</p>
      <div v-for="entry in credits" :key="entry.id" class="s3d-mk-credit">
        <span class="s3d-mk-title">{{ entry.credit.title }}</span>
        <span class="s3d-mk-hint"
          >{{ entry.credit.author }} · {{ entry.credit.source }} · {{ entry.credit.license || t('marketplace.item.licenseUnknown') }}</span
        >
        <a v-if="webUrl(entry.credit.webUrl)" :href="webUrl(entry.credit.webUrl)" target="_blank" rel="noopener noreferrer">{{
          t('marketplace.item.open')
        }}</a>
      </div>
      <button v-if="credits.length" class="s3d-btn small" @click="copyCredits">{{ t('marketplace.credits.copy') }}</button>
    </template>

    <template v-else-if="selected">
      <button class="s3d-btn small" :disabled="loading" @click="selected = null">{{ t('marketplace.item.back') }}</button>
      <img
        v-if="imageUrl(selected.thumbnail)"
        class="s3d-mk-thumb"
        :src="imageUrl(selected.thumbnail)"
        :alt="selected.title"
        referrerpolicy="no-referrer"
      />
      <div class="s3d-mk-title">{{ selected.title }}</div>
      <dl class="s3d-mk-facts">
        <dt>{{ t('marketplace.item.source') }}</dt>
        <dd>{{ source.label }}</dd>
        <dt>{{ t('marketplace.item.author') }}</dt>
        <dd>
          <a v-if="webUrl(selected.authorUrl)" :href="webUrl(selected.authorUrl)" target="_blank" rel="noopener noreferrer">{{
            selected.author
          }}</a>
          <template v-else>{{ selected.author || '–' }}</template>
        </dd>
        <dt>{{ t('marketplace.item.license') }}</dt>
        <dd>
          <a
            v-if="selected.license && webUrl(selected.licenseUrl)"
            :href="webUrl(selected.licenseUrl)"
            target="_blank"
            rel="noopener noreferrer"
            >{{ selected.license }}</a
          >
          <template v-else>{{ selected.license || t('marketplace.item.licenseUnknown') }}</template>
        </dd>
        <template v-if="selected.triangles">
          <dt>{{ t('marketplace.item.triangles') }}</dt>
          <dd>{{ selected.triangles.toLocaleString() }}</dd>
        </template>
      </dl>
      <p class="s3d-mk-hint">{{ licenseHint }}</p>
      <a v-if="webUrl(selected.webUrl)" :href="webUrl(selected.webUrl)" target="_blank" rel="noopener noreferrer">{{
        t('marketplace.item.open')
      }}</a>
      <p v-if="source.places" class="s3d-mk-hint">{{ t('marketplace.item.places', { radius: 150 }) }}</p>

      <p v-if="error" class="s3d-mk-warn" role="alert">{{ error }}</p>
      <template v-if="source.download">
        <button v-if="!loading" class="s3d-btn" @click="load">{{ t('marketplace.item.load') }}</button>
        <template v-else>
          <div class="s3d-mk-bar" role="progressbar" :aria-valuenow="percent ?? undefined" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: `${percent ?? 15}%` }"></span>
          </div>
          <div class="s3d-mk-row" aria-live="polite">
            <span class="s3d-mk-hint">{{ progressText }}</span>
            <button class="s3d-btn small" @click="cancel">{{ t('marketplace.item.cancel') }}</button>
          </div>
        </template>
      </template>
      <p v-else class="s3d-mk-hint">{{ t('marketplace.item.linkOnly', { source: source.label }) }}</p>
    </template>

    <template v-else>
      <label class="s3d-mk-row">
        <span>{{ t('marketplace.panel.source') }}</span>
        <select v-model="sourceId" class="s3d-mk-input">
          <option v-for="entry in SOURCES" :key="entry.id" :value="entry.id">
            {{ entry.label }}{{ entry.key ? ` (${t('marketplace.key.short')})` : '' }}
          </option>
        </select>
      </label>

      <p v-if="source.untested" class="s3d-mk-warn">{{ t('marketplace.panel.untested') }}</p>
      <template v-if="source.key">
        <p class="s3d-mk-hint">
          {{ t(source.key.needed === 'search' ? 'marketplace.key.forSearch' : 'marketplace.key.forDownload', { source: source.label }) }}
          <a :href="source.key.helpUrl" target="_blank" rel="noopener noreferrer">{{ t('marketplace.key.get') }}</a>
        </p>
        <div class="s3d-mk-row">
          <input
            v-model="key"
            class="s3d-mk-input"
            type="password"
            autocomplete="off"
            :aria-label="t('marketplace.key.label')"
            :placeholder="t('marketplace.key.label')"
            @change="saveKey"
          />
        </div>
        <p class="s3d-mk-hint">{{ t('marketplace.key.stored') }}</p>
      </template>

      <div class="s3d-mk-row">
        <input
          v-model="query"
          class="s3d-mk-input"
          type="search"
          :aria-label="t('marketplace.panel.search')"
          :placeholder="t(source.places ? 'marketplace.panel.placePlaceholder' : 'marketplace.panel.placeholder')"
          @keydown.enter="search()"
        />
        <button class="s3d-btn small" :disabled="searching" @click="search()">{{ t('marketplace.panel.search') }}</button>
      </div>

      <div v-if="!source.places" class="s3d-mk-chips">
        <button
          v-for="entry in CATEGORIES"
          :key="entry"
          class="s3d-mk-chip"
          :class="{ active: category === entry }"
          @click="pickCategory(entry)"
        >
          {{ t(`marketplace.category.${entry}`) }}
        </button>
      </div>

      <p class="s3d-mk-hint">{{ t('marketplace.panel.privacy', { source: source.label }) }}</p>
      <p v-if="error" class="s3d-mk-warn" role="alert">{{ error }}</p>
      <p v-if="searching" class="s3d-mk-hint" aria-live="polite">{{ t('marketplace.panel.searching') }}</p>
      <p v-else-if="searched && !items.length && !error" class="s3d-mk-hint">{{ t('marketplace.panel.nothing') }}</p>

      <div class="s3d-mk-grid">
        <button v-for="item in items" :key="item.id" class="s3d-mk-card" @click="pick(item)">
          <img
            v-if="imageUrl(item.thumbnail)"
            class="s3d-mk-thumb"
            :src="imageUrl(item.thumbnail)"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <span class="s3d-mk-title">{{ item.title }}</span>
          <span class="s3d-mk-meta">{{ item.author }}</span>
          <span class="s3d-mk-meta">{{ item.license || t('marketplace.item.licenseOnClick') }}</span>
        </button>
      </div>
      <button v-if="next" class="s3d-btn small" :disabled="searching" @click="search(true)">{{ t('marketplace.panel.more') }}</button>
      <p class="s3d-mk-hint">{{ t('marketplace.panel.poweredBy', { source: source.label }) }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { creditLine, creditsInModel, loadIntoModel, LoadFailure, SIZE_LIMIT, type Progress } from './load';
import { imageUrl, pluginContext, t, webUrl } from './runtime';
import { CATEGORIES, SourceError, type Category, type ModelItem } from './source';
import { SOURCES } from './sources';

const context = pluginContext();
const MEGABYTE = 1024 * 1024;

const view = ref<'search' | 'credits'>('search');
const sourceId = ref(SOURCES[0].id);
const source = computed(() => SOURCES.find((entry) => entry.id === sourceId.value) ?? SOURCES[0]);
const keys = ref(context.storage.get<Record<string, string>>('keys', {}));
const key = computed({
  get: () => keys.value[sourceId.value] ?? '',
  set: (value: string) => {
    keys.value = { ...keys.value, [sourceId.value]: value.trim() };
  },
});
const saveKey = () => context.storage.set('keys', keys.value);

const query = ref('');
const category = ref<Category>();
const items = shallowRef<ModelItem[]>([]);
const next = ref<string>();
const searching = ref(false);
const searched = ref(false);
const error = ref('');
const selected = shallowRef<ModelItem | null>(null);
const loading = ref(false);
const progress = shallowRef<Progress>();
const credits = shallowRef<ReturnType<typeof creditsInModel>>([]);

/** cancels whatever is running: a search, the details of a model, a download */
let running: AbortController | undefined;
const startRequest = () => {
  running?.abort();
  running = new AbortController();
  return running.signal;
};
onBeforeUnmount(() => running?.abort());

const message = (reason: unknown) => {
  const code = reason instanceof SourceError || reason instanceof LoadFailure ? reason.code : '';
  if (code) {
    return t(`marketplace.errors.${code}`, { source: source.value.label, limit: SIZE_LIMIT / MEGABYTE });
  }
  // the app's import says what went wrong itself, in a sentence
  return String((reason as Error)?.message ?? reason);
};
const isCancel = (reason: unknown) => (reason as Error)?.name === 'AbortError';

const search = async (more = false) => {
  const signal = startRequest();
  searching.value = true;
  error.value = '';
  try {
    const page = await source.value.search({
      query: query.value.trim(),
      category: source.value.places ? undefined : category.value,
      next: more ? next.value : undefined,
      key: key.value,
      signal,
    });
    items.value = more ? [...items.value, ...page.items] : page.items;
    next.value = page.next;
    searched.value = true;
  } catch (reason) {
    if (!isCancel(reason)) {
      error.value = message(reason);
    }
  } finally {
    if (!signal.aborted) {
      searching.value = false;
    }
  }
};

const pickCategory = (entry: Category) => {
  category.value = category.value === entry ? undefined : entry;
  void search();
};

watch(sourceId, () => {
  running?.abort();
  searching.value = false;
  items.value = [];
  next.value = undefined;
  searched.value = false;
  error.value = '';
});

const pick = async (item: ModelItem) => {
  selected.value = item;
  error.value = '';
  if (!source.value.details) {
    return;
  }
  const signal = startRequest();
  const shown = source.value;
  try {
    const detailed = await shown.details!(item, key.value, signal);
    if (selected.value === item) {
      selected.value = detailed;
    }
  } catch (reason) {
    // the model can still be looked at; its page names the licence
    if (!isCancel(reason)) {
      console.warn(reason);
    }
  }
};

const licenseHint = computed(() => {
  const license = selected.value?.license;
  if (!license) {
    return t('marketplace.license.unknown');
  }
  return /^(cc0|public domain|pd\b)/i.test(license) ? t('marketplace.license.free') : t('marketplace.license.attribution');
});

const percent = computed(() => {
  const { received = 0, total } = progress.value ?? {};
  return total ? Math.min(100, Math.round((received / total) * 100)) : null;
});
const progressText = computed(() => {
  const { received, total } = progress.value ?? {};
  if (received === undefined) {
    return t('marketplace.load.starting');
  }
  if (total && received >= total) {
    return t('marketplace.load.building');
  }
  return t('marketplace.load.received', { size: (received / MEGABYTE).toFixed(1) });
});

const load = async () => {
  const item = selected.value;
  if (!item) {
    return;
  }
  const signal = startRequest();
  loading.value = true;
  error.value = '';
  progress.value = undefined;
  try {
    await loadIntoModel(source.value, item, key.value, signal, (value) => {
      progress.value = value;
    });
  } catch (reason) {
    if (!isCancel(reason)) {
      error.value = message(reason);
    }
  } finally {
    loading.value = false;
  }
};
const cancel = () => running?.abort();

const showCredits = () => {
  credits.value = creditsInModel();
  view.value = 'credits';
};
const copyCredits = async () => {
  await navigator.clipboard.writeText(credits.value.map((entry) => creditLine(entry.credit)).join('\n'));
  context.ui.toast(t('marketplace.credits.copied'));
};
</script>
