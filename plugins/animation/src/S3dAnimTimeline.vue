<template>
  <!-- the timeline at the bottom of the 3D view: playing, the frame, the range, and the dope sheet or graph editor -->
  <div
    v-if="state.timeline && rect"
    ref="root"
    class="s3d-an-tl"
    tabindex="0"
    :style="{ left: `${rect.left}px`, width: `${rect.width}px`, top: `${rect.bottom - height}px`, height: `${height}px` }"
    @keydown="onKey"
    @pointerdown="focusStrip"
    @contextmenu.prevent
  >
    <div class="s3d-an-tl-grip" :title="t('animation.timeline.resize')" @pointerdown.prevent="startResize"></div>
    <div class="s3d-an-tl-bar">
      <div class="s3d-an-tl-transport">
        <button :title="t('animation.timeline.toStart')" @click="jumpTo('start')">⏮</button>
        <button :title="t('animation.timeline.previousKey')" @click="jumpKey(-1)">◆◀</button>
        <button :title="t('animation.timeline.previousFrame')" @click="stepFrame(-1)">◀</button>
        <button :title="state.playing ? t('animation.timeline.pause') : t('animation.timeline.play')" @click="togglePlay">
          {{ state.playing ? '⏸' : '▶' }}
        </button>
        <button :title="t('animation.timeline.nextFrame')" @click="stepFrame(1)">▶|</button>
        <button :title="t('animation.timeline.nextKey')" @click="jumpKey(1)">▶◆</button>
        <button :title="t('animation.timeline.toEnd')" @click="jumpTo('end')">⏭</button>
      </div>
      <input
        class="s3d-input s3d-an-tl-frame"
        type="number"
        :value="Math.round(state.frame)"
        :aria-label="t('animation.timeline.frame')"
        :title="t('animation.timeline.frame')"
        @change="setFrame(Number(($event.target as HTMLInputElement).value), { camera: state.lookThrough })"
        @keydown.stop
      />
      <span class="s3d-an-tl-time">{{ seconds }}</span>
      <button class="s3d-an-tl-tool" :title="t('animation.timeline.keyHint')" @click="insertKey">
        ◆ {{ t('animation.timeline.key') }}
      </button>
      <button
        class="s3d-an-tl-tool rec"
        :class="{ on: state.autoKey }"
        :title="t('animation.timeline.autoKeyHint')"
        :aria-pressed="state.autoKey"
        @click="state.autoKey = !state.autoKey"
      >
        ● {{ t('animation.timeline.autoKey') }}
      </button>
      <button
        class="s3d-an-tl-tool"
        :class="{ on: state.lookThrough }"
        :title="t('animation.timeline.lookThroughHint')"
        :aria-pressed="state.lookThrough"
        @click="setLookThrough(!state.lookThrough)"
      >
        🎥 {{ t('animation.timeline.lookThrough') }}
      </button>
      <span class="s3d-an-grow"></span>
      <label
        >{{ t('animation.timeline.start') }}
        <input class="s3d-input" type="number" style="width: 3.5rem" :value="scene.start" @change="setRange('start', $event)" @keydown.stop
      /></label>
      <label
        >{{ t('animation.timeline.end') }}
        <input class="s3d-input" type="number" style="width: 3.5rem" :value="scene.end" @change="setRange('end', $event)" @keydown.stop
      /></label>
      <label
        >{{ t('animation.timeline.fps') }}
        <select class="s3d-input" :value="scene.fps" @change="setRange('fps', $event)" @keydown.stop>
          <option v-for="rate in RATES" :key="rate" :value="rate">{{ rate }}</option>
        </select></label
      >
      <button
        class="s3d-an-tl-tool"
        :class="{ on: state.loop }"
        :title="t('animation.timeline.loop')"
        :aria-pressed="state.loop"
        @click="state.loop = !state.loop"
      >
        🔁
      </button>
      <div class="s3d-an-switch">
        <button :class="{ active: state.timelineView === 'dope' }" @click="state.timelineView = 'dope'">
          {{ t('animation.timeline.dope') }}
        </button>
        <button :class="{ active: state.timelineView === 'graph' }" @click="openGraph">{{ t('animation.timeline.graph') }}</button>
      </div>
      <button class="s3d-an-tl-tool" :title="t('animation.timeline.fitHint')" @click="fit">{{ t('animation.timeline.fit') }}</button>
      <button class="s3d-an-tl-tool" :title="t('animation.timeline.close')" @click="state.timeline = false">✕</button>
    </div>

    <!-- dope sheet: one line per animated thing (and its channels when opened), a diamond per key -->
    <div v-if="state.timelineView === 'dope'" ref="scroller" class="s3d-an-tl-scroll" style="flex: 1; position: relative">
      <div :style="{ display: 'grid', gridTemplateColumns: `${NAMES}px 1fr`, position: 'relative' }">
        <div class="s3d-an-tl-header" style="position: sticky; top: 0; z-index: 2; background: var(--s3d-panel)">
          {{ t('animation.timeline.summary') }}
        </div>
        <div
          ref="ruler"
          style="position: sticky; top: 0; z-index: 2; height: 22px; cursor: ew-resize; background: var(--s3d-panel-2)"
          @pointerdown="startScrub"
          @wheel.prevent="onWheel"
        >
          <svg :width="width" height="22" style="display: block">
            <rect v-if="xOf(scene.start) > 0" x="0" y="0" :width="Math.max(0, xOf(scene.start))" height="22" fill="rgba(0,0,0,.06)" />
            <rect :x="xOf(scene.end)" y="0" :width="Math.max(0, width - xOf(scene.end))" height="22" fill="rgba(0,0,0,.06)" />
            <g v-for="tick in ticks" :key="tick">
              <line :x1="xOf(tick)" :x2="xOf(tick)" y1="14" y2="22" stroke="var(--s3d-text-2)" />
              <text :x="xOf(tick) + 3" y="11" font-size="10" fill="var(--s3d-text-2)">{{ tick }}</text>
            </g>
            <g v-for="shot in scene.shots" :key="shot.id">
              <path :d="`M${xOf(shot.frame)} 22 l-5 -7 h10 z`" fill="#1c7ed6" />
              <text :x="xOf(shot.frame) + 6" y="20" font-size="9" fill="#1c7ed6">{{ shotLabel(shot.camera, shot.name) }}</text>
            </g>
          </svg>
        </div>
        <template v-for="line in lines" :key="line.id">
          <div
            class="s3d-an-tl-name"
            :class="{ channel: !!line.channel, picked: line.selected }"
            :title="line.label"
            @click="clickName(line)"
          >
            <span v-if="!line.channel && line.owner !== '*'" class="twisty" @click.stop="toggle(line.owner)">{{
              state.expanded[line.owner] ? '▾' : '▸'
            }}</span>
            <span v-if="line.colour" class="s3d-an-swatch" :style="{ width: '0.5rem', height: '0.5rem', background: line.colour }"></span>
            <span class="label">{{ line.label }}</span>
          </div>
          <div
            style="position: relative; height: 22px; border-bottom: 1px solid var(--s3d-line)"
            @pointerdown.self="clearPicks"
            @wheel="onWheel"
          >
            <button
              v-for="key in line.keys"
              :key="key.frame"
              class="s3d-an-diamond"
              :class="{ keyed: isPicked(line, key.frame) }"
              :style="{
                position: 'absolute',
                top: '7px',
                left: `${xOf(key.frame + (isPicked(line, key.frame) ? dragDelta : 0)) - 4}px`,
                background: isPicked(line, key.frame) ? undefined : interpColour(key.interp),
              }"
              :title="`${key.frame}`"
              @pointerdown.stop="startKeyDrag($event, line, key.frame)"
              @contextmenu.prevent.stop="openMenu($event, line, key.frame)"
            ></button>
          </div>
        </template>
        <div :style="playheadStyle"></div>
      </div>
      <div v-if="lines.length === 1" class="s3d-an-tl-empty">{{ t('animation.timeline.empty') }}</div>
    </div>

    <!-- graph editor: the curves of the chosen channels, keys and handles to drag -->
    <div v-else style="flex: 1; display: grid; min-height: 0" :style="{ gridTemplateColumns: `${NAMES}px 1fr` }">
      <div class="s3d-an-tl-scroll">
        <template v-for="row in rows" :key="row.owner">
          <div class="s3d-an-tl-name" :title="row.label" @click="showOwner(row.owner)">
            <span class="label"
              ><b>{{ row.label }}</b></span
            >
          </div>
          <label v-for="channel in row.channels" :key="channel.channel" class="s3d-an-tl-name channel">
            <input type="checkbox" :checked="graphShown(row.owner, channel.channel)" @change="toggleGraph(row.owner, channel.channel)" />
            <span class="s3d-an-swatch" :style="{ width: '0.5rem', height: '0.5rem', background: channel.colour }"></span>
            <span class="label">{{ channel.label }}</span>
          </label>
        </template>
        <div v-if="!rows.length" class="s3d-an-tl-empty">{{ t('animation.timeline.empty') }}</div>
      </div>
      <S3dAnimGraph :view-start="viewStart" :view-end="viewEnd" :channels="graphCurves" @zoom="zoomAt" @menu="openGraphMenu" />
    </div>

    <!-- what can be done with the keys picked -->
    <div v-if="menu" class="s3d-an-tl-menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" @pointerdown.stop>
      <button v-for="interp in INTERPOLATIONS" :key="interp" @click="menuInterp(interp)">{{ t(`animation.interp.${interp}`) }}</button>
      <hr />
      <button @click="menuHandles('auto')">{{ t('animation.menu.autoHandles') }}</button>
      <button @click="menuHandles('flat')">{{ t('animation.menu.flatHandles') }}</button>
      <button v-if="menu.channel" @click="menuCycle">{{ cycled ? t('animation.menu.noCycle') : t('animation.menu.cycle') }}</button>
      <hr />
      <button @click="menuDelete">{{ t('animation.menu.delete') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import S3dAnimGraph from './S3dAnimGraph.vue';
import { currentScene } from './apply';
import { INTERPOLATIONS, type Interpolation } from './data';
import { keyWhatIsMeant } from './rig';
import { deleteKeys, editScene, readTracks, setCycle, setHandles, setInterpolation, shiftKeys } from './keying';
import { jumpKey, jumpTo, setFrame, setLookThrough, stepFrame, togglePlay } from './player';
import { ownerRows, type OwnerRow } from './rows';
import { pluginContext, t } from './runtime';
import { findInstance } from './scene';
import { learn, useAnimationState, type PickedKey } from './state';

/**
 * Blender's timeline, dope sheet and graph editor in one strip under the 3D view. The ruler scrubs, diamonds are
 * keys – click to pick (Shift adds), drag to move, right-click for their curve, Delete removes them; Ctrl + wheel
 * zooms, Shift + wheel scrolls in time. Space plays while the strip has the focus, ← → step, ↑ ↓ jump from key to key.
 */

const NAMES = 208;
const RATES = [12, 15, 24, 25, 30, 48, 50, 60];

const context = pluginContext();
const editor = context.editor;
const state = useAnimationState();
const root = ref<HTMLElement | null>(null);
const scroller = ref<HTMLElement | null>(null);
const ruler = ref<HTMLElement | null>(null);

// ------------------------------------------------------------ where it sits: under the 3D view

/** the room for the strip: the 3D view without the toolbar on the left and the open panel (or the tiles) on the right */
const rect = ref<{ left: number; width: number; bottom: number; height: number } | null>(null);
const height = ref(context.storage.get('timelineHeight', 230));
/** the toolbar (left-1.5 + w-10) and the tiles (right-14) take this much of the view's sides */
const TOOLBAR = 52;
const TILES = 60;
const measure = () => {
  const view = editor.viewer.canvas.getBoundingClientRect();
  // the side panel floats over the view's right side: a tall panel in its right half (not the top bar or the toolbar)
  const panel = [...document.querySelectorAll<HTMLElement>('.s3d-panel.absolute')]
    .map((element) => element.getBoundingClientRect())
    .find((box) => box.height > 200 && box.left > view.left + view.width / 2);
  const right = panel ? panel.left - 8 : view.right - TILES;
  const left = view.left + TOOLBAR;
  const next = { left, width: Math.max(320, right - left), bottom: view.bottom, height: view.height };
  const old = rect.value;
  if (!old || old.left !== next.left || old.width !== next.width || old.bottom !== next.bottom || old.height !== next.height) {
    rect.value = next;
  }
};
// panels open and close without the view changing size – a cheap look now and then follows them
let timer = 0;
onMounted(() => {
  measure();
  timer = window.setInterval(measure, 300);
  window.addEventListener('resize', measure);
  window.addEventListener('pointerdown', closeMenu);
});
onBeforeUnmount(() => {
  window.clearInterval(timer);
  window.removeEventListener('resize', measure);
  window.removeEventListener('pointerdown', closeMenu);
});

const startResize = (event: PointerEvent) => {
  const startY = event.clientY;
  const startHeight = height.value;
  const move = (moveEvent: PointerEvent) => {
    height.value = Math.min(Math.max(120, startHeight - (moveEvent.clientY - startY)), Math.max(160, (rect.value?.height ?? 600) - 80));
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    context.storage.set('timelineHeight', height.value);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
};

/** the strip takes the keys (Space, arrows, Delete) – unless a field in it is clicked, which keeps its own focus */
const focusStrip = (event: PointerEvent) => {
  const target = event.target as HTMLElement;
  if (!['INPUT', 'SELECT', 'TEXTAREA', 'OPTION'].includes(target.tagName)) {
    root.value?.focus({ preventScroll: true });
  }
};

// ------------------------------------------------------------ the scene and its rows

const scene = computed(() => {
  void state.revision;
  void editor.ui.revision;
  return currentScene();
});
const rows = computed<OwnerRow[]>(() => {
  void state.revision;
  void editor.ui.revision;
  return ownerRows();
});

const seconds = computed(() => {
  const time = (state.frame - scene.value.start) / scene.value.fps;
  return `${time < 0 ? '-' : ''}${Math.floor(Math.abs(time) / 60)}:${(Math.abs(time) % 60).toFixed(2).padStart(5, '0')}`;
});

const shotLabel = (cameraId: string, name: string) => scene.value.cameras.find((camera) => camera.id === cameraId)?.name ?? name;

const setRange = (what: 'start' | 'end' | 'fps', event: Event) => {
  const value = Math.round(Number((event.target as HTMLInputElement).value));
  if (!Number.isFinite(value)) {
    return;
  }
  editScene(t('animation.undo.range'), (edited) => {
    if (what === 'fps') {
      edited.fps = Math.max(1, Math.min(120, value));
    } else if (what === 'start') {
      edited.start = Math.min(value, edited.end - 1);
    } else {
      edited.end = Math.max(value, edited.start + 1);
    }
  });
  fit();
};

// ------------------------------------------------------------ time on screen

const width = ref(600);
const viewStart = ref(0);
const viewEnd = ref(130);
const fit = () => {
  viewStart.value = scene.value.start - 2;
  viewEnd.value = scene.value.end + 2;
};
fit();
watch(
  () => [scene.value.start, scene.value.end],
  () => fit(),
);

const measureArea = () => {
  width.value = Math.max(100, (rect.value?.width ?? 700) - NAMES - 14);
};
watch(rect, measureArea, { immediate: true });

const xOf = (frame: number) => ((frame - viewStart.value) / (viewEnd.value - viewStart.value)) * width.value;
const frameOf = (x: number) => viewStart.value + (x / width.value) * (viewEnd.value - viewStart.value);

const ticks = computed(() => {
  const perFrame = width.value / (viewEnd.value - viewStart.value);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((candidate) => candidate * perFrame >= 42) ?? 1000;
  const list: number[] = [];
  for (let tick = Math.ceil(viewStart.value / step) * step; tick <= viewEnd.value; tick += step) {
    list.push(tick);
  }
  return list;
});

const playheadStyle = computed(() => ({
  position: 'absolute' as const,
  top: '0',
  bottom: '0',
  left: `${NAMES + xOf(state.frame)}px`,
  width: '2px',
  marginLeft: '-1px',
  background: '#1c7ed6',
  pointerEvents: 'none' as const,
  zIndex: 3,
}));

/** Ctrl + wheel zooms about the pointer, Shift + wheel scrolls in time, the wheel alone scrolls the rows */
const onWheel = (event: WheelEvent) => {
  const area = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (event.ctrlKey || event.metaKey || event.currentTarget === ruler.value) {
    event.preventDefault();
    zoomAt(frameOf(event.clientX - area.left), event.deltaY > 0 ? 1.15 : 1 / 1.15);
  } else if (event.shiftKey) {
    event.preventDefault();
    const shift = ((viewEnd.value - viewStart.value) * Math.sign(event.deltaY || event.deltaX)) / 10;
    viewStart.value += shift;
    viewEnd.value += shift;
  }
};
const zoomAt = (frame: number, factor: number) => {
  const span = Math.min(5000, Math.max(5, (viewEnd.value - viewStart.value) * factor));
  const share = (frame - viewStart.value) / (viewEnd.value - viewStart.value);
  viewStart.value = frame - share * span;
  viewEnd.value = viewStart.value + span;
};

/** the ruler: press and drag to show any frame */
const startScrub = (event: PointerEvent) => {
  const area = ruler.value!.getBoundingClientRect();
  const show = (clientX: number) => {
    setFrame(Math.round(frameOf(clientX - area.left)), { camera: state.lookThrough });
    learn('scrubbed');
  };
  show(event.clientX);
  const move = (moveEvent: PointerEvent) => show(moveEvent.clientX);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
};

// ------------------------------------------------------------ dope sheet lines and picking keys

interface Line {
  id: string;
  owner: string;
  channel: string | null;
  label: string;
  colour?: string;
  keys: { frame: number; interp: Interpolation }[];
  /** the keys a diamond stands for: channel → frames */
  channels: string[];
  selected: boolean;
}

const selectedIds = computed(() => {
  void editor.ui.selRev;
  return new Set([...editor.selection.values()].filter((entry) => entry.kind === 'instance').map((entry) => `obj:${entry.id}`));
});

const merged = (row: OwnerRow) => {
  const frames = new Map<number, Interpolation>();
  for (const channel of row.channels) {
    for (const key of channel.track.keys) {
      if (!frames.has(key.frame)) {
        frames.set(key.frame, key.interp);
      }
    }
  }
  return [...frames.entries()].sort((a, b) => a[0] - b[0]).map(([frame, interp]) => ({ frame, interp }));
};

const lines = computed<Line[]>(() => {
  const list: Line[] = [];
  const all = new Map<number, Interpolation>();
  for (const row of rows.value) {
    merged(row).forEach((key) => !all.has(key.frame) && all.set(key.frame, key.interp));
  }
  list.push({
    id: '*',
    owner: '*',
    channel: null,
    label: t('animation.timeline.allKeys'),
    keys: [...all.entries()].sort((a, b) => a[0] - b[0]).map(([frame, interp]) => ({ frame, interp })),
    channels: [],
    selected: false,
  });
  for (const row of rows.value) {
    list.push({
      id: row.owner,
      owner: row.owner,
      channel: null,
      label: row.label,
      keys: merged(row),
      channels: row.channels.map((channel) => channel.channel),
      selected: selectedIds.value.has(row.owner),
    });
    if (state.expanded[row.owner]) {
      for (const channel of row.channels) {
        list.push({
          id: `${row.owner}|${channel.channel}`,
          owner: row.owner,
          channel: channel.channel,
          label: channel.label,
          colour: channel.colour,
          keys: channel.track.keys.map((key) => ({ frame: key.frame, interp: key.interp })),
          channels: [channel.channel],
          selected: false,
        });
      }
    }
  }
  return list;
});

/** the keys a diamond stands for */
const keysOf = (line: Line, frame: number): PickedKey[] => {
  const owners = line.owner === '*' ? rows.value : rows.value.filter((row) => row.owner === line.owner);
  const picked: PickedKey[] = [];
  for (const row of owners) {
    for (const channel of row.channels) {
      if ((line.channel && channel.channel !== line.channel) || !channel.track.keys.some((key) => Math.abs(key.frame - frame) < 1e-6)) {
        continue;
      }
      picked.push({ owner: row.owner, channel: channel.channel, frame });
    }
  }
  return picked;
};

const same = (a: PickedKey, b: PickedKey) => a.owner === b.owner && a.channel === b.channel && Math.abs(a.frame - b.frame) < 1e-6;

const isPicked = (line: Line, frame: number) => {
  const keys = keysOf(line, frame);
  return keys.length > 0 && keys.every((key) => state.picked.some((picked) => same(picked, key)));
};

const clearPicks = () => {
  state.picked = [];
};

const pick = (line: Line, frame: number, add: boolean) => {
  const keys = keysOf(line, frame);
  if (add) {
    const already = keys.every((key) => state.picked.some((picked) => same(picked, key)));
    state.picked = already
      ? state.picked.filter((picked) => !keys.some((key) => same(picked, key)))
      : [...state.picked, ...keys.filter((key) => !state.picked.some((picked) => same(picked, key)))];
  } else {
    state.picked = keys;
  }
};

const interpColour = (interp: Interpolation) =>
  interp === 'constant' ? '#adb5bd' : interp === 'linear' ? '#ced4da' : interp === 'bezier' ? '#fff' : '#d0bfff';

/** moving picked keys: they follow the pointer in whole frames and land on release */
const dragDelta = ref(0);
const startKeyDrag = (event: PointerEvent, line: Line, frame: number) => {
  if (event.button === 2) {
    return;
  }
  if (!isPicked(line, frame) || event.shiftKey) {
    pick(line, frame, event.shiftKey);
  }
  const startX = event.clientX;
  const perFrame = width.value / (viewEnd.value - viewStart.value);
  const move = (moveEvent: PointerEvent) => {
    dragDelta.value = Math.round((moveEvent.clientX - startX) / perFrame);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    const delta = dragDelta.value;
    dragDelta.value = 0;
    if (delta) {
      shiftKeys(state.picked, delta);
    } else if (!event.shiftKey) {
      // a click on a key shows its frame
      setFrame(frame, { camera: state.lookThrough });
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
};

const toggle = (owner: string) => {
  state.expanded[owner] = !state.expanded[owner];
};

/** a click on a group's name selects it in the model */
const clickName = (line: Line) => {
  if (line.owner.startsWith('obj:') && !line.channel) {
    const found = findInstance(Number(line.owner.slice(4)));
    if (found) {
      if (found.ancestors.length) {
        editor.setContext(found.ancestors);
      } else if (editor.activePath.length) {
        editor.setContext([]);
      }
      editor.select([{ kind: 'instance', id: found.instance.id }]);
    }
  } else if (!line.channel && line.owner !== '*') {
    toggle(line.owner);
  }
};

// ------------------------------------------------------------ graph editor

const openGraph = () => {
  state.timelineView = 'graph';
  learn('graph');
};

const graphShown = (owner: string, channel: string) => state.graphChannels.includes(`${owner}|${channel}`);
const toggleGraph = (owner: string, channel: string) => {
  const id = `${owner}|${channel}`;
  state.graphChannels = graphShown(owner, channel) ? state.graphChannels.filter((entry) => entry !== id) : [...state.graphChannels, id];
};
const showOwner = (owner: string) => {
  const row = rows.value.find((entry) => entry.owner === owner);
  if (row) {
    state.graphChannels = row.channels.map((channel) => `${owner}|${channel.channel}`);
  }
};

/** the curves the graph shows: the ones ticked – or, when none is, those of the selected groups (else all) */
const graphCurves = computed(() => {
  const all = rows.value.flatMap((row) => row.channels.map((channel) => ({ ...channel, owner: row.owner })));
  const ticked = all.filter((channel) => graphShown(channel.owner, channel.channel));
  if (ticked.length) {
    return ticked;
  }
  const selected = all.filter((channel) => selectedIds.value.has(channel.owner));
  return selected.length ? selected : all;
});

// ------------------------------------------------------------ the keys' menu

const menu = ref<{ x: number; y: number; owner: string; channel: string | null } | null>(null);
const closeMenu = () => {
  menu.value = null;
};
const openMenu = (event: MouseEvent, line: Line, frame: number) => {
  if (!isPicked(line, frame)) {
    pick(line, frame, false);
  }
  menu.value = { x: event.clientX, y: Math.max(8, event.clientY - 300), owner: line.owner, channel: line.channel };
};
const openGraphMenu = (event: { x: number; y: number; owner: string; channel: string }) => {
  menu.value = { x: event.x, y: Math.max(8, event.y - 300), owner: event.owner, channel: event.channel };
};
const cycled = computed(() => {
  if (!menu.value?.channel) {
    return false;
  }
  return !!readTracks(scene.value, menu.value.owner)?.[menu.value.channel]?.cycle;
});
const menuInterp = (interp: Interpolation) => {
  setInterpolation(state.picked, interp);
  closeMenu();
};
const menuHandles = (kind: 'auto' | 'flat') => {
  setHandles(state.picked, kind);
  closeMenu();
};
const menuCycle = () => {
  if (menu.value?.channel) {
    setCycle(menu.value.owner, menu.value.channel, !cycled.value);
  }
  closeMenu();
};
const menuDelete = () => {
  deleteKeys(state.picked);
  closeMenu();
};

// ------------------------------------------------------------ keys of the keyboard

/** I: the selected groups, the bones just posed or the camera there is – else it says what to do */
const insertKey = () => keyWhatIsMeant();

const onKey = (event: KeyboardEvent) => {
  // undo, redo, save and the palette stay the app's
  if (event.ctrlKey || event.metaKey) {
    return;
  }
  const key = event.key;
  const handled = (() => {
    if (key === ' ') {
      togglePlay();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      stepFrame(key === 'ArrowLeft' ? -1 : 1);
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      jumpKey(key === 'ArrowDown' ? -1 : 1);
    } else if (key === 'Home' || key === 'End') {
      jumpTo(key === 'Home' ? 'start' : 'end');
    } else if (key === 'Delete' || key === 'Backspace' || key.toLowerCase() === 'x') {
      deleteKeys(state.picked);
    } else if (key.toLowerCase() === 'i') {
      insertKey();
    } else if (key === 'Escape') {
      clearPicks();
      closeMenu();
    } else {
      return false;
    }
    return true;
  })();
  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
};
</script>
