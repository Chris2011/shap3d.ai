<template>
  <div
    class="grid gap-2 border-b border-line px-3 py-1.5"
    :class="[columns, !row.text && 'shadow-[inset_3px_0_0_var(--s3d-warn,#c77c00)]']"
  >
    <div class="col-span-full flex items-center gap-1.5 font-mono text-[0.625rem] text-muted">
      <S3dIcon :name="row.area.icon" :size="12" />
      <span class="truncate">{{ row.key }}</span>
      <span v-if="row.placeholderProblem" class="font-sans font-semibold text-danger" :title="t('i18n.editor.placeholdersTitle')">{{
        t('i18n.editor.placeholders', { names: row.placeholders })
      }}</span>
      <span v-if="row.changed" class="font-sans text-blue">{{ t('i18n.editor.changed') }}</span>
      <button
        type="button"
        class="ms-auto flex items-center gap-1 bg-transparent p-0 font-sans text-blue hover:underline"
        :title="t('i18n.editor.whereTitle')"
        @click="emit('where', row.key)"
      >
        <S3dIcon name="eye" :size="13" /> {{ t('i18n.editor.where') }}
      </button>
    </div>
    <div class="whitespace-pre-wrap break-words text-ink">{{ row.source }}</div>
    <div v-if="withReference" class="whitespace-pre-wrap break-words text-ink-2">{{ row.reference || '—' }}</div>
    <textarea
      class="s3d-input min-h-7 resize-y px-1.5 py-1 text-xs leading-snug"
      :class="!row.text && 'border-warn'"
      :rows="textareaRows(row.source)"
      :dir="dir"
      :value="row.text"
      :placeholder="t('i18n.editor.missing')"
      :aria-label="row.key"
      spellcheck="true"
      @input="emit('edit', row.key, valueOf($event))"
      @keydown.stop
    ></textarea>
  </div>
</template>

<script setup lang="ts">
import S3dIcon from '../../../../components/S3dIcon.vue';
import { valueOf } from '../../../../utils/inputEvent';
import { t } from '../../../../i18n';
import { textareaRows, type TranslationRow } from '../translationRows';

/** One text: key, warnings, source, reference and the field for the translation. */
defineProps<{ row: TranslationRow; columns: string; withReference: boolean; dir: string }>();
const emit = defineEmits<{ (event: 'edit', key: string, text: string): void; (event: 'where', key: string): void }>();
</script>
