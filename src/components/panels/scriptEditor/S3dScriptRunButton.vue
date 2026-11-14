<template>
  <!-- while the worker builds: a spinner and "building" in the button – nothing moves -->
  <S3dButton
    primary
    class="flex h-7 items-center gap-1.5"
    :title="running ? t('scriptEditor.executing') : t('scriptEditor.runTitle')"
    :disabled="running"
    :aria-busy="running"
  >
    <span
      v-if="running"
      class="size-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    ></span>
    <S3dIcon v-else name="play" :size="14" />
    <!-- the label shown, over both labels drawn invisibly by CSS: the button keeps the width of the longer one
         (only the shown label is text – the screenshot scenes find the button by it) -->
    <span class="grid">
      <span
        v-for="label in [t('scriptEditor.run'), t('scriptEditor.executing')]"
        :key="label"
        class="invisible [grid-area:1/1] after:content-[attr(data-label)]"
        :data-label="label"
        aria-hidden="true"
      ></span>
      <span class="[grid-area:1/1]">{{ running ? t('scriptEditor.executing') : t('scriptEditor.run') }}</span>
    </span>
  </S3dButton>
</template>

<script setup lang="ts">
import S3dIcon from '../../S3dIcon.vue';
import S3dButton from '../../ui/S3dButton.vue';
import { t } from '../../../i18n';

/** "Run" – shows a spinner and "building" while `running`, at a fixed width. */
defineProps<{ running: boolean }>();
</script>
