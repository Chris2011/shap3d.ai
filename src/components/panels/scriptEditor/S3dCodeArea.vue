<template>
  <div class="flex min-h-30 flex-1 border-y border-line bg-surface-2 font-mono text-[0.78125rem]/[1.125rem]">
    <div ref="gutter" class="w-9.5 flex-none overflow-hidden bg-surface-2 py-1.5 pe-1.5 text-end text-muted select-none">
      <div v-for="lineNumber in lines" :key="lineNumber">{{ lineNumber }}</div>
    </div>
    <div class="relative min-w-0 flex-1">
      <pre
        ref="highlightLayer"
        class="s3d-syntax pointer-events-none absolute inset-0 m-0 overflow-hidden px-2 py-1.5 font-mono whitespace-pre text-ink [tab-size:2]"
        aria-hidden="true"
        v-html="highlighted"
      ></pre>
      <textarea
        :ref="(element) => (textarea = element as HTMLTextAreaElement | null)"
        v-model="code"
        class="absolute inset-0 m-0 resize-none overflow-auto border-0 bg-transparent px-2 py-1.5 whitespace-pre text-transparent caret-ink outline-none select-text [tab-size:2] selection:bg-[rgba(0,95,158,.25)] selection:text-transparent placeholder:text-muted"
        :placeholder="placeholder"
        :aria-label="t('panels.scripts')"
        spellcheck="false"
        wrap="off"
        @scroll="sync"
        @keydown="key"
        @keydown.stop
        @paste="onPaste"
        @input="completion.onInput"
        @mousedown="completion.close"
        @blur="completion.close"
      ></textarea>
      <S3dCompletionPopup
        v-if="completion.isOpen.value && completion.anchor.value"
        :items="completion.result.value!.items"
        :selected="completion.selected.value"
        :anchor="completion.anchor.value"
        :word="completion.result.value!.word"
        @select="(index) => (completion.selected.value = index)"
        @accept="completion.accept"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue';
import S3dCompletionPopup from '../S3dCompletionPopup.vue';
import { useEditor } from '../../keys';
import { highlight, type CodeLang } from '../../../scripting/highlight';
import { looksLikeObj } from '../../../scripting/mesh';
import { findScriptLanguage } from '../../../scripting/languages';
import { lineCount, newlineKeepingIndent, replaceRange, type CodeEdit } from '../../../utils/codeText';
import { useScriptEditorState } from '../../../composables/useScriptEditorState';
import { useScriptRun } from '../../../composables/useScriptRun';
import { t } from '../../../i18n';

/**
 * The code itself: line numbers, a syntax-coloured layer under a transparent textarea, code completion.
 * Tab indents, Enter keeps the indentation, Ctrl+Enter runs.
 */
const editor = useEditor();
const { lang, code, textarea, completion } = useScriptEditorState();
const { run } = useScriptRun();
const gutter = useTemplateRef<HTMLElement>('gutter');
const highlightLayer = useTemplateRef<HTMLElement>('highlightLayer');
const pluginLanguage = computed(() => findScriptLanguage(lang.value));
const lines = computed(() => lineCount(code.value));
const highlighted = computed(() =>
  highlight(code.value + '\n', pluginLanguage.value ? (pluginLanguage.value.highlight ?? 'js') : (lang.value as CodeLang)),
);

/** what an empty editor shows (only visible while there is no code) */
const placeholder = computed(() => {
  const start =
    lang.value === 'js'
      ? "s3d.box([0, 0, 0], 1, 1, 1, { material: 'Holz' });"
      : lang.value === 'json'
        ? '{ "objects": [ { "type": "box", "size": [1, 1, 1] } ] }'
        : lang.value === 'obj'
          ? 'v 0 0 0 … / f 1 2 3 …'
          : t('scriptEditor.enterCode');
  return t('scriptEditor.placeholder', { start });
});

/** the colour layer and the line numbers scroll with the textarea */
const sync = () => {
  const area = textarea.value;
  if (!area) {
    return;
  }
  if (highlightLayer.value) {
    highlightLayer.value.scrollTop = area.scrollTop;
    highlightLayer.value.scrollLeft = area.scrollLeft;
  }
  if (gutter.value) {
    gutter.value.scrollTop = area.scrollTop;
  }
  completion.reposition();
};

const apply = (area: HTMLTextAreaElement, edit: CodeEdit) => {
  code.value = edit.code;
  nextTick(() => {
    area.selectionStart = area.selectionEnd = edit.caret;
  });
};
const key = (event: KeyboardEvent) => {
  const area = textarea.value!;
  if (completion.onKeydown(event)) {
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    void run();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    apply(area, replaceRange(code.value, area.selectionStart, area.selectionEnd, '  '));
  }
  if (event.key === 'Enter' && !event.ctrlKey) {
    event.preventDefault();
    apply(area, newlineKeepingIndent(code.value, area.selectionStart, area.selectionEnd));
  }
};

/** Pasting raw mesh output (LLaMA-Mesh, .obj file) switches to OBJ mode automatically. */
const onPaste = (event: ClipboardEvent) => {
  const text = event.clipboardData?.getData('text') ?? '';
  if (lang.value !== 'obj' && looksLikeObj(text)) {
    lang.value = 'obj';
    editor.toast(t('scriptEditor.objDetected'));
  }
};
</script>
