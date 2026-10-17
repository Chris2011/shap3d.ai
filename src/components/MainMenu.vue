<template>
  <div class="backdrop" @pointerdown="$emit('close')"></div>
  <div class="s3d-menu main" @pointerdown.stop>
    <div class="brand"><Logo :size="30" :word-size="18" /><span class="tag">{{ BRAND.tagline }}</span><span class="say">sprich „{{ BRAND.pronounced }}“ · {{ BRAND.ipa }}</span></div>
    <template v-for="(it, i) in items" :key="i">
      <div v-if="it.sep" class="s3d-menu-sep"></div>
      <div v-else class="s3d-menu-item" :class="{ disabled: it.cmd && !enabled(it.cmd) }" @mouseenter="sub = it.sub ? i : -1" @click="click(it)">
        <Icon v-if="it.icon" :name="it.icon" :size="18" />
        <span v-else style="width:18px"></span>
        {{ it.label }}
        <span v-if="it.cmd && shortcut(it.cmd)" class="sc">{{ shortcut(it.cmd) }}</span>
        <Icon v-if="it.sub" name="chevron" :size="14" style="margin-left:auto" />
        <div v-if="it.sub && sub === i" class="s3d-menu submenu">
          <div v-for="c in subItems(it.sub)" :key="c.id" class="s3d-menu-item" :class="{ disabled: c.enabled && !c.enabled(ed) }" @click.stop="runIt(c.id)">
            <span class="check">{{ c.checked && c.checked(ed) ? '✓' : '' }}</span>{{ c.label }}<span v-if="c.shortcut" class="sc">{{ c.shortcut }}</span>
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

<style scoped>
.brand { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px 14px 10px; margin: -4px 0 4px; background: #0b0f14; }
.brand .tag { font-size: 10.5px; letter-spacing: 1.6px; text-transform: uppercase; color: #7d8794; padding-left: 39px; }
.brand .say { font-size: 11px; color: #5fd4e6; padding-left: 39px; margin-top: -3px; }
.backdrop { position: fixed; inset: 0; z-index: 55; }
.main { top: 44px; left: 0; z-index: 60; border-radius: 0; }
.submenu { left: 100%; top: -4px; margin-left: 2px; max-height: 80vh; overflow: auto; }
.s3d-menu-item { position: relative; }
.check { width: 14px; display: inline-block; color: var(--s3d-blue); font-weight: 700; }
</style>
