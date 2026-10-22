<template>
  <div>
    <span v-if="progress.error" class="text-xs text-danger">{{ t('pluginManager.error', { error: progress.error }) }}</span>
    <template v-else>
      <S3dProgressBar :value="progress.frac" labeled />
      <div class="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[#374151] tabular-nums dark:text-ink-2">
        <span>{{ progress.status }}</span>
        <span v-if="progress.total">{{
          t('ai.chat.progress', { done: fmtBytes(progress.completed), total: fmtBytes(progress.total) })
        }}</span>
        <span v-if="progress.speed > 0 && progress.phase === 'download'">{{ fmtBytes(progress.speed) }}/s</span>
        <span v-if="progress.phase === 'download'">{{ fmtDuration(progress.eta) }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import S3dProgressBar from '../../../components/ui/S3dProgressBar.vue';
import { fmtBytes, fmtDuration, type PullProgress } from './providers';
import { t } from '../../../i18n';

/** Progress of one Ollama download: bar, status, bytes, speed and remaining time (or the error). */
defineProps<{ progress: PullProgress & { error?: string } }>();
</script>
