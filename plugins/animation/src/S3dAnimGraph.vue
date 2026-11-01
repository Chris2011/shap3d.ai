<template>
  <!-- the graph editor: value over time, keys and their handles to drag -->
  <div ref="root" style="position: relative; min-width: 0; min-height: 0; overflow: hidden">
    <svg :width="size.width" :height="size.height" style="display: block" @wheel.prevent="onWheel" @pointerdown.self="startScrub">
      <rect x="0" y="0" :width="size.width" :height="RULER" fill="var(--s3d-panel-2)" @pointerdown="startScrub" />
      <rect
        v-if="xOf(scene.start) > 0"
        x="0"
        :y="RULER"
        :width="xOf(scene.start)"
        :height="size.height"
        fill="rgba(0,0,0,.05)"
        pointer-events="none"
      />
      <rect
        :x="xOf(scene.end)"
        :y="RULER"
        :width="Math.max(0, size.width - xOf(scene.end))"
        :height="size.height"
        fill="rgba(0,0,0,.05)"
        pointer-events="none"
      />
      <g pointer-events="none">
        <g v-for="tick in ticks" :key="`t${tick}`">
          <line :x1="xOf(tick)" :x2="xOf(tick)" :y1="RULER - 6" :y2="size.height" stroke="var(--s3d-line)" />
          <text :x="xOf(tick) + 3" y="12" font-size="10" fill="var(--s3d-text-2)">{{ tick }}</text>
        </g>
        <g v-for="tick in valueTicks" :key="`v${tick}`">
          <line x1="0" :x2="size.width" :y1="yOfShared(tick)" :y2="yOfShared(tick)" stroke="var(--s3d-line)" stroke-dasharray="2 3" />
          <text x="4" :y="yOfShared(tick) - 3" font-size="10" fill="var(--s3d-text-2)">{{ formatValue(tick) }}</text>
        </g>
        <line :x1="xOf(state.frame)" :x2="xOf(state.frame)" y1="0" :y2="size.height" stroke="#1c7ed6" stroke-width="2" />
      </g>
      <g v-for="curve in curves" :key="curve.id">
        <polyline :points="curve.points" fill="none" :stroke="curve.colour" stroke-width="1.75" pointer-events="none" />
        <g v-for="(key, index) in curve.keys" :key="index">
          <template v-if="key.picked && key.handles">
            <line :x1="key.x" :y1="key.y" :x2="key.handles.left.x" :y2="key.handles.left.y" stroke="var(--s3d-text-2)" />
            <line :x1="key.x" :y1="key.y" :x2="key.handles.right.x" :y2="key.handles.right.y" stroke="var(--s3d-text-2)" />
            <circle
              :cx="key.handles.left.x"
              :cy="key.handles.left.y"
              r="4"
              fill="var(--s3d-panel)"
              :stroke="curve.colour"
              style="cursor: move"
              @pointerdown.stop="startHandleDrag($event, curve, key.frame, 'left')"
            />
            <circle
              :cx="key.handles.right.x"
              :cy="key.handles.right.y"
              r="4"
              fill="var(--s3d-panel)"
              :stroke="curve.colour"
              style="cursor: move"
              @pointerdown.stop="startHandleDrag($event, curve, key.frame, 'right')"
            />
          </template>
          <circle
            :cx="key.x"
            :cy="key.y"
            :r="key.picked ? 5.5 : 4.5"
            :fill="key.picked ? '#f59f00' : 'var(--s3d-panel)'"
            :stroke="curve.colour"
            stroke-width="2"
            style="cursor: move"
            @pointerdown.stop="startKeyDrag($event, curve, key.frame)"
            @contextmenu.prevent.stop="menu($event, curve, key.frame)"
          >
            <title>{{ `${curve.label} · ${key.frame} · ${formatValue(key.value)}` }}</title>
          </circle>
        </g>
      </g>
    </svg>
    <label class="s3d-an-check" style="position: absolute; inset-inline-end: 0.5rem; top: 0.125rem; font-size: 0.6875rem">
      <input v-model="normalized" type="checkbox" /> {{ t('animation.graph.normalize') }}
    </label>
    <p v-if="!channels.length" class="s3d-an-tl-empty" style="position: absolute; top: 1.5rem">{{ t('animation.graph.empty') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { currentScene } from './apply';
import { curveRange, evaluate, handlesOf } from './curves';
import type { Track } from './data';
import { changeKey } from './keying';
import { setFrame } from './player';
import type { ChannelRow } from './rows';
import { pluginContext, t } from './runtime';
import { learn, useAnimationState } from './state';

/**
 * Blender's graph editor: the channels' curves over time. A key drags in time and value, a picked smooth key shows
 * its handles – dragging one shapes the curve (the other side follows, so the curve stays smooth). Normalised, every
 * curve fills the height on its own, so a turn in degrees and a position in metres can be seen together.
 */

const props = defineProps<{ viewStart: number; viewEnd: number; channels: (ChannelRow & { owner: string })[] }>();
const emit = defineEmits<{
  zoom: [frame: number, factor: number];
  menu: [event: { x: number; y: number; owner: string; channel: string }];
}>();

const RULER = 18;
const PADDING = 14;

const editor = pluginContext().editor;
const state = useAnimationState();
const root = ref<HTMLElement | null>(null);
const size = reactive({ width: 400, height: 160 });
const normalized = ref(false);

let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(() => {
    size.width = root.value?.clientWidth ?? 400;
    size.height = root.value?.clientHeight ?? 160;
  });
  observer.observe(root.value!);
});
onBeforeUnmount(() => observer?.disconnect());

const scene = computed(() => {
  void state.revision;
  void editor.ui.revision;
  return currentScene();
});

const xOf = (frame: number) => ((frame - props.viewStart) / (props.viewEnd - props.viewStart)) * size.width;
const frameOf = (x: number) => props.viewStart + (x / size.width) * (props.viewEnd - props.viewStart);

/** a key or handle being dragged: the curve is drawn from this changed copy until it is let go */
interface Dragging {
  owner: string;
  channel: string;
  frame: number;
  track: Track;
}
const dragging = ref<Dragging | null>(null);

const trackOf = (curve: ChannelRow & { owner: string }) =>
  dragging.value && dragging.value.owner === curve.owner && dragging.value.channel === curve.channel ? dragging.value.track : curve.track;

/** each curve's value range – worked out from the stored curves, so it stays while a copy is dragged */
const ranges = computed(() => {
  const map = new Map<string, { min: number; max: number }>();
  for (const curve of props.channels) {
    const range = curveRange(curve.track, curve.channel);
    map.set(`${curve.owner}|${curve.channel}`, range);
  }
  return map;
});

/** the shared range of all curves (not normalised) */
const shared = computed(() => {
  let min = Infinity;
  let max = -Infinity;
  for (const range of ranges.value.values()) {
    min = Math.min(min, range.min);
    max = Math.max(max, range.max);
  }
  if (!Number.isFinite(min)) {
    return { min: 0, max: 1 };
  }
  if (max - min < 1e-6) {
    return { min: min - 1, max: max + 1 };
  }
  const room = (max - min) * 0.08;
  return { min: min - room, max: max + room };
});

const rangeOf = (id: string) => {
  if (!normalized.value) {
    return shared.value;
  }
  const range = ranges.value.get(id) ?? { min: 0, max: 1 };
  const span = Math.max(range.max - range.min, 1e-6);
  return { min: range.min - span * 0.08, max: range.max + span * 0.08 };
};

const yOf = (value: number, range: { min: number; max: number }) =>
  RULER + PADDING + ((range.max - value) / (range.max - range.min)) * (size.height - RULER - 2 * PADDING);
const valueOf = (y: number, range: { min: number; max: number }) =>
  range.max - ((y - RULER - PADDING) / (size.height - RULER - 2 * PADDING)) * (range.max - range.min);
const yOfShared = (value: number) => yOf(value, shared.value);

const ticks = computed(() => {
  const perFrame = size.width / (props.viewEnd - props.viewStart);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((candidate) => candidate * perFrame >= 42) ?? 1000;
  const list: number[] = [];
  for (let tick = Math.ceil(props.viewStart / step) * step; tick <= props.viewEnd; tick += step) {
    list.push(tick);
  }
  return list;
});

/** lines across at round values (not when normalised – then each curve has its own scale) */
const valueTicks = computed(() => {
  if (normalized.value) {
    return [];
  }
  const { min, max } = shared.value;
  const rough = (max - min) / Math.max(2, (size.height - RULER) / 40);
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? rough;
  const list: number[] = [];
  for (let tick = Math.ceil(min / step) * step; tick <= max; tick += step) {
    list.push(Math.round(tick * 1e6) / 1e6);
  }
  return list;
});

const formatValue = (value: number) =>
  Math.abs(value) >= 100 ? value.toFixed(0) : Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(3);

const isPicked = (owner: string, channel: string, frame: number) =>
  state.picked.some((key) => key.owner === owner && key.channel === channel && Math.abs(key.frame - frame) < 1e-6);

const curves = computed(() =>
  props.channels.map((curve) => {
    const id = `${curve.owner}|${curve.channel}`;
    const range = rangeOf(id);
    const track = trackOf(curve);
    const points: string[] = [];
    for (let x = 0; x <= size.width; x += 2) {
      points.push(`${x},${yOf(evaluate(track, frameOf(x), curve.channel), range).toFixed(1)}`);
    }
    const keys = track.keys.map((key, index) => {
      const picked = isPicked(curve.owner, curve.channel, key.frame);
      let handles: { left: { x: number; y: number }; right: { x: number; y: number } } | null = null;
      if (picked && key.interp === 'bezier') {
        const { left, right } = handlesOf(track.keys, index);
        handles = {
          left: { x: xOf(key.frame + left[0]), y: yOf(key.value + left[1], range) },
          right: { x: xOf(key.frame + right[0]), y: yOf(key.value + right[1], range) },
        };
      }
      return { frame: key.frame, value: key.value, x: xOf(key.frame), y: yOf(key.value, range), picked, handles };
    });
    return { ...curve, id, range, points: points.join(' '), keys };
  }),
);

type Curve = (typeof curves.value)[number];

const startScrub = (event: PointerEvent) => {
  const area = root.value!.getBoundingClientRect();
  const show = (clientX: number) => {
    setFrame(Math.round(frameOf(clientX - area.left)), { camera: state.lookThrough });
    learn('scrubbed');
  };
  if (event.clientY - area.top > RULER) {
    state.picked = [];
    return;
  }
  show(event.clientX);
  const move = (moveEvent: PointerEvent) => show(moveEvent.clientX);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
};

const onWheel = (event: WheelEvent) => {
  const area = root.value!.getBoundingClientRect();
  emit('zoom', frameOf(event.clientX - area.left), event.deltaY > 0 ? 1.15 : 1 / 1.15);
};

/** follows the pointer until it is let go, then calls `done` */
const drag = (onMove: (event: PointerEvent) => void, done: () => void) => {
  const up = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', up);
    done();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', up);
};

const startKeyDrag = (event: PointerEvent, curve: Curve, frame: number) => {
  if (event.button === 2) {
    return;
  }
  const picked = { owner: curve.owner, channel: curve.channel, frame };
  if (event.shiftKey) {
    state.picked = isPicked(curve.owner, curve.channel, frame)
      ? state.picked.filter((key) => !(key.owner === curve.owner && key.channel === curve.channel && key.frame === frame))
      : [...state.picked, picked];
    return;
  }
  state.picked = [picked];
  const track = structuredClone(curve.track);
  const key = track.keys.find((entry) => Math.abs(entry.frame - frame) < 1e-6)!;
  const original = { frame: key.frame, value: key.value };
  const range = curve.range;
  const startX = event.clientX;
  const startY = event.clientY;
  dragging.value = { owner: curve.owner, channel: curve.channel, frame, track };
  let moved = false;
  drag(
    (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 3) {
        return;
      }
      moved = true;
      // Shift-free: time in whole frames, the value as it goes; Alt keeps the value, Ctrl keeps the frame
      key.frame = moveEvent.ctrlKey ? original.frame : Math.round(original.frame + (dx / size.width) * (props.viewEnd - props.viewStart));
      key.value = moveEvent.altKey ? original.value : Math.round(valueOf(yOf(original.value, range) + dy, range) * 1e4) / 1e4;
      track.keys.sort((a, b) => a.frame - b.frame);
      dragging.value = { ...dragging.value!, track };
    },
    () => {
      dragging.value = null;
      if (!moved) {
        setFrame(frame, { camera: state.lookThrough });
        return;
      }
      const target = { frame: key.frame, value: key.value };
      changeKey(curve.owner, curve.channel, frame, (stored, storedTrack) => {
        storedTrack.keys = storedTrack.keys.filter((other) => other === stored || Math.abs(other.frame - target.frame) >= 1e-6);
        stored.frame = target.frame;
        stored.value = target.value;
      });
      state.picked = [{ ...picked, frame: target.frame }];
    },
  );
};

const startHandleDrag = (event: PointerEvent, curve: Curve, frame: number, side: 'left' | 'right') => {
  const track = structuredClone(curve.track);
  const index = track.keys.findIndex((entry) => Math.abs(entry.frame - frame) < 1e-6);
  const key = track.keys[index];
  const current = handlesOf(track.keys, index);
  key.handle = 'free';
  key.left = current.left;
  key.right = current.right;
  const range = curve.range;
  const area = root.value!.getBoundingClientRect();
  dragging.value = { owner: curve.owner, channel: curve.channel, frame, track };
  drag(
    (moveEvent) => {
      const pointerFrame = frameOf(moveEvent.clientX - area.left);
      const pointerValue = valueOf(moveEvent.clientY - area.top, range);
      let dx = pointerFrame - key.frame;
      const dy = pointerValue - key.value;
      // a left handle points back in time, a right one forward
      dx = side === 'left' ? Math.min(dx, -0.01) : Math.max(dx, 0.01);
      const handle: [number, number] = [dx, dy];
      // the other handle turns along (aligned), keeping its length in time
      const other = side === 'left' ? key.right! : key.left!;
      const scale = Math.abs(other[0] / dx);
      const mirrored: [number, number] = [-dx * scale, -dy * scale];
      key.left = side === 'left' ? handle : mirrored;
      key.right = side === 'left' ? mirrored : handle;
      dragging.value = { ...dragging.value!, track };
    },
    () => {
      dragging.value = null;
      const handles = { left: key.left!, right: key.right! };
      changeKey(curve.owner, curve.channel, frame, (stored) => {
        stored.interp = 'bezier';
        stored.handle = 'free';
        stored.left = handles.left;
        stored.right = handles.right;
      });
    },
  );
};

const menu = (event: MouseEvent, curve: Curve, frame: number) => {
  if (!isPicked(curve.owner, curve.channel, frame)) {
    state.picked = [{ owner: curve.owner, channel: curve.channel, frame }];
  }
  emit('menu', { x: event.clientX, y: event.clientY, owner: curve.owner, channel: curve.channel });
};
</script>
