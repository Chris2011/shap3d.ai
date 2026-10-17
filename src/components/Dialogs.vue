<template>
  <div v-if="d" class="fixed inset-0 z-90 flex items-center justify-center bg-[rgba(20,25,30,.25)]" @pointerdown.self="cancel">
    <div class="s3d-panel max-h-[86vh] w-95 overflow-auto px-4.5 py-4" @keydown.stop>
      <!-- prompt -->
      <template v-if="d.kind === 'prompt'">
        <div class="mb-3 text-[15px] font-semibold">{{ d.data.title }}</div>
        <textarea v-if="d.data.multiline" ref="first" v-model="val" class="s3d-input h-[70px] resize-y px-2 py-1.5" @keydown.enter.exact.prevent="ok" @keydown.esc="cancel"></textarea>
        <input v-else ref="first" v-model="val" class="s3d-input" @keydown.enter="ok" @keydown.esc="cancel" />
        <div class="mt-3.5 flex justify-end gap-2"><button class="s3d-btn" @click="cancel">Abbrechen</button><button class="s3d-btn primary" @click="ok">OK</button></div>
      </template>
      <!-- confirm -->
      <template v-else-if="d.kind === 'confirm'">
        <div class="mb-3 text-[15px] font-semibold">{{ d.data.title }}</div>
        <div class="mt-3.5 flex justify-end gap-2"><button class="s3d-btn" @click="answer(false)">Nein</button><button ref="first" class="s3d-btn primary" @click="answer(true)">Ja</button></div>
      </template>
      <!-- 3D text -->
      <template v-else-if="d.kind === 'text3d'">
        <div class="mb-3 text-[15px] font-semibold">3D-Text einfügen</div>
        <textarea ref="first" v-model="t.text" class="s3d-input h-[70px] resize-y px-2 py-1.5" placeholder="Text eingeben"></textarea>
        <div class="s3d-row"><span class="s3d-label">Schriftart</span><select v-model="t.font" class="s3d-input"><option v-for="(n, k) in FONT_NAMES" :key="k" :value="k">{{ n }}</option></select></div>
        <div class="s3d-row"><span class="s3d-label">Höhe</span><input v-model="t.size" class="s3d-input" /></div>
        <label class="s3d-check"><input type="checkbox" v-model="t.filled" /> Gefüllt</label>
        <div class="s3d-row"><span class="s3d-label">Extrudiert</span><input v-model="t.depth" class="s3d-input" :disabled="!t.filled" /></div>
        <label class="s3d-check"><input type="checkbox" v-model="t.upright" /> Aufrecht stehend</label>
        <div class="mt-3.5 flex justify-end gap-2"><button class="s3d-btn" @click="cancel">Abbrechen</button><button class="s3d-btn primary" @click="place3d">Platzieren</button></div>
      </template>
      <!-- help -->
      <template v-else-if="d.kind === 'help'">
        <div class="mb-3 text-[15px] font-semibold">Tastenkürzel & Bedienung</div>
        <div class="grid gap-1">
          <div v-for="r in HELP" :key="r[0]" class="flex items-baseline gap-2.5"><kbd class="min-w-32 rounded-[3px] border border-line-2 bg-surface-2 px-1.5 text-center font-mono text-[11px]/[1.6]">{{ r[0] }}</kbd><span>{{ r[1] }}</span></div>
        </div>
        <div class="mt-3.5 flex justify-end gap-2"><button ref="first" class="s3d-btn primary" @click="ed.ui.dialog = null">Schließen</button></div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, reactive } from 'vue';
import { useEditor } from './keys';
import { FONT_NAMES, type FontName } from '../core/text3d';
import { start3DText } from '../tools/place';
import { parseLength } from '../core/units';

const ed = useEditor();
const d = computed(() => ed.ui.dialog);
const val = ref(''); const first = ref<HTMLElement | null>(null);
const t = reactive({ text: 'Text', font: 'helvetiker' as FontName, size: '1m', depth: '0,2m', filled: true, upright: true });
watch(d, v => { if (v?.kind === 'prompt') val.value = v.data.value ?? ''; nextTick(() => { (first.value as any)?.focus?.(); (first.value as any)?.select?.(); }); });
function ok() { d.value?.data.resolve(val.value); }
function cancel() { const x = d.value; if (!x) return; if (x.kind === 'prompt') x.data.resolve(null); else if (x.kind === 'confirm') x.data.resolve(false); else ed.ui.dialog = null; }
function answer(v: boolean) { d.value?.data.resolve(v); }
function place3d() {
  const u = ed.model.settings.units; const size = parseLength(t.size, u) ?? 1; const depth = parseLength(t.depth, u) ?? 0;
  if (!t.text.trim()) return;
  ed.ui.dialog = null;
  start3DText(ed, { text: t.text, font: t.font, size, depth, filled: t.filled, upright: t.upright, material: ed.ui.currentMaterial ?? undefined });
}
const HELP: [string, string][] = [
  ['Leertaste', 'Auswählen'], ['L', 'Linie'], ['R', 'Rechteck'], ['C', 'Kreis'], ['A', '2-Punkt-Bogen'], ['P', 'Drücken/Ziehen'], ['F', 'Versatz'],
  ['M', 'Verschieben (Strg = Kopie, danach „5x“ oder „/5“ eingeben)'], ['Q', 'Drehen'], ['S', 'Skalieren'], ['T', 'Maßband'], ['E', 'Radiergummi'], ['B', 'Farbeimer'],
  ['O / Mittlere Maustaste', 'Orbit'], ['H / Umschalt+Mitte', 'Schwenken'], ['Z / Mausrad', 'Zoom'], ['Umschalt+Z', 'Zoom Grenzen'], ['G', 'Komponente erstellen'],
  ['Pfeiltasten', 'Achse sperren (↑ blau, → rot, ← grün)'], ['Umschalt (halten)', 'Aktuelle Richtung sperren'], ['Zahlen tippen', 'Feld „Maße“ (z. B. 2,5m oder 3m;4m)'],
  ['Doppelklick', 'Gruppe öffnen / Fläche + Kanten auswählen'], ['Dreifachklick', 'Alle verbundenen Elemente'], ['Esc', 'Abbrechen / Gruppe schließen'],
  ['Strg+Z / Strg+Y', 'Rückgängig / Wiederholen'], ['Entf', 'Auswahl löschen'], ['Alt+K', 'Röntgen'],
];
</script>
