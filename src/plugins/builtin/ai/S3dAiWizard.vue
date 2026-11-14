<template>
  <S3dModalDialog :title="t('ai.wizard.title')" panel-class="w-[min(40rem,94vw)]" @close="emit('close')">
    <template #header>
      <S3dWizardSteps :labels="STEPS" :step="step" :done="stepDone" :reachable="reachable" @go="goTo" />
    </template>
    <S3dWizardProvider v-if="step === 0" />
    <S3dWizardConnect v-if="step === 1" />
    <S3dWizardModel v-if="step === 2" />
    <S3dWizardDone v-if="step === 3" />
    <template #footer>
      <S3dButton v-if="step > 0" @click="goTo(step - 1)">{{ t('tour.back') }}</S3dButton>
      <span class="flex-1"></span>
      <S3dButton v-if="wasConfigured && step < LAST_STEP" :disabled="!canSave" @click="finish">{{ t('ai.wizard.save') }}</S3dButton>
      <S3dButton v-if="step < LAST_STEP" primary :disabled="!canNext" @click="goTo(step + 1)">{{ t('tour.next') }}</S3dButton>
      <S3dButton v-else primary @click="finish">{{ t('tour.start') }}</S3dButton>
    </template>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import S3dButton from '../../../components/ui/S3dButton.vue';
import S3dModalDialog from '../../../components/ui/S3dModalDialog.vue';
import S3dWizardConnect from './wizard/S3dWizardConnect.vue';
import S3dWizardDone from './wizard/S3dWizardDone.vue';
import S3dWizardModel from './wizard/S3dWizardModel.vue';
import S3dWizardProvider from './wizard/S3dWizardProvider.vue';
import S3dWizardSteps from './wizard/S3dWizardSteps.vue';
import { provideAiSetup } from './wizard/useAiSetup';
import { aiConfig } from './providers';
import { t } from '../../../i18n';

/** Set-up wizard of the AI assistant: provider, connection, model, done. Saves to `aiConfig` only at the end. */
const emit = defineEmits<{ (event: 'close'): void }>();
const STEPS = computed(() => [t('ai.wizard.stepProvider'), t('ai.wizard.stepConnect'), t('ai.wizard.stepModel'), t('ai.wizard.stepDone')]);
const LAST_STEP = 3;
/** Set up before: every step can be clicked right away, and changes can be saved from any step. */
const wasConfigured = aiConfig.configured;
const step = ref(0);
/** furthest step reached so far – the steps up to it can be clicked */
const furthest = ref(wasConfigured ? LAST_STEP : 0);
const { draft, info, models, error, test, isTesting, pickInstalledModel } = provideAiSetup();

const stepValid = (index: number) =>
  index === 0
    ? !!draft.provider
    : index === 1
      ? !!draft.baseUrl && (!info.value.needsKey || !!draft.apiKey)
      : index === 2
        ? !!draft.model
        : true;
const canNext = computed(() => stepValid(step.value));
const canSave = computed(() => [0, 1, 2].every(stepValid));
const stepDone = (index: number) => index !== step.value && index < LAST_STEP && index <= furthest.value && stepValid(index);
/** a step can be clicked once it was reached and every step before it is filled in */
const reachable = (index: number) => index <= furthest.value && Array.from({ length: index }, (_, before) => before).every(stepValid);

const goTo = async (index: number) => {
  if (index >= 2 && step.value < 2) {
    if (isTesting() || (!models.value.length && !error.value)) {
      await test();
    }
    // a model that is not listed stays while the server is offline
    pickInstalledModel();
  }
  step.value = index;
  furthest.value = Math.max(furthest.value, index);
};
const finish = () => {
  Object.assign(aiConfig, draft, { configured: true });
  emit('close');
};

// already set up: load the models right away, so a jump to the model step shows what is installed
onMounted(() => {
  if (wasConfigured) {
    void test();
  }
});
</script>
