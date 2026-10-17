<template>
  <div class="fixed inset-0 z-24" @pointerdown="$emit('close')"></div>
  <div class="s3d-panel absolute top-0 left-13 z-26 max-h-[calc(100vh-120px)] w-53 overflow-auto px-1" @pointerdown.stop>
    <div v-for="(g, i) in groups" :key="i" class="grid grid-cols-[repeat(3,68px)] border-b border-[#d5d7df] py-1.5 last:border-b-0 dark:border-line">
      <button v-for="it in g" :key="it.id" class="flex min-h-[62px] flex-col items-center gap-0.5 border-0 px-0.5 pt-2 pb-1 text-center text-[10px]/[1.1] break-words text-ink" :class="ed.ui.tool === it.id ? 'bg-active' : 'hover:bg-hover'" :title="it.title ?? it.label" @click="pick(it)">
        <Icon :name="it.icon" />
        <span :class="ed.ui.tool === it.id ? 'text-navy' : 'text-label'">{{ it.label }}</span>
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
