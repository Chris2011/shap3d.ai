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

    <p v-if="placing" class="s3d-mk-notice" role="status">{{ t('marketplace.load.place') }}</p>

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

    <template v-else>
      <label v-if="!selected" class="s3d-mk-row">
        <span>{{ t('marketplace.panel.source') }}</span>
        <select v-model="sourceId" class="s3d-input s3d-mk-input">
          <option v-for="entry in SOURCES" :key="entry.id" :value="entry.id">
            {{ t(entry.label) }}{{ entry.key ? ` (${t('marketplace.key.short')})` : '' }}
          </option>
        </select>
      </label>

      <p v-if="active.untested" class="s3d-mk-warn">{{ t('marketplace.panel.untested') }}</p>
      <template v-if="active.key">
        <p class="s3d-mk-hint">
          {{ t(active.key.needed === 'search' ? 'marketplace.key.forSearch' : 'marketplace.key.forDownload', { source: active.label }) }}
          <a :href="active.key.helpUrl" target="_blank" rel="noopener noreferrer">{{ t('marketplace.key.get') }}</a>
        </p>
        <div class="s3d-mk-row">
          <input
            v-model="key"
            class="s3d-input s3d-mk-input"
            type="password"
            autocomplete="off"
            :aria-label="t('marketplace.key.label')"
            :placeholder="t('marketplace.key.label')"
            @change="saveKey"
          />
        </div>
        <p class="s3d-mk-hint">{{ t('marketplace.key.stored') }}</p>
      </template>

      <template v-if="selected">
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
          <dd>{{ active.label }}</dd>
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
        <p v-if="active.places" class="s3d-mk-hint">{{ t('marketplace.item.places', { radius: 150 }) }}</p>

        <p v-if="error" class="s3d-mk-warn" role="alert">{{ error }}</p>
        <template v-if="active.download">
          <button v-if="!loading" class="s3d-btn" :disabled="!!active.key && !key" @click="load">{{ t('marketplace.item.load') }}</button>
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
        <p v-else class="s3d-mk-hint">{{ t('marketplace.item.linkOnly', { source: active.label }) }}</p>
      </template>

      <template v-else>
        <div class="s3d-mk-row">
          <input
            v-model="query"
            class="s3d-input s3d-mk-input"
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

        <p class="s3d-mk-hint">{{ t('marketplace.panel.privacy') }}</p>
        <p v-if="error" class="s3d-mk-warn" role="alert">{{ error }}</p>
        <p v-if="fellBack && !searching" class="s3d-mk-hint">{{ t('marketplace.panel.nothing') }}</p>

        <div class="s3d-mk-grid">
          <button v-for="item in shown" :key="`${item.sourceId}:${item.id}`" class="s3d-mk-card" @click="pick(item)">
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
            <span class="s3d-mk-meta">{{ sourceOf(item).label }}</span>
          </button>
        </div>
        <div v-if="searching" class="s3d-mk-spinner" role="status" :aria-label="t('marketplace.panel.searching')"></div>
        <button v-else-if="next || items.length > visible" class="s3d-btn small" @click="showMore">
          {{ t('marketplace.panel.more') }}
        </button>
        <p v-if="source !== ALL_SOURCES" class="s3d-mk-hint">{{ t('marketplace.panel.poweredBy', { source: source.label }) }}</p>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { creditLine, creditsInModel, loadIntoModel, LoadFailure, SIZE_LIMIT, type Progress } from './load';
import { imageUrl, pluginContext, t, webUrl } from './runtime';
import { CATEGORIES, SourceError, type Category, type ModelItem, type ModelSource, type SearchPage } from './source';
import { ALL_SOURCES, SOURCES } from './sources';

const context = pluginContext();
const MEGABYTE = 1024 * 1024;

const view = ref<'search' | 'credits'>('search');
const sourceId = ref(SOURCES[0].id);
const source = computed(() => SOURCES.find((entry) => entry.id === sourceId.value) ?? SOURCES[0]);
const sourceOf = (item: ModelItem) => SOURCES.find((entry) => entry.id === item.sourceId) ?? source.value;
const selected = shallowRef<ModelItem | null>(null);
/** whose key, name and download count: the open model's source, or the one chosen in the list */
const active = computed(() => (selected.value ? sourceOf(selected.value) : source.value));
const keys = ref(context.storage.get<Record<string, string>>('keys', {}));
const key = computed({
  get: () => keys.value[active.value.id] ?? '',
  set: (value: string) => {
    keys.value = { ...keys.value, [active.value.id]: value.trim() };
  },
});
const saveKey = () => {
  context.storage.set('keys', keys.value);
  if (!selected.value) {
    void search();
  }
};

const query = ref('');
const category = ref<Category>();
const items = shallowRef<ModelItem[]>([]);
const next = ref<string>();
const searching = ref(false);
const fellBack = ref(false);
const SHOWN_AT_ONCE = 20;
const visible = ref(SHOWN_AT_ONCE);
const shown = computed(() => items.value.slice(0, visible.value));
const placingStarted = ref(false);
/** the model hangs on the pointer until the place tool is left: a click placed it, or Esc dropped it */
const placing = computed(() => placingStarted.value && context.editor.ui.tool === 'place');
watch(placing, (now) => {
  if (!now) {
    placingStarted.value = false;
  }
});
const error = ref('');
const loading = ref(false);
const progress = shallowRef<Progress>();
const credits = shallowRef<ReturnType<typeof creditsInModel>>([]);

/** one for each: looking at a model must not stop the list, and neither may stop a download */
let listing: AbortController | undefined;
let details: AbortController | undefined;
let download: AbortController | undefined;
const restart = (previous: AbortController | undefined) => {
  previous?.abort();
  return new AbortController();
};
let closed = false;
onBeforeUnmount(() => {
  closed = true;
  listing?.abort();
  details?.abort();
  // a download goes on with the panel closed: the user asked for that model
});

const message = (reason: unknown) => {
  const code = reason instanceof SourceError || reason instanceof LoadFailure ? reason.code : '';
  if (code) {
    return t(`marketplace.errors.${code}`, { source: t(active.value.label), limit: SIZE_LIMIT / MEGABYTE });
  }
  // the app's import says what went wrong itself, in a sentence
  return String((reason as Error)?.message ?? reason);
};
const isCancel = (reason: unknown) => (reason as Error)?.name === 'AbortError';

/** what a source lists: without a search or filter its default set */
const askSource = (from: ModelSource, words: string, filter: Category | undefined, cursor: string | undefined, signal: AbortSignal) =>
  from.search({
    query: words,
    category: from.places ? undefined : filter,
    next: cursor,
    key: keys.value[from.id] ?? '',
    keys: keys.value,
    signal,
  });

const search = async (more = false) => {
  listing = restart(listing);
  const { signal } = listing;
  const from = source.value;
  const words = query.value.trim();
  searching.value = true;
  error.value = '';
  fellBack.value = false;
  // what was shown belongs to another search: it goes at once, and the spinner stands in its place
  if (!more) {
    items.value = [];
    next.value = undefined;
    visible.value = SHOWN_AT_ONCE;
  }
  try {
    // a source that only answers with a key has nothing to say without one: its hint says so, the list stays full
    const needsKey = from.key?.needed === 'search' && !keys.value[from.id];
    let page: SearchPage = needsKey
      ? { items: [] }
      : await askSource(from, words, category.value, more ? next.value : undefined, signal).catch((reason) => {
          if (isCancel(reason)) {
            throw reason;
          }
          error.value = message(reason);
          return { items: [] };
        });
    // there is always something to see: when a search finds nothing, the default set of all sources
    if (!more && !page.items.length) {
      fellBack.value = !needsKey && !error.value;
      page = await askSource(ALL_SOURCES, '', undefined, undefined, signal);
    }
    signal.throwIfAborted();
    items.value = more ? [...items.value, ...page.items] : page.items;
    next.value = page.next;
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

const showMore = () => {
  visible.value += SHOWN_AT_ONCE;
  if (items.value.length < visible.value && next.value) {
    void search(true);
  }
};

watch(sourceId, () => void search());
onMounted(() => void search());

const pick = async (item: ModelItem) => {
  selected.value = item;
  error.value = '';
  const origin = sourceOf(item);
  if (!origin.details) {
    return;
  }
  details = restart(details);
  try {
    const detailed = await origin.details(item, key.value, details.signal);
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
  download = new AbortController();
  loading.value = true;
  error.value = '';
  progress.value = undefined;
  try {
    await loadIntoModel(active.value, item, key.value, download.signal, (value) => {
      progress.value = value;
    });
    placingStarted.value = true;
  } catch (reason) {
    if (!isCancel(reason)) {
      error.value = message(reason);
      // with the panel closed nobody would read it there
      if (closed) {
        context.ui.toast(error.value);
      }
    }
  } finally {
    loading.value = false;
  }
};
const cancel = () => download?.abort();

const showCredits = () => {
  credits.value = creditsInModel();
  view.value = 'credits';
};
const copyCredits = async () => {
  await navigator.clipboard.writeText(credits.value.map((entry) => creditLine(entry.credit)).join('\n'));
  context.ui.toast(t('marketplace.credits.copied'));
};
</script>
