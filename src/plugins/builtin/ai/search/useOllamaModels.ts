import { computed, shallowRef } from 'vue';
import { aiConfig, listModels } from '../providers';

/** The models installed in Ollama (lower case), for "installed" marks and "Use" buttons. */
export const useOllamaModels = () => {
  const installed = shallowRef(new Set<string>());
  const isOllama = computed(() => aiConfig.provider === 'ollama');
  const refresh = async () => {
    if (!isOllama.value) {
      return;
    }
    try {
      installed.value = new Set((await listModels(aiConfig)).map((name) => name.toLowerCase()));
    } catch {
      /* server offline – buttons still work */
    }
  };
  /** some file of this Hugging Face repository is installed */
  const hasRepo = (id: string) => [...installed.value].some((name) => name.startsWith(`hf.co/${id.toLowerCase()}:`));
  return { installed, isOllama, refresh, hasRepo };
};
