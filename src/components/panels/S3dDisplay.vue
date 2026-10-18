<template>
  <div class="s3d-section-title">Anzeigen</div>
  <label v-for="option in OPTS" :key="option.id" class="s3d-check"><input type="checkbox" :checked="check(option.id)" @change="toggle(option.id)" /> {{ option.label }}</label>
  <div class="s3d-section-title">Schnittebenen</div>
  <div v-for="section in sections" :key="section.id" class="flex items-center gap-1 [&_.s3d-btn]:px-1.75">
    <label class="s3d-check flex-1"><input type="radio" name="activesec" :checked="section.active" @change="activate(section.id)" /> {{ section.name }}</label>
    <button class="s3d-btn small" title="Ebene umdrehen" @click="flip(section.id)">⇄</button>
    <button class="s3d-btn small" title="Ebene verschieben" @click="shift(section.id, -0.1)">−</button>
    <button class="s3d-btn small" title="Ebene verschieben" @click="shift(section.id, 0.1)">+</button>
    <button class="s3d-btn small" title="Löschen" @click="del(section.id)">✕</button>
  </div>
  <label v-if="sections.length" class="s3d-check"><input type="radio" name="activesec" :checked="!sections.some(section => section.active)" @change="activate(-1)" /> Kein aktiver Schnitt</label>
  <div v-if="!sections.length" class="s3d-label">Keine Schnittebenen. Werkzeug „Schnittebene“ im erweiterten Werkzeugsatz.</div>
</template>

<script setup lang="ts">
import { useEditor } from '../keys';
import { runCommand, findCommand } from '../../engine/commands';
import { useModel } from '../../composables/useModel';

const editor = useEditor();
const OPTS = [
  { id: 'toggleAxes', label: 'Achsen' }, { id: 'toggleRulers', label: 'Maßstab an den Achsen (m · cm · mm je nach Zoom)' }, { id: 'togglePeopleSize', label: 'Größe der Personen' },
  { id: 'toggleGuides', label: 'Hilfslinien' }, { id: 'toggleSectionPlanes', label: 'Schnittebenen' }, { id: 'toggleSectionCuts', label: 'Schnitte' },
  { id: 'toggleHidden', label: 'Ausgeblendete Geometrie' }, { id: 'toggleShadows', label: 'Schatten' }, { id: 'xray', label: 'Röntgen' },
];
const check = (id: string) => { void editor.ui.revision; return !!findCommand(id)?.checked?.(editor); };
const toggle = (id: string) => { runCommand(editor, id); editor.ui.saved = false; };
const sections = useModel(() => editor.model.sections);
const activate = (id: number) => { editor.commit('Schnitt', () => editor.model.sections.forEach(section => (section.active = section.id === id))); };
const flip = (id: number) => { editor.commit('Schnitt umdrehen', () => { const section = editor.model.sections.find(candidate => candidate.id === id); if (section) section.normal.negate(); }); };
const shift = (id: number, distance: number) => { editor.commit('Schnitt verschieben', () => { const section = editor.model.sections.find(candidate => candidate.id === id); if (section) section.point.addScaledVector(section.normal, distance); }); };
const del = (id: number) => { editor.commit('Schnitt löschen', () => { editor.model.sections = editor.model.sections.filter(section => section.id !== id); }); };
</script>
