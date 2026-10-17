<template>
  <div class="text-[12.5px]">
    <label class="flex items-center justify-between">
      <span class="text-[13px] font-bold">Polygonansicht</span>
      <button class="s3d-switch" role="switch" :aria-checked="meshView.on" :class="{ on: meshView.on }" @click="meshView.on = !meshView.on; redraw()"><span></span></button>
    </label>
    <div class="mt-1.5 mb-0.5 ml-0.5" :class="{ 'opacity-50': !meshView.on }">
      <label class="s3d-check"><input v-model="meshView.points" type="checkbox" :disabled="!meshView.on" @change="redraw()" /> <i class="inline-block h-2.5 w-3.5 bg-[radial-gradient(circle,#0e8ca0_3px,transparent_3.5px)]"></i> Eckpunkte</label>
      <label class="s3d-check"><input v-model="meshView.triangles" type="checkbox" :disabled="!meshView.on" @change="redraw()" /> <i class="inline-block h-2.5 w-3.5 -skew-y-[25deg] border-b-[1.5px] border-brand-deep opacity-60"></i> Dreiecke der Flächen</label>
      <label class="s3d-check"><input v-model="meshView.soft" type="checkbox" :disabled="!meshView.on" @change="redraw()" /> <i class="inline-block h-2.5 w-3.5 border-b-[1.5px] border-dashed border-ink-2"></i> Weiche Kanten</label>
    </div>

    <div class="mt-3.5 mb-1.5 text-[11px] font-bold tracking-[.4px] text-navy uppercase">{{ scope }}</div>
    <div class="grid grid-cols-[repeat(2,1fr)] gap-1.5 [&>div]:flex [&>div]:flex-col [&>div]:border [&>div]:border-line [&>div]:bg-surface-2 [&>div]:px-2 [&>div]:py-1.5 [&_b]:text-base [&_b]:tabular-nums [&_span]:text-[11px] [&_span]:text-muted">
      <div><b>{{ fmt(stats.vertices) }}</b><span>Eckpunkte</span></div>
      <div><b>{{ fmt(stats.edges) }}</b><span>Kanten<template v-if="stats.softEdges"> ({{ fmt(stats.softEdges) }} weich)</template></span></div>
      <div><b>{{ fmt(stats.faces) }}</b><span>Flächen</span></div>
      <div><b>{{ fmt(stats.triangles) }}</b><span>Dreiecke</span></div>
    </div>

    <!-- exact resolution: parametric shape or flat circle -->
    <template v-if="res">
      <div class="mt-3.5 mb-1.5 text-[11px] font-bold tracking-[.4px] text-navy uppercase">{{ res.label }} – Auflösung</div>
      <div class="flex items-center gap-1.5">
        <button class="s3d-btn small" title="Weniger" @click="applyRes(res.value - step(res.value))">−</button>
        <input v-model.number="draft" class="s3d-input w-[70px] text-center" type="number" :min="res.min" max="256" @change="applyRes(draft)" @keydown.enter="applyRes(draft)" />
        <span class="flex-1 text-ink-2">{{ res.unit }}</span>
        <button class="s3d-btn small" title="Mehr" @click="applyRes(res.value + step(res.value))">+</button>
      </div>
      <input v-model.number="draft" class="mt-2 mb-1 w-full" type="range" :min="res.min" max="96" step="1" @change="applyRes(draft)" />
      <div class="flex flex-wrap gap-1">
        <button v-for="n in res.presets" :key="n" class="rounded-xl border px-[9px] py-px text-[11.5px] tabular-nums" :class="res.value === n ? 'border-navy bg-sel font-bold text-navy' : 'border-line-2 bg-surface text-ink hover:border-navy'" @click="applyRes(n)">{{ n }}</button>
      </div>
      <p class="mt-2 mb-0 text-[11.5px]/[1.45] text-ink-2">{{ res.hint }}</p>
    </template>

    <!-- any group / component -->
    <template v-if="inst">
      <div class="mt-3.5 mb-1.5 text-[11px] font-bold tracking-[.4px] text-navy uppercase">Polygone ändern</div>
      <div class="grid grid-cols-[repeat(2,1fr)] gap-1.5 [&_.s3d-btn]:px-1.5">
        <button class="s3d-btn" title="Jedes Dreieck wird zu vier – die Form bleibt exakt gleich" @click="more(false)">▲ Mehr (Form behalten)</button>
        <button class="s3d-btn" title="Jedes Dreieck wird zu vier, Ecken und Rundungen werden weicher" @click="more(true)">▲ Mehr (abrunden)</button>
      </div>
      <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <button class="s3d-btn" @click="less()">▼ Weniger Polygone</button>
        <label class="flex flex-[1_1_100%] items-center gap-1.5 text-ink-2">auf <input class="min-w-0 flex-1" v-model.number="keep" type="range" min="10" max="90" step="5" /> <b>{{ keep }} %</b></label>
      </div>
      <p class="mt-2 mb-0 text-[11.5px]/[1.45] text-ink-2">Wirkt auf die oberste Ebene der Gruppe/Komponente{{ inst.def.isComponent ? ' – und damit auf alle Kopien' : '' }}. Rückgängig mit Strg+Z.</p>
    </template>

    <p v-if="!res && !inst" class="mt-2 mb-0 text-[11.5px]/[1.45] text-ink-2">Wähle eine Gruppe, Komponente oder einen gezeichneten Kreis aus, um die Polygonzahl zu ändern. Lose Geometrie vorher mit „Gruppe erstellen“ zusammenfassen.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useEditor } from '../keys';
import { meshView } from '../../engine/meshView';
import { meshStats, sumStats, detectCircle, type MeshStats } from '../../core/meshops';
import { resolutionOf, setResolution, setCircleSegments, subdivideInstance, simplifyInstance } from '../../scripting/reshape';
import type { Instance, Face } from '../../core/model';

const ed = useEditor();
const keep = ref(50);
const redraw = () => ed.invalidate();
const fmt = (n: number) => n.toLocaleString('de-DE');

const sel = computed(() => { void ed.ui.rev; void ed.ui.selRev; return ed.selected(); });
const inst = computed<Instance | null>(() => {
  const s = sel.value; if (s.length !== 1 || s[0].kind !== 'instance') return null;
  return ed.entities.instances.get(s[0].id) ?? null;
});
const face = computed<Face | null>(() => {
  const faces = sel.value.filter(r => r.kind === 'face');
  if (faces.length !== 1 || sel.value.some(r => r.kind === 'instance')) return null;
  return ed.entities.faces.get(faces[0].id) ?? null;
});

const scope = computed(() => (sel.value.length ? 'Auswahl' : 'Ganzes Modell'));
const stats = computed<MeshStats>(() => {
  void ed.ui.rev;
  const s = sel.value;
  if (!s.length) return meshStats(ed.model.root);
  const parts: MeshStats[] = [];
  const faces = s.filter(r => r.kind === 'face'), edges = s.filter(r => r.kind === 'edge');
  for (const r of s.filter(r => r.kind === 'instance')) { const i = ed.entities.instances.get(r.id); if (i) parts.push(meshStats(i.def.entities)); }
  if (faces.length || edges.length) {
    const verts = new Set<number>(); let tris = 0;
    for (const r of faces) { const f = ed.entities.faces.get(r.id); if (!f) continue; [...f.outer, ...f.holes.flat()].forEach(v => verts.add(v)); tris += ed.entities.faceTriangles(f).length / 3; }
    for (const r of edges) { const e = ed.entities.edges.get(r.id); if (e) { verts.add(e.a); verts.add(e.b); } }
    parts.push({ vertices: verts.size, edges: edges.length, faces: faces.length, triangles: tris, softEdges: edges.filter(r => ed.entities.edges.get(r.id)?.soft).length });
  }
  return sumStats(parts);
});

const res = computed(() => {
  void ed.ui.rev; // the model is not reactive – re-read after every change
  if (inst.value) {
    const r = resolutionOf(inst.value); if (!r) return null;
    return { ...r, unit: r.res, presets: r.res === 'Seiten' ? [3, 4, 5, 6, 8, 12] : [8, 12, 16, 24, 32, 48, 64], hint: 'Das Objekt wird mit der neuen Auflösung exakt neu berechnet.' };
  }
  if (face.value) {
    const c = detectCircle(ed.entities, face.value); if (!c) return null;
    return { value: c.segments, min: 3, label: 'Kreis', unit: 'Segmente', presets: [6, 8, 12, 16, 24, 32, 48, 64], hint: 'Geht, solange der Kreis noch flach ist – vor Drücken/Ziehen einstellen.' };
  }
  return null;
});
const draft = ref(24);
watch(res, r => { if (r) draft.value = r.value; }, { immediate: true });
const step = (v: number) => (v < 12 ? 1 : v < 32 ? 4 : 8);

function applyRes(v: number) {
  if (!res.value || !Number.isFinite(v)) return;
  const n = Math.max(res.value.min, Math.min(256, Math.round(v)));
  if (n === res.value.value) return;
  if (inst.value) setResolution(ed, inst.value, n);
  else if (face.value) setCircleSegments(ed, ed.entities, face.value, n);
}
function more(round: boolean) { if (!inst.value) return; const err = subdivideInstance(ed, inst.value, round); ed.toast(err ?? 'Mehr Polygone – Strg+Z macht es rückgängig'); }
async function less() { if (!inst.value) return; const err = await simplifyInstance(ed, inst.value, keep.value / 100); ed.toast(err ?? 'Weniger Polygone – Strg+Z macht es rückgängig'); }
</script>
