<template>
  <!-- progress per language -->
  <div class="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-line px-3 py-2">
    <button
      v-for="entry in targets"
      :key="entry.code"
      type="button"
      class="flex min-w-36 flex-1 flex-col gap-0.75 bg-transparent p-0 text-start"
      :title="t('i18n.editor.progressTitle', { done: doneCount(entry.code), total: allKeys.length })"
      :aria-pressed="entry.code === editorState.target"
      @click="editorState.target = entry.code"
    >
      <span class="flex items-baseline gap-1.5" :class="entry.code === editorState.target ? 'font-bold text-navy' : 'text-ink'"
        >{{ entry.name
        }}<span class="ms-auto font-normal text-ink-2 tabular-nums"
          >{{ formatNumber(Math.floor(progressOf(entry.code) * 100)) }} %</span
        ></span
      >
      <S3dProgressBar :value="progressOf(entry.code)" />
    </button>
  </div>
</template>

<script setup lang="ts">
import S3dProgressBar from '../../../../components/ui/S3dProgressBar.vue';
import { t, messagesOf, formatNumber } from '../../../../i18n';
import { editorState } from '../state';
import { allKeys, progressOf } from '../store';
import { useTranslationTarget } from '../useTranslationTarget';

/** How far each language is translated; a click makes it the target. */
const { targets } = useTranslationTarget();
const doneCount = (code: string) => allKeys.value.filter((key) => messagesOf(code)[key]).length;
</script>
