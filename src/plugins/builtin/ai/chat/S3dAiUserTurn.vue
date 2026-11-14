<template>
  <div
    class="max-w-[92%] self-end px-2.5 py-2 text-[0.8125rem]/[1.45] break-words whitespace-pre-wrap"
    :class="turn.auto ? 'bg-warn-bg text-xs text-warn' : 'bg-navy-bg text-white'"
  >
    <div v-if="turn.images?.length" class="mb-1.5 flex flex-wrap gap-1">
      <img
        v-for="(picture, pictureIndex) in turn.images"
        :key="pictureIndex"
        :src="picture"
        alt=""
        class="max-h-24 max-w-full cursor-zoom-in border border-white/30 object-contain"
        @click="emit('zoom', picture)"
      />
    </div>
    {{ turn.auto ? t('ai.chat.autoFix') : turn.text
    }}<span class="mt-0.75 block text-end text-[0.625rem] opacity-70">{{ clock(turn.createdAt) }}</span>
  </div>
</template>

<script setup lang="ts">
import type { AiTurn } from '../agent';
import { clock } from '../history';
import { t } from '../../../../i18n';

/** A message of the user (or an automatic fix request), with its pictures; a click on a picture zooms it. */
defineProps<{ turn: AiTurn }>();
const emit = defineEmits<{ (event: 'zoom', picture: string): void }>();
</script>
