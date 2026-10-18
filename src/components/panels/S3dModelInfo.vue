<template>
  <div class="s3d-section-title">Einheiten</div>
  <div class="s3d-row"><span class="s3d-label">Format</span>
    <select class="s3d-input" :value="settings.units" @change="set('units', ($event.target as HTMLSelectElement).value as any)">
      <option value="mm">Millimeter</option><option value="cm">Zentimeter</option><option value="m">Meter</option><option value="in">Zoll</option><option value="ft">Fuß/Zoll</option>
    </select>
  </div>
  <div class="s3d-row"><span class="s3d-label">Genauigkeit</span>
    <select class="s3d-input" :value="settings.precision" @change="set('precision', +($event.target as HTMLSelectElement).value)">
      <option v-for="precision in [0,1,2,3,4]" :key="precision" :value="precision">{{ precision }} Nachkommastellen</option>
    </select>
  </div>
  <div class="s3d-section-title">Statistik</div>
  <div class="s3d-row"><span class="s3d-label">Flächen</span><span>{{ stats.faces }}</span></div>
  <div class="s3d-row"><span class="s3d-label">Kanten</span><span>{{ stats.edges }}</span></div>
  <div class="s3d-row"><span class="s3d-label">Definitionen</span><span>{{ defs }}</span></div>
  <div class="s3d-row"><span class="s3d-label">Materialien</span><span>{{ editor.model.materials.length }}</span></div>
  <div class="s3d-row"><span class="s3d-label">Ausdehnung</span><span>{{ extent }}</span></div>
  <button class="s3d-btn small" @click="purge">Nicht verwendete bereinigen</button>
</template>

<script setup lang="ts">
import * as THREE from 'three';
import { useEditor } from '../keys';
import type { ModelSettings } from '../../core/document';
import { useModel } from '../../composables/useModel';
const editor = useEditor();
const settings = useModel(() => editor.model.settings);
const stats = useModel(() => editor.model.root.stats());
const defs = useModel(() => editor.model.definitions.size);
const extent = useModel(() => { const bounds = editor.model.bounds(); if (bounds.isEmpty()) return '—'; const size = bounds.getSize(new THREE.Vector3()); return `${editor.fmt(size.x)} × ${editor.fmt(size.y)} × ${editor.fmt(size.z)}`; });
const set = <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) => { editor.model.settings[key] = value; editor.ui.saved = false; editor.invalidate(); editor.refreshStatus(); };
const purge = () => { editor.commit('Bereinigen', () => { editor.model.purge(); }); editor.toast('Nicht verwendete Definitionen entfernt'); };
</script>
