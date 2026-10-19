<template>
  <div class="fixed inset-0 z-59" @pointerdown="$emit('close')" @contextmenu.prevent="$emit('close')"></div>
  <div class="s3d-menu" :style="style" @pointerdown.stop>
    <template v-for="(item, i) in items" :key="i">
      <div v-if="item.sep" class="s3d-menu-sep"></div>
      <div v-else class="s3d-menu-item" @click="run(item)">{{ item.label }}<span v-if="item.sc" class="sc">{{ item.sc }}</span></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditor } from './keys';
import { runCommand } from '../engine/commands';
import { showPanel } from './panelState';
import { CONTEXT_MENU_ENTRIES } from '../plugins/uiExtensions';

const props = defineProps<{ x: number; y: number }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const editor = useEditor();
interface It { label?: string; cmd?: string; fn?: () => void; sep?: boolean; sc?: string }

const items = computed<It[]>(() => {
  const selection = editor.selected(); const out: It[] = [];
  const has = (kind: string) => selection.some(entityRef => entityRef.kind === kind);
  if (selection.length) {
    out.push({ label: 'Elementinformationen', fn: () => showPanel('entityinfo') });
    out.push({ sep: true });
    out.push({ label: 'Löschen', cmd: 'delete', sc: 'Entf' }, { label: 'Ausblenden', cmd: 'hide' });
    out.push({ sep: true });
    // entries from plugins (e.g. "Gelände bearbeiten")
    const pluginEntries = CONTEXT_MENU_ENTRIES.filter(entry => !entry.when || entry.when(editor));
    if (pluginEntries.length) out.push(...pluginEntries.map(entry => ({ label: entry.label, fn: () => entry.run(editor) })), { sep: true });
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
  if (editor.activePath.length) out.push({ sep: true }, { label: 'Gruppe schließen', cmd: 'closeGroup' });
  return out;
});
const style = computed(() => ({ left: Math.min(props.x, window.innerWidth - 240) + 'px', top: Math.min(props.y, window.innerHeight - 30 * items.value.length - 20) + 'px', position: 'fixed' as const }));
const run = (item: It) => { emit('close'); if (item.fn) item.fn(); else if (item.cmd) runCommand(editor, item.cmd); };
</script>
