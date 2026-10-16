<template>
  <div class="se">
    <div class="tb">
      <select class="s3d-input sel" :value="lang" @change="setLang(($event.target as HTMLSelectElement).value as any)">
        <option value="js">JavaScript</option><option value="json">JSON</option><option value="obj">OBJ-Mesh</option>
      </select>
      <select class="s3d-input ex" value="" @change="loadExample(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
        <option value="" disabled>Beispiel laden…</option>
        <optgroup label="JavaScript"><option v-for="e in EXAMPLES.filter(x => x.lang === 'js')" :key="e.id" :value="e.id">{{ e.name }}</option></optgroup>
        <optgroup label="JSON"><option v-for="e in EXAMPLES.filter(x => x.lang === 'json')" :key="e.id" :value="e.id">{{ e.name }}</option></optgroup>
        <optgroup label="OBJ-Mesh"><option v-for="e in EXAMPLES.filter(x => x.lang === 'obj')" :key="e.id" :value="e.id">{{ e.name }}</option></optgroup>
        <optgroup v-if="saved.length" label="Meine Skripte"><option v-for="s in saved" :key="s.name" :value="'my:' + s.name">{{ s.name }}</option></optgroup>
      </select>
      <button class="s3d-btn primary run" title="Ausführen (Strg+Enter)" @click="run"><Icon name="play" :size="14" /> Ausführen</button>
    </div>
    <div class="tb2">
      <label class="s3d-check"><input type="checkbox" v-model="clearFirst" /> Vorher Modell leeren</label>
      <span style="flex:1"></span>
      <button class="lnk" @click="save">Speichern</button>
      <button class="lnk" v-if="currentSaved" @click="delSaved">Löschen</button>
      <button class="lnk" @click="showHelp = !showHelp">{{ showHelp ? 'API-Info ausblenden' : 'API-Info' }}</button>
    </div>
    <div v-if="lang === 'obj'" class="tb2 objopts">
      <label title="Größte Seite des Objekts">Größe <input class="s3d-input sz" v-model="objSize" @keydown.stop /></label>
      <label class="s3d-check" title="OBJ-Dateien und LLaMA-Mesh sind Y-oben – wird nach Z-oben gedreht"><input type="checkbox" v-model="objYUp" /> Y ist oben</label>
      <label title="Kanten zwischen Flächen flacher als dieser Winkel werden geglättet (0 = alle Kanten sichtbar)">Glätten <input class="s3d-input ang" type="number" min="0" max="180" v-model.number="objSmooth" @keydown.stop />°</label>
    </div>
    <pre v-if="showHelp && lang === 'obj'" class="help">{{ OBJ_HELP }}</pre>
    <ApiReference v-if="showHelp && lang !== 'obj'" class="apiref" @insert="insertText" @try="tryExample" />
    <div class="editor" ref="edWrap">
      <div class="gutter" ref="gutter"><div v-for="n in lines" :key="n">{{ n }}</div></div>
      <div class="codewrap">
        <pre class="hl" ref="hl" aria-hidden="true" v-html="highlighted"></pre>
        <textarea ref="ta" v-model="code" class="code" spellcheck="false" wrap="off" @scroll="sync" @keydown="key" @keydown.stop @paste="onPaste"></textarea>
      </div>
    </div>
    <div class="console" ref="cons">
      <div class="ch">Konsole <span class="ms" v-if="lastMs != null">{{ lastMs.toFixed(0) }} ms</span><button class="lnk" @click="out = []">Leeren</button></div>
      <div v-for="(l, i) in out" :key="i" class="ln" :class="l.kind">{{ l.text }}</div>
      <div v-if="!out.length" class="ln muted">Ausgaben von s3d.log(…) und Fehler erscheinen hier. Jeder Lauf ist ein einziger Rückgängig-Schritt.</div>
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

<style scoped>
.se { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.tb { display: flex; gap: 6px; padding: 8px 10px 4px; }
.sel { width: 110px; flex: none; }
.ex { flex: 1; }
.run { display: flex; align-items: center; gap: 6px; height: 28px; }
.tb2 { display: flex; gap: 10px; align-items: center; padding: 0 10px 6px; font-size: 12px; }
.lnk { border: 0; background: transparent; color: var(--s3d-blue); cursor: pointer; font-size: 12px; padding: 0; }
.lnk:hover { text-decoration: underline; }
.apiref { flex: 0 0 52%; }
.help { margin: 0 10px 6px; padding: 8px; background: var(--s3d-bg-2); border: 1px solid var(--s3d-line); border-radius: 3px; font: 11px/1.45 Consolas, "Cascadia Code", monospace; white-space: pre-wrap; max-height: 220px; overflow: auto; user-select: text; }
.editor { flex: 1; min-height: 120px; display: flex; border-top: 1px solid var(--s3d-line); border-bottom: 1px solid var(--s3d-line); background: var(--s3d-bg-2); font: 12.5px/18px Consolas, "Cascadia Code", "Courier New", monospace; }
.gutter { width: 38px; flex: none; text-align: right; padding: 6px 6px 6px 0; color: var(--s3d-muted); background: var(--s3d-bg-2); overflow: hidden; user-select: none; }
.codewrap { position: relative; flex: 1; min-width: 0; }
.hl, .code { position: absolute; inset: 0; margin: 0; padding: 6px 8px; font: inherit; white-space: pre; overflow: auto; tab-size: 2; }
.hl { color: var(--s3d-text); pointer-events: none; overflow: hidden; }
.code { color: transparent; caret-color: var(--s3d-text); background: transparent; border: 0; outline: none; resize: none; user-select: text; }
.code::selection { background: rgba(0, 95, 158, .25); color: transparent; }
.hl :deep(.c) { color: var(--syn-c); font-style: italic; }
.hl :deep(.s) { color: var(--syn-s); }
.hl :deep(.n) { color: var(--syn-n); }
.hl :deep(.b) { color: var(--syn-b); font-weight: 600; }
.hl :deep(.k) { color: var(--syn-k); }
.hl :deep(.api) { color: var(--syn-api); font-weight: 600; }
.console { height: 150px; flex: none; overflow: auto; font: 12px/1.5 Consolas, monospace; padding: 0 10px 8px; user-select: text; }
.ch { position: sticky; top: 0; background: var(--s3d-bg); display: flex; gap: 10px; align-items: center; font: 600 12px "Open Sans", sans-serif; padding: 6px 0; }
.ch .ms { color: var(--s3d-text-2); font-weight: 400; margin-left: auto; }
.ln { white-space: pre-wrap; word-break: break-word; }
.ln.warn { color: #9a6700; }
.ln.error { color: var(--s3d-danger); }
.ln.result { color: #005f9e; }
.ln.muted { color: var(--s3d-text-2); }
.objopts { gap: 14px; }
.objopts label { display: flex; align-items: center; gap: 5px; }
.objopts .sz { width: 64px; height: 24px; }
.objopts .ang { width: 52px; height: 24px; }
</style>
