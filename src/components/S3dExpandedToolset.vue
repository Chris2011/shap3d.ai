<template>
  <div class="fixed inset-0 z-24" @pointerdown="$emit('close')"></div>
  <div class="s3d-panel absolute top-0 left-13 z-26 max-h-[calc(100vh-7.5rem)] w-53 overflow-auto px-1" @pointerdown.stop>
    <div
      v-for="(group, i) in groups"
      :key="i"
      class="grid grid-cols-[repeat(3,4.25rem)] border-b border-[#d5d7df] py-1.5 last:border-b-0 dark:border-line"
    >
      <button
        v-for="cell in group"
        :key="cell.id"
        class="flex min-h-15.5 flex-col items-center gap-0.5 border-0 px-0.5 pt-2 pb-1 text-center text-[0.625rem]/[1.1] break-words text-ink"
        :class="editor.ui.tool === cell.id ? 'bg-active' : 'hover:bg-hover'"
        :title="cell.title ?? cell.label"
        @click="pick(cell)"
      >
        <S3dIcon :name="cell.icon" />
        <span :class="editor.ui.tool === cell.id ? 'text-navy' : 'text-label'">{{ cell.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dIcon from './S3dIcon.vue';
import { useEditor } from './keys';
import { TOOL_INFO, PLUGIN_TOOLS } from '../engine/setup';
import { runCommand } from '../engine/commands';
import { t } from '../i18n';

const emit = defineEmits<{ (event: 'close'): void }>();
const editor = useEditor();
interface Cell {
  id: string;
  label: string;
  icon: string;
  cmd?: string;
  action?: () => void;
  title?: string;
}
const toolCell = (id: string): Cell => ({
  id,
  label: TOOL_INFO[id].name,
  icon: TOOL_INFO[id].icon,
  title: TOOL_INFO[id].name + (TOOL_INFO[id].key ? ` (${TOOL_INFO[id].key})` : ''),
});
const commandCell = (id: string, labelKey: string, icon: string, cmd: string): Cell => ({ id, label: t(labelKey), icon, cmd });
// same grouping and order as SketchUp Web's expanded toolset
const builtInGroups = (): Cell[][] => [
  [toolCell('lasso'), toolCell('sample')],
  [
    toolCell('circle'),
    toolCell('arc2'),
    toolCell('arc'),
    toolCell('polygon'),
    toolCell('arc3'),
    toolCell('pie'),
    toolCell('freehand'),
    toolCell('rotrect'),
  ],
  [
    toolCell('offset'),
    toolCell('followme'),
    commandCell('flipx', 'undo.flip', 'flip', 'flipX'),
    commandCell('outershell', 'toolbar.outerShell', 'solid', 'solid-outershell'),
    commandCell('sintersect', 'undo.intersect', 'union', 'solid-intersect'),
    commandCell('union', 'commands.solid-union', 'union', 'solid-union'),
    commandCell('subtract', 'toolbar.subtract', 'subtract', 'solid-subtract'),
    commandCell('trim', 'toolbar.trim', 'subtract', 'solid-trim'),
    commandCell('split', 'commands.solid-split', 'solid', 'solid-split'),
  ],
  [
    toolCell('dimension'),
    toolCell('protractor'),
    toolCell('text'),
    toolCell('section'),
    commandCell('makeGroup', 'names.group', 'group', 'makeGroup'),
    commandCell('makeComponent', 'names.component', 'component', 'makeComponent'),
  ],
  [
    toolCell('zoom'),
    commandCell('zoomExtents', 'toolbar.showAll', 'zoomext', 'zoomExtents'),
    toolCell('zoomwindow'),
    toolCell('poscam'),
    toolCell('lookaround'),
    toolCell('walk'),
  ],
];
/** plus a group with the tools of active plugins – updates while the toolset is open (plugin switched on/off, language changed) */
const groups = computed(() => {
  const pluginTools = PLUGIN_TOOLS.filter((id) => editor.hasTool(id) && TOOL_INFO[id]);
  return pluginTools.length ? [...builtInGroups(), pluginTools.map(toolCell)] : builtInGroups();
});
const pick = (cell: Cell) => {
  emit('close');
  if (cell.action) {
    cell.action();
  } else if (cell.cmd) {
    runCommand(editor, cell.cmd);
  } else {
    editor.setTool(cell.id);
  }
};
</script>
