<template>
  <div v-if="info.kind === 'none'">
    <div class="mt-1 mb-2.5 font-semibold">Keine Auswahl</div>
    <div class="s3d-row"><span class="s3d-label">Modell</span><span>{{ editor.model.name }}</span></div>
    <div class="s3d-row"><span class="s3d-label">Flächen</span><span>{{ stats.faces }}</span></div>
    <div class="s3d-row"><span class="s3d-label">Kanten</span><span>{{ stats.edges }}</span></div>
    <div class="s3d-row"><span class="s3d-label">Komponenten</span><span>{{ editor.model.definitions.size }}</span></div>
  </div>
  <div v-else>
    <div class="mt-1 mb-2.5 font-semibold">{{ info.title }}</div>
    <!-- material -->
    <div v-if="info.kind !== 'edge'" class="s3d-row">
      <span class="s3d-label">Material</span>
      <div class="size-6.5 flex-none rounded-[3px] border border-line-2" :style="{ background: info.matColor }" :title="info.material ?? 'Standard'"></div>
      <span class="flex-1 truncate text-xs">{{ info.material ?? 'Standard' }}</span>
      <button class="s3d-btn small" title="Aktuelles Material zuweisen" @click="assign('material', editor.ui.currentMaterial ?? undefined)">Zuweisen</button>
    </div>
    <div v-if="info.kind === 'face'" class="s3d-row">
      <span class="s3d-label">Rückseite</span>
      <div class="size-6.5 flex-none rounded-[3px] border border-line-2" :style="{ background: info.backColor }"></div>
      <span class="flex-1 truncate text-xs">{{ info.back ?? 'Standard' }}</span>
      <button class="s3d-btn small" @click="assign('backMaterial', editor.ui.currentMaterial ?? undefined)">Zuweisen</button>
    </div>
    <div class="s3d-row">
      <span class="s3d-label">Tag</span>
      <select class="s3d-input" :value="info.tag ?? 'Untagged'" @change="setTag(($event.target as HTMLSelectElement).value)">
        <option v-for="tag in editor.model.tags" :key="tag.name" :value="tag.name">{{ tag.name === 'Untagged' ? 'Ohne Tag' : tag.name }}</option>
      </select>
    </div>
    <template v-if="info.kind === 'instance'">
      <div class="s3d-row"><span class="s3d-label">Instanz</span><input class="s3d-input" :value="info.name" @change="setName(($event.target as HTMLInputElement).value)" /></div>
      <div class="s3d-row"><span class="s3d-label">Definition</span><input class="s3d-input" :value="info.defName" @change="setDefName(($event.target as HTMLInputElement).value)" /></div>
      <div class="s3d-row"><span class="s3d-label">Typ</span><span>{{ info.isComponent ? `Komponente (${info.count} Kopien)` : 'Gruppe' }}</span></div>
      <div class="s3d-row"><span class="s3d-label">Position</span>
        <input v-for="(coord, i) in info.pos" :key="i" class="s3d-input w-1/3 px-1 text-xs" :value="fmtNum(Number(coord))" @change="setPos(Number(i), ($event.target as HTMLInputElement).value)" />
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
import * as THREE from 'three';
import { useEditor } from '../keys';
import type { EntityRef } from '../../core/model';
import { parseLength } from '../../core/units';
import { isSolid, volume } from '../../core/solids';
import { useModel, useSelection } from '../../composables/useModel';

const editor = useEditor();
const stats = useModel(() => editor.model.root.stats());
const col = (materialName?: string, fallback = '#ffffff') => editor.model.material(materialName)?.color ?? fallback;
const fmtNum = (value: number) => editor.fmt(value);
const fmtVol = (volume: number) => { const units = editor.model.settings.units; return units === 'mm' ? `${(volume * 1e9).toFixed(0)} mm³` : units === 'cm' ? `${(volume * 1e6).toFixed(1).replace('.', ',')} cm³` : `${volume.toFixed(3).replace('.', ',')} m³`; };

const info = useSelection<any>(() => {
  const selection = editor.selected(); const entities = editor.entities; const style = editor.model.settings.style;
  if (!selection.length) return { kind: 'none' };
  if (selection.length === 1) {
    const single = selection[0];
    if (single.kind === 'face') { const face = entities.faces.get(single.id)!; return { kind: 'face', title: 'Fläche', material: face.material, matColor: col(face.material, style.frontColor), back: face.backMaterial, backColor: col(face.backMaterial, style.backColor), tag: face.tag, hidden: !!face.hidden, area: editor.fmtArea(entities.faceArea(face)) }; }
    if (single.kind === 'edge') { const edge = entities.edges.get(single.id)!; return { kind: 'edge', title: 'Kante', tag: edge.tag, hidden: !!edge.hidden, soft: !!edge.soft, length: editor.fmt(entities.edgeLength(edge)) }; }
    const instance = entities.instances.get(single.id)!;
    const pos = new THREE.Vector3().setFromMatrixPosition(instance.matrix);
    const bounds = instance.def.entities.bounds(new THREE.Box3(), instance.matrix.clone()); const size = bounds.getSize(new THREE.Vector3());
    let count = 0; const walk = (container: typeof entities) => { for (const child of container.instances.values()) { if (child.def === instance.def) count++; walk(child.def.entities); } }; walk(editor.model.root);
    const solid = isSolid(instance.def.entities); const vol = solid ? Math.abs(volume(instance.def.entities, instance.matrix)) : 0;
    return { volume: solid ? fmtVol(vol) : '', kind: 'instance', title: (solid ? 'Volumenkörper-' : '') + (instance.def.isComponent ? 'Komponente' : 'Gruppe'), name: instance.name, defName: instance.def.name, isComponent: instance.def.isComponent, count, material: instance.material, matColor: col(instance.material, '#ffffff'), tag: instance.tag, hidden: !!instance.hidden, locked: !!instance.locked, pos: [pos.x, pos.y, pos.z], size: `${editor.fmt(size.x)} × ${editor.fmt(size.y)} × ${editor.fmt(size.z)}` };
  }
  let area = 0, len = 0; const counts = { face: 0, edge: 0, instance: 0 };
  for (const entityRef of selection) { counts[entityRef.kind]++; if (entityRef.kind === 'face') area += entities.faceArea(entities.faces.get(entityRef.id)!); if (entityRef.kind === 'edge') len += entities.edgeLength(entities.edges.get(entityRef.id)!); }
  const first = selection.find(entityRef => entityRef.kind === 'face'); const firstMaterial = first ? entities.faces.get(first.id)!.material : undefined;
  return { kind: 'multi', title: `${selection.length} Elemente (${editor.selectionSummary()})`, material: firstMaterial, matColor: col(firstMaterial, style.frontColor), hidden: false, area: area ? editor.fmtArea(area) : '', length: len ? editor.fmt(len) : '' };
});

const each = (apply: (entityRef: EntityRef, entities: typeof editor.entities) => void, label: string) => { editor.commit(label, () => { for (const entityRef of editor.selected()) apply(entityRef, editor.entities); }); };
const assign = (prop: 'material' | 'backMaterial', material?: string) => {
  each((entityRef, entities) => { if (entityRef.kind === 'face') { const face = entities.faces.get(entityRef.id); if (face) (face as any)[prop] = material; } if (entityRef.kind === 'instance' && prop === 'material') { const instance = entities.instances.get(entityRef.id); if (instance) instance.material = material; } }, 'Material');
};
const setTag = (tag: string) => {
  const value = tag === 'Untagged' ? undefined : tag;
  each((entityRef, entities) => { const target: any = entityRef.kind === 'face' ? entities.faces.get(entityRef.id) : entityRef.kind === 'edge' ? entities.edges.get(entityRef.id) : entities.instances.get(entityRef.id); if (target) target.tag = value; }, 'Tag');
};
const toggle = (prop: 'hidden' | 'soft' | 'locked') => {
  const val = !info.value[prop];
  each((entityRef, entities) => {
    if ((prop === 'soft' && entityRef.kind !== 'edge') || (prop === 'locked' && entityRef.kind !== 'instance')) return;
    const target: any = entityRef.kind === 'face' ? entities.faces.get(entityRef.id) : entityRef.kind === 'edge' ? entities.edges.get(entityRef.id) : entities.instances.get(entityRef.id);
    if (target) target[prop] = entityRef.kind === 'instance' ? val : (val || undefined);
  }, prop === 'hidden' ? 'Ausblenden' : prop === 'soft' ? 'Abmildern' : 'Sperren');
};
const setName = (name: string) => { each((entityRef, entities) => { const instance = entities.instances.get(entityRef.id); if (instance) instance.name = name; }, 'Umbenennen'); };
const setDefName = (name: string) => { each((entityRef, entities) => { const instance = entities.instances.get(entityRef.id); if (instance && name.trim()) instance.def.name = name.trim(); }, 'Definition umbenennen'); };
const setPos = (axis: number, text: string) => {
  const length = parseLength(text, editor.model.settings.units); if (length == null) return;
  each((entityRef, entities) => { const instance = entities.instances.get(entityRef.id); if (!instance) return; const elements = instance.matrix.elements; elements[12 + axis] = length; }, 'Position');
};
</script>
