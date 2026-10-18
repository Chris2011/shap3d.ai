<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex gap-1.5 px-2.5 pt-2 pb-1">
      <select class="s3d-input w-27.5 flex-none" :value="lang" @change="setLang(($event.target as HTMLSelectElement).value as any)">
        <option value="js">JavaScript</option><option value="json">JSON</option><option value="obj">OBJ-Mesh</option>
      </select>
      <select class="s3d-input flex-1" value="" @change="loadExample(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
        <option value="" disabled>Beispiel laden…</option>
        <optgroup label="JavaScript"><option v-for="e in EXAMPLES.filter(x => x.lang === 'js')" :key="e.id" :value="e.id">{{ e.name }}</option></optgroup>
        <optgroup label="JSON"><option v-for="e in EXAMPLES.filter(x => x.lang === 'json')" :key="e.id" :value="e.id">{{ e.name }}</option></optgroup>
        <optgroup label="OBJ-Mesh"><option v-for="e in EXAMPLES.filter(x => x.lang === 'obj')" :key="e.id" :value="e.id">{{ e.name }}</option></optgroup>
        <optgroup v-if="saved.length" label="Meine Skripte"><option v-for="s in saved" :key="s.name" :value="'my:' + s.name">{{ s.name }}</option></optgroup>
      </select>
      <button class="s3d-btn primary flex h-7 items-center gap-1.5" title="Ausführen (Strg+Enter)" @click="run"><Icon name="play" :size="14" /> Ausführen</button>
    </div>
    <div class="flex items-center gap-2.5 px-2.5 pb-1.5 text-xs">
      <label class="s3d-check"><input type="checkbox" v-model="clearFirst" /> Vorher Modell leeren</label>
      <span class="flex-1"></span>
      <button class="bg-transparent p-0 text-xs text-blue hover:underline" @click="save">Speichern</button>
      <button class="bg-transparent p-0 text-xs text-blue hover:underline" v-if="currentSaved" @click="delSaved">Löschen</button>
      <button class="bg-transparent p-0 text-xs text-blue hover:underline" @click="showHelp = !showHelp">{{ showHelp ? 'API-Info ausblenden' : 'API-Info' }}</button>
    </div>
    <div v-if="lang === 'obj'" class="flex items-center gap-3.5 px-2.5 pb-1.5 text-xs [&_label]:flex [&_label]:items-center [&_label]:gap-1.25">
      <label title="Größte Seite des Objekts">Größe <input class="s3d-input h-6 w-16" v-model="objSize" @keydown.stop /></label>
      <label class="s3d-check" title="OBJ-Dateien und LLaMA-Mesh sind Y-oben – wird nach Z-oben gedreht"><input type="checkbox" v-model="objYUp" /> Y ist oben</label>
      <label title="Kanten zwischen Flächen flacher als dieser Winkel werden geglättet (0 = alle Kanten sichtbar)">Glätten <input class="s3d-input h-6 w-13" type="number" min="0" max="180" v-model.number="objSmooth" @keydown.stop />°</label>
    </div>
    <pre v-if="showHelp && lang === 'obj'" class="mx-2.5 mt-0 mb-1.5 max-h-55 overflow-auto rounded-[3px] border border-line bg-surface-2 p-2 font-mono text-[0.6875rem]/[1.45] whitespace-pre-wrap select-text">{{ OBJ_HELP }}</pre>
    <ApiReference v-if="showHelp && lang !== 'obj'" class="flex-[0_0_52%]" @insert="insertText" @try="tryExample" />
    <div ref="edWrap" class="flex min-h-30 flex-1 border-y border-line bg-surface-2 font-mono text-[0.78125rem]/[1.125rem]">
      <div ref="gutter" class="w-9.5 flex-none overflow-hidden bg-surface-2 py-1.5 pr-1.5 text-right text-muted select-none"><div v-for="n in lines" :key="n">{{ n }}</div></div>
      <div class="relative min-w-0 flex-1">
        <pre ref="hl" class="s3d-syntax pointer-events-none absolute inset-0 m-0 overflow-hidden px-2 py-1.5 font-mono whitespace-pre text-ink [tab-size:2]" aria-hidden="true" v-html="highlighted"></pre>
        <textarea ref="ta" v-model="code" class="absolute inset-0 m-0 resize-none overflow-auto border-0 bg-transparent px-2 py-1.5 whitespace-pre text-transparent caret-ink outline-none select-text [tab-size:2] selection:bg-[rgba(0,95,158,.25)] selection:text-transparent" spellcheck="false" wrap="off" @scroll="sync" @keydown="key" @keydown.stop @paste="onPaste"></textarea>
      </div>
    </div>
    <div ref="cons" class="h-37.5 flex-none overflow-auto px-2.5 pb-2 font-mono text-xs/normal select-text">
      <div class="sticky top-0 flex items-center gap-2.5 bg-surface py-1.5 font-sans text-xs font-semibold">Konsole <span v-if="lastMs != null" class="ml-auto font-normal text-ink-2">{{ lastMs.toFixed(0) }} ms</span><button class="bg-transparent p-0 text-xs text-blue hover:underline" @click="out = []">Leeren</button></div>
      <div v-for="(l, i) in out" :key="i" class="whitespace-pre-wrap break-words" :class="LN[l.kind]">{{ l.text }}</div>
      <div v-if="!out.length" class="whitespace-pre-wrap break-words text-ink-2">Ausgaben von s3d.log(…) und Fehler erscheinen hier. Jeder Lauf ist ein einziger Rückgängig-Schritt.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue';
import Icon from '../Icon.vue';
import { useEditor } from '../keys';
import { EXAMPLES } from '../../scripting/examples';
import ApiReference from './ApiReference.vue';
import { runScript, runJson, type ScriptLog } from '../../scripting/api';
import { highlight } from '../../scripting/highlight';
import { importObj, looksLikeObj } from '../../scripting/mesh';
import { parseLength } from '../../core/units';

type Lang = 'js' | 'json' | 'obj';
const OBJ_HELP = `OBJ-Mesh: Zeilen „v x y z“ (Ecke) und „f a b c …“ (Fläche, Eckennummern ab 1).
Alles andere (Text, # Kommentare, vn/vt, Gruppen) wird ignoriert – rohe LLaMA-Mesh-Ausgabe
kann also direkt eingefügt werden. Das Mesh wird auf „Größe“ (größte Seite) skaliert,
auf den Boden gestellt und als Komponente neben das Modell gesetzt.
Im JS-Skript: s3d.mesh(objText, { at: [x, y, z], size: '80cm', yUp: true, material: 'Holz' })`;

const ed = useEditor();
const LN: Record<string, string> = { warn: 'text-[#9a6700] dark:text-warn', error: 'text-danger', result: 'text-[#005f9e] dark:text-navy' };
const LS = 's3d:scripts';
const lang = ref<Lang>('js');
const objSize = ref('1m'); const objYUp = ref(true); const objSmooth = ref(30);
const code = ref(''); const out = ref<ScriptLog[]>([]); const lastMs = ref<number | null>(null);
const clearFirst = ref(false); const showHelp = ref(false); const currentSaved = ref<string | null>(null);
const ta = ref<HTMLTextAreaElement | null>(null); const hl = ref<HTMLElement | null>(null); const gutter = ref<HTMLElement | null>(null); const cons = ref<HTMLElement | null>(null);
const saved = ref<{ name: string; lang: Lang; code: string }[]>([]);

function loadSaved() { try { saved.value = JSON.parse(localStorage.getItem(LS) ?? '[]'); } catch { saved.value = []; } }
function storeSaved() { try { localStorage.setItem(LS, JSON.stringify(saved.value)); } catch { ed.toast('Speichern im Browser nicht möglich'); } }
onMounted(() => {
  loadSaved();
  try { const d = JSON.parse(localStorage.getItem('s3d:script-draft') ?? 'null'); if (d) { lang.value = d.lang; code.value = d.code; if (d.size) objSize.value = `${d.size}m`; } } catch { /* no draft */ }
  if (!code.value) loadExample('house');
});
watch([code, lang], () => { try { localStorage.setItem('s3d:script-draft', JSON.stringify({ lang: lang.value, code: code.value })); } catch { /* ignore */ } });

const lines = computed(() => Math.max(1, code.value.split('\n').length));
const highlighted = computed(() => highlight(code.value + '\n', lang.value));
function sync() { if (!ta.value) return; if (hl.value) { hl.value.scrollTop = ta.value.scrollTop; hl.value.scrollLeft = ta.value.scrollLeft; } if (gutter.value) gutter.value.scrollTop = ta.value.scrollTop; }

function key(e: KeyboardEvent) {
  const t = ta.value!;
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); return; }
  if (e.key === 'Tab') {
    e.preventDefault(); const s = t.selectionStart, en = t.selectionEnd;
    code.value = code.value.slice(0, s) + '  ' + code.value.slice(en);
    nextTick(() => { t.selectionStart = t.selectionEnd = s + 2; });
  }
  if (e.key === 'Enter' && !e.ctrlKey) {
    // keep indentation
    e.preventDefault(); const s = t.selectionStart; const lineStart = code.value.lastIndexOf('\n', s - 1) + 1;
    const indent = (code.value.slice(lineStart, s).match(/^\s*/) ?? [''])[0] + (/[{[(]\s*$/.test(code.value.slice(lineStart, s)) ? '  ' : '');
    code.value = code.value.slice(0, s) + '\n' + indent + code.value.slice(t.selectionEnd);
    nextTick(() => { t.selectionStart = t.selectionEnd = s + 1 + indent.length; });
  }
}

function setLang(l: Lang) { lang.value = l; }
/** Pasting raw mesh output (LLaMA-Mesh, .obj file) switches to OBJ mode automatically. */
function onPaste(e: ClipboardEvent) {
  const t = e.clipboardData?.getData('text') ?? '';
  if (lang.value !== 'obj' && looksLikeObj(t)) { lang.value = 'obj'; ed.toast('OBJ-Mesh erkannt – Sprache auf „OBJ-Mesh“ gestellt'); }
}
function loadExample(id: string) {
  if (id.startsWith('my:')) { const s = saved.value.find(x => x.name === id.slice(3)); if (s) { lang.value = s.lang; code.value = s.code; currentSaved.value = s.name; } return; }
  const e = EXAMPLES.find(x => x.id === id); if (!e) return;
  lang.value = e.lang; code.value = e.code; currentSaved.value = null;
  out.value = [{ kind: 'log', text: `Beispiel „${e.name}“: ${e.description}` }];
}
function run() {
  if (clearFirst.value) { ed.newModel(); }
  let r;
  if (lang.value === 'obj') {
    const size = parseLength(objSize.value, 'm');
    if (size == null || size <= 0) { out.value = [{ kind: 'error', text: `✗ Ungültige Größe: ${objSize.value}` }]; return; }
    r = importObj(ed, code.value, { size, yUp: objYUp.value, smooth: objSmooth.value || 0, name: currentSaved.value ?? 'Mesh' });
  } else r = lang.value === 'json' ? runJson(ed, code.value) : runScript(ed, code.value);
  lastMs.value = r.ms;
  out.value = [...r.logs];
  if (r.ok) out.value.push({ kind: 'log', text: `✓ Fertig – ${ed.model.root.stats().faces} Flächen im Modell.` });
  else out.value.push({ kind: 'error', text: '✗ ' + r.error });
  nextTick(() => { if (cons.value) cons.value.scrollTop = cons.value.scrollHeight; });
}
/** Insert text at the cursor (API info "Einfügen"). */
function insertText(t: string) {
  if (lang.value !== 'js') lang.value = 'js';
  const el = ta.value; const s = el?.selectionStart ?? code.value.length, e = el?.selectionEnd ?? s;
  // multi-line snippets start on their own line
  const before = code.value.slice(0, s); const pre = before && t.includes('\n') && !before.endsWith('\n') ? '\n' : '';
  code.value = before + pre + t + code.value.slice(e);
  nextTick(() => { if (!el) return; el.focus(); el.selectionStart = el.selectionEnd = s + pre.length + t.length; });
}
/** Build an API example right away – as its own group next to what is already there (one undo step). */
function tryExample(example: string) {
  const b = ed.model.bounds();
  const place = b.isEmpty() ? '' : `
{ const bb = __g.entities.bounds(new THREE.Box3()); if (!bb.isEmpty()) __g.move([${(b.max.x + 1).toFixed(3)} - bb.min.x, ${b.min.y.toFixed(3)} - bb.min.y, 0]); }`;
  const r = runScript(ed, `const __g = s3d.group('Beispiel', () => {
${example}
});${place}
s3d.zoomExtents();`, 'API-Beispiel');
  lastMs.value = r.ms;
  out.value = [...r.logs, r.ok ? { kind: 'log', text: '✓ Beispiel gebaut – Strg+Z macht es rückgängig.' } : { kind: 'error', text: '✗ ' + r.error }];
}
async function save() {
  const n = await ed.prompt('Name des Skripts', currentSaved.value ?? 'Mein Skript'); if (!n) return;
  saved.value = [...saved.value.filter(s => s.name !== n), { name: n, lang: lang.value, code: code.value }]; storeSaved(); currentSaved.value = n; ed.toast('Skript gespeichert');
}
function delSaved() { saved.value = saved.value.filter(s => s.name !== currentSaved.value); storeSaved(); currentSaved.value = null; }
</script>
