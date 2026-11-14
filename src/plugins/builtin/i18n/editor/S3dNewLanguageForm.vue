<template>
  <form class="flex flex-wrap items-end gap-2 border-b border-line bg-surface-2 px-3 py-2" @submit.prevent="create">
    <label class="flex flex-col gap-0.5"
      >{{ t('i18n.editor.code')
      }}<input
        v-model="draft.code"
        class="s3d-input h-7 w-24 font-mono"
        :placeholder="t('i18n.editor.codePlaceholder')"
        spellcheck="false"
        @keydown.stop
    /></label>
    <label class="flex flex-1 flex-col gap-0.5"
      >{{ t('i18n.editor.name')
      }}<input v-model="draft.name" class="s3d-input h-7 min-w-32" :placeholder="t('i18n.editor.namePlaceholder')" @keydown.stop
    /></label>
    <label class="flex flex-col gap-0.5"
      >{{ t('i18n.editor.direction') }}
      <select v-model="draft.dir" class="s3d-input h-7 w-36">
        <option value="ltr">{{ t('i18n.editor.ltr') }}</option>
        <option value="rtl">{{ t('i18n.editor.rtl') }}</option>
      </select>
    </label>
    <S3dButton type="submit" small primary :disabled="!draft.code.trim()">{{ t('i18n.editor.create') }}</S3dButton>
    <S3dButton small @click="emit('close')">{{ t('common.cancel') }}</S3dButton>
    <p class="m-0 w-full text-[0.6875rem] text-ink-2">{{ t('i18n.editor.newHint') }}</p>
  </form>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import S3dButton from '../../../../components/ui/S3dButton.vue';
import { t } from '../../../../i18n';
import { editorState } from '../state';
import { createLanguage } from '../store';
import { useTranslationTarget } from '../useTranslationTarget';

/** A new language: code, name, writing direction. It becomes the target, showing the missing texts. */
const emit = defineEmits<{ (event: 'close'): void; (event: 'message', message: { text: string; error: boolean }): void }>();
const { targetName } = useTranslationTarget();
const draft = reactive({ code: '', name: '', dir: 'ltr' as 'ltr' | 'rtl' });
const create = () => {
  try {
    const code = createLanguage({ code: draft.code, name: draft.name.trim() || draft.code.trim(), dir: draft.dir });
    editorState.target = code;
    editorState.area = 'all';
    editorState.missingOnly = true;
    Object.assign(draft, { code: '', name: '', dir: 'ltr' });
    emit('close');
    emit('message', { text: t('i18n.editor.created', { name: targetName.value }), error: false });
  } catch (error: any) {
    emit('message', { text: error?.message ?? String(error), error: true });
  }
};
</script>
