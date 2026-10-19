<template>
  <S3dModalDialog v-if="dialog" panel-class="w-95 overflow-auto px-4.5 py-4" @close="cancel">
      <!-- prompt -->
      <template v-if="dialog.kind === 'prompt'">
        <div class="mb-3 text-[0.9375rem] font-semibold">{{ dialog.data.title }}</div>
        <textarea v-if="dialog.data.multiline" ref="first" v-model="val" class="s3d-input h-17.5 resize-y px-2 py-1.5" @keydown.enter.exact.prevent="ok" @keydown.esc="cancel"></textarea>
        <input v-else ref="first" v-model="val" class="s3d-input" @keydown.enter="ok" @keydown.esc="cancel" />
        <div class="mt-3.5 flex justify-end gap-2"><button class="s3d-btn" @click="cancel">Abbrechen</button><button class="s3d-btn primary" @click="ok">OK</button></div>
      </template>
      <!-- confirm -->
      <template v-else-if="dialog.kind === 'confirm'">
        <div class="mb-3 text-[0.9375rem] font-semibold">{{ dialog.data.title }}</div>
        <div class="mt-3.5 flex justify-end gap-2"><button class="s3d-btn" @click="answer(false)">Nein</button><button ref="first" class="s3d-btn primary" @click="answer(true)">Ja</button></div>
      </template>
      <!-- help -->
      <template v-else-if="dialog.kind === 'help'">
        <div class="mb-3 text-[0.9375rem] font-semibold">Tastenkürzel & Bedienung</div>
        <div class="grid gap-1">
          <div v-for="row in HELP" :key="row[0]" class="flex items-baseline gap-2.5"><kbd class="min-w-32 rounded-[3px] border border-line-2 bg-surface-2 px-1.5 text-center font-mono text-[0.6875rem]/[1.6]">{{ row[0] }}</kbd><span>{{ row[1] }}</span></div>
        </div>
        <div class="mt-3.5 flex justify-end gap-2"><button ref="first" class="s3d-btn primary" @click="editor.ui.dialog = null">Schließen</button></div>
      </template>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import S3dModalDialog from './ui/S3dModalDialog.vue';
import { ref, computed, watch, nextTick, reactive } from 'vue';
import { useEditor } from './keys';

const editor = useEditor();
const dialog = computed(() => editor.ui.dialog);
const val = ref(''); const first = ref<HTMLElement | null>(null);
watch(dialog, current => { if (current?.kind === 'prompt') val.value = current.data.value ?? ''; nextTick(() => { (first.value as any)?.focus?.(); (first.value as any)?.select?.(); }); });
const ok = () => { dialog.value?.data.resolve(val.value); };
const cancel = () => { const current = dialog.value; if (!current) return; if (current.kind === 'prompt') current.data.resolve(null); else if (current.kind === 'confirm') current.data.resolve(false); else editor.ui.dialog = null; };
const answer = (answer: boolean) => { dialog.value?.data.resolve(answer); };
const HELP: [string, string][] = [
  ['Leertaste', 'Auswählen'], ['L', 'Linie'], ['R', 'Rechteck'], ['C', 'Kreis'], ['A', '2-Punkt-Bogen'], ['P', 'Drücken/Ziehen'], ['F', 'Versatz'],
  ['M', 'Verschieben (Strg = Kopie, danach „5x“ oder „/5“ eingeben)'], ['Q', 'Drehen'], ['S', 'Skalieren'], ['T', 'Maßband'], ['E', 'Radiergummi'], ['B', 'Farbeimer'],
  ['O / Mittlere Maustaste', 'Orbit'], ['H / Umschalt+Mitte', 'Schwenken'], ['Z / Mausrad', 'Zoom'], ['Umschalt+Z', 'Zoom Grenzen'], ['G', 'Komponente erstellen'],
  ['Pfeiltasten', 'Achse sperren (↑ blau, → rot, ← grün)'], ['Umschalt (halten)', 'Aktuelle Richtung sperren'], ['Zahlen tippen', 'Feld „Maße“ (z. B. 2,5m oder 3m;4m)'],
  ['Doppelklick', 'Gruppe öffnen / Fläche + Kanten auswählen'], ['Dreifachklick', 'Alle verbundenen Elemente'], ['Esc', 'Abbrechen / Gruppe schließen'],
  ['Strg+Z / Strg+Y', 'Rückgängig / Wiederholen'], ['Entf', 'Auswahl löschen'], ['Alt+K', 'Röntgen'],
];
</script>
