<template>
  <div class="s3d-rp">
    <!-- the room -->
    <section class="s3d-rp-section">
      <div class="s3d-rp-heading">
        {{ t('roomplanner.room.title') }}
        <span v-if="room && !editingRoom" class="s3d-rp-row">
          <button class="s3d-btn small" @click="editRoom">{{ t('roomplanner.room.edit') }}</button>
          <button class="s3d-btn small" :title="t('roomplanner.room.addTitle')" @click="addRoom">{{ t('roomplanner.room.add') }}</button>
        </span>
      </div>
      <!-- several rooms side by side: the one worked on -->
      <div v-if="rooms.length > 1 && !editingRoom" class="s3d-rp-categories">
        <button v-for="(entry, index) in rooms" :key="entry.id" :class="{ active: entry.id === room?.id }" @click="chooseRoom(entry.id)">
          {{ roomName(entry.data, index) }}
        </button>
      </div>
      <template v-if="room && !editingRoom">
        <div class="s3d-rp-figures">
          <span>{{
            t('roomplanner.room.size', { width: cm(room.data.width), depth: cm(room.data.depth), height: cm(room.data.height) })
          }}</span>
          <span>{{ t('roomplanner.room.area', { area: number(figures!.area) }) }}</span>
          <span v-if="room.data.slopes?.length">{{ t('roomplanner.room.living', { area: number(figures!.living) }) }}</span>
          <span>{{ t('roomplanner.room.perimeter', { length: number(figures!.perimeter) }) }}</span>
          <span>{{ t('roomplanner.room.wallArea', { area: number(figures!.wallArea) }) }}</span>
          <span>{{ t('roomplanner.room.volume', { volume: number(figures!.volume) }) }}</span>
        </div>
        <!-- a maisonette: which floor is worked on (the lower one hides the upper floor) -->
        <div v-if="room.levels.length > 1" class="s3d-rp-levels">
          <button v-for="(_, level) in room.levels" :key="level" :class="{ active: state.level === level }" @click="chooseLevel(level)">
            {{ t(`roomplanner.levels.${level}`) }}
          </button>
        </div>
        <div class="s3d-rp-row">
          <label class="s3d-check">
            <input type="checkbox" :checked="state.showMeasures" @change="toggleMeasures" /> {{ t('roomplanner.room.showMeasures') }}
          </label>
          <label class="s3d-rp-inline">
            {{ t('roomplanner.room.walls') }}
            <select v-model="state.walls" class="s3d-input" @change="editor.redraw()">
              <option v-for="view in WALL_VIEWS" :key="view" :value="view">{{ t(`roomplanner.room.wallViews.${view}`) }}</option>
            </select>
          </label>
        </div>
        <button v-if="rooms.length > 1" class="s3d-btn small" @click="removeRoom">{{ t('roomplanner.room.remove') }}</button>
      </template>
      <template v-else>
        <S3dRoomPlannerRoom :draft="draft" :level="state.level" :stair="stairBox" :origin="[room?.x0 ?? 0, room?.y0 ?? 0]" />
        <div class="s3d-rp-row">
          <button class="s3d-btn small primary" @click="applyRoom">
            {{ room ? t('roomplanner.room.apply') : t('roomplanner.room.create') }}
          </button>
          <button v-if="room" class="s3d-btn small" @click="cancelRoom">{{ t('roomplanner.cancel') }}</button>
        </div>
      </template>
    </section>

    <!-- the selected pieces -->
    <section v-if="selected.length" class="s3d-rp-section s3d-rp-selected">
      <div class="s3d-rp-heading">
        {{ selected.length > 1 ? t('roomplanner.selection.many', { count: selected.length }) : selectedName }}
      </div>
      <template v-if="selected.length === 1 && selectedItem">
        <S3dRoomPlannerParams :item="selectedItem" :params="selected[0].data.params" @change="changeSelected" />
      </template>
      <div class="s3d-rp-row">
        <button class="s3d-btn small" :title="t('roomplanner.selection.turnLeftTitle')" @click="turnSelected(90)">⟲ 90°</button>
        <button class="s3d-btn small" :title="t('roomplanner.selection.turnRightTitle')" @click="turnSelected(-90)">⟳ 90°</button>
        <button class="s3d-btn small" @click="duplicateSelected">{{ t('roomplanner.selection.duplicate') }}</button>
        <button class="s3d-btn small" @click="removeSelected">{{ t('roomplanner.remove') }}</button>
      </div>
      <p class="s3d-rp-hint">{{ t('roomplanner.selection.hint') }}</p>
    </section>

    <!-- the catalog -->
    <section class="s3d-rp-section">
      <div class="s3d-rp-heading">
        {{ t('roomplanner.catalog.title') }}
        <button class="s3d-btn small" :title="t('roomplanner.tool.moveTitle')" @click="useTool">{{ t('roomplanner.tool.move') }}</button>
      </div>
      <div class="s3d-rp-categories">
        <button v-for="entry in CATEGORIES" :key="entry" :class="{ active: entry === category }" @click="category = entry">
          {{ t(`roomplanner.categories.${entry}`) }}
        </button>
      </div>
      <div class="s3d-rp-items">
        <button
          v-for="entry in items"
          :key="entry.id"
          class="s3d-rp-item"
          :class="{ active: entry.id === chosen?.id }"
          :title="t('roomplanner.catalog.chooseTitle')"
          @click="choose(entry)"
          @dblclick="place"
        >
          <span class="s3d-rp-preview" v-html="previewSvg(entry, withDefaults(entry))"></span>
          <span class="s3d-rp-item-name">{{ t(`roomplanner.items.${entry.id}`) }}</span>
        </button>
      </div>
      <div v-if="chosen" class="s3d-rp-chosen">
        <span class="s3d-rp-preview large" v-html="previewSvg(chosen, chosenParams)"></span>
        <div class="s3d-rp-chosen-body">
          <strong>{{ t(`roomplanner.items.${chosen.id}`) }}</strong>
          <span class="s3d-rp-hint">{{ sizeText(chosen.size(chosenParams)) }}</span>
          <S3dRoomPlannerParams :item="chosen" :params="chosenParams" @change="(params) => (chosenParams = params)" />
          <button class="s3d-btn small primary" :title="t('roomplanner.catalog.placeTitle')" @click="place">
            {{ t('roomplanner.catalog.place') }}
          </button>
        </div>
      </div>
      <p v-if="state.placing" class="s3d-rp-hint strong">{{ t('roomplanner.tool.statusPlacing') }}</p>
    </section>

    <!-- what is in the room -->
    <section class="s3d-rp-section">
      <div class="s3d-rp-heading">
        {{ t('roomplanner.list.title') }}
        <button class="s3d-btn small" :disabled="!list.length" @click="downloadCsv">{{ t('roomplanner.list.csv') }}</button>
      </div>
      <p v-if="!list.length" class="s3d-rp-hint">{{ t('roomplanner.list.empty') }}</p>
      <button
        v-for="entry in list"
        :key="entry.key"
        class="s3d-rp-list-entry"
        :title="describeParams(entry.data)"
        @click="selectFurniture(entry.ids)"
      >
        <span class="s3d-rp-count">{{ entry.count }} ×</span>
        <span>{{ entry.name }}</span>
      </button>
      <p v-if="list.length" class="s3d-rp-hint">{{ t('roomplanner.list.total', { count: totalCount }) }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { CATEGORIES, CATALOG, itemById, withDefaults, type CatalogItem, type Category, type Params } from './catalog';
import {
  duplicateFurniture,
  furnitureName,
  removeFurniture,
  rotateFurniture,
  runPlace,
  selectFurniture,
  selectedFurniture,
} from './furniture';
import { describeParams, furnitureCsv, furnitureList } from './list';
import { previewSvg } from './preview';
import { DEFAULT_ROOM, findRoom, findRooms, normalizeRoom, roomFigures, roomName, type RoomData, WALL_VIEWS } from './room';
import S3dRoomPlannerRoom from './S3dRoomPlannerRoom.vue';
import { footprintOf } from './furniture';
import { formatNumber, pluginContext, t } from './runtime';
import { usePlannerState } from './state';
import S3dRoomPlannerParams from './S3dRoomPlannerParams.vue';

/** The room planner panel: the room, the catalog, the selected pieces and the list of what is in the room. */

const context = pluginContext();
const editor = context.editor;
const state = usePlannerState();

// the model is not reactive – the editor bumps these after changes and selections
const revision = computed(() => editor.ui.revision + editor.ui.selRev + state.revision);
const rooms = computed(() => {
  void revision.value;
  return findRooms();
});
const room = computed(() => {
  void revision.value;
  return findRoom();
});
const figures = computed(() => (room.value ? roomFigures(room.value.data) : null));
const selected = computed(() => {
  void revision.value;
  return selectedFurniture();
});
const selectedItem = computed(() => (selected.value.length === 1 ? itemById(selected.value[0].data.item) : undefined));
const selectedName = computed(() => (selected.value[0] ? furnitureName(selected.value[0].data) : ''));
const list = computed(() => {
  void revision.value;
  return furnitureList();
});
const totalCount = computed(() => list.value.reduce((sum, entry) => sum + entry.count, 0));

const cm = (metresValue: number) => Math.round(metresValue * 100);
const metres = (event: Event) => Math.max(0, Number((event.target as HTMLInputElement).value) / 100);
const number = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });
const sizeText = ([w, d, h]: [number, number, number]) => t('roomplanner.catalog.size', { width: cm(w), depth: cm(d), height: cm(h) });

// ------------------------------------------------------------ the room
const editingRoom = ref(false);
const draft = reactive<RoomData>(JSON.parse(JSON.stringify(DEFAULT_ROOM)));
/** the room being added (not yet in the model) – placed to the right of the others */
const adding = ref<[number, number] | null>(null);
const editRoom = () => {
  const source: RoomData = normalizeRoom(JSON.parse(JSON.stringify(room.value?.data ?? DEFAULT_ROOM)));
  Object.assign(draft, { name: '', shape: undefined, points: undefined, notch: null, slopes: [], roofWindows: [], upper: null }, source);
  delete draft.slope;
  adding.value = null;
  editingRoom.value = true;
};
const addRoom = () => {
  const right = Math.max(...rooms.value.map((entry) => entry.x1 + entry.data.wall));
  Object.assign(draft, JSON.parse(JSON.stringify(DEFAULT_ROOM)), {
    id: `room${Date.now().toString(36)}`,
    name: roomName(DEFAULT_ROOM, rooms.value.length),
    shape: undefined,
    points: undefined,
    notch: null,
    slopes: [],
    roofWindows: [],
    upper: null,
  });
  adding.value = [right + draft.wall, room.value?.y0 ?? 0];
  editingRoom.value = true;
};
const cancelRoom = () => {
  adding.value = null;
  editingRoom.value = false;
};
const chooseRoom = (id: string) => {
  state.roomId = id;
  state.revision++;
  editor.redraw();
};
const removeRoom = async () => {
  const current = room.value;
  if (current && (await context.ui.confirm(t('roomplanner.room.removeConfirm', { name: roomName(current.data) })))) {
    editor.commit('roomplanner.undo.removeRoom', () => editor.model.root.instances.delete(current.instance.id));
    state.roomId = null;
  }
};
/** the selected stair: the stairwell can be made to fit around it */
const stairBox = computed(() => {
  const piece = selected.value[0];
  return piece && itemById(piece.data.item)?.category === 'stairs' && piece.data.item !== 'railing'
    ? footprintOf(piece.instance, piece.data)
    : null;
});
const chooseLevel = (level: number) => {
  state.level = level;
  editor.redraw();
};
const applyRoom = () => {
  const input = adding.value ? { ...draft, at: adding.value } : { ...draft, id: draft.id ?? room.value?.id };
  const result = context.script.run(`s3d.room(${JSON.stringify(input)});`);
  if (!result.ok) {
    context.ui.toast(String(result.error ?? ''));
    return;
  }
  editingRoom.value = false;
  if (adding.value) {
    state.roomId = draft.id ?? null;
    adding.value = null;
    state.revision++;
  } else if (!room.value) {
    editor.viewer.rig.applyState({
      position: [draft.width / 2 - 0.5, -draft.depth * 0.9, draft.height * 2.6],
      target: [draft.width / 2, draft.depth / 2, 0.4],
      fov: 35,
      ortho: false,
    });
  }
};
watch(
  room,
  (current) => {
    if (!current && !editingRoom.value) {
      editRoom();
    }
  },
  { immediate: true },
);

const toggleMeasures = () => {
  state.showMeasures = !state.showMeasures;
  editor.redraw();
};

// ------------------------------------------------------------ the catalog
const category = ref<Category>('living');
const items = computed(() => CATALOG.filter((entry) => entry.category === category.value));
const chosen = ref<CatalogItem | null>(null);
const chosenParams = ref<Params>({});
const choose = (entry: CatalogItem) => {
  chosen.value = entry;
  chosenParams.value = withDefaults(entry);
};
const useTool = () => editor.setTool('roomplanner.planner');
/** the piece follows the pointer in the 3D view until a click places it */
const place = () => {
  if (!chosen.value) {
    return;
  }
  // the tool first: switching tools ends what the old one was doing
  useTool();
  state.placing = { item: chosen.value.id, params: { ...chosenParams.value } };
  state.turn = 0;
};

// ------------------------------------------------------------ the selected pieces
const changeSelected = (params: Params) => {
  const piece = selected.value[0];
  const id = piece && runPlace(piece.data.item, { params, replace: piece.instance.id });
  if (id != null) {
    selectFurniture([id]);
  }
};
const turnSelected = (degrees: number) => selected.value.forEach(({ instance }) => rotateFurniture(instance, degrees));
const duplicateSelected = () => {
  const copies = selected.value.flatMap(({ instance }) => {
    const copy = duplicateFurniture(instance);
    return copy ? [copy.id] : [];
  });
  selectFurniture(copies);
};
const removeSelected = () => {
  removeFurniture(selected.value.map(({ instance }) => instance));
  editor.select([], 'set');
};

// ------------------------------------------------------------ the list
const downloadCsv = () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + furnitureCsv()], { type: 'text/csv' }));
  link.download = `${editor.model.name || t('roomplanner.plugin.name')} – ${t('roomplanner.list.title')}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
</script>
