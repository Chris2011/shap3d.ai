<template>
  <div class="fixed inset-0 z-59" @pointerdown="$emit('close')" @contextmenu.prevent="$emit('close')"></div>
  <div class="s3d-menu" :style="style" @pointerdown.stop>
    <template v-for="(it, i) in items" :key="i">
      <div v-if="it.sep" class="s3d-menu-sep"></div>
      <div v-else class="s3d-menu-item" @click="run(it)">{{ it.label }}<span v-if="it.sc" class="sc">{{ it.sc }}</span></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditor } from './keys';
import { runCommand } from '../engine/commands';
import { showPanel } from './panelState';

const props = defineProps<{ x: number; y: number }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const ed = useEditor();
interface It { label?: string; cmd?: string; fn?: () => void; sep?: boolean; sc?: string }

const items = computed<It[]>(() => {
  const s = ed.selected(); const out: It[] = [];
  const has = (k: string) => s.some(r => r.kind === k);
  if (s.length) {
    out.push({ label: 'Elementinformationen', fn: () => showPanel('entityinfo') });
    out.push({ sep: true });
    out.push({ label: 'Löschen', cmd: 'delete', sc: 'Entf' }, { label: 'Ausblenden', cmd: 'hide' });
    out.push({ sep: true });
    const terrainInst = s.find(r => r.kind === 'instance' && ed.entities.instances.get(r.id)?.def.terrain);
    if (terrainInst) out.push({ label: '⛰ Gelände bearbeiten', cmd: 'terrain' }, { sep: true });
    else if (s.length === 1 && has('face')) out.push({ label: '⛰ Gelände aus Fläche', cmd: 'terrain' }, { sep: true });
    if (has('instance')) {
      out.push({ label: 'Gruppe/Komponente bearbeiten', cmd: 'editGroup' }, { label: 'Auflösen', cmd: 'explode' }, { label: 'Eindeutig machen', cmd: 'makeUnique' });
      out.push({ label: 'Sperren', cmd: 'lock' }, { label: 'Entsperren', cmd: 'unlock' });
    }
    out.push({ label: 'Gruppe erstellen', cmd: 'makeGroup' }, { label: 'Komponente erstellen…', cmd: 'makeComponent', sc: 'G' });
    if (has('face')) out.push({ sep: true }, { label: 'Flächen umkehren', cmd: 'reverseFaces' }, { label: 'Flächen ausrichten', cmd: 'orientFaces' }, { label: 'Flächen verschneiden', cmd: 'intersect' });
    if (has('edge') || has('face')) out.push({ label: 'Kanten abmildern', cmd: 'soften' }, { label: 'Abmilderung aufheben', cmd: 'unsoften' });
    out.push({ sep: true }, { label: 'Spiegeln: Rot', cmd: 'flipX' }, { label: 'Spiegeln: Grün', cmd: 'flipY' }, { label: 'Spiegeln: Blau', cmd: 'flipZ' });
    out.push({ sep: true }, { label: 'Auswahl zoomen', cmd: 'zoomSelection' }, { label: 'Kopieren', cmd: 'copy', sc: 'Strg+C' }, { label: 'Ausschneiden', cmd: 'cut', sc: 'Strg+X' });
  } else {
    out.push({ label: 'Einfügen', cmd: 'paste', sc: 'Strg+V' }, { label: 'Alles auswählen', cmd: 'selectAll', sc: 'Strg+A' }, { label: 'Alle einblenden', cmd: 'unhideAll' });
    out.push({ sep: true }, { label: 'Zoom Grenzen', cmd: 'zoomExtents', sc: 'Umschalt+Z' });
  }
  if (ed.activePath.length) out.push({ sep: true }, { label: 'Gruppe schließen', cmd: 'closeGroup' });
  return out;
});
const style = computed(() => ({ left: Math.min(props.x, window.innerWidth - 240) + 'px', top: Math.min(props.y, window.innerHeight - 30 * items.value.length - 20) + 'px', position: 'fixed' as const }));
function run(it: It) { emit('close'); if (it.fn) it.fn(); else if (it.cmd) runCommand(ed, it.cmd); }
</script>
