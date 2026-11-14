<template>
  <div
    :ref="(element) => (consoleBox = element as HTMLElement | null)"
    class="h-37.5 flex-none overflow-auto px-2.5 pb-2 text-xs/normal select-text"
  >
    <div class="sticky top-0 flex items-center gap-2.5 bg-surface py-1.5 text-xs font-semibold">
      {{ t('scriptEditor.console') }} <span v-if="lastMs != null" class="ms-auto font-normal text-ink-2">{{ lastMs.toFixed(0) }} ms</span
      ><button type="button" class="s3d-link" @click="out = []">{{ t('scriptEditor.clearConsole') }}</button>
    </div>
    <div
      v-for="(line, i) in out"
      :key="i"
      class="s3d-plaintext whitespace-pre-wrap break-words font-mono"
      :class="LOG_LINE_CLASS[line.kind]"
    >
      {{ line.text }}
    </div>
    <div v-if="!out.length" class="s3d-plaintext whitespace-pre-wrap break-words font-mono text-ink-2">
      {{ t('scriptEditor.consoleHint') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useScriptEditorState } from '../../../composables/useScriptEditorState';
import { t } from '../../../i18n';

/** What the last run printed, its duration, and a button to clear it. */
const LOG_LINE_CLASS: Record<string, string> = {
  warn: 'text-[#9a6700] dark:text-warn',
  error: 'text-danger',
  result: 'text-[#005f9e] dark:text-navy',
};
const { out, lastMs, consoleBox } = useScriptEditorState();
</script>
