<template>
  <div class="fixed inset-0 z-55" @pointerdown="$emit('close')"></div>
  <div class="s3d-menu top-11 left-0 z-60 rounded-none" role="menu" @pointerdown.stop>
    <div class="-mt-1 mb-1 flex flex-col items-start gap-1.5 bg-brand-night px-3.5 pt-3 pb-2.5">
      <S3dLogo :size="30" :word-size="18" /><span class="ps-9.75 text-[0.65625rem] tracking-[0.1rem] text-[#7d8794] uppercase">{{
        t('brand.tagline')
      }}</span
      ><span class="-mt-0.75 ps-9.75 text-[0.6875rem] text-brand"
        >{{ t('brand.pronounce', { name: BRAND.pronounced }) }} · {{ BRAND.ipa }}</span
      >
    </div>
    <template v-for="(item, i) in items" :key="i">
      <S3dMenuSeparator v-if="item.sep" />
      <S3dMenuItem
        v-else
        :icon="item.icon"
        icon-space
        :shortcut="item.cmd ? shortcut(item.cmd) : undefined"
        :disabled="!!item.cmd && !enabled(item.cmd)"
        :submenu="!!item.sub"
        @mouseenter="sub = item.sub ? i : -1"
        @click="click(item)"
      >
        {{ t(`menu.${item.label}`) }}
        <template v-if="item.sub && sub === i" #submenu>
          <div class="s3d-menu -top-1 left-full ms-0.5 max-h-[80vh] overflow-auto" role="menu">
            <template v-for="command in subItems(item.sub)" :key="command.id">
              <S3dMenuSeparator v-if="command.separator" />
              <S3dMenuItem
                :checked="!!command.checked?.(editor)"
                :shortcut="command.shortcut"
                :disabled="!!command.enabled && !command.enabled(editor)"
                @click.stop="runIt(command.id)"
                >{{ command.label }}</S3dMenuItem
              >
            </template>
          </div>
        </template>
      </S3dMenuItem>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import S3dMenuItem from './ui/S3dMenuItem.vue';
import S3dMenuSeparator from './ui/S3dMenuSeparator.vue';
import S3dLogo from './S3dLogo.vue';
import { BRAND } from '../brand';
import { useEditor } from './keys';
import { COMMANDS, GROUP_ALIASES, runCommand, findCommand } from '../engine/commands';
import { t } from '../i18n';

const emit = defineEmits<{ (event: 'close'): void }>();
const editor = useEditor();
const sub = ref(-1);
/** label = message `menu.<label>`; sub = command group (plugins may still use the German group names) */
interface Item {
  label?: string;
  icon?: string;
  cmd?: string;
  sub?: string;
  sep?: boolean;
}
const items: Item[] = [
  { label: 'new', icon: 'file', cmd: 'new' },
  { label: 'newTab', icon: 'file', cmd: 'newTab' },
  { label: 'open', icon: 'folder', cmd: 'open' },
  { label: 'saveAs', icon: 'save', cmd: 'save' },
  { label: 'saveLocal', icon: 'save', cmd: 'saveLocal' },
  { label: 'loadLocal', icon: 'folder', cmd: 'loadLocal' },
  { sep: true },
  { label: 'import', icon: 'import', cmd: 'import' },
  { label: 'export', icon: 'export', sub: 'export' },
  { sep: true },
  { label: 'edit', icon: 'select', sub: 'edit' },
  { label: 'view', icon: 'display', sub: 'view' },
  { label: 'camera', icon: 'camera', sub: 'camera' },
  { label: 'solids', icon: 'solid', sub: 'solids' },
  { label: 'plugins', icon: 'plugin', sub: 'plugins' },
  { sep: true },
  { label: 'print', icon: 'print', cmd: 'print' },
  { label: 'commandPalette', icon: 'search', cmd: 'commandPalette' },
  { label: 'tour', icon: 'help', cmd: 'tour' },
];
const subItems = (group: string) => {
  return group === 'export'
    ? COMMANDS.filter((command) => command.id.startsWith('export-'))
    : COMMANDS.filter((command) => (GROUP_ALIASES[command.group] ?? command.group) === group);
};
const enabled = (id: string) => {
  const command = findCommand(id);
  return !command?.enabled || command.enabled(editor);
};
const shortcut = (id: string) => {
  return findCommand(id)?.shortcut;
};
const click = (item: Item) => {
  if (item.cmd) {
    runIt(item.cmd);
  }
};
const runIt = (id: string) => {
  emit('close');
  runCommand(editor, id);
};
</script>
