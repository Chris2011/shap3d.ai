<template>
  <div class="s3d-rp-room-form">
    <label class="s3d-rp-field">
      <span>{{ t('roomplanner.room.nameLabel') }}</span>
      <input v-model="draft.name" class="s3d-input" :placeholder="t('roomplanner.room.name')" />
    </label>
    <div class="s3d-rp-grid">
      <template v-for="key in ['width', 'depth', 'height', 'wall'] as const" :key="key">
        <label v-if="!(polygon && (key === 'width' || key === 'depth'))" class="s3d-rp-field">
          <span>{{ t(`roomplanner.room.${key}`) }}</span>
          <input class="s3d-input" type="number" min="1" step="1" :value="cm(draft[key])" @change="draft[key] = metres($event)" />
        </label>
      </template>
      <label class="s3d-rp-field">
        <span>{{ t('roomplanner.room.floor') }}</span>
        <select v-model="draft.floor" class="s3d-input">
          <option v-for="floor in FLOORS" :key="floor" :value="floor">{{ t(`roomplanner.floors.${floor}`) }}</option>
        </select>
      </label>
    </div>

    <!-- the floor plan: a rectangle, an L or a free polygon (slanted and round walls) -->
    <div class="s3d-rp-subheading">{{ t('roomplanner.room.shape') }}</div>
    <div class="s3d-rp-row">
      <select class="s3d-input" :value="shape" @change="setShape(($event.target as HTMLSelectElement).value as Shape)">
        <option v-for="option in SHAPES" :key="option" :value="option">{{ t(`roomplanner.room.shapes.${option}`) }}</option>
      </select>
      <select v-if="shape === 'L' && draft.notch" v-model="draft.notch.corner" class="s3d-input">
        <option v-for="corner in CORNERS" :key="corner" :value="corner">{{ t(`roomplanner.corners.${corner}`) }}</option>
      </select>
    </div>
    <div v-if="shape === 'L' && draft.notch" class="s3d-rp-grid">
      <label v-for="key in ['width', 'depth'] as const" :key="key" class="s3d-rp-field">
        <span>{{ t(`roomplanner.room.notch.${key}`) }}</span>
        <input
          class="s3d-input"
          type="number"
          min="30"
          step="1"
          :value="cm(draft.notch[key])"
          @change="draft.notch![key] = metres($event)"
        />
      </label>
    </div>
    <template v-if="polygon && draft.points">
      <span class="s3d-rp-hint">{{ t('roomplanner.room.points.hint') }}</span>
      <div class="s3d-rp-points">
        <span></span>
        <span>{{ t('roomplanner.room.points.x') }}</span>
        <span>{{ t('roomplanner.room.points.y') }}</span>
        <span :title="t('roomplanner.room.points.bulgeTitle')">{{ t('roomplanner.room.points.bulge') }}</span>
        <span></span>
        <template v-for="(point, i) in draft.points" :key="i">
          <span class="s3d-rp-count">{{ i + 1 }}</span>
          <input class="s3d-input" type="number" step="1" :value="cm(point.x)" @change="point.x = value($event)" />
          <input class="s3d-input" type="number" step="1" :value="cm(point.y)" @change="point.y = value($event)" />
          <input class="s3d-input" type="number" step="1" :value="cm(point.bulge ?? 0)" @change="point.bulge = value($event)" />
          <button
            class="s3d-rp-icon"
            :disabled="draft.points.length <= 3"
            :title="t('roomplanner.remove')"
            @click="draft.points.splice(i, 1)"
          >
            ×
          </button>
        </template>
      </div>
      <button class="s3d-btn small" @click="addPoint">{{ t('roomplanner.room.points.add') }}</button>
    </template>

    <!-- sloped ceilings on the top floor: shed, gable or hip roof, with roof windows -->
    <div class="s3d-rp-subheading s3d-rp-row">
      {{ t('roomplanner.room.slope.title') }}
      <button class="s3d-btn small" :title="t('roomplanner.room.slope.shedTitle')" @click="roof(['north'])">
        {{ t('roomplanner.room.slope.shed') }}
      </button>
      <button class="s3d-btn small" :title="t('roomplanner.room.slope.gableTitle')" @click="roof(['north', 'south'])">
        {{ t('roomplanner.room.slope.gable') }}
      </button>
      <button class="s3d-btn small" :title="t('roomplanner.room.slope.hipTitle')" @click="roof(['north', 'south', 'east', 'west'])">
        {{ t('roomplanner.room.slope.hip') }}
      </button>
    </div>
    <div v-for="(slope, i) in draft.slopes ?? []" :key="i" class="s3d-rp-grid s3d-rp-slope">
      <label class="s3d-rp-field">
        <span>{{ t('roomplanner.room.slope.side') }}</span>
        <select v-model="slope.side" class="s3d-input">
          <option v-for="side in WALL_SIDES" :key="side" :value="side">{{ t(`roomplanner.walls.${side}`) }}</option>
        </select>
      </label>
      <label v-for="key in ['knee', 'depth'] as const" :key="key" class="s3d-rp-field">
        <span>{{ t(`roomplanner.room.slope.${key}`) }}</span>
        <input class="s3d-input" type="number" min="0" step="1" :value="cm(slope[key])" @change="slope[key] = metres($event)" />
      </label>
      <button class="s3d-rp-icon" :title="t('roomplanner.remove')" @click="draft.slopes!.splice(i, 1)">×</button>
    </div>
    <div class="s3d-rp-row">
      <button class="s3d-btn small" :disabled="(draft.slopes?.length ?? 0) >= 4" @click="addSlope">
        {{ t('roomplanner.room.slope.add') }}
      </button>
      <button class="s3d-btn small" :disabled="!draft.slopes?.length" @click="addRoofWindow">
        {{ t('roomplanner.room.roofWindow.add') }}
      </button>
    </div>
    <div v-for="(window, i) in draft.roofWindows ?? []" :key="window.id" class="s3d-rp-opening">
      <div class="s3d-rp-row">
        <strong>{{ t('roomplanner.room.roofWindow.name') }}</strong>
        <button class="s3d-rp-icon" :title="t('roomplanner.remove')" @click="draft.roofWindows!.splice(i, 1)">×</button>
      </div>
      <div class="s3d-rp-grid four">
        <label v-for="key in ['x', 'y', 'w', 'd'] as const" :key="key" class="s3d-rp-field">
          <span>{{ t(`roomplanner.room.roofWindow.${key}`) }}</span>
          <input class="s3d-input" type="number" step="1" :value="cm(window[key])" @change="window[key] = metres($event)" />
        </label>
      </div>
    </div>

    <!-- a maisonette: an upper floor with a stairwell -->
    <label class="s3d-check s3d-rp-subheading">
      <input
        type="checkbox"
        :checked="!!draft.upper"
        @change="draft.upper = checked($event) ? JSON.parse(JSON.stringify(DEFAULT_UPPER)) : null"
      />
      {{ t('roomplanner.room.upper.title') }}
    </label>
    <template v-if="draft.upper">
      <div class="s3d-rp-grid">
        <label v-for="key in ['height', 'slab'] as const" :key="key" class="s3d-rp-field">
          <span>{{ t(`roomplanner.room.upper.${key}`) }}</span>
          <input
            class="s3d-input"
            type="number"
            min="1"
            step="1"
            :value="cm(draft.upper[key])"
            @change="draft.upper![key] = metres($event)"
          />
        </label>
      </div>
      <span class="s3d-rp-hint">{{ t('roomplanner.room.upper.stairwell') }}</span>
      <div class="s3d-rp-grid four">
        <label v-for="key in ['x', 'y', 'w', 'd'] as const" :key="key" class="s3d-rp-field">
          <span>{{ t(`roomplanner.room.upper.${key}`) }}</span>
          <input
            class="s3d-input"
            type="number"
            step="1"
            :value="cm(draft.upper.stairwell[key])"
            @change="draft.upper!.stairwell[key] = metres($event)"
          />
        </label>
      </div>
      <div class="s3d-rp-row">
        <label class="s3d-check">
          <input v-model="draft.upper.stairwell.round" type="checkbox" /> {{ t('roomplanner.room.upper.round') }}
        </label>
        <button class="s3d-btn small" :disabled="!stair" :title="t('roomplanner.room.upper.fitTitle')" @click="fitStairwell">
          {{ t('roomplanner.room.upper.fit') }}
        </button>
      </div>
    </template>

    <div class="s3d-rp-subheading">{{ t('roomplanner.room.openings') }}</div>
    <div v-for="opening in draft.openings" :key="opening.id" class="s3d-rp-opening">
      <div class="s3d-rp-row">
        <strong>{{ t(`roomplanner.room.${opening.kind}`) }}</strong>
        <select v-model="opening.wall" class="s3d-input">
          <option v-for="edge in straightEdges" :key="edge.index" :value="edge.index">{{ edgeName(edge) }}</option>
        </select>
        <select v-if="draft.upper" v-model="opening.level" class="s3d-input s3d-rp-narrow">
          <option v-for="level in [0, 1]" :key="level" :value="level">{{ t(`roomplanner.levels.${level}`) }}</option>
        </select>
        <button
          class="s3d-rp-icon"
          :title="t('roomplanner.remove')"
          @click="draft.openings = draft.openings.filter((other) => other.id !== opening.id)"
        >
          ×
        </button>
      </div>
      <div class="s3d-rp-grid four">
        <label v-for="key in openingKeys(opening.kind)" :key="key" class="s3d-rp-field">
          <span>{{ t(`roomplanner.room.${key}`) }}</span>
          <input class="s3d-input" type="number" min="0" step="1" :value="cm(opening[key])" @change="opening[key] = metres($event)" />
        </label>
      </div>
    </div>
    <div class="s3d-rp-row">
      <button class="s3d-btn small" @click="addOpening('door')">{{ t('roomplanner.room.addDoor') }}</button>
      <button class="s3d-btn small" @click="addOpening('window')">{{ t('roomplanner.room.addWindow') }}</button>
    </div>
    <p v-if="polygon" class="s3d-rp-hint">{{ t('roomplanner.room.curvedHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Footprint } from './furniture';
import {
  CORNERS,
  DEFAULT_SLOPE,
  DEFAULT_UPPER,
  WALL_SIDES,
  cornersOf,
  edgesOf,
  type Edge,
  type FloorId,
  type Opening,
  type RoomData,
  type Shape,
  type WallSide,
} from './room';
import { t } from './runtime';

/**
 * The room being edited: size, floor plan (rectangle, L or free polygon with bulging walls), sloped ceilings
 * and roof windows, the upper floor with its stairwell, doors and windows. It changes `draft` directly.
 */
const props = defineProps<{ draft: RoomData; level: number; stair: Footprint | null; origin: [number, number] }>();

const FLOORS: FloorId[] = ['floor', 'tiles', 'concrete', 'carpet'];
const SHAPES: Shape[] = ['rect', 'L', 'polygon'];

const cm = (metresValue: number) => Math.round(metresValue * 100);
const metres = (event: Event) => Math.max(0, Number((event.target as HTMLInputElement).value) / 100);
/** a coordinate in cm (may be negative while editing) */
const value = (event: Event) => Number((event.target as HTMLInputElement).value) / 100;
const checked = (event: Event) => (event.target as HTMLInputElement).checked;
const newId = () => Math.random().toString(36).slice(2, 8);

const shape = computed<Shape>(() => props.draft.shape ?? (props.draft.notch ? 'L' : 'rect'));
const polygon = computed(() => shape.value === 'polygon');
const setShape = (next: Shape) => {
  const draft = props.draft;
  if (next === 'polygon') {
    // start from the plan as it is now
    draft.points = cornersOf(draft).map((corner) => ({ x: corner.x, y: corner.y, bulge: corner.bulge ?? 0 }));
  }
  draft.notch = next === 'L' ? (draft.notch ?? { corner: 'ne', width: draft.width / 2, depth: draft.depth / 2 }) : null;
  draft.shape = next;
};
const addPoint = () => {
  const points = props.draft.points!;
  const last = points[points.length - 1],
    first = points[0];
  points.push({ x: (last.x + first.x) / 2, y: (last.y + first.y) / 2 - 0.5, bulge: 0 });
};

const roof = (sides: WallSide[]) => (props.draft.slopes = sides.map((side) => ({ ...DEFAULT_SLOPE, side })));
const addSlope = () => {
  const used = new Set((props.draft.slopes ?? []).map((slope) => slope.side));
  const side = WALL_SIDES.find((candidate) => !used.has(candidate)) ?? 'north';
  props.draft.slopes = [...(props.draft.slopes ?? []), { ...DEFAULT_SLOPE, side }];
};
/** a roof window in the middle of the first slope */
const addRoofWindow = () => {
  const draft = props.draft;
  const slope = draft.slopes![0];
  const middle = slope.depth / 2;
  const at = {
    south: [draft.width / 2, middle],
    north: [draft.width / 2, draft.depth - middle],
    west: [middle, draft.depth / 2],
    east: [draft.width - middle, draft.depth / 2],
  }[slope.side];
  draft.roofWindows = [...(draft.roofWindows ?? []), { id: newId(), x: at[0], y: at[1], w: 0.78, d: 0.98 }];
};

const fitStairwell = () => {
  const box = props.stair;
  if (!box || !props.draft.upper) {
    return;
  }
  const round = (number: number) => Math.round(number * 100) / 100;
  props.draft.upper.stairwell = {
    x: round(box.x0 - props.origin[0]),
    y: round(box.y0 - props.origin[1]),
    w: round(box.x1 - box.x0),
    d: round(box.y1 - box.y0),
    round: props.draft.upper.stairwell.round,
  };
};

/** the walls openings can go in (curved ones cannot) */
const edges = computed(() => edgesOf(props.draft));
const straightEdges = computed(() => edges.value.filter((edge) => Math.abs(edge.bulge) < 0.01));
const edgeName = (edge: Edge) => {
  const same = edges.value.filter((candidate) => candidate.side === edge.side);
  const suffix = same.length > 1 ? ` ${same.indexOf(edge) + 1}` : '';
  return `${t(`roomplanner.walls.${edge.side}`)}${suffix} (${cm(edge.length)} cm)`;
};
const openingKeys = (kind: Opening['kind']) =>
  kind === 'window' ? (['offset', 'width', 'height', 'sill'] as const) : (['offset', 'width', 'height'] as const);
const addOpening = (kind: Opening['kind']) =>
  props.draft.openings.push(
    kind === 'door'
      ? { id: newId(), kind, wall: straightEdges.value[0]?.index ?? 0, offset: 0.5, width: 0.9, height: 2.1, sill: 0, level: 0 }
      : {
          id: newId(),
          kind,
          wall: straightEdges.value[Math.min(2, straightEdges.value.length - 1)]?.index ?? 0,
          offset: 1,
          width: 1.2,
          height: 1.3,
          sill: 0.9,
          level: props.draft.upper ? props.level : 0,
        },
  );
</script>
