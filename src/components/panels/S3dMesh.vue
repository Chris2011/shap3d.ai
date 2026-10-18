<template>
  <div class="text-[0.78125rem]">
    <label class="flex items-center justify-between">
      <span class="text-[0.8125rem] font-bold">Polygonansicht</span>
      <S3dToggleSwitch v-model="meshView.on" label="Polygonansicht" @update:model-value="redraw()" />
    </label>
    <div class="mt-1.5 mb-0.5 ml-0.5" :class="{ 'opacity-50': !meshView.on }">
      <label class="s3d-check"><input v-model="meshView.points" type="checkbox" :disabled="!meshView.on" @change="redraw()" /> <i class="inline-block h-2.5 w-3.5 bg-[radial-gradient(circle,#0e8ca0_3px,transparent_3.5px)]"></i> Eckpunkte</label>
      <label class="s3d-check"><input v-model="meshView.triangles" type="checkbox" :disabled="!meshView.on" @change="redraw()" /> <i class="inline-block h-2.5 w-3.5 -skew-y-[25deg] border-b-[1.5px] border-brand-deep opacity-60"></i> Dreiecke der Flächen</label>
      <label class="s3d-check"><input v-model="meshView.soft" type="checkbox" :disabled="!meshView.on" @change="redraw()" /> <i class="inline-block h-2.5 w-3.5 border-b-[1.5px] border-dashed border-ink-2"></i> Weiche Kanten</label>
    </div>

    <div class="mt-3.5 mb-1.5 s3d-caption text-navy">{{ scope }}</div>
    <div class="grid grid-cols-[repeat(2,1fr)] gap-1.5 [&>div]:flex [&>div]:flex-col [&>div]:border [&>div]:border-line [&>div]:bg-surface-2 [&>div]:px-2 [&>div]:py-1.5 [&_b]:text-base [&_b]:tabular-nums [&_span]:text-[0.6875rem] [&_span]:text-muted">
      <div><b>{{ fmt(stats.vertices) }}</b><span>Eckpunkte</span></div>
      <div><b>{{ fmt(stats.edges) }}</b><span>Kanten<template v-if="stats.softEdges"> ({{ fmt(stats.softEdges) }} weich)</template></span></div>
      <div><b>{{ fmt(stats.faces) }}</b><span>Flächen</span></div>
      <div><b>{{ fmt(stats.triangles) }}</b><span>Dreiecke</span></div>
    </div>

    <!-- exact resolution: parametric shape or flat circle -->
    <template v-if="res">
      <div class="mt-3.5 mb-1.5 s3d-caption text-navy">{{ res.label }} – Auflösung</div>
      <div class="flex items-center gap-1.5">
        <button class="s3d-btn small" title="Weniger" @click="applyRes(res.value - step(res.value))">−</button>
        <input v-model.number="draft" class="s3d-input w-17.5 text-center" type="number" :min="res.min" max="256" @change="applyRes(draft)" @keydown.enter="applyRes(draft)" />
        <span class="flex-1 text-ink-2">{{ res.unit }}</span>
        <button class="s3d-btn small" title="Mehr" @click="applyRes(res.value + step(res.value))">+</button>
      </div>
      <input v-model.number="draft" class="mt-2 mb-1 w-full" type="range" :min="res.min" max="96" step="1" @change="applyRes(draft)" />
      <div class="flex flex-wrap gap-1">
        <button v-for="preset in res.presets" :key="preset" class="s3d-chip tabular-nums" :class="{ on: res.value === preset }" @click="applyRes(preset)">{{ preset }}</button>
      </div>
      <p class="mt-2 mb-0 text-[0.71875rem]/[1.45] text-ink-2">{{ res.hint }}</p>
    </template>

    <!-- any group / component -->
    <template v-if="inst">
      <div class="mt-3.5 mb-1.5 s3d-caption text-navy">Polygone ändern</div>
      <div class="grid grid-cols-[repeat(2,1fr)] gap-1.5 [&_.s3d-btn]:px-1.5">
        <button class="s3d-btn" title="Jedes Dreieck wird zu vier – die Form bleibt exakt gleich" @click="more(false)">▲ Mehr (Form behalten)</button>
        <button class="s3d-btn" title="Jedes Dreieck wird zu vier, Ecken und Rundungen werden weicher" @click="more(true)">▲ Mehr (abrunden)</button>
      </div>
      <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <button class="s3d-btn" @click="less()">▼ Weniger Polygone</button>
        <label class="flex flex-[1_1_100%] items-center gap-1.5 text-ink-2">auf <input class="min-w-0 flex-1" v-model.number="keep" type="range" min="10" max="90" step="5" /> <b>{{ keep }} %</b></label>
      </div>
      <p class="mt-2 mb-0 text-[0.71875rem]/[1.45] text-ink-2">Wirkt auf die oberste Ebene der Gruppe/Komponente{{ inst.definition.isComponent ? ' – und damit auf alle Kopien' : '' }}. Rückgängig mit Strg+Z.</p>
    </template>

    <p v-if="!res && !inst" class="mt-2 mb-0 text-[0.71875rem]/[1.45] text-ink-2">Wähle eine Gruppe, Komponente oder einen gezeichneten Kreis aus, um die Polygonzahl zu ändern. Lose Geometrie vorher mit „Gruppe erstellen“ zusammenfassen.</p>
  </div>
</template>

<script setup lang="ts">
import S3dToggleSwitch from '../ui/S3dToggleSwitch.vue';
import { computed, ref, watch } from 'vue';
import { useEditor } from '../keys';
import { meshView } from '../../engine/meshView';
import { meshStats, sumStats, detectCircle, type MeshStats } from '../../core/meshops';
import { resolutionOf, setResolution, setCircleSegments, subdivideInstance, simplifyInstance } from '../../scripting/reshape';
import type { Instance, Face } from '../../core/model';
import { useModel, useSelection } from '../../composables/useModel';

const editor = useEditor();
const keep = ref(50);
const redraw = () => editor.invalidate();
const fmt = (count: number) => count.toLocaleString('de-DE');

const sel = useSelection(() => editor.selected());
const inst = computed<Instance | null>(() => {
  const selection = sel.value; if (selection.length !== 1 || selection[0].kind !== 'instance') return null;
  return editor.entities.instances.get(selection[0].id) ?? null;
});
const face = computed<Face | null>(() => {
  const faces = sel.value.filter(entityRef => entityRef.kind === 'face');
  if (faces.length !== 1 || sel.value.some(entityRef => entityRef.kind === 'instance')) return null;
  return editor.entities.faces.get(faces[0].id) ?? null;
});

const scope = computed(() => (sel.value.length ? 'Auswahl' : 'Ganzes Modell'));
const stats = useModel<MeshStats>(() => {
  const selection = sel.value;
  if (!selection.length) return meshStats(editor.model.root);
  const parts: MeshStats[] = [];
  const faces = selection.filter(entityRef => entityRef.kind === 'face'), edges = selection.filter(entityRef => entityRef.kind === 'edge');
  for (const entityRef of selection.filter(entityRef => entityRef.kind === 'instance')) { const instance = editor.entities.instances.get(entityRef.id); if (instance) parts.push(meshStats(instance.definition.entities)); }
  if (faces.length || edges.length) {
    const verts = new Set<number>(); let tris = 0;
    for (const entityRef of faces) { const face = editor.entities.faces.get(entityRef.id); if (!face) continue; [...face.outer, ...face.holes.flat()].forEach(vertex => verts.add(vertex)); tris += editor.entities.faceTriangles(face).length / 3; }
    for (const entityRef of edges) { const edge = editor.entities.edges.get(entityRef.id); if (edge) { verts.add(edge.start); verts.add(edge.end); } }
    parts.push({ vertices: verts.size, edges: edges.length, faces: faces.length, triangles: tris, softEdges: edges.filter(entityRef => editor.entities.edges.get(entityRef.id)?.soft).length });
  }
  return sumStats(parts);
});

const res = useModel(() => {
  
  if (inst.value) {
    const resolution = resolutionOf(inst.value); if (!resolution) return null;
    return { ...resolution, unit: resolution.option, presets: resolution.option === 'Seiten' ? [3, 4, 5, 6, 8, 12] : [8, 12, 16, 24, 32, 48, 64], hint: 'Das Objekt wird mit der neuen Auflösung exakt neu berechnet.' };
  }
  if (face.value) {
    const circle = detectCircle(editor.entities, face.value); if (!circle) return null;
    return { value: circle.segments, min: 3, label: 'Kreis', unit: 'Segmente', presets: [6, 8, 12, 16, 24, 32, 48, 64], hint: 'Geht, solange der Kreis noch flach ist – vor Drücken/Ziehen einstellen.' };
  }
  return null;
});
const draft = ref(24);
watch(res, resolution => { if (resolution) draft.value = resolution.value; }, { immediate: true });
const step = (value: number) => (value < 12 ? 1 : value < 32 ? 4 : 8);

const applyRes = (value: number) => {
  if (!res.value || !Number.isFinite(value)) return;
  const segments = Math.max(res.value.min, Math.min(256, Math.round(value)));
  if (segments === res.value.value) return;
  if (inst.value) setResolution(editor, inst.value, segments);
  else if (face.value) setCircleSegments(editor, editor.entities, face.value, segments);
};
const more = (round: boolean) => { if (!inst.value) return; const err = subdivideInstance(editor, inst.value, round); editor.toast(err ?? 'Mehr Polygone – Strg+Z macht es rückgängig'); };
const less = async () => { if (!inst.value) return; const err = await simplifyInstance(editor, inst.value, keep.value / 100); editor.toast(err ?? 'Weniger Polygone – Strg+Z macht es rückgängig'); };
</script>
