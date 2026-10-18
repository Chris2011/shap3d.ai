<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex gap-1.5 px-2.5 pt-2 pb-1">
      <select class="s3d-input w-27.5 flex-none" :value="lang" @change="setLang(($event.target as HTMLSelectElement).value as any)">
        <option value="js">JavaScript</option><option value="json">JSON</option><option value="obj">OBJ-Mesh</option>
      </select>
      <select class="s3d-input flex-1" value="" @change="loadExample(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
        <option value="" disabled>Beispiel laden…</option>
        <optgroup label="JavaScript"><option v-for="example in EXAMPLES.filter(candidate => candidate.lang === 'js')" :key="example.id" :value="example.id">{{ example.name }}</option></optgroup>
        <optgroup label="JSON"><option v-for="example in EXAMPLES.filter(candidate => candidate.lang === 'json')" :key="example.id" :value="example.id">{{ example.name }}</option></optgroup>
        <optgroup label="OBJ-Mesh"><option v-for="example in EXAMPLES.filter(candidate => candidate.lang === 'obj')" :key="example.id" :value="example.id">{{ example.name }}</option></optgroup>
        <optgroup v-if="saved.length" label="Meine Skripte"><option v-for="script in saved" :key="script.name" :value="'my:' + script.name">{{ script.name }}</option></optgroup>
      </select>
      <button class="s3d-btn primary flex h-7 items-center gap-1.5" title="Ausführen (Strg+Enter)" @click="run"><S3dIcon name="play" :size="14" /> Ausführen</button>
    </div>
    <div class="flex items-center gap-2.5 px-2.5 pb-1.5 text-xs">
      <label class="s3d-check"><input type="checkbox" v-model="clearFirst" /> Vorher Modell leeren</label>
      <span class="flex-1"></span>
      <button class="s3d-link" @click="save">Speichern</button>
      <button class="s3d-link" v-if="currentSaved" @click="delSaved">Löschen</button>
      <button class="s3d-link" @click="showHelp = !showHelp">{{ showHelp ? 'API-Info ausblenden' : 'API-Info' }}</button>
    </div>
    <div v-if="lang === 'obj'" class="flex items-center gap-3.5 px-2.5 pb-1.5 text-xs [&_label]:flex [&_label]:items-center [&_label]:gap-1.25">
      <label title="Größte Seite des Objekts">Größe <input class="s3d-input h-6 w-16" v-model="objSize" @keydown.stop /></label>
      <label class="s3d-check" title="OBJ-Dateien und LLaMA-Mesh sind Y-oben – wird nach Z-oben gedreht"><input type="checkbox" v-model="objYUp" /> Y ist oben</label>
      <label title="Kanten zwischen Flächen flacher als dieser Winkel werden geglättet (0 = alle Kanten sichtbar)">Glätten <input class="s3d-input h-6 w-13" type="number" min="0" max="180" v-model.number="objSmooth" @keydown.stop />°</label>
    </div>
    <pre v-if="showHelp && lang === 'obj'" class="mx-2.5 mt-0 mb-1.5 max-h-55 overflow-auto rounded-[3px] border border-line bg-surface-2 p-2 font-mono text-[0.6875rem]/[1.45] whitespace-pre-wrap select-text">{{ OBJ_HELP }}</pre>
    <S3dApiReference v-if="showHelp && lang !== 'obj'" class="flex-[0_0_52%]" @insert="insertText" @try="tryExample" />
    <div ref="edWrap" class="flex min-h-30 flex-1 border-y border-line bg-surface-2 font-mono text-[0.78125rem]/[1.125rem]">
      <div ref="gutter" class="w-9.5 flex-none overflow-hidden bg-surface-2 py-1.5 pr-1.5 text-right text-muted select-none"><div v-for="lineNumber in lines" :key="lineNumber">{{ lineNumber }}</div></div>
      <div class="relative min-w-0 flex-1">
        <pre ref="highlightLayer" class="s3d-syntax pointer-events-none absolute inset-0 m-0 overflow-hidden px-2 py-1.5 font-mono whitespace-pre text-ink [tab-size:2]" aria-hidden="true" v-html="highlighted"></pre>
        <textarea ref="textarea" v-model="code" class="absolute inset-0 m-0 resize-none overflow-auto border-0 bg-transparent px-2 py-1.5 whitespace-pre text-transparent caret-ink outline-none select-text [tab-size:2] selection:bg-[rgba(0,95,158,.25)] selection:text-transparent" spellcheck="false" wrap="off" @scroll="sync" @keydown="key" @keydown.stop @paste="onPaste"></textarea>
      </div>
    </div>
    <div ref="cons" class="h-37.5 flex-none overflow-auto px-2.5 pb-2 font-mono text-xs/normal select-text">
      <div class="sticky top-0 flex items-center gap-2.5 bg-surface py-1.5 font-sans text-xs font-semibold">Konsole <span v-if="lastMs != null" class="ml-auto font-normal text-ink-2">{{ lastMs.toFixed(0) }} ms</span><button class="s3d-link" @click="out = []">Leeren</button></div>
      <div v-for="(line, i) in out" :key="i" class="whitespace-pre-wrap break-words" :class="LOG_LINE_CLASS[line.kind]">{{ line.text }}</div>
      <div v-if="!out.length" class="whitespace-pre-wrap break-words text-ink-2">Ausgaben von s3d.log(…) und Fehler erscheinen hier. Jeder Lauf ist ein einziger Rückgängig-Schritt.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useScripts, type ScriptLang } from '../../composables/useScripts';
import { ref, computed, nextTick, onMounted, watch } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import { EXAMPLES } from '../../scripting/examples';
import S3dApiReference from './S3dApiReference.vue';
import { runScript, runJson, type ScriptLog } from '../../scripting/api';
import { highlight } from '../../scripting/highlight';
import { importObj, looksLikeObj } from '../../scripting/mesh';
import { parseLength } from '../../core/units';

type Lang = ScriptLang;
const OBJ_HELP = `OBJ-Mesh: Zeilen „v x y z“ (Ecke) und „f a b c …“ (Fläche, Eckennummern ab 1).
Alles andere (Text, # Kommentare, vn/vt, Gruppen) wird ignoriert – rohe LLaMA-Mesh-Ausgabe
kann also direkt eingefügt werden. Das Mesh wird auf „Größe“ (größte Seite) skaliert,
auf den Boden gestellt und als Komponente neben das Modell gesetzt.
Im JS-Skript: s3d.mesh(objText, { at: [x, y, z], size: '80cm', yUp: true, material: 'Holz' })`;

const editor = useEditor();
const LOG_LINE_CLASS: Record<string, string> = { warn: 'text-[#9a6700] dark:text-warn', error: 'text-danger', result: 'text-[#005f9e] dark:text-navy' };
const scripts = useScripts(); const saved = scripts.saved;
const lang = ref<Lang>('js');
const objSize = ref('1m'); const objYUp = ref(true); const objSmooth = ref(30);
const code = ref(''); const out = ref<ScriptLog[]>([]); const lastMs = ref<number | null>(null);
const clearFirst = ref(false); const showHelp = ref(false); const currentSaved = ref<string | null>(null);
const textarea = ref<HTMLTextAreaElement | null>(null); const highlightLayer = ref<HTMLElement | null>(null); const gutter = ref<HTMLElement | null>(null); const cons = ref<HTMLElement | null>(null);
onMounted(() => {
  const draft = scripts.draft.value; // last session – or code the AI assistant just sent over
  if (draft) { lang.value = draft.lang; code.value = draft.code; if (draft.size) objSize.value = `${draft.size}m`; }
  if (!code.value) loadExample('house');
});
watch([code, lang], () => { scripts.draft.value = { lang: lang.value, code: code.value }; });

const lines = computed(() => Math.max(1, code.value.split('\n').length));
const highlighted = computed(() => highlight(code.value + '\n', lang.value));
const sync = () => { if (!textarea.value) return; if (highlightLayer.value) { highlightLayer.value.scrollTop = textarea.value.scrollTop; highlightLayer.value.scrollLeft = textarea.value.scrollLeft; } if (gutter.value) gutter.value.scrollTop = textarea.value.scrollTop; };

const key = (event: KeyboardEvent) => {
  const area = textarea.value!;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run(); return; }
  if (event.key === 'Tab') {
    event.preventDefault(); const start = area.selectionStart, end = area.selectionEnd;
    code.value = code.value.slice(0, start) + '  ' + code.value.slice(end);
    nextTick(() => { area.selectionStart = area.selectionEnd = start + 2; });
  }
  if (event.key === 'Enter' && !event.ctrlKey) {
    // keep indentation
    event.preventDefault(); const start = area.selectionStart; const lineStart = code.value.lastIndexOf('\n', start - 1) + 1;
    const indent = (code.value.slice(lineStart, start).match(/^\s*/) ?? [''])[0] + (/[{[(]\s*$/.test(code.value.slice(lineStart, start)) ? '  ' : '');
    code.value = code.value.slice(0, start) + '\n' + indent + code.value.slice(area.selectionEnd);
    nextTick(() => { area.selectionStart = area.selectionEnd = start + 1 + indent.length; });
  }
};

const setLang = (language: Lang) => { lang.value = language; };
/** Pasting raw mesh output (LLaMA-Mesh, .obj file) switches to OBJ mode automatically. */
const onPaste = (event: ClipboardEvent) => {
  const text = event.clipboardData?.getData('text') ?? '';
  if (lang.value !== 'obj' && looksLikeObj(text)) { lang.value = 'obj'; editor.toast('OBJ-Mesh erkannt – Sprache auf „OBJ-Mesh“ gestellt'); }
};
const loadExample = (id: string) => {
  if (id.startsWith('my:')) { const script = scripts.find(id.slice(3)); if (script) { lang.value = script.lang; code.value = script.code; currentSaved.value = script.name; } return; }
  const example = EXAMPLES.find(candidate => candidate.id === id); if (!example) return;
  lang.value = example.lang; code.value = example.code; currentSaved.value = null;
  out.value = [{ kind: 'log', text: `Beispiel „${example.name}“: ${example.description}` }];
};
const run = () => {
  if (clearFirst.value) { editor.newModel(); }
  let result;
  if (lang.value === 'obj') {
    const size = parseLength(objSize.value, 'm');
    if (size == null || size <= 0) { out.value = [{ kind: 'error', text: `✗ Ungültige Größe: ${objSize.value}` }]; return; }
    result = importObj(editor, code.value, { size, yUp: objYUp.value, smooth: objSmooth.value || 0, name: currentSaved.value ?? 'Mesh' });
  } else result = lang.value === 'json' ? runJson(editor, code.value) : runScript(editor, code.value);
  lastMs.value = result.ms;
  out.value = [...result.logs];
  if (result.ok) out.value.push({ kind: 'log', text: `✓ Fertig – ${editor.model.root.stats().faces} Flächen im Modell.` });
  else out.value.push({ kind: 'error', text: '✗ ' + result.error });
  nextTick(() => { if (cons.value) cons.value.scrollTop = cons.value.scrollHeight; });
};
/** Insert text at the cursor (API info "Einfügen"). */
const insertText = (text: string) => {
  if (lang.value !== 'js') lang.value = 'js';
  const el = textarea.value; const start = el?.selectionStart ?? code.value.length, end = el?.selectionEnd ?? start;
  // multi-line snippets start on their own line
  const before = code.value.slice(0, start); const pre = before && text.includes('\n') && !before.endsWith('\n') ? '\n' : '';
  code.value = before + pre + text + code.value.slice(end);
  nextTick(() => { if (!el) return; el.focus(); el.selectionStart = el.selectionEnd = start + pre.length + text.length; });
};
/** Build an API example right away – as its own group next to what is already there (one undo step). */
const tryExample = (example: string) => {
  const bounds = editor.model.bounds();
  const place = bounds.isEmpty() ? '' : `
{ const bb = __g.entities.bounds(new THREE.Box3()); if (!bb.isEmpty()) __g.move([${(bounds.max.x + 1).toFixed(3)} - bb.min.x, ${bounds.min.y.toFixed(3)} - bb.min.y, 0]); }`;
  const result = runScript(editor, `const __g = s3d.group('Beispiel', () => {
${example}
});${place}
s3d.zoomExtents();`, 'API-Beispiel');
  lastMs.value = result.ms;
  out.value = [...result.logs, result.ok ? { kind: 'log', text: '✓ Beispiel gebaut – Strg+Z macht es rückgängig.' } : { kind: 'error', text: '✗ ' + result.error }];
};
const save = async () => {
  const name = await editor.prompt('Name des Skripts', currentSaved.value ?? 'Mein Skript'); if (!name) return;
  scripts.save({ name: name, lang: lang.value, code: code.value }); currentSaved.value = name; editor.toast('Skript gespeichert');
};
const delSaved = () => { if (currentSaved.value) scripts.remove(currentSaved.value); currentSaved.value = null; };
</script>
