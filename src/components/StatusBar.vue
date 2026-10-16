<template>
  <div class="status">
    <button class="s3d-iconbtn sm" title="Hilfe / Tastenkürzel" @click="ed.ui.dialog = { kind: 'help' }"><Icon name="help" :size="18" /></button>
    <span class="dot"></span>
    <div class="devwrap">
      <button class="s3d-iconbtn sm" :class="{ active: devOpen }" :title="'Eingabegerät: ' + (nav.device === 'mouse' ? 'Maus' : 'Trackpad')" @click.stop="devOpen = !devOpen"><Icon :name="nav.device === 'mouse' ? 'mouse' : 'trackpad'" :size="18" /></button>
      <div v-if="devOpen" class="devpop s3d-panel" @click.stop @pointerdown.stop>
        <div class="dt">Eingabegerät</div>
        <div class="seg">
          <button :class="{ on: nav.device === 'mouse' }" @click="nav.device = 'mouse'"><Icon name="mouse" :size="16" /> Maus</button>
          <button :class="{ on: nav.device === 'trackpad' }" @click="nav.device = 'trackpad'"><Icon name="trackpad" :size="16" /> Trackpad</button>
        </div>
        <template v-if="nav.device === 'trackpad'">
          <div class="dt">Wischen mit zwei Fingern</div>
          <div class="seg">
            <button v-for="a in ACTIONS" :key="a" :class="{ on: nav.swipe === a }" @click="nav.swipe = a">{{ ACTION_LABEL[a] }}</button>
          </div>
        </template>
        <table class="map">
          <tr v-for="r in mapping" :key="r[0]"><td><kbd>{{ r[0] }}</kbd></td><td>{{ r[1] }}</td></tr>
        </table>
        <div class="dt">Feineinstellung</div>
        <div v-for="a in ACTIONS" :key="'s' + a" class="srow">
          <span class="sl">{{ ACTION_LABEL[a] }}</span>
          <input type="range" min="0.25" max="3" step="0.05" v-model.number="nav.sensitivity[a]" />
          <label class="inv"><input type="checkbox" v-model="nav.invert[a]" /> umkehren</label>
        </div>
      </div>
    </div>
    <div class="hint" :title="ed.ui.status">{{ ed.ui.status }}</div>
    <div class="sel" v-if="selInfo">{{ selInfo }}</div>
    <div class="vcb">
      <label>{{ ed.ui.vcbLabel || 'Maßangaben' }}</label>
      <input ref="input" v-model="value" class="vcb-input" spellcheck="false" @focus="onFocus" @blur="onBlur" @keydown.enter.prevent="submit" @keydown.esc.prevent="cancel" @keydown.stop />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import Icon from './Icon.vue';
import { nav, wheelAction, ACTION_LABEL, type NavAction } from '../engine/navigation';
import { onMounted, onUnmounted } from 'vue';
import { useEditor } from './keys';

const ed = useEditor();
const devOpen = ref(false);
const ACTIONS: NavAction[] = ['orbit', 'pan', 'zoom'];
const mapping = computed(() => {
  const wheel = nav.device === 'mouse' ? 'Mausrad' : 'Zwei Finger';
  const rows: [string, string][] = [
    [wheel, ACTION_LABEL[wheelAction(false, false)]],
    ['Umschalt + ' + wheel, ACTION_LABEL[wheelAction(true, false)]],
    ['Strg + ' + wheel, ACTION_LABEL[wheelAction(false, true)]],
  ];
  if (nav.device === 'trackpad') rows.push(['Zwei Finger zusammenziehen', 'Zoomen']);
  else rows.push(['Mittlere Taste ziehen', 'Orbit'], ['Umschalt + Mittlere Taste', 'Schwenken']);
  return rows;
});
const closeDev = () => { devOpen.value = false; };
onMounted(() => window.addEventListener('click', closeDev));
onUnmounted(() => window.removeEventListener('click', closeDev));
const input = ref<HTMLInputElement | null>(null);
const value = ref('');
watch(() => ed.ui.vcbValue, v => { if (!ed.ui.vcbEditing) value.value = v; });
const selInfo = computed(() => { void ed.ui.selRev; void ed.ui.rev; return ed.selection.size ? ed.selectionSummary() : ''; });

function onFocus() { ed.ui.vcbEditing = true; }
function onBlur() { ed.ui.vcbEditing = false; value.value = ed.ui.vcbValue; }
function submit() { const v = value.value; ed.ui.vcbEditing = false; input.value?.blur(); ed.submitVcb(v); value.value = ed.ui.vcbValue; }
function cancel() { ed.ui.vcbEditing = false; input.value?.blur(); value.value = ed.ui.vcbValue; }
function focusVcb(initial: string) {
  ed.ui.vcbEditing = true; value.value = initial;
  nextTick(() => { input.value?.focus(); const l = value.value.length; input.value?.setSelectionRange(l, l); });
}
defineExpose({ focusVcb });
</script>

<style scoped>
.status { position: absolute; left: 0; right: 0; bottom: 0; height: var(--s3d-status-h); background: var(--s3d-panel); display: flex; align-items: center; padding: 0 6px; gap: 4px; z-index: 30; font-size: 12px; }
.s3d-iconbtn.sm { width: 26px; height: 26px; }
.dot { width: 1px; height: 16px; background: var(--s3d-border); margin: 0 2px; }
.hint { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--s3d-text); font-size: 13.3px; padding-left: 6px; }
.sel { color: var(--s3d-text-2); white-space: nowrap; padding: 0 12px; }
.vcb { display: flex; align-items: center; gap: 4px; padding-left: 10px; font-size: 13.3px; }
.vcb label { color: var(--s3d-text); white-space: nowrap; }
.vcb-input { width: 160px; height: 22px; border: 1px solid #8e919c; border-radius: 0; padding: 0 4px; outline: none; font-size: 13px; text-align: left; background: var(--s3d-bg); }
.vcb-input:focus { border-color: var(--s3d-blue); }
.devwrap { position: relative; }
.devpop { position: absolute; bottom: 34px; left: 0; width: 300px; padding: 10px 12px; z-index: 50; font-size: 12px; }
.dt { font-weight: 700; color: var(--s3d-navy); letter-spacing: .5px; margin: 8px 0 5px; }
.dt:first-child { margin-top: 0; }
.seg { display: flex; border: 1px solid var(--s3d-line-2); background: var(--s3d-bg); }
.seg button { flex: 1; border: 0; background: transparent; padding: 5px 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 12px; border-right: 1px solid var(--s3d-line-2); }
.seg button:last-child { border-right: 0; }
.seg button.on { background: var(--s3d-active); color: var(--s3d-navy); font-weight: 700; }
.map { width: 100%; margin-top: 8px; border-collapse: collapse; }
.map td { padding: 2px 0; }
kbd { font: 11px Consolas, monospace; background: var(--s3d-bg); border: 1px solid var(--s3d-line-2); padding: 0 5px; white-space: nowrap; }
.srow { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
.sl { width: 64px; }
.srow input[type=range] { flex: 1; }
.inv { display: flex; align-items: center; gap: 3px; white-space: nowrap; }
</style>
