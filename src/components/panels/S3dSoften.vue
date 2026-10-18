<template>
  <p class="s3d-label my-3">Mildert Kanten zwischen Flächen der Auswahl ab, deren Winkel kleiner als der eingestellte Wert ist.</p>
  <div class="s3d-row"><span class="s3d-label">Winkel</span><input type="range" min="0" max="180" step="1" v-model.number="angle" class="flex-1" /><span class="w-10.5 text-right">{{ angle }}°</span></div>
  <label class="s3d-check"><input type="checkbox" v-model="coplanar" /> Koplanare abmildern</label>
  <div class="mt-2 flex gap-1.5"><button class="s3d-btn small" :disabled="!ed.selection.size" @click="apply">Auf Auswahl anwenden</button><button class="s3d-btn small" :disabled="!ed.selection.size" @click="clear">Zurücksetzen</button></div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useEditor } from '../keys';
const ed = useEditor(); const angle = ref(20); const coplanar = ref(true);
function edges(): number[] { void ed.ui.selRev; const E = ed.entities; const s = new Set<number>(); for (const r of ed.selected()) { if (r.kind === 'edge') s.add(r.id); if (r.kind === 'face') { const f = E.faces.get(r.id); if (f) E.faceEdges(f).forEach(e => s.add(e.id)); } } if (ed.selected().some(r => r.kind === 'instance')) for (const r of ed.selected()) { const i = E.instances.get(r.id); if (i) i.def.entities.edges.forEach(e => s.add(-e.id)); } return [...s]; }
function apply() {
  const c = Math.cos(angle.value * Math.PI / 180);
  ed.commit('Abmildern/Glätten', () => {
    const E = ed.entities;
    const run = (ents: typeof E, ids: number[]) => { for (const id of ids) { const e = ents.edges.get(id); if (!e) continue; const fs = ents.facesOfEdge(id); if (fs.length !== 2) continue; const d = ents.faceNormal(fs[0]).dot(ents.faceNormal(fs[1])); e.soft = (d >= c && (coplanar.value || d < 1 - 1e-6)) || undefined; } };
    run(E, edges().filter(x => x > 0));
    for (const r of ed.selected()) if (r.kind === 'instance') { const i = E.instances.get(r.id); if (i) run(i.def.entities, [...i.def.entities.edges.keys()]); }
  });
}
function clear() { ed.commit('Abmildern zurücksetzen', () => { const E = ed.entities; for (const id of edges()) { const e = id > 0 ? E.edges.get(id) : undefined; if (e) e.soft = undefined; } for (const r of ed.selected()) if (r.kind === 'instance') { const i = E.instances.get(r.id); if (i) i.def.entities.edges.forEach(e => (e.soft = undefined)); } }); }
</script>
