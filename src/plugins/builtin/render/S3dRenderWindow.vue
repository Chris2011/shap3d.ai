<template>
  <div
    v-if="renderUi.open"
    ref="panel"
    class="s3d-panel fixed z-60 flex flex-col shadow-[0_4px_18px_rgba(0,0,0,.18)]"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
    role="dialog"
    :aria-label="t('render.window.title')"
    @keydown.stop
    @pointerdown.stop
  >
    <div ref="handle" class="flex cursor-move items-center gap-2 bg-panel-2 py-1.75 pe-1.5 ps-2.5 text-navy select-none">
      <span class="flex-1 text-[0.8125rem] font-bold">{{ t('render.window.title') }}</span>
      <S3dCloseButton size="sm" :title="t('render.window.close')" @pointerdown.stop @click="renderUi.open = false" />
    </div>
    <!-- the session's canvas is put in here: it outlives the window, so its shader is compiled only once -->
    <div ref="holder" :style="{ width: size.width + 'px', height: size.height + 'px' }"></div>
    <div class="flex items-center gap-2 px-2.5 py-1.5 text-xs">
      <span class="flex-1 text-ink-2" role="status">{{ status }}</span>
      <S3dButton small :title="t('render.window.againTitle')" @click="start">{{ t('render.window.again') }}</S3dButton>
      <S3dButton small :disabled="!samples" @click="save">{{ t('render.window.save') }}</S3dButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import S3dButton from '../../../components/ui/S3dButton.vue';
import S3dCloseButton from '../../../components/ui/S3dCloseButton.vue';
import { useEditor } from '../../../components/keys';
import { useFloatingWindow } from '../../../composables/useFloatingWindow';
import { formatNumber, t } from '../../../i18n';
import { buildTraceScene } from './traceScene';
import { isCompiling, traceSession } from './session';
import { renderUi } from './state';

/** The path-traced picture of the current view in a floating window – it gets sharper with every pass. */
const editor = useEditor();
const position = useFloatingWindow(useTemplateRef<HTMLElement>('panel'), useTemplateRef<HTMLElement>('handle'), { x: 80, y: 70 });
const holder = useTemplateRef<HTMLDivElement>('holder');

/** passes after which it stops – the picture hardly changes any more, and the graphics card may rest */
const MAX_SAMPLES = 400;
const WIDTH = 520;
/** how long one frame may keep the graphics card busy with tracing, so the app stays smooth */
const FRAME_BUDGET_MS = 12;
const size = ref({ width: WIDTH, height: 320 });
const samples = ref(0);
const compiling = ref(false);
const failed = ref('');
const status = computed(() =>
  failed.value
    ? failed.value
    : compiling.value
      ? t('render.window.compiling')
      : samples.value >= MAX_SAMPLES
        ? t('render.window.done', { count: formatNumber(samples.value) })
        : t('render.window.passes', { count: formatNumber(samples.value) }),
);

let disposeScene: (() => void) | null = null;
let frame = 0;

/** stops tracing and frees this picture's materials – the session (and its compiled shader) stays */
const stop = () => {
  cancelAnimationFrame(frame);
  disposeScene?.();
  disposeScene = null;
};

/** the current view, traced from the start */
const start = async () => {
  stop();
  samples.value = 0;
  failed.value = '';
  const viewer = editor.viewer;
  size.value = { width: WIDTH, height: Math.round((WIDTH * viewer.height) / Math.max(1, viewer.width)) };
  await nextTick();
  if (!holder.value) {
    return;
  }
  let tracer;
  try {
    const session = traceSession();
    holder.value.append(session.canvas);
    session.renderer.setSize(size.value.width, size.value.height);
    tracer = session.tracer;
    const { scene, camera, dispose } = buildTraceScene(editor, size.value.width / size.value.height);
    disposeScene = dispose;
    tracer.setScene(scene, camera);
  } catch (error) {
    failed.value = t('render.window.failed', { message: (error as Error)?.message ?? String(error) });
    stop();
    return;
  }
  const loop = () => {
    if (!renderUi.open || samples.value >= MAX_SAMPLES) {
      return;
    }
    // a call renders one tile of the picture: several per frame, as long as a frame allows
    const begin = performance.now();
    do {
      tracer.renderSample();
    } while (performance.now() - begin < FRAME_BUDGET_MS && !isCompiling(tracer));
    compiling.value = isCompiling(tracer);
    samples.value = Math.floor(tracer.samples);
    frame = requestAnimationFrame(loop);
  };
  loop();
};

/** the picture as it is now, as a PNG */
const save = () => {
  traceSession().canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${editor.model.name || 'render'}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, 'image/png');
};

watch(
  () => renderUi.open,
  (open) => (open ? start() : stop()),
);
// the command asks for a new picture while the window is open
watch(
  () => renderUi.request,
  () => renderUi.open && start(),
);
onBeforeUnmount(stop);
</script>
