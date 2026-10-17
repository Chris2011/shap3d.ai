<template>
  <div class="s3d-section-title">Anzeigen</div>
  <label v-for="o in OPTS" :key="o.id" class="s3d-check"><input type="checkbox" :checked="check(o.id)" @change="toggle(o.id)" /> {{ o.label }}</label>
  <div class="s3d-section-title">Schnittebenen</div>
  <div v-for="s in sections" :key="s.id" class="sec">
    <label class="s3d-check" style="flex:1"><input type="radio" name="activesec" :checked="s.active" @change="activate(s.id)" /> {{ s.name }}</label>
    <button class="s3d-btn small" title="Ebene umdrehen" @click="flip(s.id)">⇄</button>
    <button class="s3d-btn small" title="Ebene verschieben" @click="shift(s.id, -0.1)">−</button>
    <button class="s3d-btn small" title="Ebene verschieben" @click="shift(s.id, 0.1)">+</button>
    <button class="s3d-btn small" title="Löschen" @click="del(s.id)">✕</button>
  </div>
  <label v-if="sections.length" class="s3d-check"><input type="radio" name="activesec" :checked="!sections.some(s => s.active)" @change="activate(-1)" /> Kein aktiver Schnitt</label>
  <div v-if="!sections.length" class="s3d-label">Keine Schnittebenen. Werkzeug „Schnittebene“ im erweiterten Werkzeugsatz.</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditor } from '../keys';
import { runCommand, findCommand } from '../../engine/commands';

const ed = useEditor();
const OPTS = [
  { id: 'toggleAxes', label: 'Achsen' }, { id: 'toggleRulers', label: 'Maßstab an den Achsen (m · cm · mm je nach Zoom)' }, { id: 'togglePeopleSize', label: 'Größe der Personen' },
  { id: 'toggleGuides', label: 'Hilfslinien' }, { id: 'toggleSectionPlanes', label: 'Schnittebenen' }, { id: 'toggleSectionCuts', label: 'Schnitte' },
  { id: 'toggleHidden', label: 'Ausgeblendete Geometrie' }, { id: 'toggleShadows', label: 'Schatten' }, { id: 'xray', label: 'Röntgen' },
];
const check = (id: string) => { void ed.ui.rev; return !!findCommand(id)?.checked?.(ed); };
function toggle(id: string) { runCommand(ed, id); ed.ui.saved = false; }
const sections = computed(() => { void ed.ui.rev; return ed.model.sections; });
function activate(id: number) { ed.commit('Schnitt', () => ed.model.sections.forEach(s => (s.active = s.id === id))); }
function flip(id: number) { ed.commit('Schnitt umdrehen', () => { const s = ed.model.sections.find(x => x.id === id); if (s) s.n.negate(); }); }
function shift(id: number, d: number) { ed.commit('Schnitt verschieben', () => { const s = ed.model.sections.find(x => x.id === id); if (s) s.p.addScaledVector(s.n, d); }); }
function del(id: number) { ed.commit('Schnitt löschen', () => { ed.model.sections = ed.model.sections.filter(s => s.id !== id); }); }
</script>

<style scoped>
.sec { display: flex; gap: 4px; align-items: center; }
.sec .s3d-btn { padding: 0 7px; }
</style>
