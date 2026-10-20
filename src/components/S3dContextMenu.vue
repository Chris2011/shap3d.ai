<template>
  <div class="fixed inset-0 z-59" @pointerdown="$emit('close')" @contextmenu.prevent="$emit('close')"></div>
  <div class="s3d-menu" :style="style" @pointerdown.stop>
    <template v-for="(item, i) in items" :key="i">
      <div v-if="item.sep" class="s3d-menu-sep"></div>
      <div v-else class="s3d-menu-item relative" @mouseenter="open = item.children ? i : -1" @click="run(item)">
        {{ item.label }}<span v-if="item.sc" class="sc">{{ item.sc }}</span>
        <S3dIcon v-if="item.children" name="chevron" :size="14" class="ms-auto" />
        <div v-if="item.children && open === i" class="s3d-menu -top-1 ms-0.5" :class="subLeft ? 'right-full me-0.5' : 'left-full'">
          <div v-for="(child, j) in item.children" :key="j" class="s3d-menu-item" @click.stop="run(child)">
            {{ child.label }}<span v-if="child.sc" class="sc">{{ child.sc }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import S3dIcon from './S3dIcon.vue';
import { useEditor } from './keys';
import { runCommand } from '../engine/commands';
import { showPanel } from './panelState';
import { CONTEXT_MENU_ENTRIES } from '../plugins/uiExtensions';
import { CODE_FORMATS, codeFromSelection } from '../scripting/codeExport';
import { useScripts } from '../composables/useScripts';
import { t, localize, shortcutLabel } from '../i18n';

const props = defineProps<{ x: number; y: number }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const editor = useEditor();
interface It {
  label?: string;
  cmd?: string;
  fn?: () => void;
  sep?: boolean;
  sc?: string;
  children?: It[];
}
/** index of the item whose submenu is open */
const open = ref(-1);
const scripts = useScripts();

/** "Open as code ▸ JavaScript / JSON / OBJ / …" – the selection (or the whole context) as code in the script editor */
const codeEntry = (label: string): It => ({
  label,
  children: CODE_FORMATS.map((format) => ({
    label: format.label,
    fn: () => {
      try {
        const { code, size } = codeFromSelection(editor, format.id);
        scripts.open({ lang: format.id, code, size });
        showPanel('scripts');
      } catch (error: any) {
        editor.toast(error?.message ?? String(error));
      }
    },
  })),
});

const items = computed<It[]>(() => {
  const selection = editor.selected();
  const out: It[] = [];
  const has = (kind: string) => selection.some((entityRef) => entityRef.kind === kind);
  if (selection.length) {
    out.push({ label: t('panels.entityinfo'), fn: () => showPanel('entityinfo') });
    out.push({ sep: true });
    out.push({ label: t('commands.delete'), cmd: 'delete', sc: shortcutLabel('Del') }, { label: t('commands.hide'), cmd: 'hide' });
    out.push({ sep: true });
    // entries from plugins (e.g. "Gelände bearbeiten")
    const pluginEntries = CONTEXT_MENU_ENTRIES.filter((entry) => !entry.when || entry.when(editor));
    if (pluginEntries.length) {
      out.push(...pluginEntries.map((entry) => ({ label: localize(entry.label), fn: () => entry.run(editor) })), { sep: true });
    }
    if (has('instance')) {
      out.push(
        { label: t('contextMenu.editGroup'), cmd: 'editGroup' },
        { label: t('commands.explode'), cmd: 'explode' },
        { label: t('commands.makeUnique'), cmd: 'makeUnique' },
      );
      out.push({ label: t('commands.lock'), cmd: 'lock' }, { label: t('commands.unlock'), cmd: 'unlock' });
    }
    out.push({ label: t('commands.makeGroup'), cmd: 'makeGroup' }, { label: t('commands.makeComponent'), cmd: 'makeComponent', sc: 'G' });
    if (has('face')) {
      out.push(
        { sep: true },
        { label: t('commands.reverseFaces'), cmd: 'reverseFaces' },
        { label: t('commands.orientFaces'), cmd: 'orientFaces' },
        { label: t('contextMenu.intersect'), cmd: 'intersect' },
      );
    }
    if (has('edge') || has('face')) {
      out.push({ label: t('commands.soften'), cmd: 'soften' }, { label: t('commands.unsoften'), cmd: 'unsoften' });
    }
    out.push(
      { sep: true },
      { label: t('contextMenu.flipRed'), cmd: 'flipX' },
      { label: t('contextMenu.flipGreen'), cmd: 'flipY' },
      { label: t('contextMenu.flipBlue'), cmd: 'flipZ' },
    );
    out.push(
      { sep: true },
      { label: t('commands.zoomSelection'), cmd: 'zoomSelection' },
      { label: t('commands.copy'), cmd: 'copy', sc: shortcutLabel('Ctrl+C') },
      { label: t('commands.cut'), cmd: 'cut', sc: shortcutLabel('Ctrl+X') },
    );
    out.push({ sep: true }, codeEntry(t('contextMenu.openAsCode')));
  } else {
    out.push(
      { label: t('commands.paste'), cmd: 'paste', sc: shortcutLabel('Ctrl+V') },
      { label: t('commands.selectAll'), cmd: 'selectAll', sc: shortcutLabel('Ctrl+A') },
      { label: t('commands.unhideAll'), cmd: 'unhideAll' },
    );
    out.push({ sep: true }, { label: t('commands.zoomExtents'), cmd: 'zoomExtents', sc: shortcutLabel('Shift+Z') });
    out.push({ sep: true }, codeEntry(editor.activePath.length ? t('contextMenu.groupAsCode') : t('contextMenu.modelAsCode')));
  }
  if (editor.activePath.length) {
    out.push({ sep: true }, { label: t('contextMenu.closeGroup'), cmd: 'closeGroup' });
  }
  return out;
});
const style = computed(() => ({
  left: Math.min(props.x, window.innerWidth - 240) + 'px',
  top: Math.min(props.y, window.innerHeight - 30 * items.value.length - 20) + 'px',
  position: 'fixed' as const,
}));
/** submenus open to the left when the menu sits near the right edge */
const subLeft = computed(() => props.x > window.innerWidth - 480);
const run = (item: It) => {
  if (item.children) {
    return;
  }
  emit('close');
  if (item.fn) {
    item.fn();
  } else if (item.cmd) {
    runCommand(editor, item.cmd);
  }
};
</script>
