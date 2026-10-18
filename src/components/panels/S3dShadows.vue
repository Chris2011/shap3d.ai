<template>
  <label class="s3d-check font-semibold"><input type="checkbox" :checked="settings.shadows" @change="set('shadows', !settings.shadows)" /> Schatten anzeigen</label>
  <div class="s3d-section-title">Uhrzeit</div>
  <div class="s3d-row"><input type="range" min="5" max="21" step="0.25" :value="settings.shadowHour" @input="set('shadowHour', +val($event))" class="flex-1" /><span class="w-18.5 text-right tabular-nums">{{ time }}</span></div>
  <div class="s3d-section-title">Datum</div>
  <div class="s3d-row"><input type="range" min="1" max="12" step="1" :value="settings.shadowMonth" @input="set('shadowMonth', +val($event))" class="flex-1" /><span class="w-18.5 text-right tabular-nums">{{ MONTHS[settings.shadowMonth - 1] }}</span></div>
  <p class="s3d-label my-3">Der Sonnenstand wird für ca. 48° nördlicher Breite berechnet. Auch ohne Schatten bestimmt er die Beleuchtung der Flächen.</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditor } from '../keys';
import type { ModelSettings } from '../../core/document';
import { useModel } from '../../composables/useModel';
const editor = useEditor();
const settings = useModel(() => editor.model.settings);
const val = (event: Event) => (event.target as HTMLInputElement).value;
const set = <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) => { editor.model.settings[key] = value; editor.ui.saved = false; editor.invalidate(); };
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const time = computed(() => { const hours = Math.floor(settings.value.shadowHour), minutes = Math.round((settings.value.shadowHour - hours) * 60); return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`; });
</script>
