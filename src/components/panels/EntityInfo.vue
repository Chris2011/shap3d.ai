<template>
  <div v-if="info.kind === 'none'">
    <div class="mt-1 mb-2.5 font-semibold">Keine Auswahl</div>
    <div class="s3d-row"><span class="s3d-label">Modell</span><span>{{ ed.model.name }}</span></div>
    <div class="s3d-row"><span class="s3d-label">Flächen</span><span>{{ stats.faces }}</span></div>
    <div class="s3d-row"><span class="s3d-label">Kanten</span><span>{{ stats.edges }}</span></div>
    <div class="s3d-row"><span class="s3d-label">Komponenten</span><span>{{ ed.model.definitions.size }}</span></div>
  </div>
  <div v-else>
    <div class="mt-1 mb-2.5 font-semibold">{{ info.title }}</div>
    <!-- material -->
    <div v-if="info.kind !== 'edge'" class="s3d-row">
      <span class="s3d-label">Material</span>
      <div class="size-6.5 flex-none rounded-[3px] border border-line-2" :style="{ background: info.matColor }" :title="info.material ?? 'Standard'"></div>
      <span class="flex-1 truncate text-xs">{{ info.material ?? 'Standard' }}</span>
      <button class="s3d-btn small" title="Aktuelles Material zuweisen" @click="assign('material', ed.ui.currentMaterial ?? undefined)">Zuweisen</button>
    </div>
    <div v-if="info.kind === 'face'" class="s3d-row">
      <span class="s3d-label">Rückseite</span>
      <div class="size-6.5 flex-none rounded-[3px] border border-line-2" :style="{ background: info.backColor }"></div>
      <span class="flex-1 truncate text-xs">{{ info.back ?? 'Standard' }}</span>
      <button class="s3d-btn small" @click="assign('backMaterial', ed.ui.currentMaterial ?? undefined)">Zuweisen</button>
    </div>
    <div class="s3d-row">
      <span class="s3d-label">Tag</span>
      <select class="s3d-input" :value="info.tag ?? 'Untagged'" @change="setTag(($event.target as HTMLSelectElement).value)">
        <option v-for="t in ed.model.tags" :key="t.name" :value="t.name">{{ t.name === 'Untagged' ? 'Ohne Tag' : t.name }}</option>
      </select>
    </div>
    <template v-if="info.kind === 'instance'">
      <div class="s3d-row"><span class="s3d-label">Instanz</span><input class="s3d-input" :value="info.name" @change="setName(($event.target as HTMLInputElement).value)" /></div>
      <div class="s3d-row"><span class="s3d-label">Definition</span><input class="s3d-input" :value="info.defName" @change="setDefName(($event.target as HTMLInputElement).value)" /></div>
      <div class="s3d-row"><span class="s3d-label">Typ</span><span>{{ info.isComponent ? `Komponente (${info.count} Kopien)` : 'Gruppe' }}</span></div>
      <div class="s3d-row"><span class="s3d-label">Position</span>
        <input v-for="(c, i) in info.pos" :key="i" class="s3d-input w-1/3 px-1 text-xs" :value="fmtNum(Number(c))" @change="setPos(Number(i), ($event.target as HTMLInputElement).value)" />
      </div>
      <div class="s3d-row"><span class="s3d-label">Größe</span><span>{{ info.size }}</span></div>
      <div class="s3d-row" v-if="info.volume"><span class="s3d-label">Volumen</span><span>{{ info.volume }}</span></div>
      <label class="s3d-check"><input type="checkbox" :checked="info.locked" @change="toggle('locked')" /> Gesperrt</label>
    </template>
    <template v-if="info.kind === 'face'">
      <div class="s3d-row"><span class="s3d-label">Fläche</span><span>{{ info.area }}</span></div>
    </template>
    <template v-if="info.kind === 'edge'">
      <div class="s3d-row"><span class="s3d-label">Länge</span><span>{{ info.length }}</span></div>
      <label class="s3d-check"><input type="checkbox" :checked="info.soft" @change="toggle('soft')" /> Abgemildert</label>
    </template>
    <template v-if="info.kind === 'multi'">
      <div class="s3d-row" v-if="info.area"><span class="s3d-label">Fläche gesamt</span><span>{{ info.area }}</span></div>
      <div class="s3d-row" v-if="info.length"><span class="s3d-label">Länge gesamt</span><span>{{ info.length }}</span></div>
    </template>
    <label class="s3d-check"><input type="checkbox" :checked="info.hidden" @change="toggle('hidden')" /> Ausgeblendet</label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import * as THREE from 'three';
import { useEditor } from '../keys';
import type { EntityRef } from '../../core/model';
import { parseLength } from '../../core/units';
import { isSolid, volume } from '../../core/solids';

const ed = useEditor();
const stats = computed(() => { void ed.ui.rev; return ed.model.root.stats(); });
const col = (n?: string, fb = '#ffffff') => ed.model.material(n)?.color ?? fb;
const fmtNum = (v: number) => ed.fmt(v);
const fmtVol = (v: number) => { const u = ed.model.settings.units; return u === 'mm' ? `${(v * 1e9).toFixed(0)} mm³` : u === 'cm' ? `${(v * 1e6).toFixed(1).replace('.', ',')} cm³` : `${v.toFixed(3).replace('.', ',')} m³`; };

const info = computed<any>(() => {
  void ed.ui.selRev; void ed.ui.rev;
  const s = ed.selected(); const E = ed.entities; const st = ed.model.settings.style;
  if (!s.length) return { kind: 'none' };
  if (s.length === 1) {
    const r = s[0];
    if (r.kind === 'face') { const f = E.faces.get(r.id)!; return { kind: 'face', title: 'Fläche', material: f.material, matColor: col(f.material, st.frontColor), back: f.backMaterial, backColor: col(f.backMaterial, st.backColor), tag: f.tag, hidden: !!f.hidden, area: ed.fmtArea(E.faceArea(f)) }; }
    if (r.kind === 'edge') { const e = E.edges.get(r.id)!; return { kind: 'edge', title: 'Kante', tag: e.tag, hidden: !!e.hidden, soft: !!e.soft, length: ed.fmt(E.edgeLength(e)) }; }
    const i = E.instances.get(r.id)!;
    const pos = new THREE.Vector3().setFromMatrixPosition(i.matrix);
    const bb = i.def.entities.bounds(new THREE.Box3(), i.matrix.clone()); const sz = bb.getSize(new THREE.Vector3());
    let count = 0; const walk = (e: typeof E) => { for (const x of e.instances.values()) { if (x.def === i.def) count++; walk(x.def.entities); } }; walk(ed.model.root);
    const solid = isSolid(i.def.entities); const vol = solid ? Math.abs(volume(i.def.entities, i.matrix)) : 0;
    return { volume: solid ? fmtVol(vol) : '', kind: 'instance', title: (solid ? 'Volumenkörper-' : '') + (i.def.isComponent ? 'Komponente' : 'Gruppe'), name: i.name, defName: i.def.name, isComponent: i.def.isComponent, count, material: i.material, matColor: col(i.material, '#ffffff'), tag: i.tag, hidden: !!i.hidden, locked: !!i.locked, pos: [pos.x, pos.y, pos.z], size: `${ed.fmt(sz.x)} × ${ed.fmt(sz.y)} × ${ed.fmt(sz.z)}` };
  }
  let area = 0, len = 0; const c = { face: 0, edge: 0, instance: 0 };
  for (const r of s) { c[r.kind]++; if (r.kind === 'face') area += E.faceArea(E.faces.get(r.id)!); if (r.kind === 'edge') len += E.edgeLength(E.edges.get(r.id)!); }
  const first = s.find(r => r.kind === 'face'); const fm = first ? E.faces.get(first.id)!.material : undefined;
  return { kind: 'multi', title: `${s.length} Elemente (${ed.selectionSummary()})`, material: fm, matColor: col(fm, st.frontColor), hidden: false, area: area ? ed.fmtArea(area) : '', length: len ? ed.fmt(len) : '' };
});

function each(fn: (r: EntityRef, E: typeof ed.entities) => void, label: string) { ed.commit(label, () => { for (const r of ed.selected()) fn(r, ed.entities); }); }
function assign(prop: 'material' | 'backMaterial', m?: string) {
  each((r, E) => { if (r.kind === 'face') { const f = E.faces.get(r.id); if (f) (f as any)[prop] = m; } if (r.kind === 'instance' && prop === 'material') { const i = E.instances.get(r.id); if (i) i.material = m; } }, 'Material');
}
function setTag(t: string) {
  const v = t === 'Untagged' ? undefined : t;
  each((r, E) => { const o: any = r.kind === 'face' ? E.faces.get(r.id) : r.kind === 'edge' ? E.edges.get(r.id) : E.instances.get(r.id); if (o) o.tag = v; }, 'Tag');
}
function toggle(p: 'hidden' | 'soft' | 'locked') {
  const val = !info.value[p];
  each((r, E) => {
    if ((p === 'soft' && r.kind !== 'edge') || (p === 'locked' && r.kind !== 'instance')) return;
    const o: any = r.kind === 'face' ? E.faces.get(r.id) : r.kind === 'edge' ? E.edges.get(r.id) : E.instances.get(r.id);
    if (o) o[p] = r.kind === 'instance' ? val : (val || undefined);
  }, p === 'hidden' ? 'Ausblenden' : p === 'soft' ? 'Abmildern' : 'Sperren');
}
function setName(n: string) { each((r, E) => { const i = E.instances.get(r.id); if (i) i.name = n; }, 'Umbenennen'); }
function setDefName(n: string) { each((r, E) => { const i = E.instances.get(r.id); if (i && n.trim()) i.def.name = n.trim(); }, 'Definition umbenennen'); }
function setPos(k: number, v: string) {
  const L = parseLength(v, ed.model.settings.units); if (L == null) return;
  each((r, E) => { const i = E.instances.get(r.id); if (!i) return; const e = i.matrix.elements; e[12 + k] = L; }, 'Position');
}
</script>
