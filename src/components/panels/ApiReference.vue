<template>
  <div class="ref">
    <div class="top">
      <input v-model="q" class="s3d-input q" placeholder="Suchen: kegel, glas, drehen, treppe …" spellcheck="false" @keydown.stop />
      <span class="count">{{ entries.length }} Befehle · {{ mats.length }} Materialien</span>
    </div>
    <div class="tabs">
      <button v-for="t in TABS" :key="t" class="tab" :class="{ on: tab === t }" @click="tab = t">{{ t }}</button>
    </div>

    <div class="body">
      <!-- commands -->
      <template v-for="c in shownCats" :key="c">
        <div class="cat">{{ c }}</div>
        <div v-for="e in entries.filter(x => x.cat === c)" :key="e.id" class="entry">
          <div class="eh">
            <span class="et">{{ e.title }}</span>
            <span v-if="e.returns" class="ret" title="Rückgabewert">→ {{ e.returns }}</span>
          </div>
          <code class="sig" v-html="hl(e.sig)"></code>
          <div class="desc">{{ e.desc }}</div>
          <pre class="ex" v-html="hl(e.example)"></pre>
          <div class="acts">
            <button class="lnk" title="Beispiel an der Cursorposition einfügen" @click="$emit('insert', e.example + '\n')">Einfügen</button>
            <button class="lnk" title="Beispiel sofort ins Modell bauen (ein Rückgängig-Schritt)" @click="$emit('try', e.example)">▶ Ausprobieren</button>
            <button class="lnk" @click="copy(e.example, e.id)">{{ copied === e.id ? '✓ Kopiert' : 'Kopieren' }}</button>
          </div>
        </div>
      </template>

      <!-- material library -->
      <template v-if="showMaterials && mats.length">
        <div class="cat">Fertige Materialien <span class="sub">– einfach per Name verwenden: { material: 'Glas' }</span></div>
        <template v-for="mc in MATERIAL_CATEGORIES" :key="mc">
          <div v-if="mats.some(m => m.category === mc)" class="mcat">{{ mc }}</div>
          <div class="grid">
            <button v-for="m in mats.filter(x => x.category === mc)" :key="m.name" class="mat" :title="matTitle(m)" @click="$emit('insert', `'${m.name}'`)">
              <span class="sw" :class="{ glass: (m.opacity ?? 1) < 1 }"><span :style="swatch(m)"></span></span>
              <span class="mn">{{ m.name }}</span>
              <span class="try" title="Würfel mit diesem Material bauen" @click.stop="$emit('try', `s3d.box([0, 0, 0], 1, 1, 1, { material: '${m.name}' });`)">▶</span>
            </button>
          </div>
        </template>
        <div class="cat">Texturen <span class="sub">– für eigene Materialien: s3d.material(name, farbe, { texture: '…' })</span></div>
        <div class="grid">
          <button v-for="t in textures" :key="t.kind" class="mat" :title="`texture: '${t.kind}' – Kachel ${t.size} m`" @click="$emit('insert', `'${t.kind}'`)">
            <span class="sw"><span :style="{ backgroundImage: `url(${texUrl(t.kind, '#c8b8a0')})`, backgroundSize: 'cover' }"></span></span>
            <span class="mn"><code>{{ t.kind }}</code> {{ t.label }}</span>
          </button>
        </div>
      </template>

      <div v-if="!entries.length && !mats.length" class="none">Nichts gefunden für „{{ q }}“.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { API_CATALOG, API_CATEGORIES, type ApiCategory } from '../../scripting/catalog';
import { MATERIAL_LIBRARY, MATERIAL_CATEGORIES, type LibraryMaterial } from '../../core/materialLibrary';
import { TEXTURES, TEXTURE_SIZE, makeTexture, type TextureKind } from '../../core/textures';
import { highlight } from '../../scripting/highlight';

defineEmits<{ (e: 'insert', text: string): void; (e: 'try', code: string): void }>();

type Tab = 'Alle' | 'Formen' | 'Flächen' | 'Gruppen' | 'Materialien' | 'Ansicht' | 'Hilfen';
const TABS: Tab[] = ['Alle', 'Formen', 'Flächen', 'Gruppen', 'Materialien', 'Ansicht', 'Hilfen'];
const TAB_CATS: Record<Tab, ApiCategory[]> = {
  Alle: API_CATEGORIES, Formen: ['Körper'], Flächen: ['Flächen & Linien', 'Flächen bearbeiten'], Gruppen: ['Gruppen & Komponenten'],
  Materialien: ['Materialien'], Ansicht: ['Ansicht & Szene'], Hilfen: ['Hilfen'],
};

const q = ref(''); const tab = ref<Tab>('Alle'); const copied = ref('');
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const match = (...parts: string[]) => { const t = norm(q.value.trim()); return !t || t.split(/\s+/).every(w => parts.some(p => norm(p).includes(w))); };

const entries = computed(() => API_CATALOG.filter(e => TAB_CATS[tab.value].includes(e.cat) && match(e.title, e.sig, e.desc, e.id)));
const shownCats = computed(() => API_CATEGORIES.filter(c => entries.value.some(e => e.cat === c)));
const showMaterials = computed(() => tab.value === 'Alle' || tab.value === 'Materialien');
const mats = computed(() => (showMaterials.value ? MATERIAL_LIBRARY.filter(m => match(m.name, m.category, m.texture ?? '', m.note ?? '')) : []));
const textures = computed(() => (Object.keys(TEXTURES) as TextureKind[]).filter(k => match(k, TEXTURES[k], 'textur')).map(k => ({ kind: k, label: TEXTURES[k], size: TEXTURE_SIZE[k] })));

const hl = (code: string) => highlight(code, 'js');

// swatches: the same procedural textures the 3D view uses, rendered once
const urls = new Map<string, string>();
function texUrl(kind: TextureKind, color: string) {
  const key = kind + color; let u = urls.get(key);
  if (!u) { u = (makeTexture(kind, color).image as HTMLCanvasElement).toDataURL('image/jpeg', 0.8); urls.set(key, u); }
  return u;
}
function swatch(m: LibraryMaterial) {
  const s: Record<string, string> = { backgroundColor: m.color, opacity: String(m.opacity ?? 1) };
  if (m.texture) { s.backgroundImage = `url(${texUrl(m.texture, m.color)})`; s.backgroundSize = 'cover'; }
  return s;
}
const matTitle = (m: LibraryMaterial) => `${m.name} · ${m.color}${m.texture ? ` · Textur ${m.texture}` : ''}${m.opacity != null && m.opacity < 1 ? ` · ${Math.round(m.opacity * 100)} % deckend` : ''}${m.note ? ' · ' + m.note : ''}\nKlick = Namen einfügen`;

async function copy(text: string, id: string) {
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
  copied.value = id; setTimeout(() => { if (copied.value === id) copied.value = ''; }, 1400);
}
</script>

<style scoped>
.ref { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--s3d-line); background: var(--s3d-bg-2); }
.top { display: flex; align-items: center; gap: 8px; padding: 8px 10px 4px; }
.q { flex: 1; height: 28px; }
.count { font-size: 11px; color: var(--s3d-muted); white-space: nowrap; }
.tabs { display: flex; gap: 2px; padding: 2px 10px 0; border-bottom: 1px solid var(--s3d-line); overflow-x: auto; }
.tab { border: 0; background: transparent; padding: 5px 8px; font-size: 12px; cursor: pointer; color: var(--s3d-text-2); border-bottom: 2px solid transparent; white-space: nowrap; }
.tab:hover { color: var(--s3d-navy); }
.tab.on { color: var(--s3d-navy); font-weight: 700; border-bottom-color: var(--s3d-navy); }
.body { flex: 1; overflow: auto; padding: 4px 10px 12px; user-select: text; }
.cat { font-size: 11px; font-weight: 700; color: var(--s3d-navy); text-transform: uppercase; letter-spacing: .5px; margin: 12px 0 4px; }
.cat .sub { text-transform: none; font-weight: 400; letter-spacing: 0; color: var(--s3d-muted); }
.entry { background: var(--s3d-bg); border: 1px solid var(--s3d-line); padding: 7px 9px; margin-bottom: 6px; }
.eh { display: flex; align-items: baseline; gap: 8px; }
.et { font-weight: 700; font-size: 13px; }
.ret { font-size: 11px; color: var(--s3d-muted); }
.sig { display: block; font: 12px/1.45 Consolas, monospace; margin: 3px 0; white-space: pre-wrap; word-break: break-word; }
.desc { font-size: 12px; color: var(--s3d-text); line-height: 1.4; }
.ex { margin: 5px 0 0; padding: 5px 7px; background: var(--s3d-bg-2); border: 1px solid var(--s3d-line); font: 11.5px/1.45 Consolas, monospace; white-space: pre; overflow-x: auto; }
.acts { display: flex; gap: 12px; margin-top: 4px; }
.lnk { border: 0; background: transparent; color: var(--s3d-blue); cursor: pointer; font-size: 12px; padding: 0; }
.lnk:hover { text-decoration: underline; }
.mcat { font-size: 11px; color: var(--s3d-text-2); font-weight: 600; margin: 8px 0 3px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px; }
.mat { display: flex; align-items: center; gap: 6px; border: 1px solid var(--s3d-line); background: var(--s3d-bg); padding: 3px 5px; cursor: pointer; text-align: left; font-size: 12px; min-width: 0; }
.mat:hover { border-color: var(--s3d-navy); }
.sw { width: 22px; height: 22px; flex: none; border: 1px solid rgba(0, 0, 0, .15); position: relative; overflow: hidden; }
.sw.glass { background: repeating-conic-gradient(#ccc 0 25%, var(--s3d-bg) 0 50%) 0 0 / 8px 8px; }
.sw > span { position: absolute; inset: 0; }
.mn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mn code { font: 11px Consolas, monospace; color: var(--syn-b); }
.try { color: var(--s3d-blue); opacity: 0; font-size: 11px; padding: 0 2px; }
.mat:hover .try { opacity: 1; }
.none { padding: 16px 0; color: var(--s3d-muted); font-size: 13px; }
.hl, .sig, .ex { color: var(--s3d-text); }
.sig :deep(.c), .ex :deep(.c) { color: var(--syn-c); font-style: italic; }
.sig :deep(.s), .ex :deep(.s) { color: var(--syn-s); }
.sig :deep(.n), .ex :deep(.n) { color: var(--syn-n); }
.sig :deep(.b), .ex :deep(.b) { color: var(--syn-b); font-weight: 600; }
.sig :deep(.api), .ex :deep(.api) { color: var(--syn-api); font-weight: 600; }
</style>
