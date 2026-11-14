import { computed, ref, shallowRef, watch } from 'vue';
import { watchDebounced } from '@vueuse/core';
import { searchModels, type HfModel, type HfSort } from '../hfsearch';
import { t } from '../../../../i18n';

/**
 * Searching Hugging Face for GGUF models: the query (searched 400 ms after typing stops), the sort order,
 * "small only", the results and their state. An older search is cancelled when a new one starts.
 */
export const useHfSearch = () => {
  const query = ref('coder');
  const smallOnly = ref(true);
  const sort = ref<HfSort>('downloads');
  const results = shallowRef<HfModel[]>([]);
  const loading = ref(false);
  const error = ref('');
  /** Unknown sizes stay visible – only names that clearly say > 4B are hidden. */
  const shown = computed(() =>
    smallOnly.value ? results.value.filter((model) => (model.active ?? model.params ?? 0) <= 4) : results.value,
  );

  let controller: AbortController | null = null;
  const run = async () => {
    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    error.value = '';
    try {
      results.value = await searchModels(query.value, sort.value, controller.signal);
    } catch (reason: any) {
      if (reason?.name !== 'AbortError') {
        error.value = navigator.onLine ? (reason?.message ?? String(reason)) : t('ai.search.offline');
      }
    } finally {
      loading.value = false;
    }
  };
  watchDebounced(query, run, { debounce: 400 });
  watch(sort, run);

  return { query, smallOnly, sort, results, shown, loading, error, run };
};
