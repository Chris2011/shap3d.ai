<template>
  <div class="absolute inset-x-0 bottom-0 z-30 flex h-status items-center gap-1 bg-panel px-1.5 text-xs">
    <button class="s3d-iconbtn size-6.5" title="Hilfe / Tastenkürzel" @click="ed.ui.dialog = { kind: 'help' }"><Icon name="help" :size="18" /></button>
    <span class="mx-0.5 h-4 w-px bg-edge"></span>
    <div class="relative">
      <button class="s3d-iconbtn size-6.5" :class="{ active: devOpen }" :title="'Eingabegerät: ' + (nav.device === 'mouse' ? 'Maus' : 'Trackpad')" @click.stop="devOpen = !devOpen"><Icon :name="nav.device === 'mouse' ? 'mouse' : 'trackpad'" :size="18" /></button>
      <div v-if="devOpen" class="s3d-panel absolute bottom-8.5 left-0 z-50 w-75 px-3 py-2.5 text-xs" @click.stop @pointerdown.stop>
        <div :class="DT" class="mt-0!">Eingabegerät</div>
        <div class="flex border border-line-2 bg-surface">
          <button :class="[SEG, nav.device === 'mouse' && SEG_ON]" @click="nav.device = 'mouse'"><Icon name="mouse" :size="16" /> Maus</button>
          <button :class="[SEG, nav.device === 'trackpad' && SEG_ON]" @click="nav.device = 'trackpad'"><Icon name="trackpad" :size="16" /> Trackpad</button>
        </div>
        <template v-if="nav.device === 'trackpad'">
          <div :class="DT">Wischen mit zwei Fingern</div>
          <div class="flex border border-line-2 bg-surface">
            <button v-for="a in ACTIONS" :key="a" :class="[SEG, nav.swipe === a && SEG_ON]" @click="nav.swipe = a">{{ ACTION_LABEL[a] }}</button>
          </div>
        </template>
        <table class="mt-2 w-full border-collapse">
          <tr v-for="r in mapping" :key="r[0]"><td class="py-0.5"><kbd class="whitespace-nowrap border border-line-2 bg-surface px-1.25 font-mono text-[0.6875rem]">{{ r[0] }}</kbd></td><td class="py-0.5">{{ r[1] }}</td></tr>
        </table>
        <div :class="DT">Feineinstellung</div>
        <div v-for="a in ACTIONS" :key="'s' + a" class="my-0.75 flex items-center gap-1.5">
          <span class="w-16">{{ ACTION_LABEL[a] }}</span>
          <input class="flex-1" type="range" min="0.25" max="3" step="0.05" v-model.number="nav.sensitivity[a]" />
          <label class="flex items-center gap-0.75 whitespace-nowrap"><input type="checkbox" v-model="nav.invert[a]" /> umkehren</label>
        </div>
      </div>
    </div>
    <div class="min-w-0 flex-1 truncate pl-1.5 text-[0.83125rem] text-ink" :title="ed.ui.status">{{ ed.ui.status }}</div>
    <div v-if="selInfo" class="whitespace-nowrap px-3 text-ink-2">{{ selInfo }}</div>
    <div class="flex items-center gap-1 pl-2.5 text-[0.83125rem]">
      <label class="whitespace-nowrap text-ink">{{ ed.ui.vcbLabel || 'Maßangaben' }}</label>
      <input ref="input" v-model="value" class="h-5.5 w-40 rounded-none border border-[#8e919c] bg-surface px-1 text-left text-[0.8125rem] outline-none focus:border-blue" spellcheck="false" @focus="onFocus" @blur="onBlur" @keydown.enter.prevent="submit" @keydown.esc.prevent="cancel" @keydown.stop />
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
const DT = 'mt-2 mb-1.25 font-bold tracking-[0.03125rem] text-navy';
const SEG = 'flex flex-1 items-center justify-center gap-1.25 border-r border-line-2 bg-transparent px-1 py-1.25 text-xs last:border-r-0';
const SEG_ON = 'bg-active font-bold text-navy';
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
