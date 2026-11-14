<template>
  <div ref="root" class="flex h-full min-h-0 flex-col text-xs">
    <S3dTranslationToolbar v-model:creating="creating" @message="message = $event" />
    <S3dNewLanguageForm v-if="creating" @close="creating = false" @message="message = $event" />
    <S3dStatusMessage v-if="message" class="mx-3 mt-2 mb-0" :text="message.text" :error="message.error" />
    <S3dTranslationProgress />
    <S3dTranslationFilters />
    <div class="flex min-h-0 flex-1">
      <S3dTranslationAreas :rows="allRows" />
      <!-- texts -->
      <div ref="list" class="min-w-0 flex-1 overflow-auto select-text">
        <div
          class="sticky top-0 z-1 grid gap-2 border-b border-line bg-panel-2 px-3 py-1 text-[0.6875rem] font-bold text-ink-2"
          :class="columns"
        >
          <span>{{ t('i18n.editor.source') }}</span>
          <span v-if="reference">{{ referenceName }}</span>
          <span>{{ targetName }}</span>
        </div>
        <S3dTranslationRow
          v-for="row in shownRows"
          :key="row.key"
          :row="row"
          :columns="columns"
          :with-reference="!!reference"
          :dir="targetDir"
          :data-key="row.key"
          @edit="edit"
          @where="where"
        />
        <div v-if="!rows.length" class="p-4 text-[0.8125rem] text-ink-2">
          {{ editorState.missingOnly ? t('i18n.editor.allDone') : t('i18n.editor.nothingFound') }}
        </div>
        <div v-if="rows.length > shownRows.length" class="p-3 text-center">
          <S3dButton small @click="editorState.limit += 200">{{
            t('i18n.editor.more', { count: rows.length - shownRows.length })
          }}</S3dButton>
        </div>
        <S3dTranslationFooter @message="message = $event" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue';
import S3dButton from '../../../components/ui/S3dButton.vue';
import S3dStatusMessage from '../../../components/ui/S3dStatusMessage.vue';
import S3dNewLanguageForm from './editor/S3dNewLanguageForm.vue';
import S3dTranslationAreas from './editor/S3dTranslationAreas.vue';
import S3dTranslationFilters from './editor/S3dTranslationFilters.vue';
import S3dTranslationFooter from './editor/S3dTranslationFooter.vue';
import S3dTranslationProgress from './editor/S3dTranslationProgress.vue';
import S3dTranslationRow from './editor/S3dTranslationRow.vue';
import S3dTranslationToolbar from './editor/S3dTranslationToolbar.vue';
import { useEditor } from '../../../components/keys';
import { t, language, messagesOf, SOURCE_LANGUAGE } from '../../../i18n';
import { areaOf } from './areas';
import { flashText } from './highlight';
import { editorState } from './state';
import { allKeys, setText, isChanged } from './store';
import { buildTranslationRows, filterTranslationRows } from './translationRows';
import { useLanguagePreview } from './useLanguagePreview';
import { useTranslationTarget } from './useTranslationTarget';

/** Translation editor: pick a language, filter by area and search, translate text by text with a live preview. */
const editor = useEditor();
const root = useTemplateRef<HTMLElement>('root');
const list = useTemplateRef<HTMLElement>('list');
const creating = ref(false);
const message = shallowRef<{ text: string; error: boolean } | null>(null);
const { targets, targetName, targetDir, reference, referenceName } = useTranslationTarget();
const columns = computed(() => (reference.value ? 'grid-cols-3' : 'grid-cols-2'));
useLanguagePreview();

// a target that exists: the app language, otherwise German, otherwise the first one
watch(
  targets,
  (targetList) => {
    if (targetList.some((entry) => entry.code === editorState.target)) {
      return;
    }
    editorState.target =
      targetList.find((entry) => entry.code === language.value)?.code ??
      targetList.find((entry) => entry.code === 'de')?.code ??
      targetList[0]?.code ??
      '';
  },
  { immediate: true },
);

/** texts edited since the filter was set stay in the list (otherwise "missing only" would hide a row while typing) */
const touched = reactive(new Set<string>());
const allRows = computed(() =>
  buildTranslationRows(
    allKeys.value,
    {
      source: messagesOf(SOURCE_LANGUAGE),
      target: messagesOf(editorState.target),
      reference: reference.value ? messagesOf(reference.value) : {},
    },
    areaOf,
    (key) => isChanged(editorState.target, key),
  ),
);
const rows = computed(() =>
  filterTranslationRows(allRows.value, {
    area: editorState.area,
    search: editorState.search,
    missingOnly: editorState.missingOnly,
    keep: touched,
  }),
);
const shownRows = computed(() => rows.value.slice(0, editorState.limit));
watch(
  () => [editorState.area, editorState.search, editorState.missingOnly, editorState.target],
  () => {
    editorState.limit = 120;
    touched.clear();
    list.value?.scrollTo({ top: 0 });
  },
);
const edit = (key: string, text: string) => {
  touched.add(key);
  setText(editorState.target, key, text);
};
/** "where is this text?" – flashes it in the app */
const where = (key: string) => {
  const text = messagesOf(language.value)[key] ?? messagesOf(SOURCE_LANGUAGE)[key] ?? '';
  const found = flashText(text, root.value);
  editor.toast(found ? t('i18n.editor.whereFound', { count: found }) : t('i18n.editor.whereNone'));
};
</script>
