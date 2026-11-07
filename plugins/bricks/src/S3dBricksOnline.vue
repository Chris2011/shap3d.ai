<template>
  <section class="s3d-bk-section">
    <div class="s3d-bk-heading">{{ t('bricks.online.title') }}</div>
    <p class="s3d-bk-hint">{{ t('bricks.online.intro', { source: LIBRARY_LABEL }) }}</p>

    <form class="s3d-bk-row" @submit.prevent="searchOnline">
      <input
        v-model="query"
        class="s3d-bk-input"
        type="search"
        :aria-label="t('bricks.online.search')"
        :placeholder="t('bricks.online.search')"
      />
      <button class="s3d-btn small" type="submit" :disabled="!query.trim() || searching || !key">{{ REBRICKABLE_LABEL }}</button>
    </form>

    <div v-if="results.length" class="s3d-bk-results">
      <button v-for="part in results" :key="part.number" class="s3d-bk-result" :disabled="!!loading" @click="load(part.number)">
        <span>{{ part.title }}</span>
        <span class="s3d-bk-number">{{ isStored(part.number) ? '✓ ' : '' }}{{ part.number }}</span>
      </button>
    </div>
    <button v-else-if="numberAsked" class="s3d-btn small" :disabled="!!loading" @click="load(numberAsked)">
      {{ t('bricks.online.loadNumber', { number: numberAsked }) }}
    </button>
    <p v-else-if="query.trim()" class="s3d-bk-hint">{{ t('bricks.online.nothing') }}</p>

    <template v-if="loading">
      <p class="s3d-bk-hint strong">{{ t('bricks.online.loading', { number: loading, files }) }}</p>
      <button class="s3d-btn small" @click="cancel">{{ t('bricks.online.cancel') }}</button>
    </template>
    <p v-if="problem" class="s3d-bk-warn" role="alert">{{ problem }}</p>

    <details>
      <summary class="s3d-bk-hint">{{ t('bricks.online.keyTitle', { source: REBRICKABLE_LABEL }) }}</summary>
      <div class="s3d-bk-section">
        <p class="s3d-bk-warn">{{ t('bricks.online.untested', { source: REBRICKABLE_LABEL }) }}</p>
        <p class="s3d-bk-hint">
          {{ t('bricks.online.keyHint', { source: REBRICKABLE_LABEL }) }}
          <a :href="REBRICKABLE_HELP" target="_blank" rel="noopener noreferrer">{{ t('bricks.online.keyGet') }}</a>
        </p>
        <input
          v-model="key"
          class="s3d-bk-input"
          type="password"
          autocomplete="off"
          spellcheck="false"
          :aria-label="t('bricks.online.keyLabel')"
          :placeholder="t('bricks.online.keyLabel')"
          @change="saveKey"
        />
        <p class="s3d-bk-hint">{{ t('bricks.online.keyStored') }}</p>
      </div>
    </details>
    <p class="s3d-bk-credit">
      {{ t('bricks.online.credit', { source: LIBRARY_LABEL }) }}
      <a :href="LIBRARY_URL" target="_blank" rel="noopener noreferrer">{{ LIBRARY_URL }}</a>
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { searchCommonParts } from './ldrawParts';
import {
  LIBRARY_LABEL,
  LIBRARY_URL,
  loadPart,
  OnlineError,
  REBRICKABLE_HELP,
  REBRICKABLE_LABEL,
  searchRebrickable,
  type FoundPart,
} from './online';
import { isPartNumber } from './ldraw';
import { LDRAW_PREFIX, loadedPart } from './parts';
import { pluginContext, t } from './runtime';

/** More parts from the library: what is known without a key is searched here, Rebrickable with the user's own key. */

const emit = defineEmits<{ loaded: [id: string] }>();
const context = pluginContext();

const query = ref('');
const found = ref<FoundPart[]>([]);
// what the service found belongs to the words it was asked for
watch(query, () => (found.value = []));
const searching = ref(false);
const loading = ref('');
const files = ref(0);
const problem = ref('');
const key = ref(context.storage.get<string>('rebrickableKey', ''));
const saveKey = () => context.storage.set('rebrickableKey', key.value.trim());

let controller: AbortController | null = null;
onBeforeUnmount(() => controller?.abort());

const results = computed(() => {
  const text = query.value.trim();
  if (!text) {
    return [];
  }
  const known = searchCommonParts(text);
  const numbers = new Set(known.map((part) => part.number));
  return [...known, ...found.value.filter((part) => !numbers.has(part.number))];
});
/** nothing known under this, but it could be a number in the library */
const numberAsked = computed(() => {
  const text = query.value.trim();
  return isPartNumber(text) && /\d/.test(text) ? text : '';
});
const isStored = (number: string) => !!loadedPart(LDRAW_PREFIX + number.toLowerCase());

const messageOf = (error: unknown) => (error instanceof OnlineError ? t(`bricks.errors.${error.code}`) : t('bricks.errors.network'));

const searchOnline = async () => {
  controller?.abort();
  controller = new AbortController();
  searching.value = true;
  problem.value = '';
  try {
    found.value = await searchRebrickable(query.value.trim(), key.value.trim(), controller.signal);
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      problem.value = messageOf(error);
    }
  } finally {
    searching.value = false;
  }
};

const load = async (number: string) => {
  controller?.abort();
  controller = new AbortController();
  loading.value = number;
  files.value = 0;
  problem.value = '';
  try {
    const part = await loadPart(number, controller.signal, (count) => (files.value = count));
    emit('loaded', part.id);
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      problem.value = messageOf(error);
    }
  } finally {
    loading.value = '';
  }
};

const cancel = () => controller?.abort();
</script>
