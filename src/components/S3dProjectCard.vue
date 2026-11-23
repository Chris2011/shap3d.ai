<template>
  <div class="group relative flex flex-col overflow-hidden rounded border border-line bg-surface">
    <button type="button" class="flex flex-col text-start" :title="t('projects.open')" @click="emit('open')">
      <img v-if="entry.thumbnail" :src="entry.thumbnail" alt="" class="aspect-[4/3] w-full bg-panel-2 object-cover" />
      <div v-else class="flex aspect-[4/3] w-full items-center justify-center bg-panel-2"><S3dIcon name="cube" :size="32" /></div>
      <span class="truncate px-2 pt-1.5 text-[0.8125rem] font-semibold">{{ entry.name }}</span>
      <span class="px-2 pb-1.5 text-[0.6875rem] text-muted">{{ updated }}</span>
    </button>
    <div class="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
      <S3dIconButton icon="plus" :label="t('projects.duplicate')" :icon-size="16" @click="emit('duplicate')" />
      <S3dIconButton icon="trash" :label="t('projects.remove')" :icon-size="16" @click="emit('remove')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dIcon from './S3dIcon.vue';
import S3dIconButton from './ui/S3dIconButton.vue';
import type { ProjectEntry } from '../engine/projects';
import { t, language } from '../i18n';

/** One model in the project overview: preview, name and date; open by clicking, copy or remove from the corner. */
const props = defineProps<{ entry: ProjectEntry }>();
const emit = defineEmits<{ (event: 'open' | 'duplicate' | 'remove'): void }>();
const updated = computed(() => new Date(props.entry.updated).toLocaleString(language.value, { dateStyle: 'medium', timeStyle: 'short' }));
</script>
