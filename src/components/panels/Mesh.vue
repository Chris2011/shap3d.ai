<template>
  <div class="mesh">
    <label class="row sw">
      <span>Polygonansicht</span>
      <button class="switch" role="switch" :aria-checked="meshView.on" :class="{ on: meshView.on }" @click="meshView.on = !meshView.on; redraw()"><span></span></button>
    </label>
    <div class="opts" :class="{ dim: !meshView.on }">
      <label class="s3d-check"><input v-model="meshView.points" type="checkbox" :disabled="!meshView.on" @change="redraw()" /> <i class="dot"></i> Eckpunkte</label>
      <label class="s3d-check"><input v-model="meshView.triangles" type="checkbox" :disabled="!meshView.on" @change="redraw()" /> <i class="tri"></i> Dreiecke der Flächen</label>
      <label class="s3d-check"><input v-model="meshView.soft" type="checkbox" :disabled="!meshView.on" @change="redraw()" /> <i class="soft"></i> Weiche Kanten</label>
    </div>

    <div class="sect">{{ scope }}</div>
    <div class="stats">
      <div><b>{{ fmt(stats.vertices) }}</b><span>Eckpunkte</span></div>
      <div><b>{{ fmt(stats.edges) }}</b><span>Kanten<template v-if="stats.softEdges"> ({{ fmt(stats.softEdges) }} weich)</template></span></div>
      <div><b>{{ fmt(stats.faces) }}</b><span>Flächen</span></div>
      <div><b>{{ fmt(stats.triangles) }}</b><span>Dreiecke</span></div>
    </div>

    <!-- exact resolution: parametric shape or flat circle -->
    <template v-if="res">
      <div class="sect">{{ res.label }} – Auflösung</div>
      <div class="resrow">
        <button class="s3d-btn small" title="Weniger" @click="applyRes(res.value - step(res.value))">−</button>
        <input v-model.number="draft" class="s3d-input num" type="number" :min="res.min" max="256" @change="applyRes(draft)" @keydown.enter="applyRes(draft)" />
        <span class="unit">{{ res.unit }}</span>
        <button class="s3d-btn small" title="Mehr" @click="applyRes(res.value + step(res.value))">+</button>
      </div>
      <input v-model.number="draft" class="range" type="range" :min="res.min" max="96" step="1" @change="applyRes(draft)" />
      <div class="presets">
        <button v-for="n in res.presets" :key="n" class="chip" :class="{ on: res.value === n }" @click="applyRes(n)">{{ n }}</button>
      </div>
      <p class="hint">{{ res.hint }}</p>
    </template>

    <!-- any group / component -->
    <template v-if="inst">
      <div class="sect">Polygone ändern</div>
      <div class="moreRow">
        <button class="s3d-btn" title="Jedes Dreieck wird zu vier – die Form bleibt exakt gleich" @click="more(false)">▲ Mehr (Form behalten)</button>
        <button class="s3d-btn" title="Jedes Dreieck wird zu vier, Ecken und Rundungen werden weicher" @click="more(true)">▲ Mehr (abrunden)</button>
      </div>
      <div class="less">
        <button class="s3d-btn" @click="less()">▼ Weniger Polygone</button>
        <label class="keep">auf <input v-model.number="keep" type="range" min="10" max="90" step="5" /> <b>{{ keep }} %</b></label>
      </div>
      <p class="hint">Wirkt auf die oberste Ebene der Gruppe/Komponente{{ inst.def.isComponent ? ' – und damit auf alle Kopien' : '' }}. Rückgängig mit Strg+Z.</p>
    </template>

    <p v-if="!res && !inst" class="hint">Wähle eine Gruppe, Komponente oder einen gezeichneten Kreis aus, um die Polygonzahl zu ändern. Lose Geometrie vorher mit „Gruppe erstellen“ zusammenfassen.</p>
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

<style scoped>
.mesh { font-size: 12.5px; }
.row { display: flex; align-items: center; justify-content: space-between; }
.sw span { font-weight: 700; font-size: 13px; }
.switch { width: 38px; height: 22px; border-radius: 11px; border: 0; background: var(--s3d-line-2); position: relative; cursor: pointer; padding: 0; transition: background .15s; }
.switch span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .3); transition: transform .15s; }
.switch.on { background: var(--s3d-blue); }
.switch.on span { transform: translateX(16px); }
.opts { margin: 6px 0 2px 2px; }
.opts.dim { opacity: .5; }
.opts i { display: inline-block; width: 14px; height: 10px; }
.opts .dot { background: radial-gradient(circle, #0e8ca0 3px, transparent 3.5px); }
.opts .tri { border-bottom: 1.5px solid #0e8ca0; transform: skewY(-25deg); opacity: .6; }
.opts .soft { border-bottom: 1.5px dashed var(--s3d-text-2); }
.sect { font-size: 11px; font-weight: 700; color: var(--s3d-navy); text-transform: uppercase; letter-spacing: .4px; margin: 14px 0 6px; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.stats div { background: var(--s3d-bg-2); border: 1px solid var(--s3d-line); padding: 6px 8px; display: flex; flex-direction: column; }
.stats b { font-size: 16px; font-variant-numeric: tabular-nums; }
.stats span { font-size: 11px; color: var(--s3d-muted); }
.resrow { display: flex; align-items: center; gap: 6px; }
.num { width: 70px; text-align: center; }
.unit { flex: 1; color: var(--s3d-text-2); }
.range { width: 100%; margin: 8px 0 4px; }
.presets { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { border: 1px solid var(--s3d-line-2); background: var(--s3d-bg); color: var(--s3d-text); border-radius: 12px; padding: 1px 9px; cursor: pointer; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.chip:hover { border-color: var(--s3d-navy); }
.chip.on { background: var(--s3d-sel); border-color: var(--s3d-navy); color: var(--s3d-navy); font-weight: 700; }
.moreRow { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.moreRow .s3d-btn { padding: 0 6px; }
.less { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 6px; }
.keep { flex: 1 1 100%; display: flex; align-items: center; gap: 6px; color: var(--s3d-text-2); }
.keep input { flex: 1; min-width: 0; }
.hint { color: var(--s3d-text-2); line-height: 1.45; margin: 8px 0 0; font-size: 11.5px; }
</style>
