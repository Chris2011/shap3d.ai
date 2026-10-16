<template>
  <div class="backdrop" @pointerdown="$emit('close')"></div>
  <div class="palette s3d-panel">
    <div class="inp"><Icon name="search" :size="18" /><input ref="inp" v-model="q" placeholder="Werkzeuge und Befehle suchen…" @keydown.down.prevent="sel = Math.min(sel + 1, list.length - 1)" @keydown.up.prevent="sel = Math.max(sel - 1, 0)" @keydown.enter.prevent="run(list[sel])" @keydown.esc="$emit('close')" /></div>
    <div class="list">
      <div v-for="(it, i) in list" :key="it.id" class="row" :class="{ on: i === sel }" @mouseenter="sel = i" @click="run(it)">
        <Icon :name="it.icon" :size="20" /><span>{{ it.label }}</span><span class="grp">{{ it.group }}</span><span class="sc">{{ it.sc }}</span>
      </div>
      <div v-if="!list.length" class="empty">Keine Treffer</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import Icon from './Icon.vue';
import { useEditor } from './keys';
import { TOOL_INFO } from '../engine/setup';
import { COMMANDS, runCommand } from '../engine/commands';
import { showPanel } from './panelState';

const emit = defineEmits<{ (e: 'close'): void }>();
const ed = useEditor(); const q = ref(''); const sel = ref(0); const inp = ref<HTMLInputElement | null>(null);
interface Row { id: string; label: string; icon: string; group: string; sc?: string; run: () => void }
const all: Row[] = [
  ...Object.values(TOOL_INFO).filter(t => t.id !== 'place').map(t => ({ id: 't:' + t.id, label: t.name, icon: t.icon, group: 'Werkzeug', sc: t.key, run: () => ed.setTool(t.id) })),
  { id: 't:text3d', label: '3D-Text', icon: 'text3d', group: 'Werkzeug', run: () => { ed.ui.dialog = { kind: 'text3d' }; } },
  ...COMMANDS.map(c => ({ id: 'c:' + c.id, label: c.label, icon: 'chevron', group: c.group, sc: c.shortcut, run: () => runCommand(ed, c.id) })),
  ...[['entityinfo', 'Elementinformationen'], ['outliner', 'Gliederung'], ['materials', 'Materialien'], ['styles', 'Stile'], ['tags', 'Tags'], ['shadows', 'Schatten'], ['scenes', 'Szenen'], ['display', 'Anzeige'], ['modelinfo', 'Modellinformationen'], ['scripts', 'Skript-Editor'], ['components', 'Komponenten'], ['instructor', 'Kursleiter'], ['soften', 'Abmildern/Glätten']]
    .map(([id, l]) => ({ id: 'p:' + id, label: l, icon: id === 'scripts' ? 'script' : id === 'components' ? 'component' : id, group: 'Panel', run: () => showPanel(id) })),
];
const list = computed(() => { const s = q.value.trim().toLowerCase(); const r = s ? all.filter(x => x.label.toLowerCase().includes(s) || x.group.toLowerCase().includes(s)) : all; return r.slice(0, 60); });
watch(q, () => (sel.value = 0));
function run(it?: Row) { if (!it) return; emit('close'); it.run(); }
onMounted(() => inp.value?.focus());
</script>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 69; background: rgba(0,0,0,.05); }
.palette { position: absolute; left: 56px; top: 56px; width: 420px; z-index: 70; overflow: hidden; }
.inp { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--s3d-line); }
.inp input { flex: 1; border: 0; outline: none; font-size: 14px; }
.list { max-height: 420px; overflow: auto; padding: 4px 0; }
.row { display: flex; align-items: center; gap: 10px; padding: 6px 12px; cursor: pointer; }
.row.on { background: var(--s3d-active); }
.grp { margin-left: auto; color: var(--s3d-text-2); font-size: 11px; }
.sc { color: var(--s3d-text-2); font-size: 11px; min-width: 64px; text-align: right; }
.empty { padding: 12px; color: var(--s3d-text-2); }
</style>
