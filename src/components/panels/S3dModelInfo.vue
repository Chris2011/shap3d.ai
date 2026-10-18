<template>
  <div class="s3d-section-title">Einheiten</div>
  <div class="s3d-row"><span class="s3d-label">Format</span>
    <select class="s3d-input" :value="s.units" @change="set('units', ($event.target as HTMLSelectElement).value as any)">
      <option value="mm">Millimeter</option><option value="cm">Zentimeter</option><option value="m">Meter</option><option value="in">Zoll</option><option value="ft">Fuß/Zoll</option>
    </select>
  </div>
  <div class="s3d-row"><span class="s3d-label">Genauigkeit</span>
    <select class="s3d-input" :value="s.precision" @change="set('precision', +($event.target as HTMLSelectElement).value)">
      <option v-for="p in [0,1,2,3,4]" :key="p" :value="p">{{ p }} Nachkommastellen</option>
    </select>
  </div>
  <div class="s3d-section-title">Statistik</div>
  <div class="s3d-row"><span class="s3d-label">Flächen</span><span>{{ stats.faces }}</span></div>
  <div class="s3d-row"><span class="s3d-label">Kanten</span><span>{{ stats.edges }}</span></div>
  <div class="s3d-row"><span class="s3d-label">Definitionen</span><span>{{ defs }}</span></div>
  <div class="s3d-row"><span class="s3d-label">Materialien</span><span>{{ ed.model.materials.length }}</span></div>
  <div class="s3d-row"><span class="s3d-label">Ausdehnung</span><span>{{ extent }}</span></div>
  <button class="s3d-btn small" @click="purge">Nicht verwendete bereinigen</button>
</template>

<script setup lang="ts">
import * as THREE from 'three';
import { useEditor } from '../keys';
import type { ModelSettings } from '../../core/document';
import { useModel } from '../../composables/useModel';
const ed = useEditor();
const s = useModel(() => ed.model.settings);
const stats = useModel(() => ed.model.root.stats());
const defs = useModel(() => ed.model.definitions.size);
const extent = useModel(() => { const b = ed.model.bounds(); if (b.isEmpty()) return '—'; const z = b.getSize(new THREE.Vector3()); return `${ed.fmt(z.x)} × ${ed.fmt(z.y)} × ${ed.fmt(z.z)}`; });
function set<K extends keyof ModelSettings>(k: K, v: ModelSettings[K]) { ed.model.settings[k] = v; ed.ui.saved = false; ed.invalidate(); ed.refreshStatus(); }
function purge() { ed.commit('Bereinigen', () => { ed.model.purge(); }); ed.toast('Nicht verwendete Definitionen entfernt'); }
</script>
