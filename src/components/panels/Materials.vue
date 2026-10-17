<template>
  <div class="mt-1 mb-2.5 flex items-center gap-2.5">
    <div class="size-12 flex-none rounded-[3px] border border-line-2" :style="swStyle(cur)"></div>
    <div>
      <div class="font-semibold">{{ ed.ui.currentMaterial ?? 'Standard' }}</div>
      <div class="s3d-label">Klicken Sie ein Material an, dann auf Flächen (Farbeimer, B).</div>
    </div>
  </div>
  <input v-model="filter" class="s3d-input" placeholder="Materialien durchsuchen" />
  <div class="my-2.5 grid grid-cols-6 gap-1.5">
    <div class="flex aspect-square cursor-pointer items-end justify-center rounded-[3px] border border-line-2 bg-[linear-gradient(135deg,var(--s3d-bg)_50%,#a4b2bf_50%)] text-[9px] text-[#333]" :class="{ [ON]: ed.ui.currentMaterial == null }" title="Standard" @click="choose(null)"><span>Std</span></div>
    <div v-for="m in list" :key="m.name" class="aspect-square cursor-pointer rounded-[3px] border border-line-2" :class="{ [ON]: ed.ui.currentMaterial === m.name }" :style="swStyle(m)" :title="m.name" @click="choose(m.name)"></div>
  </div>

  <template v-if="cur">
    <div class="s3d-section-title">Bearbeiten</div>
    <div class="s3d-row"><span class="s3d-label">Name</span><input class="s3d-input" :value="cur.name" @change="rename(($event.target as HTMLInputElement).value)" /></div>
    <div class="s3d-row"><span class="s3d-label">Farbe</span><input type="color" class="h-7 w-9 flex-none rounded-[3px] border border-edge bg-surface p-px" :value="cur.color" @input="setColor(($event.target as HTMLInputElement).value)" /><input class="s3d-input" :value="cur.color" @change="setColor(($event.target as HTMLInputElement).value)" /></div>
    <div class="s3d-row"><span class="s3d-label">Deckkraft</span><input type="range" min="0.05" max="1" step="0.05" :value="cur.opacity" @input="setOpacity(+($event.target as HTMLInputElement).value)" /><span class="w-10 text-right">{{ Math.round(cur.opacity * 100) }} %</span></div>
    <div class="s3d-row"><span class="s3d-label">Textur</span>
      <select class="s3d-input" :value="cur.texture ?? ''" @change="setTexture(($event.target as HTMLSelectElement).value)">
        <option value="">Keine (nur Farbe)</option>
        <option v-for="(n, k) in TEXTURES" :key="k" :value="k">{{ n }}</option>
      </select>
    </div>
    <div v-if="cur.texture" class="s3d-row"><span class="s3d-label">Größe</span><input class="s3d-input" :value="ed.fmt(cur.textureSize ?? defaultSize(cur.texture))" @change="setTexSize(($event.target as HTMLInputElement).value)" /></div>
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
import { TEXTURES, TEXTURE_SIZE, makeTexture, isTextureKind } from '../../core/textures';
import { parseLength } from '../../core/units';

const ed = useEditor();
const ON = 'outline-2 outline-offset-1 outline-blue';
const filter = ref(''); const newName = ref(''); const newColor = ref('#c08040');
const mats = computed(() => { void ed.ui.rev; return ed.model.materials; });
const list = computed(() => mats.value.filter(m => !filter.value || m.name.toLowerCase().includes(filter.value.toLowerCase())));
const cur = computed(() => { void ed.ui.rev; return ed.model.material(ed.ui.currentMaterial ?? undefined) ?? null; });
const swStyle = (m: MaterialDef | null) => m?.texture && isTextureKind(m.texture) ? { background: `url(${makeTexture(m.texture, m.color).image.toDataURL()}) center/120%` } : m ? { background: m.opacity < 1 ? `linear-gradient(135deg, ${m.color} 50%, ${m.color}66 50%)` : m.color } : { background: 'linear-gradient(135deg,#fff 50%,#a4b2bf 50%)' };
const usage = computed(() => {
  void ed.ui.rev; const n = cur.value?.name; if (!n) return 0; let c = 0; const seen = new Set<Entities>();
  const walk = (e: Entities) => { if (seen.has(e)) return; seen.add(e); for (const f of e.faces.values()) { if (f.material === n) c++; if (f.backMaterial === n) c++; } for (const i of e.instances.values()) { if (i.material === n) c++; walk(i.def.entities); } };
  walk(ed.model.root); return c;
});
function choose(n: string | null) { ed.ui.currentMaterial = n; if (ed.ui.tool !== 'paint') ed.setTool('paint'); else ed.refreshStatus(); }
function change(label: string, fn: () => void) { ed.commit(label, fn); }
function setColor(c: string) { const m = cur.value; if (!m || !/^#[0-9a-f]{6}$/i.test(c)) return; m.color = c; ed.invalidate(); ed.ui.saved = false; }
function setTexture(k: string) { const m = cur.value; if (!m) return; m.texture = k || undefined; m.textureSize = undefined; ed.invalidate(); ed.ui.saved = false; }
function setTexSize(v: string) { const m = cur.value; const L = parseLength(v, ed.model.settings.units); if (!m || L == null || L <= 0) return; m.textureSize = L; ed.invalidate(); ed.ui.saved = false; }
const defaultSize = (k: string) => (TEXTURE_SIZE as Record<string, number>)[k] ?? 1;
function setOpacity(o: number) { const m = cur.value; if (!m) return; m.opacity = o; ed.invalidate(); ed.ui.saved = false; }
function rename(n: string) {
  const m = cur.value; n = n.trim(); if (!m || !n || ed.model.materials.some(x => x.name === n)) return; const old = m.name;
  change('Material umbenennen', () => {
    m.name = n; const seen = new Set<Entities>();
    const walk = (e: Entities) => { if (seen.has(e)) return; seen.add(e); for (const f of e.faces.values()) { if (f.material === old) f.material = n; if (f.backMaterial === old) f.backMaterial = n; } for (const i of e.instances.values()) { if (i.material === old) i.material = n; walk(i.def.entities); } };
    walk(ed.model.root);
  });
  ed.ui.currentMaterial = n;
}
function remove() {
  const m = cur.value; if (!m) return; const old = m.name;
  change('Material löschen', () => {
    ed.model.materials = ed.model.materials.filter(x => x !== m); const seen = new Set<Entities>();
    const walk = (e: Entities) => { if (seen.has(e)) return; seen.add(e); for (const f of e.faces.values()) { if (f.material === old) f.material = undefined; if (f.backMaterial === old) f.backMaterial = undefined; } for (const i of e.instances.values()) { if (i.material === old) i.material = undefined; walk(i.def.entities); } };
    walk(ed.model.root);
  });
  ed.ui.currentMaterial = null;
}
function create() {
  let n = newName.value.trim() || 'Material'; let k = 1; const base = n; while (ed.model.materials.some(x => x.name === n)) n = `${base} ${++k}`;
  change('Material erstellen', () => ed.model.materials.push({ name: n, color: newColor.value, opacity: 1 }));
  newName.value = ''; choose(n);
}
</script>
