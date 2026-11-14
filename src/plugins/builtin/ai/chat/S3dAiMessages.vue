<template>
  <div ref="list" class="flex flex-1 flex-col gap-2 overflow-auto px-3 py-2.5 select-text">
    <div v-if="!aiConfig.configured" class="flex flex-col items-center gap-2 px-2.5 py-5 text-center text-ink">
      <S3dIcon name="sparkle" :size="40" />
      <p>{{ t('ai.chat.intro') }}</p>
      <S3dButton primary @click="emit('setUp')">{{ t('ai.chat.setUpAi') }}</S3dButton>
      <p class="text-[0.6875rem] text-muted">{{ t('ai.chat.local') }}</p>
    </div>
    <div v-else-if="!aiState.turns.length" class="flex flex-col items-center gap-2 px-2.5 py-5 text-center text-ink">
      <S3dIcon name="sparkle" :size="34" />
      <p>{{ t('ai.chat.whatToBuild') }}</p>
      <p v-if="isMesh" class="text-[0.6875rem] text-muted">{{ t('ai.chat.meshHint') }}</p>
      <div class="flex flex-wrap justify-center gap-1.5">
        <button v-for="question in QUICK" :key="question" type="button" class="s3d-chip" @click="emit('ask', question)">
          {{ question }}
        </button>
      </div>
    </div>

    <template v-for="(turn, i) in aiState.turns" :key="turn.id">
      <div
        v-if="i === 0 || !sameDay(aiState.turns[i - 1].createdAt, turn.createdAt)"
        class="my-1 flex items-center gap-2 text-[0.6875rem] text-muted before:h-px before:flex-1 before:bg-line before:content-[''] after:h-px after:flex-1 after:bg-line after:content-['']"
      >
        <span>{{ dayLabel(turn.createdAt) }}</span>
      </div>
      <S3dAiUserTurn v-if="turn.role === 'user'" :turn="turn" @zoom="zoomed = $event" />
      <S3dAiAssistantTurn v-else :turn="turn" :now="now" />
    </template>
    <Teleport to="body">
      <div v-if="zoomed" class="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/70 p-6" @click="zoomed = null">
        <img :src="zoomed" alt="" class="max-h-full max-w-full object-contain" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import S3dIcon from '../../../../components/S3dIcon.vue';
import S3dButton from '../../../../components/ui/S3dButton.vue';
import S3dAiAssistantTurn from './S3dAiAssistantTurn.vue';
import S3dAiUserTurn from './S3dAiUserTurn.vue';
import { aiConfig, modeFor } from '../providers';
import { aiState } from '../agent';
import { dayLabel, sameDay } from '../history';
import { t } from '../../../../i18n';

/** The conversation, with a day line between days; empty: set-up hint or quick questions. Follows new text. */
defineProps<{ now: number }>();
const emit = defineEmits<{ (event: 'ask', question: string): void; (event: 'setUp'): void }>();
const list = useTemplateRef<HTMLElement>('list');
const zoomed = ref<string | null>(null);
const isMesh = computed(() => modeFor(aiConfig.model) === 'mesh');
const QUICK = computed(() => [1, 2, 3, 4, 5, 6].map((index) => t(`ai.chat.quick${index}`)));
watch(
  () => aiState.turns.map((turn) => turn.text.length + (turn.status ?? '')).join(),
  () =>
    nextTick(() => {
      if (list.value) {
        list.value.scrollTop = list.value.scrollHeight;
      }
    }),
);
</script>
