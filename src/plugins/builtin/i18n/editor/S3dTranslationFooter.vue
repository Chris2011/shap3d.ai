<template>
  <div class="flex flex-wrap gap-3 px-3 py-3 text-ink-2">
    <button v-if="isCustom" type="button" class="s3d-link text-danger" @click="remove">
      {{ t('i18n.editor.deleteLanguage', { name: targetName }) }}
    </button>
    <button v-else-if="hasChanges" type="button" class="s3d-link" @click="reset">{{ t('i18n.editor.resetChanges') }}</button>
    <span class="flex-1"></span>
    <span>{{ t('i18n.editor.storedHint') }}</span>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '../../../../components/keys';
import { t } from '../../../../i18n';
import { editorState } from '../state';
import { removeLanguage, resetLanguage } from '../store';
import { useTranslationTarget } from '../useTranslationTarget';

/** Delete an own language or reset the changes to a shipped one – both after asking. */
const emit = defineEmits<{ (event: 'message', message: { text: string; error: boolean }): void }>();
const editor = useEditor();
const { targetName, isCustom, hasChanges } = useTranslationTarget();
const remove = async () => {
  const name = targetName.value;
  if (!(await editor.confirm(t('i18n.editor.confirmDelete', { name })))) {
    return;
  }
  removeLanguage(editorState.target);
  emit('message', { text: t('i18n.editor.deleted', { name }), error: false });
};
const reset = async () => {
  if (!(await editor.confirm(t('i18n.editor.confirmReset', { name: targetName.value })))) {
    return;
  }
  resetLanguage(editorState.target);
};
</script>
