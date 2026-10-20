<template>
  <div
    ref="wrap"
    class="absolute touch-none overflow-hidden bg-[#dfe8f0]"
    :style="{ cursor }"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointerleave="leave"
    @dblclick="dbl"
    @wheel.prevent="wheel"
  >
    <canvas ref="glCanvas" class="absolute inset-0 block size-full"></canvas>
    <canvas ref="overlayCanvas" class="pointer-events-none absolute inset-0 block size-full"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted, computed } from 'vue';
import { useResizeObserver, useIntervalFn } from '@vueuse/core';
import { useEditor } from './keys';
import type { PEvt } from '../engine/editor';
import { addScaleFigure } from '../engine/defaults';
import { pickRef } from '../tools/select';
import { autosave } from '../engine/defaults';
import { toolCursor } from '../engine/cursors';

const emit = defineEmits<{ (event: 'context', position: { x: number; y: number }): void }>();
const editor = useEditor();
const wrap = shallowRef<HTMLDivElement | null>(null);
const glCanvas = shallowRef<HTMLCanvasElement | null>(null);
const overlayCanvas = shallowRef<HTMLCanvasElement | null>(null);
let rightDown: { x: number; y: number } | null = null;

// middle mouse navigation temporarily shows the orbit/pan cursor like SketchUp
const nav = ref<'orbit' | 'pan' | null>(null);
const cursor = computed(() => toolCursor(nav.value ?? editor.ui.tool));

const evt = (event: PointerEvent | MouseEvent): PEvt => {
  const rect = wrap.value!.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    button: event.button,
    shift: event.shiftKey,
    ctrl: event.ctrlKey || event.metaKey,
    alt: event.altKey,
    detail: event.detail,
  };
};
const down = (event: PointerEvent) => {
  (document.activeElement as HTMLElement)?.blur?.();
  wrap.value!.setPointerCapture(event.pointerId);
  if (event.button === 2) {
    rightDown = { x: event.clientX, y: event.clientY };
    return;
  }
  if (event.button === 1) {
    event.preventDefault();
    nav.value = event.shiftKey ? 'pan' : 'orbit';
  }
  editor.pointerDown(evt(event));
};
const move = (event: PointerEvent) => {
  editor.pointerMove(evt(event));
};
const up = (event: PointerEvent) => {
  wrap.value!.releasePointerCapture(event.pointerId);
  if (event.button === 1) {
    nav.value = null;
  }
  if (event.button === 2) {
    if (rightDown && Math.hypot(event.clientX - rightDown.x, event.clientY - rightDown.y) < 5) {
      // right click selects the entity under the cursor if it isn't selected yet (like SketchUp)
      const point = evt(event);
      const { ref: picked } = pickRef(editor, point.x, point.y);
      if (picked && !editor.selection.has(editor.key(picked))) {
        editor.select([picked]);
      }
      emit('context', { x: event.clientX, y: event.clientY });
    }
    rightDown = null;
    return;
  }
  editor.pointerUp(evt(event));
};
const leave = () => {
  editor.mouse.inside = false;
  editor.setHover(null);
  editor.redraw();
};
const dbl = (event: MouseEvent) => {
  editor.dblClick(evt(event));
};
const wheel = (event: WheelEvent) => {
  const point = evt(event);
  editor.wheel(point.x, point.y, {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    shift: event.shiftKey,
    ctrl: event.ctrlKey || event.metaKey,
    mode: event.deltaMode,
  });
};

onMounted(() => {
  editor.attach(glCanvas.value!, overlayCanvas.value!);
  resize();
  // restore the last session or start with SketchUp's default scene
  let restored = false;
  try {
    const saved = localStorage.getItem('s3d:autosave');
    if (saved) {
      const data = JSON.parse(saved);
      if (data?._dirty) {
        editor.loadJSON(data);
        restored = true;
        editor.ui.saved = false;
        editor.toast('Letztes Modell wiederhergestellt');
      }
    }
  } catch {
    /* ignore broken autosave */
  }
  if (!restored) {
    addScaleFigure(editor);
    editor.resetHistory();
    editor.ui.saved = true;
  }
});
onUnmounted(() => editor.viewer?.dispose());

const resize = () => {
  if (!wrap.value || !editor.viewer) {
    return;
  }
  const rect = wrap.value.getBoundingClientRect();
  editor.viewer.resize(Math.max(1, rect.width), Math.max(1, rect.height));
};
useResizeObserver(wrap, resize);
useIntervalFn(() => autosave(editor), 15000); // autosave every 15 s (and on unload, see App.vue)
</script>
