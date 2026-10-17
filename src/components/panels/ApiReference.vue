<template>
  <div class="flex min-h-0 flex-col border-t border-line bg-surface-2">
    <div class="flex items-center gap-2 px-2.5 pt-2 pb-1">
      <input v-model="q" class="s3d-input h-7 flex-1" placeholder="Suchen: kegel, glas, drehen, treppe …" spellcheck="false" @keydown.stop />
      <span class="whitespace-nowrap text-[11px] text-muted">{{ entries.length }} Befehle · {{ mats.length }} Materialien</span>
    </div>
    <div class="flex gap-0.5 overflow-x-auto border-b border-line px-2.5 pt-0.5">
      <button v-for="t in TABS" :key="t" class="whitespace-nowrap border-b-2 bg-transparent px-2 py-[5px] text-xs" :class="tab === t ? 'border-navy font-bold text-navy' : 'border-transparent text-ink-2 hover:text-navy'" @click="tab = t">{{ t }}</button>
    </div>

    <div class="flex-1 overflow-auto px-2.5 pt-1 pb-3 select-text">
      <!-- commands -->
      <template v-for="c in shownCats" :key="c">
        <div class="mt-3 mb-1 text-[11px] font-bold tracking-[.5px] text-navy uppercase">{{ c }}</div>
        <div v-for="e in entries.filter(x => x.cat === c)" :key="e.id" class="mb-1.5 border border-line bg-surface px-[9px] py-[7px]">
          <div class="flex items-baseline gap-2">
            <span class="text-[13px] font-bold">{{ e.title }}</span>
            <span v-if="e.returns" class="text-[11px] text-muted" title="Rückgabewert">→ {{ e.returns }}</span>
          </div>
          <code class="s3d-syntax font-mono text-ink my-[3px] block text-xs/[1.45] break-words whitespace-pre-wrap" v-html="hl(e.sig)"></code>
          <div class="text-xs/[1.4] text-ink">{{ e.desc }}</div>
          <pre class="s3d-syntax font-mono text-ink mt-[5px] overflow-x-auto border border-line bg-surface-2 px-[7px] py-[5px] text-[11.5px]/[1.45] whitespace-pre" v-html="hl(e.example)"></pre>
          <div class="mt-1 flex gap-3">
            <button class="bg-transparent p-0 text-xs text-blue hover:underline" title="Beispiel an der Cursorposition einfügen" @click="$emit('insert', e.example + '\n')">Einfügen</button>
            <button class="bg-transparent p-0 text-xs text-blue hover:underline" title="Beispiel sofort ins Modell bauen (ein Rückgängig-Schritt)" @click="$emit('try', e.example)">▶ Ausprobieren</button>
            <button class="bg-transparent p-0 text-xs text-blue hover:underline" @click="copy(e.example, e.id)">{{ copied === e.id ? '✓ Kopiert' : 'Kopieren' }}</button>
          </div>
        </div>
      </template>

      <!-- material library -->
      <template v-if="showMaterials && mats.length">
        <div class="mt-3 mb-1 text-[11px] font-bold tracking-[.5px] text-navy uppercase">Fertige Materialien <span class="font-normal tracking-normal text-muted normal-case">– einfach per Name verwenden: { material: 'Glas' }</span></div>
        <template v-for="mc in MATERIAL_CATEGORIES" :key="mc">
          <div v-if="mats.some(m => m.category === mc)" class="mt-2 mb-[3px] text-[11px] font-semibold text-ink-2">{{ mc }}</div>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1">
            <button v-for="m in mats.filter(x => x.category === mc)" :key="m.name" class="group flex min-w-0 items-center gap-1.5 border border-line bg-surface px-[5px] py-[3px] text-left text-xs hover:border-navy" :title="matTitle(m)" @click="$emit('insert', `'${m.name}'`)">
              <span class="relative size-5.5 flex-none overflow-hidden border border-black/15" :class="{ 'bg-[repeating-conic-gradient(#ccc_0_25%,var(--s3d-bg)_0_50%)] bg-size-[8px_8px]': (m.opacity ?? 1) < 1 }"><span class="absolute inset-0" :style="swatch(m)"></span></span>
              <span class="min-w-0 flex-1 truncate">{{ m.name }}</span>
              <span class="px-0.5 text-[11px] text-blue opacity-0 group-hover:opacity-100" title="Würfel mit diesem Material bauen" @click.stop="$emit('try', `s3d.box([0, 0, 0], 1, 1, 1, { material: '${m.name}' });`)">▶</span>
            </button>
          </div>
        </template>
        <div class="mt-3 mb-1 text-[11px] font-bold tracking-[.5px] text-navy uppercase">Texturen <span class="font-normal tracking-normal text-muted normal-case">– für eigene Materialien: s3d.material(name, farbe, { texture: '…' })</span></div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1">
          <button v-for="t in textures" :key="t.kind" class="flex min-w-0 items-center gap-1.5 border border-line bg-surface px-[5px] py-[3px] text-left text-xs hover:border-navy" :title="`texture: '${t.kind}' – Kachel ${t.size} m`" @click="$emit('insert', `'${t.kind}'`)">
            <span class="relative size-5.5 flex-none overflow-hidden border border-black/15"><span class="absolute inset-0" :style="{ backgroundImage: `url(${texUrl(t.kind, '#c8b8a0')})`, backgroundSize: 'cover' }"></span></span>
            <span class="min-w-0 flex-1 truncate"><code class="font-mono text-[11px] text-syn-b">{{ t.kind }}</code> {{ t.label }}</span>
          </button>
        </div>
      </template>

      <div v-if="!entries.length && !mats.length" class="py-4 text-[13px] text-muted">Nichts gefunden für „{{ q }}“.</div>
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
