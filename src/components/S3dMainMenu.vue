<template>
  <div class="fixed inset-0 z-55" @pointerdown="$emit('close')"></div>
  <div class="s3d-menu top-11 left-0 z-60 rounded-none" @pointerdown.stop>
    <div class="-mt-1 mb-1 flex flex-col items-start gap-1.5 bg-brand-night px-3.5 pt-3 pb-2.5"><S3dLogo :size="30" :word-size="18" /><span class="pl-9.75 text-[0.65625rem] tracking-[0.1rem] text-[#7d8794] uppercase">{{ BRAND.tagline }}</span><span class="-mt-0.75 pl-9.75 text-[0.6875rem] text-brand">sprich „{{ BRAND.pronounced }}“ · {{ BRAND.ipa }}</span></div>
    <template v-for="(item, i) in items" :key="i">
      <div v-if="item.sep" class="s3d-menu-sep"></div>
      <div v-else class="s3d-menu-item relative" :class="{ disabled: item.cmd && !enabled(item.cmd) }" @mouseenter="sub = item.sub ? i : -1" @click="click(item)">
        <S3dIcon v-if="item.icon" :name="item.icon" :size="18" />
        <span v-else class="w-4.5"></span>
        {{ item.label }}
        <span v-if="item.cmd && shortcut(item.cmd)" class="sc">{{ shortcut(item.cmd) }}</span>
        <S3dIcon v-if="item.sub" name="chevron" :size="14" class="ml-auto" />
        <div v-if="item.sub && sub === i" class="s3d-menu -top-1 left-full ml-0.5 max-h-[80vh] overflow-auto">
          <div v-for="command in subItems(item.sub)" :key="command.id" class="s3d-menu-item" :class="{ disabled: command.enabled && !command.enabled(editor) }" @click.stop="runIt(command.id)">
            <span class="inline-block w-3.5 font-bold text-blue">{{ command.checked && command.checked(editor) ? '✓' : '' }}</span>{{ command.label }}<span v-if="command.shortcut" class="sc">{{ command.shortcut }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import S3dIcon from './S3dIcon.vue';
import S3dLogo from './S3dLogo.vue';
import { BRAND } from '../brand';
import { useEditor } from './keys';
import { COMMANDS, runCommand, findCommand } from '../engine/commands';

const emit = defineEmits<{ (event: 'close'): void }>();
const editor = useEditor();
const sub = ref(-1);
interface Item { label?: string; icon?: string; cmd?: string; sub?: string; sep?: boolean }
const items: Item[] = [
  { label: 'Neu', icon: 'file', cmd: 'new' },
  { label: 'Öffnen…', icon: 'folder', cmd: 'open' },
  { label: 'Speichern unter (Download)', icon: 'save', cmd: 'save' },
  { label: 'Im Browser speichern', icon: 'save', cmd: 'saveLocal' },
  { label: 'Aus Browser laden', icon: 'folder', cmd: 'loadLocal' },
  { sep: true },
  { label: 'Importieren…', icon: 'import', cmd: 'import' },
  { label: 'Exportieren', icon: 'export', sub: 'export' },
  { sep: true },
  { label: 'Bearbeiten', icon: 'select', sub: 'Bearbeiten' },
  { label: 'Ansicht', icon: 'display', sub: 'Ansicht' },
  { label: 'Kamera', icon: 'camera', sub: 'Kamera' },
  { label: 'Volumenkörper', icon: 'solid', sub: 'Volumenkörper' },
  { sep: true },
  { label: 'Drucken', icon: 'print', cmd: 'print' },
  { label: 'Befehlspalette…', icon: 'search', cmd: 'commandPalette' },
  { label: 'Einführung', icon: 'help', cmd: 'tour' },
];
const subItems = (group: string) => { return group === 'export' ? COMMANDS.filter(command => command.id.startsWith('export-')) : COMMANDS.filter(command => command.group === group); };
const enabled = (id: string) => { const command = findCommand(id); return !command?.enabled || command.enabled(editor); };
const shortcut = (id: string) => { return findCommand(id)?.shortcut; };
const click = (item: Item) => { if (item.cmd) runIt(item.cmd); };
const runIt = (id: string) => { emit('close'); runCommand(editor, id); };
</script>
