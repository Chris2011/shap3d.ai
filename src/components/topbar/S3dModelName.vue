<template>
  <input
    v-if="editing"
    ref="nameInput"
    v-model="name"
    class="mx-1 h-7 w-50 border border-navy bg-surface px-2 font-bold text-navy outline-none"
    :aria-label="t('topbar.rename')"
    @keydown.enter="commit"
    @blur="commit"
    @keydown.esc="editing = false"
  />
  <button
    v-else
    type="button"
    class="max-w-65 cursor-text truncate border-0 bg-transparent pe-2 ps-1.5 text-sm/11 font-bold tracking-[0.05312rem] text-navy"
    :title="t('topbar.rename')"
    @click="start"
  >
    {{ modelName }}
  </button>
</template>

<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue';
import { useEditor } from '../keys';
import { useModel } from '../../composables/useModel';
import { t } from '../../i18n';

/** The model's name in the top bar; a click edits it, Enter or leaving keeps it, Esc cancels. */
const editor = useEditor();
const modelName = useModel(() => editor.model.name);
const editing = ref(false);
const name = ref('');
const nameInput = useTemplateRef<HTMLInputElement>('nameInput');
const start = () => {
  name.value = editor.model.name;
  editing.value = true;
  nextTick(() => {
    nameInput.value?.focus();
    nameInput.value?.select();
  });
};
const commit = () => {
  if (!editing.value) {
    return;
  }
  editing.value = false;
  if (name.value.trim()) {
    editor.model.name = name.value.trim();
    editor.ui.saved = false;
    editor.ui.revision++;
  }
};
</script>
