<template>
  <div class="backdrop" @pointerdown="$emit('close')"></div>
  <div class="expanded s3d-panel" @pointerdown.stop>
    <div v-for="(g, i) in groups" :key="i" class="grp">
      <button v-for="it in g" :key="it.id" class="cell" :class="{ active: ed.ui.tool === it.id }" :title="it.title ?? it.label" @click="pick(it)">
        <Icon :name="it.icon" />
        <span>{{ it.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from './Icon.vue';
import { useEditor } from './keys';
import { TOOL_INFO } from '../engine/setup';
import { runCommand } from '../engine/commands';

const emit = defineEmits<{ (e: 'close'): void }>();
const ed = useEditor();
interface Cell { id: string; label: string; icon: string; cmd?: string; action?: () => void; title?: string }
const T = (id: string): Cell => ({ id, label: TOOL_INFO[id].name, icon: TOOL_INFO[id].icon, title: TOOL_INFO[id].name + (TOOL_INFO[id].key ? ` (${TOOL_INFO[id].key})` : '') });
const C = (id: string, label: string, icon: string, cmd: string): Cell => ({ id, label, icon, cmd });
// same grouping and order as SketchUp Web's expanded toolset
const groups: Cell[][] = [
  [T('lasso'), T('sample')],
  [T('circle'), T('arc2'), T('arc'), T('polygon'), T('arc3'), T('pie'), T('freehand'), T('rotrect'), { id: 'text3d', label: '3D-Text', icon: 'text3d', action: () => { ed.ui.dialog = { kind: 'text3d' }; } }],
  [T('offset'), T('followme'), T('terrain'), C('flipx', 'Spiegeln', 'flip', 'flipX'), C('outershell', 'Äußere Schale', 'solid', 'solid-outershell'), C('sintersect', 'Verschneiden', 'union', 'solid-intersect'), C('union', 'Vereinigen', 'union', 'solid-union'), C('subtract', 'Entfernen', 'subtract', 'solid-subtract'), C('trim', 'Abschneiden', 'subtract', 'solid-trim'), C('split', 'Teilen', 'solid', 'solid-split')],
  [T('dimension'), T('protractor'), T('text'), T('section'), C('makeGroup', 'Gruppe', 'group', 'makeGroup'), C('makeComponent', 'Komponente', 'component', 'makeComponent')],
  [T('zoom'), C('zoomExtents', 'Alles zeigen', 'zoomext', 'zoomExtents'), T('zoomwindow'), T('poscam'), T('lookaround'), T('walk')],
];
function pick(it: Cell) {
  emit('close');
  if (it.action) it.action();
  else if (it.cmd) runCommand(ed, it.cmd);
  else ed.setTool(it.id);
}
</script>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 24; }
.expanded { position: absolute; left: 52px; top: 0; width: 212px; padding: 0 4px; z-index: 26; max-height: calc(100vh - 120px); overflow: auto; }
.grp { display: grid; grid-template-columns: repeat(3, 68px); padding: 6px 0; border-bottom: 1px solid #d5d7df; }
.grp:last-child { border-bottom: 0; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; background: transparent; padding: 8px 2px 4px; cursor: pointer; color: var(--s3d-text); font-size: 10px; line-height: 1.1; text-align: center; min-height: 62px; word-break: break-word; }
.cell span { color: var(--s3d-gray-label); }
.cell:hover { background: var(--s3d-hover); }
.cell.active { background: var(--s3d-active); }
.cell.active span { color: var(--s3d-navy); }
</style>
