<template>
  <S3dModalDialog v-if="projectsState.open" :title="t('projects.title')" panel-class="w-[min(760px,94vw)]" @close="closeProjects">
    <template #header>
      <S3dTextInput v-model="query" class="max-w-60 flex-1" :placeholder="t('projects.search')" :aria-label="t('projects.search')" />
    </template>
    <div class="min-h-40 overflow-auto p-4">
      <p v-if="!shown.length" class="py-8 text-center text-muted">{{ t(entries.length ? 'projects.noMatch' : 'projects.empty') }}</p>
      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        <S3dProjectCard
          v-for="entry in shown"
          :key="entry.id"
          :entry="entry"
          @open="open(entry)"
          @duplicate="duplicate(entry)"
          @remove="remove(entry)"
        />
      </div>
    </div>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import S3dModalDialog from './ui/S3dModalDialog.vue';
import S3dTextInput from './ui/S3dTextInput.vue';
import S3dProjectCard from './S3dProjectCard.vue';
import { useEditor } from './keys';
import { projectsState, closeProjects } from './projectsState';
import { listProjects, openProject, duplicateProject, removeProject, type ProjectEntry } from '../engine/projects';
import { t } from '../i18n';

/** File › Projects…: the models last saved or opened in this browser, newest first, with search. */
const editor = useEditor();
const entries = shallowRef<ProjectEntry[]>([]);
const query = ref('');
const shown = computed(() => {
  const words = query.value.trim().toLowerCase();
  return words ? entries.value.filter((entry) => entry.name.toLowerCase().includes(words)) : entries.value;
});
const reload = async () => {
  entries.value = await listProjects().catch(() => []);
};
watch(
  () => projectsState.open,
  (open) => {
    if (open) {
      query.value = '';
      void reload();
    }
  },
  { immediate: true },
);

const open = async (entry: ProjectEntry) => {
  if (!editor.ui.saved && !(await editor.confirm(t('confirm.discardChanges')))) {
    return;
  }
  try {
    await openProject(editor, entry.id);
    closeProjects();
  } catch {
    editor.toast(t('toast.loadFailed'));
  }
};
const duplicate = async (entry: ProjectEntry) => {
  await duplicateProject(entry, t('projects.copyName', { name: entry.name })).catch(() => editor.toast(t('toast.saveFailed')));
  await reload();
};
const remove = async (entry: ProjectEntry) => {
  if (await editor.confirm(t('projects.confirmRemove', { name: entry.name }))) {
    await removeProject(entry.id);
    await reload();
  }
};
</script>
