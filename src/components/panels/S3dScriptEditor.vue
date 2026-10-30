<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="relative flex gap-1.5 px-2.5 pt-2 pb-1">
      <select class="s3d-input w-27.5 flex-none" :value="lang" @change="setLang(($event.target as HTMLSelectElement).value as any)">
        <option value="js">JavaScript</option>
        <option value="json">JSON</option>
        <option value="obj">OBJ-Mesh</option>
        <option v-for="language in SCRIPT_LANGUAGES" :key="language.id" :value="language.id">{{ localize(language.label) }}</option>
      </select>
      <select
        class="s3d-input flex-1"
        value=""
        @change="
          loadExample(($event.target as HTMLSelectElement).value);
          ($event.target as HTMLSelectElement).value = '';
        "
      >
        <option value="" disabled>{{ t('scriptEditor.loadExample') }}</option>
        <optgroup label="JavaScript">
          <option v-for="example in EXAMPLES.filter((candidate) => candidate.lang === 'js')" :key="example.id" :value="example.id">
            {{ example.name }}
          </option>
        </optgroup>
        <optgroup label="JSON">
          <option v-for="example in EXAMPLES.filter((candidate) => candidate.lang === 'json')" :key="example.id" :value="example.id">
            {{ example.name }}
          </option>
        </optgroup>
        <optgroup label="OBJ-Mesh">
          <option v-for="example in EXAMPLES.filter((candidate) => candidate.lang === 'obj')" :key="example.id" :value="example.id">
            {{ example.name }}
          </option>
        </optgroup>
        <optgroup
          v-for="language in SCRIPT_LANGUAGES.filter((candidate) => candidate.examples?.length)"
          :key="language.id"
          :label="localize(language.label)"
        >
          <option v-for="example in language.examples" :key="example.id" :value="`plugin:${language.id}:${example.id}`">
            {{ localize(example.name) }}
          </option>
        </optgroup>
        <optgroup v-if="saved.length" :label="t('scriptEditor.myScripts')">
          <option v-for="script in saved" :key="script.name" :value="'my:' + script.name">{{ script.name }}</option>
        </optgroup>
      </select>
      <!-- while the worker builds: a spinner and "building" in the button, a thin bar under the row – nothing moves -->
      <button
        class="s3d-btn primary flex h-7 items-center gap-1.5"
        :title="running ? t('scriptEditor.executing') : t('scriptEditor.runTitle')"
        :disabled="running"
        :aria-busy="running"
        @click="run"
      >
        <span
          v-if="running"
          class="size-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        ></span>
        <S3dIcon v-else name="play" :size="14" />
        <!-- both labels in one cell: the button keeps the width of the longer one -->
        <span class="grid">
          <span class="[grid-area:1/1]" :class="{ invisible: running }">{{ t('scriptEditor.run') }}</span>
          <span class="[grid-area:1/1]" :class="{ invisible: !running }">{{ t('scriptEditor.executing') }}</span>
        </span>
      </button>
      <div
        v-if="running"
        class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
        role="progressbar"
        :aria-label="t('scriptEditor.executing')"
      >
        <div class="h-full w-2/5 animate-splash-load bg-blue motion-reduce:animate-none"></div>
      </div>
    </div>
    <div class="flex items-center gap-2.5 px-2.5 pb-1.5 text-xs">
      <label class="s3d-check"><input type="checkbox" v-model="clearFirst" /> {{ t('scriptEditor.clearFirst') }}</label>
      <span class="flex-1"></span>
      <select
        v-if="convertTargets.length"
        class="s3d-input h-6 w-auto py-0 text-xs"
        value=""
        :title="t('scriptEditor.convertTitle')"
        :disabled="running"
        @change="
          convertTo(($event.target as HTMLSelectElement).value);
          ($event.target as HTMLSelectElement).value = '';
        "
      >
        <option value="" disabled>{{ t('scriptEditor.convertTo') }}</option>
        <option v-for="format in convertTargets" :key="format.id" :value="format.id">{{ format.label }}</option>
      </select>
      <button v-if="beforeConvert" class="s3d-link" :title="t('scriptEditor.undoConvertTitle')" @click="undoConvert">
        {{ t('scriptEditor.undoConvert') }}
      </button>
      <button class="s3d-link" :title="t('scriptEditor.newTitle')" @click="newScript">{{ t('menu.new') }}</button>
      <button class="s3d-link" @click="save">{{ t('topbar.save') }}</button>
      <button class="s3d-link" v-if="currentSaved" @click="delSaved">{{ t('commands.delete') }}</button>
      <button class="s3d-link" @click="showHelp = !showHelp">
        {{ showHelp ? t('scriptEditor.hideApiInfo') : t('scriptEditor.apiInfo') }}
      </button>
    </div>
    <div
      v-if="lang === 'obj'"
      class="flex items-center gap-3.5 px-2.5 pb-1.5 text-xs [&_label]:flex [&_label]:items-center [&_label]:gap-1.25"
    >
      <label :title="t('scriptEditor.sizeTitle')"
        >{{ t('materials.size') }} <input class="s3d-input h-6 w-16" v-model="objSize" @keydown.stop
      /></label>
      <label class="s3d-check" :title="t('scriptEditor.yUpTitle')"
        ><input type="checkbox" v-model="objYUp" /> {{ t('scriptEditor.yUp') }}</label
      >
      <label :title="t('scriptEditor.smoothTitle')"
        >{{ t('scriptEditor.smooth') }}
        <input class="s3d-input h-6 w-13" type="number" min="0" max="180" v-model.number="objSmooth" @keydown.stop />°</label
      >
    </div>
    <pre
      v-if="showHelp && lang === 'obj'"
      class="mx-2.5 mt-0 mb-1.5 max-h-55 overflow-auto rounded-[3px] border border-line bg-surface-2 p-2 font-mono text-[0.6875rem]/[1.45] whitespace-pre-wrap select-text"
      >{{ t('scriptEditor.objHelp') }}</pre>
    <pre
      v-if="showHelp && pluginLanguage"
      class="mx-2.5 mt-0 mb-1.5 max-h-55 overflow-auto rounded-[3px] border border-line bg-surface-2 p-2 font-mono text-[0.6875rem]/[1.45] whitespace-pre-wrap select-text"
      >{{ pluginLanguage.help ? localize(pluginLanguage.help) : t('scriptEditor.noHelp') }}</pre>
    <S3dApiReference v-if="showHelp && !pluginLanguage && lang !== 'obj'" class="flex-[0_0_52%]" @insert="insertText" @try="tryExample" />
    <div ref="edWrap" class="flex min-h-30 flex-1 border-y border-line bg-surface-2 font-mono text-[0.78125rem]/[1.125rem]">
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
          ref="textarea"
          v-model="code"
          class="absolute inset-0 m-0 resize-none overflow-auto border-0 bg-transparent px-2 py-1.5 whitespace-pre text-transparent caret-ink outline-none select-text [tab-size:2] selection:bg-[rgba(0,95,158,.25)] selection:text-transparent placeholder:text-muted"
          :placeholder="placeholder"
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
    <div ref="cons" class="h-37.5 flex-none overflow-auto px-2.5 pb-2 text-xs/normal select-text">
      <div class="sticky top-0 flex items-center gap-2.5 bg-surface py-1.5 text-xs font-semibold">
        {{ t('scriptEditor.console') }} <span v-if="lastMs != null" class="ms-auto font-normal text-ink-2">{{ lastMs.toFixed(0) }} ms</span
        ><button class="s3d-link" @click="out = []">{{ t('scriptEditor.clearConsole') }}</button>
      </div>
      <div
        v-for="(line, i) in out"
        :key="i"
        class="s3d-plaintext whitespace-pre-wrap break-words font-mono"
        :class="LOG_LINE_CLASS[line.kind]"
      >
        {{ line.text }}
      </div>
      <div v-if="!out.length" class="s3d-plaintext whitespace-pre-wrap break-words font-mono text-ink-2">
        {{ t('scriptEditor.consoleHint') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useScripts, type ScriptLang } from '../../composables/useScripts';
import { ref, shallowRef, computed, nextTick, onMounted, watch } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import { EXAMPLES } from '../../scripting/examples';
import S3dApiReference from './S3dApiReference.vue';
import { runScriptAsync, runJson, type ScriptLog } from '../../scripting/api';
import { highlight, type CodeLang } from '../../scripting/highlight';
import { importObj, looksLikeObj } from '../../scripting/mesh';
import { parseLength } from '../../core/units';
import { SCRIPT_LANGUAGES, findScriptLanguage, prepareScript } from '../../scripting/languages';
import { CODE_FORMATS, findCodeFormat, convertCode } from '../../scripting/codeExport';
import S3dCompletionPopup from './S3dCompletionPopup.vue';
import { useCodeCompletion } from '../../composables/useCodeCompletion';
import { t, localize } from '../../i18n';

type Lang = ScriptLang;

const editor = useEditor();
const LOG_LINE_CLASS: Record<string, string> = {
  warn: 'text-[#9a6700] dark:text-warn',
  error: 'text-danger',
  result: 'text-[#005f9e] dark:text-navy',
};
const scripts = useScripts();
const saved = scripts.saved;
const lang = ref<Lang>('js');
const objSize = ref('1m');
const objYUp = ref(true);
const objSmooth = ref(30);
const code = ref('');
const out = shallowRef<ScriptLog[]>([]);
const lastMs = ref<number | null>(null);
const clearFirst = ref(false);
const showHelp = ref(false);
const currentSaved = ref<string | null>(null);
const textarea = shallowRef<HTMLTextAreaElement | null>(null);
const highlightLayer = shallowRef<HTMLElement | null>(null);
const gutter = shallowRef<HTMLElement | null>(null);
const cons = shallowRef<HTMLElement | null>(null);
onMounted(() => {
  const draft = scripts.draft.value; // last session – or code the AI assistant just sent over
  // no draft yet: an empty editor whose placeholder points to the examples
  if (draft) {
    lang.value = isKnownLang(draft.lang) ? draft.lang : 'js';
    code.value = draft.code;
    if (draft.size) {
      objSize.value = `${draft.size}m`;
    }
  }
});
watch([code, lang], () => {
  scripts.draft.value = { lang: lang.value, code: code.value };
});
// code sent over while the editor is open (plugins)
watch(
  scripts.request,
  (request) => {
    if (!request) {
      return;
    }
    lang.value = request.lang;
    code.value = request.code;
    if (request.size) {
      objSize.value = `${request.size}m`;
    }
    currentSaved.value = null;
    scripts.request.value = null;
  },
  { immediate: true },
);

/** formats the current code can be converted into (only if its own format can be read back) */
const convertTargets = computed(() =>
  findCodeFormat(lang.value)?.evaluate ? CODE_FORMATS.filter((format) => format.id !== lang.value) : [],
);
/** the code before the last conversion – "undo conversion" brings it back until the result is edited */
const beforeConvert = shallowRef<{ lang: Lang; code: string; size: string; result: string } | null>(null);
watch(code, (value) => {
  if (beforeConvert.value && value !== beforeConvert.value.result) {
    beforeConvert.value = null;
  }
});
const convertTo = async (targetId: string) => {
  const target = findCodeFormat(targetId);
  if (!target) {
    return;
  }
  running.value = true;
  try {
    const size = parseLength(objSize.value, 'm') ?? 1;
    const result = await convertCode(editor, lang.value, code.value, targetId, {
      objSize: size,
      objYUp: objYUp.value,
      objSmooth: objSmooth.value || 0,
    });
    const previous = { lang: lang.value, code: code.value, size: objSize.value, result: result.code };
    lang.value = targetId;
    code.value = result.code;
    objSize.value = `${result.size}m`;
    currentSaved.value = null;
    beforeConvert.value = previous;
    out.value = [{ kind: 'result', text: `✓ ${t('scriptEditor.converted', { format: localize(target.label) })}` }];
  } catch (error: any) {
    out.value = [{ kind: 'error', text: `✗ ${t('scriptEditor.convertFailed', { error: error?.message ?? error })}` }];
  } finally {
    running.value = false;
  }
};
const undoConvert = () => {
  const previous = beforeConvert.value;
  if (!previous) {
    return;
  }
  lang.value = previous.lang;
  code.value = previous.code;
  objSize.value = previous.size;
  beforeConvert.value = null;
};

const lines = computed(() => Math.max(1, code.value.split('\n').length));
const BUILT_IN_LANGS: readonly string[] = ['js', 'json', 'obj'];
const isKnownLang = (id: string) => BUILT_IN_LANGS.includes(id) || !!findScriptLanguage(id);
/** the plugin language that is selected, if any */
const pluginLanguage = computed(() => findScriptLanguage(lang.value));
const highlighted = computed(() =>
  highlight(code.value + '\n', pluginLanguage.value ? (pluginLanguage.value.highlight ?? 'js') : (lang.value as CodeLang)),
);
const sync = () => {
  if (!textarea.value) {
    return;
  }
  if (highlightLayer.value) {
    highlightLayer.value.scrollTop = textarea.value.scrollTop;
    highlightLayer.value.scrollLeft = textarea.value.scrollLeft;
  }
  if (gutter.value) {
    gutter.value.scrollTop = textarea.value.scrollTop;
  }
  completion.reposition();
};

const completion = useCodeCompletion({ textarea, lang, editor });
watch(lang, completion.close);

const key = (event: KeyboardEvent) => {
  const area = textarea.value!;
  if (completion.onKeydown(event)) {
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    run();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = area.selectionStart,
      end = area.selectionEnd;
    code.value = code.value.slice(0, start) + '  ' + code.value.slice(end);
    nextTick(() => {
      area.selectionStart = area.selectionEnd = start + 2;
    });
  }
  if (event.key === 'Enter' && !event.ctrlKey) {
    // keep indentation
    event.preventDefault();
    const start = area.selectionStart;
    const lineStart = code.value.lastIndexOf('\n', start - 1) + 1;
    const indent =
      (code.value.slice(lineStart, start).match(/^\s*/) ?? [''])[0] + (/[{[(]\s*$/.test(code.value.slice(lineStart, start)) ? '  ' : '');
    code.value = code.value.slice(0, start) + '\n' + indent + code.value.slice(area.selectionEnd);
    nextTick(() => {
      area.selectionStart = area.selectionEnd = start + 1 + indent.length;
    });
  }
};

const setLang = (language: Lang) => {
  lang.value = language;
};

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
/** the start of a new script per language – JSON gets its frame, the caret goes where the first object belongs */
const NEW_SCRIPT: Record<string, { code: string; caret: number }> = {
  json: { code: '{\n  "objects": [\n    \n  ]\n}', caret: '{\n  "objects": [\n    '.length },
};
/** "New": empty editor in the current language; replaced through the textarea, so Ctrl+Z brings the old code back */
const newScript = () => {
  const area = textarea.value;
  if (!area) {
    return;
  }
  const template = NEW_SCRIPT[lang.value] ?? { code: '', caret: 0 };
  completion.close();
  area.focus();
  area.select();
  if (!document.execCommand(template.code ? 'insertText' : 'delete', false, template.code)) {
    code.value = template.code;
  }
  nextTick(() => area.setSelectionRange(template.caret, template.caret));
  currentSaved.value = null;
  beforeConvert.value = null;
  out.value = code.value ? [] : [{ kind: 'log', text: t('scriptEditor.newHint') }];
};
/** Pasting raw mesh output (LLaMA-Mesh, .obj file) switches to OBJ mode automatically. */
const onPaste = (event: ClipboardEvent) => {
  const text = event.clipboardData?.getData('text') ?? '';
  if (lang.value !== 'obj' && looksLikeObj(text)) {
    lang.value = 'obj';
    editor.toast(t('scriptEditor.objDetected'));
  }
};
const loadExample = (id: string) => {
  if (id.startsWith('plugin:')) {
    const [, languageId, exampleId] = id.split(':');
    const language = findScriptLanguage(languageId);
    const example = language?.examples?.find((candidate) => candidate.id === exampleId);
    if (!language || !example) {
      return;
    }
    lang.value = language.id;
    code.value = example.code;
    currentSaved.value = null;
    out.value = [
      {
        kind: 'log',
        text: example.description
          ? t('scriptEditor.exampleWithDescription', { name: localize(example.name), description: localize(example.description) })
          : t('scriptEditor.example', { name: localize(example.name) }),
      },
    ];
    return;
  }
  if (id.startsWith('my:')) {
    const script = scripts.find(id.slice(3));
    if (script) {
      lang.value = script.lang;
      code.value = script.code;
      currentSaved.value = script.name;
    }
    return;
  }
  const example = EXAMPLES.find((candidate) => candidate.id === id);
  if (!example) {
    return;
  }
  lang.value = example.lang;
  code.value = example.code;
  currentSaved.value = null;
  out.value = [{ kind: 'log', text: t('scriptEditor.exampleWithDescription', { name: example.name, description: example.description }) }];
};
const running = ref(false);
const run = async () => {
  if (running.value) {
    return;
  }
  if (clearFirst.value) {
    editor.newModel();
  }
  let result;
  if (pluginLanguage.value) {
    running.value = true;
    out.value = [{ kind: 'log', text: t('scriptEditor.running', { language: localize(pluginLanguage.value.label) }) }];
    const startedAt = performance.now();
    try {
      result = await pluginLanguage.value.run(code.value, editor);
    } catch (error: any) {
      result = { ok: false, logs: [], error: error?.message ?? String(error), durationMs: performance.now() - startedAt };
    } finally {
      running.value = false;
    }
  } else if (lang.value === 'obj') {
    const size = parseLength(objSize.value, 'm');
    if (size == null || size <= 0) {
      out.value = [{ kind: 'error', text: `✗ ${t('scriptEditor.invalidSize', { size: objSize.value })}` }];
      return;
    }
    result = importObj(editor, code.value, { size, yUp: objYUp.value, smooth: objSmooth.value || 0, name: currentSaved.value ?? 'Mesh' });
  } else {
    // plugins prepare what the script uses (e.g. fonts for text3d) – for JSON as for JavaScript
    running.value = true;
    out.value = [{ kind: 'log', text: t('statusbar.building') }];
    try {
      await prepareScript(code.value);
      result = lang.value === 'json' ? runJson(editor, code.value) : await runScriptAsync(editor, code.value);
    } finally {
      running.value = false;
    }
  }
  lastMs.value = result.durationMs;
  const summary: ScriptLog = result.ok
    ? { kind: 'log', text: `✓ ${t('scriptEditor.done', { count: editor.model.root.stats().faces })}` }
    : { kind: 'error', text: '✗ ' + result.error };
  out.value = [...result.logs, summary];
  nextTick(() => {
    if (cons.value) {
      cons.value.scrollTop = cons.value.scrollHeight;
    }
  });
};
/** Insert text at the cursor (API info "Insert"). */
const insertText = (text: string) => {
  if (lang.value !== 'js') {
    lang.value = 'js';
  }
  const el = textarea.value;
  const start = el?.selectionStart ?? code.value.length,
    end = el?.selectionEnd ?? start;
  // multi-line snippets start on their own line
  const before = code.value.slice(0, start);
  const pre = before && text.includes('\n') && !before.endsWith('\n') ? '\n' : '';
  code.value = before + pre + text + code.value.slice(end);
  nextTick(() => {
    if (!el) {
      return;
    }
    el.focus();
    el.selectionStart = el.selectionEnd = start + pre.length + text.length;
  });
};
/** Build an API example right away – as its own group next to what is already there (one undo step). */
const tryExample = async (example: string) => {
  const bounds = editor.model.bounds();
  const place = bounds.isEmpty()
    ? ''
    : `
{ const bb = __g.entities.bounds(new THREE.Box3()); if (!bb.isEmpty()) __g.move([${(bounds.max.x + 1).toFixed(3)} - bb.min.x, ${bounds.min.y.toFixed(3)} - bb.min.y, 0]); }`;
  const result = await runScriptAsync(
    editor,
    `const __g = s3d.group(${JSON.stringify(t('scriptEditor.exampleGroup'))}, () => {
${example}
});${place}
s3d.zoomExtents();`,
    t('scriptEditor.apiExample'),
  );
  lastMs.value = result.durationMs;
  out.value = [
    ...result.logs,
    result.ok ? { kind: 'log', text: t('scriptEditor.exampleBuilt') } : { kind: 'error', text: '✗ ' + result.error },
  ];
};
const save = async () => {
  const name = await editor.prompt(t('prompt.scriptName'), currentSaved.value ?? t('scriptEditor.myScript'));
  if (!name) {
    return;
  }
  scripts.save({ name: name, lang: lang.value, code: code.value });
  currentSaved.value = name;
  editor.toast(t('scriptEditor.saved'));
};
const delSaved = () => {
  if (currentSaved.value) {
    scripts.remove(currentSaved.value);
  }
  currentSaved.value = null;
};
</script>
