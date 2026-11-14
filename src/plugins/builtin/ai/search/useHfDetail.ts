import { ref, shallowRef } from 'vue';
import { modelDetail, type HfDetail, type HfModel } from '../hfsearch';

/** The one search result that is open, with its files and details loaded from Hugging Face. */
export const useHfDetail = () => {
  const openId = ref<string | null>(null);
  const detail = shallowRef<HfDetail | null>(null);
  const loading = ref(false);
  const error = ref('');
  const toggle = async (model: HfModel) => {
    if (openId.value === model.id) {
      openId.value = null;
      return;
    }
    openId.value = model.id;
    detail.value = null;
    error.value = '';
    loading.value = true;
    try {
      const loaded = await modelDetail(model.id);
      // another model may have been opened meanwhile
      if (openId.value === model.id) {
        detail.value = loaded;
      }
    } catch (reason: any) {
      error.value = reason?.message ?? String(reason);
    } finally {
      loading.value = false;
    }
  };
  const close = () => {
    openId.value = null;
  };
  return { openId, detail, loading, error, toggle, close };
};
