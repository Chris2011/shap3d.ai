<template>
  <div class="mt-1 mb-2.5 flex items-center gap-2.5">
    <div class="size-12 flex-none rounded-[3px] border border-line-2" :style="swatchStyle(cur)"></div>
    <div>
      <div class="font-semibold">{{ editor.ui.currentMaterial ?? 'Standard' }}</div>
      <div class="s3d-label">Klicken Sie ein Material an, dann auf Flächen (Farbeimer, B).</div>
    </div>
  </div>
  <input v-model="filter" class="s3d-input" placeholder="Materialien durchsuchen" />
  <div class="my-2.5 grid grid-cols-[repeat(6,1fr)] gap-1.5">
    <div class="flex aspect-square cursor-pointer items-end justify-center rounded-[3px] border border-line-2 bg-[linear-gradient(135deg,var(--s3d-bg)_50%,#a4b2bf_50%)] text-[0.5625rem] text-[#333]" :class="{ [SELECTED_OUTLINE]: editor.ui.currentMaterial == null }" title="Standard" @click="choose(null)"><span>Std</span></div>
    <div v-for="material in list" :key="material.name" class="aspect-square cursor-pointer rounded-[3px] border border-line-2" :class="{ [SELECTED_OUTLINE]: editor.ui.currentMaterial === material.name }" :style="swatchStyle(material)" :title="material.name" @click="choose(material.name)"></div>
  </div>

  <template v-if="cur">
    <div class="s3d-section-title">Bearbeiten</div>
    <div class="s3d-row"><span class="s3d-label">Name</span><input class="s3d-input" :value="cur.name" @change="rename(($event.target as HTMLInputElement).value)" /></div>
    <div class="s3d-row"><span class="s3d-label">Farbe</span><input type="color" class="h-7 w-9 flex-none rounded-[3px] border border-edge bg-surface p-px" :value="cur.color" @input="setColor(($event.target as HTMLInputElement).value)" /><input class="s3d-input" :value="cur.color" @change="setColor(($event.target as HTMLInputElement).value)" /></div>
    <div class="s3d-row"><span class="s3d-label">Deckkraft</span><input type="range" min="0.05" max="1" step="0.05" :value="cur.opacity" @input="setOpacity(+($event.target as HTMLInputElement).value)" /><span class="w-10 text-right">{{ Math.round(cur.opacity * 100) }} %</span></div>
    <div class="s3d-row"><span class="s3d-label">Textur</span>
      <select class="s3d-input" :value="cur.texture ?? ''" @change="setTexture(($event.target as HTMLSelectElement).value)">
        <option value="">Keine (nur Farbe)</option>
        <option v-for="(label, kind) in TEXTURES" :key="kind" :value="kind">{{ label }}</option>
      </select>
    </div>
    <div v-if="cur.texture" class="s3d-row"><span class="s3d-label">Größe</span><input class="s3d-input" :value="editor.fmt(cur.textureSize ?? defaultSize(cur.texture))" @change="setTexSize(($event.target as HTMLInputElement).value)" /></div>
    <div class="s3d-row"><span class="s3d-label">Verwendet</span><span>{{ usage }}×</span></div>
    <button class="s3d-btn small" @click="remove">Material löschen</button>
  </template>

  <div class="s3d-section-title">Neues Material</div>
  <div class="s3d-row"><input v-model="newName" class="s3d-input" placeholder="Name" /><input v-model="newColor" type="color" class="h-7 w-9 flex-none rounded-[3px] border border-edge bg-surface p-px" /></div>
  <button class="s3d-btn small" @click="create">Erstellen</button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEditor } from '../keys';
import type { MaterialDef } from '../../core/document';
import type { Entities } from '../../core/model';
import { TEXTURES, TEXTURE_SIZE } from '../../core/textures';
import { swatchStyle } from '../../utils/materialSwatch';
import { parseLength } from '../../core/units';
import { useModel } from '../../composables/useModel';

const editor = useEditor();
const SELECTED_OUTLINE = 'outline-2 outline-offset-1 outline-blue';
const filter = ref(''); const newName = ref(''); const newColor = ref('#c08040');
const mats = useModel(() => editor.model.materials);
const list = computed(() => mats.value.filter(material => !filter.value || material.name.toLowerCase().includes(filter.value.toLowerCase())));
const cur = useModel(() => editor.model.material(editor.ui.currentMaterial ?? undefined) ?? null);
const usage = useModel(() => {
  const name = cur.value?.name; if (!name) return 0; let count = 0; const seen = new Set<Entities>();
  const walk = (entities: Entities) => { if (seen.has(entities)) return; seen.add(entities); for (const face of entities.faces.values()) { if (face.material === name) count++; if (face.backMaterial === name) count++; } for (const instance of entities.instances.values()) { if (instance.material === name) count++; walk(instance.definition.entities); } };
  walk(editor.model.root); return count;
});
const choose = (name: string | null) => { editor.ui.currentMaterial = name; if (editor.ui.tool !== 'paint') editor.setTool('paint'); else editor.refreshStatus(); };
const change = (label: string, apply: () => void) => { editor.commit(label, apply); };
const setColor = (color: string) => { const material = cur.value; if (!material || !/^#[0-9a-f]{6}$/i.test(color)) return; material.color = color; editor.invalidate(); editor.ui.saved = false; };
const setTexture = (kind: string) => { const material = cur.value; if (!material) return; material.texture = kind || undefined; material.textureSize = undefined; editor.invalidate(); editor.ui.saved = false; };
const setTexSize = (text: string) => { const material = cur.value; const size = parseLength(text, editor.model.settings.units); if (!material || size == null || size <= 0) return; material.textureSize = size; editor.invalidate(); editor.ui.saved = false; };
const defaultSize = (kind: string) => (TEXTURE_SIZE as Record<string, number>)[kind] ?? 1;
const setOpacity = (opacity: number) => { const material = cur.value; if (!material) return; material.opacity = opacity; editor.invalidate(); editor.ui.saved = false; };
const rename = (name: string) => {
  const material = cur.value; name = name.trim(); if (!material || !name || editor.model.materials.some(other => other.name === name)) return; const old = material.name;
  change('Material umbenennen', () => {
    material.name = name; const seen = new Set<Entities>();
    const walk = (entities: Entities) => { if (seen.has(entities)) return; seen.add(entities); for (const face of entities.faces.values()) { if (face.material === old) face.material = name; if (face.backMaterial === old) face.backMaterial = name; } for (const instance of entities.instances.values()) { if (instance.material === old) instance.material = name; walk(instance.definition.entities); } };
    walk(editor.model.root);
  });
  editor.ui.currentMaterial = name;
};
const remove = () => {
  const material = cur.value; if (!material) return; const old = material.name;
  change('Material löschen', () => {
    editor.model.materials = editor.model.materials.filter(other => other !== material); const seen = new Set<Entities>();
    const walk = (entities: Entities) => { if (seen.has(entities)) return; seen.add(entities); for (const face of entities.faces.values()) { if (face.material === old) face.material = undefined; if (face.backMaterial === old) face.backMaterial = undefined; } for (const instance of entities.instances.values()) { if (instance.material === old) instance.material = undefined; walk(instance.definition.entities); } };
    walk(editor.model.root);
  });
  editor.ui.currentMaterial = null;
};
const create = () => {
  let name = newName.value.trim() || 'Material'; let counter = 1; const base = name; while (editor.model.materials.some(other => other.name === name)) name = `${base} ${++counter}`;
  change('Material erstellen', () => editor.model.materials.push({ name: name, color: newColor.value, opacity: 1 }));
  newName.value = ''; choose(name);
};
</script>
