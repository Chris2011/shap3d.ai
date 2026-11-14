import { computed, inject, provide, reactive, ref, shallowRef, type InjectionKey } from 'vue';
import {
  MODEL_PRESETS,
  aiConfig,
  providerInfo,
  listModels,
  listQuants,
  normModel,
  presetVariants,
  describeError,
  downloads,
  startDownload,
  ensureMeshModel,
  type ProviderId,
  type AiConfig,
  type ModelPreset,
  type PresetVariant,
} from '../providers';
import { RECOMMENDED_QUANT } from '../hfsearch';
import { t } from '../../../../i18n';

const createSetup = () => {
  /** the settings being edited – written to `aiConfig` only on "Save"/"Start" */
  const draft = reactive<AiConfig>({ ...aiConfig });
  const info = computed(() => providerInfo(draft.provider));
  const models = shallowRef<string[]>([]);
  /** quantization of the installed models (Ollama only) */
  const quants = shallowRef<Record<string, string>>({});
  const error = ref('');
  const testing = ref(false);
  const installed = (name: string) => models.value.some((model) => normModel(model) === normModel(name));

  const refreshModels = async () => {
    models.value = await listModels(draft);
    quants.value = await listQuants(draft);
  };
  /** a running connection test – a jump to the model step waits for it instead of starting a second one */
  let pendingTest: Promise<void> | null = null;
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
  const test = () => (pendingTest ??= runTest().finally(() => (pendingTest = null)));
  const isTesting = () => !!pendingTest;

  const chooseProvider = (id: ProviderId) => {
    if (draft.provider !== id) {
      draft.provider = id;
      draft.baseUrl = providerInfo(id).baseUrl;
      draft.model = '';
      models.value = [];
      quants.value = {};
      error.value = '';
    }
  };

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
  const choosePreset = (preset: ModelPreset) => {
    const variant = variantOf(preset);
    if (variantInstalled(variant)) {
      draft.model = variant.name;
    }
  };
  /** the first installed preset, else the first model on the server – when the model step opens without one */
  const pickInstalledModel = () => {
    if (models.value.length && (!draft.model || !installed(draft.model))) {
      draft.model = MODEL_PRESETS.flatMap(presetVariants).find(variantInstalled)?.name ?? models.value[0];
    }
  };
  /** downloads a preset with Ollama and chooses it */
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

  return {
    draft,
    info,
    models,
    quants,
    error,
    testing,
    installed,
    test,
    isTesting,
    chooseProvider,
    chosenQuants,
    variantInstalled,
    variantOf,
    choosePreset,
    pickInstalledModel,
    install,
  };
};
export type AiSetup = ReturnType<typeof createSetup>;

const AI_SETUP: InjectionKey<AiSetup> = Symbol('aiSetup');

/** Creates the state of the AI set-up wizard (draft settings, server models, presets) for its steps. */
export const provideAiSetup = () => {
  const setup = createSetup();
  provide(AI_SETUP, setup);
  return setup;
};

/** The state of the wizard this step is part of. */
export const useAiSetup = () => {
  const setup = inject(AI_SETUP);
  if (!setup) {
    throw new Error('useAiSetup() outside S3dAiWizard');
  }
  return setup;
};
