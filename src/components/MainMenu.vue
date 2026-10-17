<template>
  <div class="fixed inset-0 z-55" @pointerdown="$emit('close')"></div>
  <div class="s3d-menu top-11 left-0 z-60 rounded-none" @pointerdown.stop>
    <div class="-mt-1 mb-1 flex flex-col items-start gap-1.5 bg-brand-night px-3.5 pt-3 pb-2.5"><Logo :size="30" :word-size="18" /><span class="pl-[39px] text-[10.5px] tracking-[1.6px] text-[#7d8794] uppercase">{{ BRAND.tagline }}</span><span class="-mt-[3px] pl-[39px] text-[11px] text-brand">sprich „{{ BRAND.pronounced }}“ · {{ BRAND.ipa }}</span></div>
    <template v-for="(it, i) in items" :key="i">
      <div v-if="it.sep" class="s3d-menu-sep"></div>
      <div v-else class="s3d-menu-item relative" :class="{ disabled: it.cmd && !enabled(it.cmd) }" @mouseenter="sub = it.sub ? i : -1" @click="click(it)">
        <Icon v-if="it.icon" :name="it.icon" :size="18" />
        <span v-else class="w-[18px]"></span>
        {{ it.label }}
        <span v-if="it.cmd && shortcut(it.cmd)" class="sc">{{ shortcut(it.cmd) }}</span>
        <Icon v-if="it.sub" name="chevron" :size="14" class="ml-auto" />
        <div v-if="it.sub && sub === i" class="s3d-menu -top-1 left-full ml-0.5 max-h-[80vh] overflow-auto">
          <div v-for="c in subItems(it.sub)" :key="c.id" class="s3d-menu-item" :class="{ disabled: c.enabled && !c.enabled(ed) }" @click.stop="runIt(c.id)">
            <span class="inline-block w-3.5 font-bold text-blue">{{ c.checked && c.checked(ed) ? '✓' : '' }}</span>{{ c.label }}<span v-if="c.shortcut" class="sc">{{ c.shortcut }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Icon from './Icon.vue';
import Logo from './Logo.vue';
import { BRAND } from '../brand';
import { useEditor } from './keys';
import { COMMANDS, runCommand, findCommand } from '../engine/commands';

const emit = defineEmits<{ (e: 'close'): void }>();
const ed = useEditor();
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
function subItems(g: string) { return g === 'export' ? COMMANDS.filter(c => c.id.startsWith('export-')) : COMMANDS.filter(c => c.group === g); }
function enabled(id: string) { const c = findCommand(id); return !c?.enabled || c.enabled(ed); }
function shortcut(id: string) { return findCommand(id)?.shortcut; }
function click(it: Item) { if (it.cmd) runIt(it.cmd); }
function runIt(id: string) { emit('close'); runCommand(ed, id); }
</script>
