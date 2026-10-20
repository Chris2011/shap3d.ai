<template>
  <div ref="root" class="flex h-full min-h-0 flex-col text-xs">
    <!-- target language and files -->
    <div class="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
      <label class="flex items-center gap-1.5 font-semibold"
        >{{ t('i18n.editor.target') }}
        <select v-model="editorState.target" class="s3d-input h-7 w-40 font-normal">
          <option v-for="entry in targets" :key="entry.code" :value="entry.code">{{ entry.name }} ({{ entry.code }})</option>
        </select>
      </label>
      <button class="s3d-btn small flex items-center gap-1" :class="{ 'bg-active': creating }" @click="creating = !creating">
        <S3dIcon name="plus" :size="13" /> {{ t('i18n.editor.newLanguage') }}
      </button>
      <span class="flex-1"></span>
      <button class="s3d-btn small flex items-center gap-1" :title="t('i18n.editor.importTitle')" @click="importFile">
        <S3dIcon name="import" :size="13" /> {{ t('i18n.editor.import') }}
      </button>
      <button
        class="s3d-btn small flex items-center gap-1"
        :title="t('i18n.editor.exportTitle')"
        :disabled="!editorState.target"
        @click="exportTarget"
      >
        <S3dIcon name="export" :size="13" /> {{ t('i18n.editor.export') }}
      </button>
      <button
        class="s3d-btn small flex items-center gap-1"
        :title="t('i18n.editor.templateTitle')"
        @click="downloadJson('template.json', templateFile())"
      >
        <S3dIcon name="file" :size="13" /> {{ t('i18n.editor.template') }}
      </button>
    </div>

    <!-- new language -->
    <form v-if="creating" class="flex flex-wrap items-end gap-2 border-b border-line bg-surface-2 px-3 py-2" @submit.prevent="create">
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
      <button type="submit" class="s3d-btn small primary" :disabled="!draft.code.trim()">{{ t('i18n.editor.create') }}</button>
      <button type="button" class="s3d-btn small" @click="creating = false">{{ t('common.cancel') }}</button>
      <p class="m-0 w-full text-[0.6875rem] text-ink-2">{{ t('i18n.editor.newHint') }}</p>
    </form>
    <p
      v-if="message"
      class="mx-3 mt-2 mb-0 rounded-[3px] border px-2 py-1.5"
      :class="message.error ? 'border-danger/40 bg-danger/8 text-danger' : 'border-line bg-surface text-ink-2'"
    >
      {{ message.text }}
    </p>

    <!-- progress per language -->
    <div class="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-line px-3 py-2">
      <button
        v-for="entry in targets"
        :key="entry.code"
        class="flex min-w-36 flex-1 flex-col gap-0.75 bg-transparent p-0 text-start"
        :title="t('i18n.editor.progressTitle', { done: doneCount(entry.code), total: allKeys.length })"
        @click="editorState.target = entry.code"
      >
        <span class="flex items-baseline gap-1.5" :class="entry.code === editorState.target ? 'font-bold text-navy' : 'text-ink'"
          >{{ entry.name
          }}<span class="ms-auto font-normal text-ink-2 tabular-nums"
            >{{ formatNumber(Math.floor(progressOf(entry.code) * 100)) }} %</span
          ></span
        >
        <S3dProgressBar :value="progressOf(entry.code)" />
      </button>
    </div>

    <!-- search, filter, preview -->
    <div class="flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-1.5">
      <input
        v-model="editorState.search"
        class="s3d-input h-7 min-w-40 flex-1"
        :placeholder="t('i18n.editor.search')"
        spellcheck="false"
        @keydown.stop
      />
      <label class="s3d-check whitespace-nowrap"
        ><input v-model="editorState.missingOnly" type="checkbox" /> {{ t('i18n.editor.missingOnly') }}</label
      >
      <label class="flex items-center gap-1.5 whitespace-nowrap" :title="t('i18n.editor.previewTitle')"
        ><S3dToggleSwitch v-model="editorState.preview" small :label="t('i18n.editor.preview')" /> {{ t('i18n.editor.preview') }}</label
      >
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- areas -->
      <nav class="w-46 flex-none overflow-auto border-e border-line py-1">
        <button
          v-for="area in areaList"
          :key="area.id"
          class="flex w-full items-center gap-2 bg-transparent px-2.5 py-1 text-start"
          :class="editorState.area === area.id ? 'bg-active font-semibold text-navy' : 'text-ink hover:bg-hover'"
          @click="selectArea(area.id)"
        >
          <S3dIcon :name="area.icon" :size="16" />
          <span class="min-w-0 flex-1 truncate">{{ area.label }}</span>
          <span
            v-if="area.missing"
            class="rounded-full bg-warn-bg px-1.5 text-[0.625rem] font-bold text-warn tabular-nums"
            :title="t('i18n.editor.missingCount', { count: area.missing })"
            >{{ area.missing }}</span
          >
          <span v-else class="text-[0.625rem] text-ok">✓</span>
        </button>
      </nav>

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
        <div
          v-for="row in shownRows"
          :key="row.key"
          class="grid gap-2 border-b border-line px-3 py-1.5"
          :class="[columns, !row.text && 'shadow-[inset_3px_0_0_var(--s3d-warn,#c77c00)]']"
          :data-key="row.key"
        >
          <div class="col-span-full flex items-center gap-1.5 font-mono text-[0.625rem] text-muted">
            <S3dIcon :name="row.area.icon" :size="12" />
            <span class="truncate">{{ row.key }}</span>
            <span v-if="row.placeholderProblem" class="font-sans font-semibold text-danger" :title="t('i18n.editor.placeholdersTitle')">{{
              t('i18n.editor.placeholders', { names: row.placeholders })
            }}</span>
            <span v-if="row.changed" class="font-sans text-blue">{{ t('i18n.editor.changed') }}</span>
            <button
              class="ms-auto flex items-center gap-1 bg-transparent p-0 font-sans text-blue hover:underline"
              :title="t('i18n.editor.whereTitle')"
              @click="where(row.key)"
            >
              <S3dIcon name="eye" :size="13" /> {{ t('i18n.editor.where') }}
            </button>
          </div>
          <div class="whitespace-pre-wrap break-words text-ink">{{ row.source }}</div>
          <div v-if="reference" class="whitespace-pre-wrap break-words text-ink-2">{{ row.reference || '—' }}</div>
          <textarea
            class="s3d-input min-h-7 resize-y px-1.5 py-1 text-xs leading-snug"
            :class="!row.text && 'border-warn'"
            :rows="rowsFor(row.source)"
            :dir="targetDir"
            :value="row.text"
            :placeholder="t('i18n.editor.missing')"
            spellcheck="true"
            @input="edit(row.key, ($event.target as HTMLTextAreaElement).value)"
            @keydown.stop
          ></textarea>
        </div>
        <div v-if="!rows.length" class="p-4 text-[0.8125rem] text-ink-2">
          {{ editorState.missingOnly ? t('i18n.editor.allDone') : t('i18n.editor.nothingFound') }}
        </div>
        <div v-if="rows.length > shownRows.length" class="p-3 text-center">
          <button class="s3d-btn small" @click="editorState.limit += 200">
            {{ t('i18n.editor.more', { count: rows.length - shownRows.length }) }}
          </button>
        </div>
        <div class="flex flex-wrap gap-3 px-3 py-3 text-ink-2">
          <button v-if="isCustom" class="s3d-link text-danger" @click="remove">
            {{ t('i18n.editor.deleteLanguage', { name: targetName }) }}
          </button>
          <button v-else-if="hasChanges" class="s3d-link" @click="reset">{{ t('i18n.editor.resetChanges') }}</button>
          <span class="flex-1"></span>
          <span>{{ t('i18n.editor.storedHint') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue';
import S3dIcon from '../../../components/S3dIcon.vue';
import S3dProgressBar from '../../../components/ui/S3dProgressBar.vue';
import S3dToggleSwitch from '../../../components/ui/S3dToggleSwitch.vue';
import { useEditor } from '../../../components/keys';
import { pickFile } from '../../../engine/commands';
import { t, languages, language, chosenLanguage, setLanguage, messagesOf, formatNumber, SOURCE_LANGUAGE } from '../../../i18n';
import { areaOf, areaOrder, type Area } from './areas';
import { flashText } from './highlight';
import { editorState } from './state';
import {
  allKeys,
  progressOf,
  setText,
  isChanged,
  createLanguage,
  removeLanguage,
  resetLanguage,
  importLanguage,
  languageFile,
  templateFile,
  downloadJson,
  customLanguages,
  overrides,
} from './store';

const editor = useEditor();
const root = useTemplateRef<HTMLElement>('root');
const list = useTemplateRef<HTMLElement>('list');

/** every language except English (the source) can be edited */
const targets = computed(() => languages.filter((entry) => entry.code !== SOURCE_LANGUAGE));
const targetInfo = computed(() => targets.value.find((entry) => entry.code === editorState.target));
const targetName = computed(() => targetInfo.value?.name ?? editorState.target);
const targetDir = computed(() => targetInfo.value?.dir ?? 'ltr');
const isCustom = computed(() => !!customLanguages[editorState.target]);
const hasChanges = computed(() => !!overrides[editorState.target] && Object.keys(overrides[editorState.target]).length > 0);
/** German as a second column while another language is translated */
const reference = computed(() => (editorState.target !== 'de' && languages.some((entry) => entry.code === 'de') ? 'de' : ''));
const referenceName = computed(() => languages.find((entry) => entry.code === reference.value)?.name ?? '');
const columns = computed(() => (reference.value ? 'grid-cols-3' : 'grid-cols-2'));

// a target that exists: the app language, otherwise English, otherwise the first one
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

// ------------------------------------------------------------ live preview: the app shows the target language
let before: string | null = null;
const applyPreview = () => {
  if (editorState.preview && editorState.target) {
    before ??= chosenLanguage.value;
    setLanguage(editorState.target);
  } else if (before != null) {
    setLanguage(before);
    before = null;
  }
};
watch(() => [editorState.preview, editorState.target], applyPreview, { immediate: true });
onBeforeUnmount(() => {
  if (before != null) {
    setLanguage(before);
  }
});

// ------------------------------------------------------------ rows
const placeholdersOf = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(', ');
const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

interface Row {
  key: string;
  area: Area;
  source: string;
  reference: string;
  text: string;
  changed: boolean;
  placeholders: string;
  placeholderProblem: boolean;
}
const allRows = computed<Row[]>(() => {
  const source = messagesOf(SOURCE_LANGUAGE),
    target = messagesOf(editorState.target),
    second = reference.value ? messagesOf(reference.value) : {};
  return allKeys.value.map((key) => {
    const text = target[key] ?? '';
    const placeholders = placeholdersOf(source[key]);
    return {
      key,
      area: areaOf(key),
      source: source[key],
      reference: second[key] ?? '',
      text,
      changed: isChanged(editorState.target, key),
      placeholders,
      placeholderProblem: !!text && placeholdersOf(text) !== placeholders,
    };
  });
});
const rows = computed(() => {
  const words = normalise(editorState.search.trim()).split(/\s+/).filter(Boolean);
  return allRows.value.filter(
    (row) =>
      (editorState.area === 'all' || row.area.id === editorState.area) &&
      (!editorState.missingOnly || !row.text || touched.has(row.key)) &&
      words.every((word) => normalise(`${row.key} ${row.source} ${row.reference} ${row.text}`).includes(word)),
  );
});
const shownRows = computed(() => rows.value.slice(0, editorState.limit));
watch(
  () => [editorState.area, editorState.search, editorState.missingOnly, editorState.target],
  () => {
    editorState.limit = 120;
    touched.clear();
    list.value?.scrollTo({ top: 0 });
  },
);

/** texts edited since the filter was set stay in the list (otherwise "missing only" would hide a row while typing) */
const touched = reactive(new Set<string>());
const edit = (key: string, text: string) => {
  touched.add(key);
  setText(editorState.target, key, text);
};

/** areas with their names, icons and how many texts are missing (only areas that have texts) */
const areaList = computed(() => {
  const missing = new Map<string, number>();
  const present = new Map<string, Area>();
  for (const row of allRows.value) {
    present.set(row.area.id, row.area);
    if (!row.text) {
      missing.set(row.area.id, (missing.get(row.area.id) ?? 0) + 1);
    }
  }
  const total = [...missing.values()].reduce((sum, count) => sum + count, 0);
  return [
    { id: 'all', icon: 'menu', label: t('i18n.areas.all'), missing: total },
    ...[...present.values()]
      .sort((first, second) => areaOrder(first.id) - areaOrder(second.id) || first.label.localeCompare(second.label))
      .map((area) => ({ ...area, missing: missing.get(area.id) ?? 0 })),
  ];
});
const selectArea = (id: string) => {
  editorState.area = id;
};
const doneCount = (code: string) => allKeys.value.filter((key) => messagesOf(code)[key]).length;
const rowsFor = (text: string) => Math.min(6, Math.max(1, Math.ceil(text.length / 38), text.split('\n').length));

// ------------------------------------------------------------ "where is this text?"
const where = (key: string) => {
  const text = messagesOf(language.value)[key] ?? messagesOf(SOURCE_LANGUAGE)[key] ?? '';
  const found = flashText(text, root.value);
  editor.toast(found ? t('i18n.editor.whereFound', { count: found }) : t('i18n.editor.whereNone'));
};

// ------------------------------------------------------------ languages and files
const creating = ref(false);
const draft = reactive({ code: '', name: '', dir: 'ltr' as 'ltr' | 'rtl' });
const message = shallowRef<{ text: string; error: boolean } | null>(null);

const create = () => {
  try {
    const code = createLanguage({ code: draft.code, name: draft.name.trim() || draft.code.trim(), dir: draft.dir });
    editorState.target = code;
    editorState.area = 'all';
    editorState.missingOnly = true;
    creating.value = false;
    Object.assign(draft, { code: '', name: '', dir: 'ltr' });
    message.value = { text: t('i18n.editor.created', { name: targetName.value }), error: false };
  } catch (error: any) {
    message.value = { text: error?.message ?? String(error), error: true };
  }
};
const importFile = async () => {
  const file = await pickFile('.json,application/json');
  if (!file) {
    return;
  }
  try {
    const code = importLanguage(await file.text());
    editorState.target = code;
    message.value = {
      text: t('i18n.editor.imported', { name: targetName.value, percent: formatNumber(Math.floor(progressOf(code) * 100)) }),
      error: false,
    };
  } catch (error: any) {
    message.value = { text: t('i18n.editor.importFailed', { error: error?.message ?? error }), error: true };
  }
};
const exportTarget = () => downloadJson(`${editorState.target}.json`, languageFile(editorState.target));
const remove = async () => {
  const name = targetName.value;
  if (!(await editor.confirm(t('i18n.editor.confirmDelete', { name })))) {
    return;
  }
  removeLanguage(editorState.target);
  message.value = { text: t('i18n.editor.deleted', { name }), error: false };
};
const reset = async () => {
  if (!(await editor.confirm(t('i18n.editor.confirmReset', { name: targetName.value })))) {
    return;
  }
  resetLanguage(editorState.target);
};
</script>
