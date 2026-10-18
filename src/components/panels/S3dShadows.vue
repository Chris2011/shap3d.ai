<template>
  <label class="s3d-check font-semibold"><input type="checkbox" :checked="s.shadows" @change="set('shadows', !s.shadows)" /> Schatten anzeigen</label>
  <div class="s3d-section-title">Uhrzeit</div>
  <div class="s3d-row"><input type="range" min="5" max="21" step="0.25" :value="s.shadowHour" @input="set('shadowHour', +val($event))" class="flex-1" /><span class="w-18.5 text-right tabular-nums">{{ time }}</span></div>
  <div class="s3d-section-title">Datum</div>
  <div class="s3d-row"><input type="range" min="1" max="12" step="1" :value="s.shadowMonth" @input="set('shadowMonth', +val($event))" class="flex-1" /><span class="w-18.5 text-right tabular-nums">{{ MONTHS[s.shadowMonth - 1] }}</span></div>
  <p class="s3d-label my-3">Der Sonnenstand wird für ca. 48° nördlicher Breite berechnet. Auch ohne Schatten bestimmt er die Beleuchtung der Flächen.</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditor } from '../keys';
import type { ModelSettings } from '../../core/document';
import { useModel } from '../../composables/useModel';
const ed = useEditor();
const s = useModel(() => ed.model.settings);
const val = (e: Event) => (e.target as HTMLInputElement).value;
function set<K extends keyof ModelSettings>(k: K, v: ModelSettings[K]) { ed.model.settings[k] = v; ed.ui.saved = false; ed.invalidate(); }
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const time = computed(() => { const h = Math.floor(s.value.shadowHour), m = Math.round((s.value.shadowHour - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; });
</script>
