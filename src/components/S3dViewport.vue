<template>
  <div ref="wrap" class="absolute touch-none overflow-hidden bg-[#dfe8f0]" :style="{ cursor }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointerleave="leave" @dblclick="dbl" @wheel.prevent="wheel">
    <canvas ref="gl" class="absolute inset-0 block size-full"></canvas>
    <canvas ref="ov" class="pointer-events-none absolute inset-0 block size-full"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useResizeObserver, useIntervalFn } from '@vueuse/core';
import { useEditor } from './keys';
import type { PEvt } from '../engine/editor';
import { addScaleFigure } from '../engine/defaults';
import { pickRef } from '../tools/select';
import { autosave } from '../engine/defaults';
import { toolCursor } from '../engine/cursors';

const emit = defineEmits<{ (e: 'context', p: { x: number; y: number }): void }>();
const ed = useEditor();
const wrap = ref<HTMLDivElement | null>(null);
const gl = ref<HTMLCanvasElement | null>(null);
const ov = ref<HTMLCanvasElement | null>(null);
let rightDown: { x: number; y: number } | null = null;

// middle mouse navigation temporarily shows the orbit/pan cursor like SketchUp
const nav = ref<'orbit' | 'pan' | null>(null);
const cursor = computed(() => toolCursor(nav.value ?? ed.ui.tool));

function evt(e: PointerEvent | MouseEvent): PEvt {
  const r = wrap.value!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, detail: e.detail };
}
function down(e: PointerEvent) {
  (document.activeElement as HTMLElement)?.blur?.();
  wrap.value!.setPointerCapture(e.pointerId);
  if (e.button === 2) { rightDown = { x: e.clientX, y: e.clientY }; return; }
  if (e.button === 1) { e.preventDefault(); nav.value = e.shiftKey ? 'pan' : 'orbit'; }
  ed.pointerDown(evt(e));
}
function move(e: PointerEvent) { ed.pointerMove(evt(e)); }
function up(e: PointerEvent) {
  wrap.value!.releasePointerCapture(e.pointerId);
  if (e.button === 1) nav.value = null;
  if (e.button === 2) {
    if (rightDown && Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y) < 5) {
      // right click selects the entity under the cursor if it isn't selected yet (like SketchUp)
      const p = evt(e); const { ref: r } = pickRef(ed, p.x, p.y); if (r && !ed.selection.has(ed.key(r))) ed.select([r]);
      emit('context', { x: e.clientX, y: e.clientY });
    }
    rightDown = null; return;
  }
  ed.pointerUp(evt(e));
}
function leave() { ed.mouse.inside = false; ed.setHover(null); ed.redraw(); }
function dbl(e: MouseEvent) { ed.dblClick(evt(e)); }
function wheel(e: WheelEvent) { const p = evt(e); ed.wheel(p.x, p.y, { dx: e.deltaX, dy: e.deltaY, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, mode: e.deltaMode }); }

onMounted(() => {
  ed.attach(gl.value!, ov.value!);
  resize();
  // restore the last session or start with SketchUp's default scene
  let restored = false;
  try { const s = localStorage.getItem('s3d:autosave'); if (s) { const j = JSON.parse(s); if (j?._dirty) { ed.loadJSON(j); restored = true; ed.ui.saved = false; ed.toast('Letztes Modell wiederhergestellt'); } } } catch { /* ignore broken autosave */ }
  if (!restored) { addScaleFigure(ed); ed.resetHistory(); ed.ui.saved = true; }
});
onUnmounted(() => ed.viewer?.dispose());

function resize() {
  if (!wrap.value || !ed.viewer) return;
  const r = wrap.value.getBoundingClientRect(); ed.viewer.resize(Math.max(1, r.width), Math.max(1, r.height));
}
useResizeObserver(wrap, resize);
useIntervalFn(() => autosave(ed), 15000); // autosave every 15 s (and on unload, see App.vue)
</script>
