<template>
  <div ref="root" class="s3d-lo" tabindex="-1" @keydown="onKey">
    <!-- sheets and library -->
    <aside class="s3d-lo-side">
      <div class="s3d-lo-title">{{ t('layout.sheets') }}</div>
      <!-- drag a sheet to put it somewhere else -->
      <button
        v-for="(page, index) in layoutDoc.pages"
        :key="page.id"
        class="s3d-lo-page"
        :class="{ active: page.id === currentPage?.id, 'drop-target': dropTarget === page.id }"
        draggable="true"
        @click="selectPage(page.id)"
        @dragstart="draggedPage = page.id"
        @dragover.prevent="dropTarget = page.id"
        @dragleave="dropTarget = null"
        @drop.prevent="dropPage(page.id)"
        @dragend="draggedPage = dropTarget = null"
      >
        <span class="s3d-lo-page-number">{{ index + 1 }}</span>
        <span class="s3d-lo-page-name">{{ page.name }}</span>
      </button>
      <div class="s3d-lo-side-actions s3d-lo-add">
        <button class="s3d-btn small" :title="t('layout.templates.addTitle')" @click="addPage()">{{ t('layout.addSheet') }}</button>
        <button class="s3d-btn small" :title="t('layout.templates.title')" @click="addMenu = !addMenu">▾</button>
        <button class="s3d-btn small" :disabled="!scenes.length" :title="t('layout.fromScenesTitle')" @click="fromScenes">
          {{ t('layout.fromScenes') }}
        </button>
        <!-- new sheet from a template; the star marks the default for "+ Sheet" -->
        <div v-if="addMenu" class="s3d-lo-menu s3d-lo-template-menu">
          <div class="s3d-lo-menu-row">
            <button @click="addPage(null)">{{ t('layout.templates.empty') }}</button>
            <button
              class="s3d-lo-icon-button"
              :class="{ off: defaultTemplate !== null }"
              :title="t('layout.templates.default')"
              @click="chooseDefault(null)"
            >
              ★
            </button>
          </div>
          <div v-for="template in templates" :key="template.id" class="s3d-lo-menu-row">
            <button @click="addPage(template.id)">{{ template.name }}</button>
            <button
              class="s3d-lo-icon-button"
              :class="{ off: defaultTemplate !== template.id }"
              :title="t('layout.templates.default')"
              @click="chooseDefault(template.id)"
            >
              ★
            </button>
            <button class="s3d-lo-icon-button" :title="t('layout.templates.remove')" @click="dropTemplate(template.id)">×</button>
          </div>
          <p v-if="!templates.length" class="s3d-lo-hint">{{ t('layout.templates.none') }}</p>
        </div>
      </div>
      <S3dLayoutLayers v-if="currentPage" :document="layoutDoc" :active="activeLayer.id" @activate="(id) => (activeLayerId = id)" />
      <S3dLayoutLibrary v-if="currentPage" :active="tool === 'symbol' ? pendingSymbol : null" @pick="pickSymbol" />
    </aside>

    <!-- paper -->
    <main class="s3d-lo-main">
      <div class="s3d-lo-toolbar">
        <div v-for="group in TOOL_GROUPS" :key="group[0]" class="s3d-lo-tool-group">
          <button
            class="s3d-lo-tool"
            :class="{ active: group.includes(tool) }"
            :disabled="!currentPage"
            :title="t(`layout.tools.${shown(group)}Title`)"
            @click="setTool(shown(group))"
          >
            {{ t(`layout.tools.${shown(group)}`) }}
          </button>
          <button
            v-if="group.length > 1"
            class="s3d-lo-tool s3d-lo-more"
            :disabled="!currentPage"
            @click="menu = menu === group[0] ? null : group[0]"
          >
            ▾
          </button>
          <div v-if="menu === group[0]" class="s3d-lo-menu">
            <button
              v-for="id in group"
              :key="id"
              :class="{ active: tool === id }"
              :title="t(`layout.tools.${id}Title`)"
              @click="chooseVariant(group, id)"
            >
              {{ t(`layout.tools.${id}`) }}
            </button>
          </div>
        </div>
        <label v-if="AMOUNT_TOOLS.includes(tool)" class="s3d-lo-amount">
          {{ tool === 'polygon' ? t('layout.shape.sides') : t('layout.amount') }}
          <input v-model.number="amounts[tool]" class="s3d-input" type="number" :min="tool === 'polygon' ? 3 : 0" step="0.5" />
        </label>
        <span class="s3d-lo-gap"></span>
        <button class="s3d-lo-tool" :disabled="!canGoPage(-1)" :title="t('layout.previousPage')" @click="goPage(-1)">‹</button>
        <button class="s3d-lo-tool" :disabled="!canGoPage(1)" :title="t('layout.nextPage')" @click="goPage(1)">›</button>
        <button class="s3d-lo-tool" :disabled="!currentPage" @click="zoom = Math.max(0.25, zoom / 1.25)">−</button>
        <button class="s3d-lo-tool" :disabled="!currentPage" @click="zoom = 1">{{ Math.round(zoom * 100) }} %</button>
        <button class="s3d-lo-tool" :disabled="!currentPage" @click="zoom = Math.min(6, zoom * 1.25)">+</button>
        <span class="s3d-lo-gap"></span>
        <button class="s3d-lo-tool" :disabled="!currentPage" @click="currentPage && exportPageSvg(currentPage)">
          {{ t('layout.exportSvg') }}
        </button>
        <button class="s3d-lo-tool" :disabled="!layoutDoc.pages.length" @click="present">{{ t('layout.present') }}</button>
        <button class="s3d-lo-tool primary" :disabled="!layoutDoc.pages.length" @click="printSheets()">{{ t('layout.print') }}</button>
      </div>

      <div
        ref="canvas"
        class="s3d-lo-canvas"
        :class="{ panning: !!pan }"
        @wheel.prevent="onWheel"
        @pointerdown.capture="onCanvasDown"
        @pointermove="onCanvasMove"
        @pointerup="pan = null"
        @mousedown.middle.prevent
        @pointerdown.self="closeMenus"
      >
        <div v-if="!currentPage" class="s3d-lo-empty">
          <p>{{ t('layout.empty') }}</p>
          <div class="s3d-lo-side-actions">
            <button class="s3d-btn small" @click="addPage()">{{ t('layout.addSheet') }}</button>
            <button class="s3d-btn small" :disabled="!scenes.length" @click="fromScenes">{{ t('layout.fromScenes') }}</button>
          </div>
        </div>
        <div
          v-else
          ref="paper"
          class="s3d-lo-paper"
          :class="`tool-${tool}`"
          :style="{ width: `${paperWidth}px`, height: `${paperHeight}px` }"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @dblclick="onDoubleClick"
          @contextmenu.prevent="onContextMenu"
        >
          <div class="s3d-lo-svg" v-html="svg"></div>
          <!-- selection, handles and what is being drawn – in paper millimetres -->
          <svg class="s3d-lo-overlay" :viewBox="`0 0 ${size[0]} ${size[1]}`">
            <path v-if="gridPath" :d="gridPath" class="s3d-lo-grid-lines" />
            <rect v-for="(box, i) in selectionBoxes" :key="i" v-bind="box" class="s3d-lo-selection" />
            <rect v-if="pending" v-bind="pending" class="s3d-lo-pending" />
            <circle
              v-for="handle in handles"
              :key="handle.id"
              :cx="handle.x"
              :cy="handle.y"
              :r="handleRadius"
              class="s3d-lo-handle"
              :data-handle="handle.id"
            />
            <rect v-if="draft.rect" v-bind="draft.rect" class="s3d-lo-draft" />
            <ellipse v-if="draft.ellipse" v-bind="draft.ellipse" class="s3d-lo-draft" />
            <path v-if="draft.path" :d="draft.path" class="s3d-lo-draft open" />
          </svg>
        </div>
      </div>
      <div class="s3d-lo-status">{{ status }}</div>
    </main>

    <S3dLayoutInspector
      :document="layoutDoc"
      :page="currentPage"
      :selection="selection"
      :scenes="scenes"
      @select="(ids) => (selectedIds = ids)"
      @duplicate-page="duplicatePage"
      @remove-page="removePage"
      @save-template="saveAsTemplate"
    />

    <!-- right-click on the sheet -->
    <div
      v-if="contextMenu"
      class="s3d-lo-menu s3d-lo-context"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @pointerdown.stop
    >
      <template v-if="contextViewport">
        <label class="s3d-lo-field">
          <span>{{ t('layout.viewport.scene') }}</span>
          <select
            class="s3d-input"
            :value="contextViewport.sceneId ?? ''"
            @change="changeContextViewport({ sceneId: inputValue($event) ? Number(inputValue($event)) : null })"
          >
            <option value="">{{ t('layout.viewport.storedView') }}</option>
            <option v-for="scene in scenes" :key="scene.id" :value="scene.id">{{ scene.name }}</option>
          </select>
        </label>
        <label class="s3d-lo-field">
          <span>{{ t('layout.viewport.scale') }}</span>
          <select
            class="s3d-input"
            :value="contextViewport.scale ?? ''"
            @change="changeContextViewport({ scale: inputValue($event) ? Number(inputValue($event)) : null })"
          >
            <option value="">{{ t('layout.viewport.fit') }}</option>
            <option v-if="contextViewport.scale && !SCALES.includes(contextViewport.scale)" :value="contextViewport.scale">
              {{ scaleText(contextViewport.scale) }}
            </option>
            <option v-for="scale in SCALES" :key="scale" :value="scale">1:{{ scale }}</option>
          </select>
        </label>
        <button @click="openInModel(contextViewport)">{{ t('layout.context.openInModel') }}</button>
        <hr />
      </template>
      <button @click="contextAction('front')">{{ t('layout.actions.toFront') }}</button>
      <button @click="contextAction('back')">{{ t('layout.actions.toBack') }}</button>
      <button @click="contextAction('duplicate')">{{ t('layout.actions.duplicate') }}</button>
      <button @click="contextAction('lock')">{{ t('layout.actions.lock') }}</button>
      <button @click="contextAction('remove')">{{ t('layout.remove') }}</button>
    </div>

    <!-- presentation: the sheets full screen, arrows or a click go on, Esc ends -->
    <div
      v-if="presenting"
      ref="presentation"
      class="s3d-lo-presentation"
      tabindex="-1"
      @click="presentStep(1)"
      @keydown.stop="onPresentKey"
    >
      <div class="s3d-lo-presentation-page" v-html="presentationSvg"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import {
  SCALES,
  changeDocument,
  layerOf,
  layersOf,
  loadDocument,
  newId,
  pageSize,
  setupOf,
  type ViewportElement,
  type Corners,
  type LayoutElement,
  type LayoutPage,
  type ShapeStyle,
  type SymbolElement,
} from './document';
import { addSheetFromScenes, exportPageSvg, modelSignature, newViewport, printSheets } from './actions';
import {
  addElements,
  arrangeElements,
  changeElements,
  duplicateElements,
  groupElements,
  removeElements,
  replaceElement,
  ungroupElement,
} from './edit';
import { copied, elementBounds, handlesOf, moved, withHandle, type Box, type Handle } from './elements';
import { angleTo, arcPath, arcThroughPoints, extendLine, joinCorner, offsetElement, splitElement, trimLine, type Point } from './geometry';
import { pageSvg, scaleText, symbolSize, viewportUnder } from './render';
import { defaultTemplateId, loadTemplates, removeTemplate, saveTemplate, setDefaultTemplate, sheetFrom } from './templates';
import { symbolById } from './symbols';
import { pluginContext, t } from './runtime';
import S3dLayoutInspector from './S3dLayoutInspector.vue';
import S3dLayoutLayers from './S3dLayoutLayers.vue';
import S3dLayoutLibrary from './S3dLayoutLibrary.vue';

/** The workspace "Sheets": the list of sheets with the library, the tools and the paper, the properties. */

type ToolId =
  | 'select'
  | 'erase'
  | 'style'
  | 'viewport'
  | 'image'
  | 'text'
  | 'label'
  | 'dimension'
  | 'angle'
  | 'line'
  | 'freehand'
  | 'arc'
  | 'arc2'
  | 'pie'
  | 'rect'
  | 'rounded'
  | 'lozenge'
  | 'bulged'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'offset'
  | 'fillet'
  | 'chamfer'
  | 'trim'
  | 'extend'
  | 'split'
  | 'symbol';

/** the tools as in LayOut's toolbar – variants of one kind share a button with a menu */
const TOOL_GROUPS: ToolId[][] = [
  ['select'],
  ['erase'],
  ['style'],
  ['viewport', 'image'],
  ['text', 'label'],
  ['dimension', 'angle'],
  ['line', 'freehand'],
  ['arc', 'arc2', 'pie'],
  ['rect', 'rounded', 'lozenge', 'bulged'],
  ['circle', 'ellipse'],
  ['polygon'],
  ['offset'],
  ['fillet', 'chamfer'],
  ['trim', 'extend'],
  ['split'],
];
/** tools that take a number from the toolbar */
const AMOUNT_TOOLS: ToolId[] = ['offset', 'fillet', 'chamfer', 'polygon'];
const RECT_CORNERS: Partial<Record<ToolId, Corners>> = { rect: 'square', rounded: 'rounded', lozenge: 'lozenge', bulged: 'bulged' };

const context = pluginContext();
const editor = context.editor;

// the model is not reactive – the editor bumps ui.revision after every change (undo included)
const layoutDoc = computed(() => {
  void editor.ui.revision;
  return loadDocument();
});
const scenes = computed(() => {
  void editor.ui.revision;
  return [...editor.model.scenes];
});
const signature = computed(() => {
  void editor.ui.revision;
  return modelSignature();
});

const currentPageId = ref<string | null>(null);
const currentPage = computed(
  () => layoutDoc.value.pages.find((page) => page.id === currentPageId.value) ?? layoutDoc.value.pages[0] ?? null,
);
const pageId = () => currentPage.value?.id ?? '';
const selectedIds = ref<string[]>([]);
const selection = computed(() => currentPage.value?.elements.filter((element) => selectedIds.value.includes(element.id)) ?? []);

const tool = ref<ToolId>('select');
const variants = reactive<Record<string, ToolId>>({});
const menu = ref<ToolId | null>(null);
const amounts = reactive<Partial<Record<ToolId, number>>>({ offset: 3, fillet: 5, chamfer: 5, polygon: 6 });
const pendingSymbol = ref<string | null>(null);
/** clicks collected by tools that need several (angle, arcs, fillet, chamfer) */
const clicks = ref<{ point: Point; id?: string }[]>([]);
/** the style the style tool picked up */
const sampledStyle = ref<ShapeStyle | null>(null);
const zoom = ref(1);

const shown = (group: ToolId[]) => (group.includes(tool.value) ? tool.value : (variants[group[0]] ?? group[0]));
const setTool = (id: ToolId) => {
  tool.value = id;
  menu.value = null;
  clicks.value = [];
  sampledStyle.value = null;
  if (id !== 'select') {
    selectedIds.value = [];
  }
};
const chooseVariant = (group: ToolId[], id: ToolId) => {
  variants[group[0]] = id;
  setTool(id);
};
const pickSymbol = (symbol: string) => {
  setTool('symbol');
  pendingSymbol.value = symbol;
};

const selectPage = (id: string) => {
  currentPageId.value = id;
  selectedIds.value = [];
};
const pageIndex = computed(() => (currentPage.value ? layoutDoc.value.pages.indexOf(currentPage.value) : -1));
const canGoPage = (step: number) => pageIndex.value + step >= 0 && pageIndex.value + step < layoutDoc.value.pages.length;
const goPage = (step: number) => canGoPage(step) && selectPage(layoutDoc.value.pages[pageIndex.value + step].id);

// ------------------------------------------------------------ paper size on screen
const canvas = ref<HTMLElement | null>(null);
const paper = ref<HTMLElement | null>(null);
const root = ref<HTMLElement | null>(null);
const available = ref({ width: 800, height: 600 });
const measure = () => {
  if (canvas.value) {
    available.value = { width: canvas.value.clientWidth - 48, height: canvas.value.clientHeight - 48 };
  }
};
onMounted(() => {
  measure();
  new ResizeObserver(measure).observe(canvas.value!);
  root.value?.focus();
});
const size = computed(() => (currentPage.value ? pageSize(currentPage.value) : [420, 297]));
const fit = computed(() => Math.min(available.value.width / size.value[0], available.value.height / size.value[1]));
const paperWidth = computed(() => size.value[0] * fit.value * zoom.value);
const paperHeight = computed(() => size.value[1] * fit.value * zoom.value);
const handleRadius = computed(() => 5 / (fit.value * zoom.value));
/** the wheel zooms around the pointer – the point under it stays where it is */
const onWheel = async (event: WheelEvent) => {
  const before = paper.value?.getBoundingClientRect();
  zoom.value = Math.min(6, Math.max(0.25, zoom.value * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
  if (!before || !canvas.value) {
    return;
  }
  const fraction = { x: (event.clientX - before.left) / before.width, y: (event.clientY - before.top) / before.height };
  await nextTick();
  const after = paper.value!.getBoundingClientRect();
  canvas.value.scrollLeft += after.left + fraction.x * after.width - event.clientX;
  canvas.value.scrollTop += after.top + fraction.y * after.height - event.clientY;
};

/** the middle mouse button moves the sheet (pan) */
const pan = ref<{ x: number; y: number; left: number; top: number } | null>(null);
const onCanvasDown = (event: PointerEvent) => {
  if (event.button !== 1 || !canvas.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  pan.value = { x: event.clientX, y: event.clientY, left: canvas.value.scrollLeft, top: canvas.value.scrollTop };
  try {
    canvas.value.setPointerCapture(event.pointerId);
  } catch {
    // synthetic events have no active pointer
  }
};
const onCanvasMove = (event: PointerEvent) => {
  if (pan.value && canvas.value) {
    canvas.value.scrollLeft = pan.value.left - (event.clientX - pan.value.x);
    canvas.value.scrollTop = pan.value.top - (event.clientY - pan.value.y);
  }
};

// ------------------------------------------------------------ sheets and templates
const addMenu = ref(false);
const templates = ref(loadTemplates());
const defaultTemplate = ref(defaultTemplateId());
/** a new sheet – from a template (id), an empty one (null) or from the default template (undefined) */
const addPage = (templateId?: string | null) => {
  addMenu.value = false;
  const id = templateId === undefined ? defaultTemplate.value : templateId;
  const page = sheetFrom(
    templates.value.find((template) => template.id === id),
    t('layout.defaultSheet', { number: layoutDoc.value.pages.length + 1 }),
  );
  changeDocument((stored) => stored.pages.push(page), 'layout.undo.addSheet');
  selectPage(page.id);
};
const saveAsTemplate = async () => {
  const page = currentPage.value;
  const name = page && (await context.ui.prompt(t('layout.templates.name'), page.name));
  if (page && name) {
    saveTemplate(name, page);
    templates.value = loadTemplates();
    toast('layout.templates.saved');
  }
};
const chooseDefault = (id: string | null) => {
  setDefaultTemplate(id);
  defaultTemplate.value = id;
};
const dropTemplate = (id: string) => {
  removeTemplate(id);
  templates.value = loadTemplates();
  defaultTemplate.value = defaultTemplateId();
};

/** drag and drop in the list of sheets */
const draggedPage = ref<string | null>(null);
const dropTarget = ref<string | null>(null);
const dropPage = (targetId: string) => {
  const moving = draggedPage.value;
  draggedPage.value = dropTarget.value = null;
  if (!moving || moving === targetId) {
    return;
  }
  changeDocument((stored) => {
    const from = stored.pages.findIndex((page) => page.id === moving);
    const [page] = stored.pages.splice(from, 1);
    stored.pages.splice(
      stored.pages.findIndex((candidate) => candidate.id === targetId) +
        (from <= stored.pages.findIndex((candidate) => candidate.id === targetId) ? 1 : 0),
      0,
      page,
    );
  }, 'layout.undo.moveSheet');
};
const fromScenes = () => {
  const page = addSheetFromScenes();
  if (page) {
    selectPage(page.id);
  }
};
const duplicatePage = () => {
  const source = currentPage.value;
  if (!source) {
    return;
  }
  const copy: LayoutPage = {
    ...source,
    id: newId(),
    name: t('layout.copyOf', { name: source.name }),
    elements: source.elements.map(copied),
  };
  changeDocument(
    (stored) => stored.pages.splice(stored.pages.findIndex((page) => page.id === source.id) + 1, 0, copy),
    'layout.undo.addSheet',
  );
  selectPage(copy.id);
};
const removePage = async () => {
  const page = currentPage.value;
  if (page && (await context.ui.confirm(t('layout.page.removeConfirm', { name: page.name })))) {
    changeDocument((stored) => (stored.pages = stored.pages.filter((candidate) => candidate.id !== page.id)), 'layout.undo.removeSheet');
    currentPageId.value = null;
  }
};

// ------------------------------------------------------------ the paper
/** while moving or pulling a handle: the page with the changed elements (viewport images are cached) */
const preview = ref<LayoutElement[] | null>(null);
const svg = computed(() => {
  const page = currentPage.value;
  return page ? pageSvg(layoutDoc.value, preview.value ? { ...page, elements: preview.value } : page, signature.value, true) : '';
});

// ------------------------------------------------------------ layers, grid and snapping
const activeLayerId = ref('');
/** the layer new elements go to – the chosen one, else the top layer */
const activeLayer = computed(() => {
  const layers = layersOf(layoutDoc.value);
  return layers.find((layer) => layer.id === activeLayerId.value) ?? layers[layers.length - 1];
});
const setup = computed(() => setupOf(layoutDoc.value));
/** an element that can be picked: not locked, on a visible layer that is not locked */
const pickable = (element: LayoutElement) => {
  const layer = layerOf(layoutDoc.value, element);
  return !element.locked && layer.visible && !layer.locked;
};
const snap = (value: number) => {
  const step = setup.value.snapToGrid ? setup.value.gridSpacing : 0.5;
  return Math.round(value / step) * step;
};
const gridPath = computed(() => {
  if (!setup.value.grid) {
    return '';
  }
  const [width, height] = size.value;
  const step = setup.value.gridSpacing;
  const parts: string[] = [];
  for (let x = step; x < width; x += step) {
    parts.push(`M${x} 0V${height}`);
  }
  for (let y = step; y < height; y += step) {
    parts.push(`M0 ${y}H${width}`);
  }
  return parts.join('');
});
const toPaper = (event: PointerEvent | MouseEvent): Point => {
  const box = paper.value!.getBoundingClientRect();
  return {
    x: snap(((event.clientX - box.left) / box.width) * size.value[0]),
    y: snap(((event.clientY - box.top) / box.height) * size.value[1]),
  };
};
/** the element under the pointer (locked ones do not count) */
const elementAt = (event: Event) => {
  const target = (event.target as Element).closest('.s3d-lo-svg [data-id]');
  if (!target || target.hasAttribute('data-locked')) {
    return null;
  }
  return currentPage.value?.elements.find((element) => element.id === target.getAttribute('data-id')) ?? null;
};

const asBox = (box: Box, pad = 1) => ({ x: box.x - pad, y: box.y - pad, width: box.w + 2 * pad, height: box.h + 2 * pad });
const displayed = (element: LayoutElement) => preview.value?.find((candidate) => candidate.id === element.id) ?? element;
const selectionBoxes = computed(() => selection.value.map((element) => asBox(elementBounds(displayed(element)))));
const handles = computed(() => (tool.value === 'select' && selection.value.length === 1 ? handlesOf(displayed(selection.value[0])) : []));
/** the first element picked by fillet/chamfer, shown until the second one is clicked */
const pending = computed(() => {
  const first = clicks.value[0]?.id ? currentPage.value?.elements.find((element) => element.id === clicks.value[0].id) : null;
  return first ? asBox(elementBounds(first)) : null;
});

// ------------------------------------------------------------ pointer
interface Drag {
  kind: 'move' | 'handle' | 'draw' | 'band';
  start: Point;
  current: Point;
  handle?: Handle['id'];
  /** the points of a freehand line */
  points?: Point[];
}
const drag = ref<Drag | null>(null);

/** with Shift, lines and dimensions stay horizontal or vertical */
const constrained = (event: PointerEvent, start: Point, point: Point) =>
  event.shiftKey
    ? Math.abs(point.x - start.x) > Math.abs(point.y - start.y)
      ? { x: point.x, y: start.y }
      : { x: start.x, y: point.y }
    : point;

const capture = (event: PointerEvent) => {
  try {
    paper.value!.setPointerCapture(event.pointerId); // keeps the drag when the pointer leaves the paper
  } catch {
    // no active pointer with this id (synthetic events) – dragging still works inside the paper
  }
};

const created = (elements: LayoutElement[], keepTool = false) => {
  if (activeLayer.value.locked) {
    toast('layout.layers.lockedActive');
    return;
  }
  elements = elements.map((element) => ({ ...element, layer: activeLayer.value.id }));
  addElements(pageId(), elements);
  if (!keepTool) {
    tool.value = 'select';
    selectedIds.value = elements.map((element) => element.id);
  }
};

const toast = (key: string) => context.ui.toast(t(key));

/** tools that act on a click on an element */
const onElementClick = (element: LayoutElement | null, point: Point) => {
  if (!element) {
    toast('layout.status.pickElement');
    return;
  }
  switch (tool.value) {
    case 'erase':
      removeElements(pageId(), [element.id]);
      return;
    case 'style':
      if (!sampledStyle.value) {
        sampledStyle.value = JSON.parse(JSON.stringify(element.style ?? {}));
        toast('layout.status.styleSampled');
      } else {
        const style = sampledStyle.value;
        changeElements(pageId(), [element.id], (target) => (target.style = { ...style }));
      }
      return;
    case 'offset': {
      const copy = offsetElement(element, amounts.offset ?? 3, point);
      return copy ? created([copy], true) : toast('layout.status.cannotOffset');
    }
    case 'split': {
      const pieces = splitElement(element, point);
      return pieces ? replaceElement(pageId(), element.id, pieces) : toast('layout.status.cannotSplit');
    }
    case 'trim':
    case 'extend': {
      if (element.type !== 'line') {
        return toast('layout.status.linesOnly');
      }
      if (tool.value === 'trim') {
        replaceElement(pageId(), element.id, trimLine(currentPage.value!, element, point));
      } else {
        const longer = extendLine(currentPage.value!, element, point);
        return longer ? replaceElement(pageId(), element.id, [longer]) : toast('layout.status.nothingToReach');
      }
      return;
    }
    case 'fillet':
    case 'chamfer': {
      if (element.type !== 'line') {
        return toast('layout.status.linesOnly');
      }
      if (!clicks.value.length) {
        clicks.value = [{ point, id: element.id }];
        return;
      }
      const first = currentPage.value?.elements.find((candidate) => candidate.id === clicks.value[0].id);
      const firstClick = clicks.value[0].point;
      clicks.value = [];
      if (first?.type !== 'line' || first.id === element.id) {
        return;
      }
      const joined = joinCorner({ line: first, click: firstClick }, { line: element, click: point }, amounts[tool.value] ?? 5, tool.value);
      if (!joined) {
        return toast('layout.status.cannotJoinCorner');
      }
      replaceElement(pageId(), first.id, [joined.lines[0]]);
      replaceElement(pageId(), element.id, [joined.lines[1]], joined.corner ? [joined.corner] : []);
      return;
    }
  }
};

const CLICK_TOOLS: ToolId[] = ['erase', 'style', 'offset', 'split', 'trim', 'extend', 'fillet', 'chamfer'];

const onDown = async (event: PointerEvent) => {
  if (event.button !== 0) {
    return;
  }
  closeMenus();
  root.value?.focus();
  const point = toPaper(event);
  const target = event.target as Element;

  if (CLICK_TOOLS.includes(tool.value)) {
    onElementClick(elementAt(event), point);
    return;
  }
  if (tool.value === 'text') {
    const text = await context.ui.prompt(t('layout.text.prompt'));
    if (text) {
      created([{ id: newId(), type: 'text', x: point.x, y: point.y, text, size: 4 }]);
    }
    return;
  }
  if (tool.value === 'image') {
    placeImage(point);
    return;
  }
  if (tool.value === 'symbol' && pendingSymbol.value) {
    placeSymbol(pendingSymbol.value, point);
    return;
  }
  // tools with several clicks
  if (tool.value === 'angle') {
    clicks.value = [...clicks.value, { point }];
    if (clicks.value.length === 3) {
      const [vertex, first, second] = clicks.value.map((click) => click.point);
      clicks.value = [];
      const r = Math.max(
        4,
        Math.min(Math.hypot(first.x - vertex.x, first.y - vertex.y), Math.hypot(second.x - vertex.x, second.y - vertex.y)) * 0.6,
      );
      created([{ id: newId(), type: 'angle', cx: vertex.x, cy: vertex.y, x1: first.x, y1: first.y, x2: second.x, y2: second.y, r }]);
    }
    return;
  }
  if ((tool.value === 'arc' || tool.value === 'pie' || tool.value === 'arc2') && clicks.value.length === 2) {
    followArc(point);
    finishArc(point);
    return;
  }

  capture(event);
  if (tool.value !== 'select') {
    drag.value = { kind: 'draw', start: point, current: point, points: [point] };
    return;
  }
  const handle = target.getAttribute('data-handle') as Handle['id'] | null;
  if (handle && selection.value.length === 1) {
    drag.value = { kind: 'handle', handle, start: point, current: point };
    return;
  }
  const element = elementAt(event);
  if (!element) {
    if (!event.shiftKey) {
      selectedIds.value = [];
    }
    drag.value = { kind: 'band', start: point, current: point };
    return;
  }
  if (event.shiftKey) {
    selectedIds.value = selectedIds.value.includes(element.id)
      ? selectedIds.value.filter((id) => id !== element.id)
      : [...selectedIds.value, element.id];
    return;
  }
  if (!selectedIds.value.includes(element.id)) {
    selectedIds.value = [element.id];
  }
  drag.value = { kind: 'move', start: point, current: point };
};

const onMove = (event: PointerEvent) => {
  const current = drag.value;
  const point = toPaper(event);
  if (current) {
    const next = constrained(event, current.start, point);
    const points = current.points && tool.value === 'freehand' ? addFreehandPoint(current.points, point) : current.points;
    drag.value = { ...current, current: next, points };
    updatePreview();
  } else if (clicks.value.length === 2) {
    // the arc follows the pointer until the last click
    drag.value = null;
    followArc(point);
  }
};

const addFreehandPoint = (points: Point[], point: Point) => {
  const last = points[points.length - 1];
  return Math.hypot(point.x - last.x, point.y - last.y) >= 0.8 ? [...points, point] : points;
};

const updatePreview = () => {
  const current = drag.value;
  const page = currentPage.value;
  if (!current || !page) {
    preview.value = null;
    return;
  }
  if (current.kind === 'move') {
    const dx = current.current.x - current.start.x,
      dy = current.current.y - current.start.y;
    preview.value = page.elements.map((element) => (selectedIds.value.includes(element.id) ? moved(element, dx, dy) : element));
  } else if (current.kind === 'handle' && current.handle) {
    preview.value = page.elements.map((element) =>
      selectedIds.value.includes(element.id) ? withHandle(element, current.handle!, current.current) : element,
    );
  }
};

const onUp = () => {
  const current = drag.value;
  drag.value = null;
  const changed = preview.value;
  preview.value = null;
  if (!current) {
    return;
  }
  const { start, current: end } = current;
  if ((current.kind === 'move' || current.kind === 'handle') && changed && (end.x !== start.x || end.y !== start.y)) {
    const byId = new Map(changed.map((element) => [element.id, element]));
    changeElements(pageId(), selectedIds.value, (element) => Object.assign(element, byId.get(element.id)));
    return;
  }
  if (current.kind === 'band') {
    const band = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
    if (band.w > 1 || band.h > 1) {
      const inside = (currentPage.value?.elements ?? []).filter((element) => {
        const box = elementBounds(element);
        return (
          pickable(element) && box.x >= band.x && box.y >= band.y && box.x + box.w <= band.x + band.w && box.y + box.h <= band.y + band.h
        );
      });
      selectedIds.value = [...new Set([...selectedIds.value, ...inside.map((element) => element.id)])];
    }
    return;
  }
  if (current.kind === 'draw') {
    finishDrawing(current);
  }
};

const finishDrawing = (current: Drag) => {
  const { start, current: end } = current;
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const box = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(dx), h: Math.abs(dy) };
  const id = newId();
  switch (tool.value) {
    case 'viewport':
      return box.w >= 10 && box.h >= 10 && created([newViewport(box, scenes.value[0]?.id ?? null)]);
    case 'line':
      return distance >= 1 && created([{ id, type: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y }]);
    case 'freehand':
      return (
        (current.points?.length ?? 0) > 2 &&
        created([{ id, type: 'path', points: current.points!.map((point) => [point.x, point.y]), closed: false }])
      );
    case 'dimension':
      return distance >= 2 && created([{ id, type: 'dimension', x1: start.x, y1: start.y, x2: end.x, y2: end.y, offset: 8 }]);
    case 'label':
      if (distance >= 2) {
        void addLabel(start, end);
      }
      return;
    case 'rect':
    case 'rounded':
    case 'lozenge':
    case 'bulged':
      return (
        box.w >= 1 &&
        box.h >= 1 &&
        created([{ id, type: 'rect', ...box, corners: RECT_CORNERS[tool.value], radius: tool.value === 'rounded' ? 3 : undefined }])
      );
    case 'circle':
      return distance >= 0.5 && created([{ id, type: 'circle', cx: start.x, cy: start.y, r: distance }]);
    case 'ellipse':
      return (
        box.w >= 1 &&
        box.h >= 1 &&
        created([{ id, type: 'ellipse', cx: box.x + box.w / 2, cy: box.y + box.h / 2, rx: box.w / 2, ry: box.h / 2 }])
      );
    case 'polygon':
      return (
        distance >= 0.5 &&
        created([
          { id, type: 'polygon', cx: start.x, cy: start.y, r: distance, sides: Math.max(3, Math.round(amounts.polygon ?? 6)), rotation: 0 },
        ])
      );
    case 'arc':
    case 'pie':
    case 'arc2':
      // first part of an arc: centre → start (arc, pie) or start → end (arc2); the next click finishes it
      if (distance >= 1) {
        clicks.value = [{ point: start }, { point: end }];
        arcHover.value = end;
        arcTurn.value = 0;
      }
      return;
  }
};

const addLabel = async (tip: Point, textPoint: Point) => {
  const text = await context.ui.prompt(t('layout.text.prompt'));
  if (text) {
    created([{ id: newId(), type: 'label', x1: tip.x, y1: tip.y, x2: textPoint.x, y2: textPoint.y, text, size: 3.5 }]);
  }
};

const arcHover = ref<Point | null>(null);
/** how far the pointer turned around the centre since the start of the arc – its sign is the direction */
const arcTurn = ref(0);
const followArc = (point: Point) => {
  const centre = clicks.value[0].point;
  if (arcHover.value && tool.value !== 'arc2') {
    const delta = ((angleTo(centre, point) - angleTo(centre, arcHover.value) + 540) % 360) - 180;
    arcTurn.value += delta;
  }
  arcHover.value = point;
};
/** the arc as it would be with `point` as the last click – it runs the way the pointer went */
const arcFor = (point: Point) => {
  const [first, second] = clicks.value.map((click) => click.point);
  if (tool.value === 'arc2') {
    return arcThroughPoints(first, second, point);
  }
  const start = angleTo(first, second),
    end = angleTo(first, point);
  const r = Math.hypot(second.x - first.x, second.y - first.y);
  return arcTurn.value < 0 ? { cx: first.x, cy: first.y, r, start: end, end: start } : { cx: first.x, cy: first.y, r, start, end };
};
const finishArc = (point: Point) => {
  const arc = arcFor(point);
  clicks.value = [];
  arcHover.value = null;
  if (arc && arc.r > 0.5) {
    created([{ id: newId(), type: 'arc', ...arc, pie: tool.value === 'pie' || undefined }]);
  }
};

/** what is being drawn, as overlay shapes */
const draft = computed(() => {
  const current = drag.value;
  const result: { rect?: Record<string, number>; ellipse?: Record<string, number>; path?: string } = {};
  if (clicks.value.length === 2 && arcHover.value && ['arc', 'pie', 'arc2'].includes(tool.value)) {
    const arc = arcFor(arcHover.value);
    if (arc) {
      result.path = arcPath(arc) + (tool.value === 'pie' ? `L${arc.cx} ${arc.cy}Z` : '');
    }
    return result;
  }
  if (clicks.value.length && tool.value === 'angle') {
    const points = clicks.value.map((click) => click.point);
    result.path = `M${points.map((point) => `${point.x} ${point.y}`).join('L')}`;
    return result;
  }
  if (!current) {
    return result;
  }
  const { start, current: end } = current;
  const box = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (current.kind === 'band' || (current.kind === 'draw' && ['viewport', 'rect', 'rounded', 'lozenge', 'bulged'].includes(tool.value))) {
    result.rect = box;
  } else if (current.kind === 'draw' && (tool.value === 'circle' || tool.value === 'polygon')) {
    result.ellipse = { cx: start.x, cy: start.y, rx: distance, ry: distance };
  } else if (current.kind === 'draw' && tool.value === 'ellipse') {
    result.ellipse = { cx: box.x + box.width / 2, cy: box.y + box.height / 2, rx: box.width / 2, ry: box.height / 2 };
  } else if (current.kind === 'draw' && tool.value === 'freehand') {
    result.path = `M${(current.points ?? []).map((point) => `${point.x} ${point.y}`).join('L')}`;
  } else if (current.kind === 'draw') {
    result.path = `M${start.x} ${start.y}L${end.x} ${end.y}`;
  }
  return result;
});

// ------------------------------------------------------------ symbols and images
/** a symbol centred on the click; on a scaled viewport it takes that scale, otherwise 1:50 */
const placeSymbol = (symbol: string, point: Point) => {
  const scale = (currentPage.value && viewportUnder(currentPage.value, point.x, point.y)?.scale) || 50;
  const element: SymbolElement = { id: newId(), type: 'symbol', symbol, x: 0, y: 0, scale, rotation: 0, mirror: false };
  const { w, h } = symbolSize(element);
  created([{ ...element, x: point.x - w / 2, y: point.y - h / 2 }], true);
  selectedIds.value = [element.id];
};

const placeImage = (point: Point) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const image = new Image();
      image.onload = () => {
        const w = 80,
          h = (80 * image.naturalHeight) / Math.max(1, image.naturalWidth);
        created([{ id: newId(), type: 'image', x: point.x, y: point.y, w, h, src }]);
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  };
  input.click();
};

/** a viewport's view in the model (the workspace closes) */
const openInModel = (viewport: ViewportElement) => {
  contextMenu.value = null;
  const scene = viewport.sceneId != null ? editor.model.scenes.find((candidate) => candidate.id === viewport.sceneId) : undefined;
  editor.viewer.rig.applyState(scene?.camera ?? viewport.camera, false);
  context.workspaces.open(null);
};
/** a double-click on a viewport opens its view in the model */
const onDoubleClick = (event: MouseEvent) => {
  const element = elementAt(event);
  if (element?.type === 'viewport' && tool.value === 'select') {
    openInModel(element);
  }
};

// ------------------------------------------------------------ context menu
const contextMenu = ref<{ x: number; y: number } | null>(null);
const contextViewport = computed(() =>
  selection.value.length === 1 && selection.value[0].type === 'viewport' ? selection.value[0] : null,
);
const inputValue = (event: Event) => (event.target as HTMLSelectElement).value;
const onContextMenu = (event: MouseEvent) => {
  const element = elementAt(event);
  if (!element) {
    contextMenu.value = null;
    return;
  }
  if (!selectedIds.value.includes(element.id)) {
    selectedIds.value = [element.id];
  }
  tool.value = 'select';
  const box = root.value!.getBoundingClientRect();
  contextMenu.value = { x: event.clientX - box.left, y: event.clientY - box.top };
};
const changeContextViewport = (values: Partial<ViewportElement>) =>
  changeElements(pageId(), selectedIds.value, (element) => Object.assign(element, values));
const contextAction = (action: 'front' | 'back' | 'duplicate' | 'lock' | 'remove') => {
  const ids = selectedIds.value;
  contextMenu.value = null;
  if (action === 'front' || action === 'back') {
    arrangeElements(pageId(), ids, action);
  } else if (action === 'duplicate') {
    selectedIds.value = duplicateElements(pageId(), selection.value);
  } else if (action === 'lock') {
    changeElements(pageId(), ids, (element) => (element.locked = true));
    selectedIds.value = [];
  } else {
    removeElements(pageId(), ids);
    selectedIds.value = [];
  }
};
const closeMenus = () => {
  menu.value = null;
  addMenu.value = false;
  contextMenu.value = null;
};

// ------------------------------------------------------------ keys
let clipboard: LayoutElement[] = [];

const rotateSelected = (degrees: number) =>
  changeElements(pageId(), selectedIds.value, (element) => {
    if (element.type === 'text' || element.type === 'symbol' || element.type === 'polygon') {
      element.rotation = ((((element.rotation ?? 0) + degrees) % 360) + 360) % 360;
    }
  });

const onKey = (event: KeyboardEvent) => {
  if ((event.target as HTMLElement).closest('input, textarea, select')) {
    return;
  }
  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const ids = selectedIds.value;
  const handled = () => event.preventDefault();
  if ((event.key === 'Delete' || event.key === 'Backspace') && ids.length) {
    handled();
    removeElements(pageId(), ids);
    selectedIds.value = [];
  } else if (event.key === 'Escape') {
    drag.value = null;
    preview.value = null;
    setTool('select');
    selectedIds.value = [];
  } else if (ctrl && key === 'c' && ids.length) {
    handled();
    clipboard = selection.value.map(copied);
  } else if (ctrl && key === 'x' && ids.length) {
    handled();
    clipboard = selection.value.map(copied);
    removeElements(pageId(), ids);
    selectedIds.value = [];
  } else if (ctrl && key === 'v' && clipboard.length && currentPage.value) {
    handled();
    selectedIds.value = duplicateElements(pageId(), clipboard);
  } else if (ctrl && key === 'd' && ids.length) {
    handled();
    selectedIds.value = duplicateElements(pageId(), selection.value);
  } else if (ctrl && key === 'g' && event.shiftKey && ids.length === 1) {
    handled();
    selectedIds.value = ungroupElement(pageId(), ids[0]);
  } else if (ctrl && key === 'g' && ids.length > 1) {
    handled();
    selectedIds.value = [groupElements(pageId(), ids)];
  } else if (ctrl && key === 'a' && currentPage.value) {
    handled();
    selectedIds.value = currentPage.value.elements.filter(pickable).map((element) => element.id);
  } else if (!ctrl && key === 'r' && ids.length) {
    rotateSelected(event.shiftKey ? -90 : 90);
  } else if (!ctrl && key === 'm' && ids.length) {
    changeElements(pageId(), ids, (element) => element.type === 'symbol' && (element.mirror = !element.mirror));
  } else if (event.key.startsWith('Arrow') && ids.length) {
    handled();
    const step = event.shiftKey ? 10 : 1;
    const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key] ?? [0, 0];
    const byId = new Map(selection.value.map((element) => [element.id, moved(element, dx, dy)]));
    changeElements(pageId(), ids, (element) => Object.assign(element, byId.get(element.id)));
  } else if (event.key === 'PageDown') {
    handled();
    goPage(1);
  } else if (event.key === 'PageUp') {
    handled();
    goPage(-1);
  }
};

// ------------------------------------------------------------ presentation
const presenting = ref(false);
const presentIndex = ref(0);
const presentation = ref<HTMLElement | null>(null);
const presentationSvg = computed(() => {
  const page = layoutDoc.value.pages[presentIndex.value];
  return page ? pageSvg(layoutDoc.value, page, signature.value) : '';
});
const present = async () => {
  presentIndex.value = Math.max(0, pageIndex.value);
  presenting.value = true;
  await nextTick();
  presentation.value?.focus();
  presentation.value?.requestFullscreen?.().catch(() => {
    // no full screen (e.g. in a frame) – the overlay still covers the window
  });
};
const endPresentation = () => {
  presenting.value = false;
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  }
  root.value?.focus();
};
const presentStep = (step: number) => {
  const next = presentIndex.value + step;
  if (next >= layoutDoc.value.pages.length) {
    endPresentation();
  } else if (next >= 0) {
    presentIndex.value = next;
  }
};
const onPresentKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    endPresentation();
  } else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key)) {
    presentStep(1);
  } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(event.key)) {
    presentStep(-1);
  }
};
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && presenting.value) {
    presenting.value = false;
  }
});

// ------------------------------------------------------------ texts
const status = computed(() => {
  if (!currentPage.value) {
    return '';
  }
  if ((tool.value === 'fillet' || tool.value === 'chamfer') && clicks.value.length) {
    return t('layout.status.secondLine');
  }
  if (tool.value === 'style' && sampledStyle.value) {
    return t('layout.status.styleApply');
  }
  if (['arc', 'pie', 'arc2'].includes(tool.value) && clicks.value.length === 2) {
    return t(tool.value === 'arc2' ? 'layout.status.arcBulge' : 'layout.status.arcEnd');
  }
  if (tool.value === 'symbol' && pendingSymbol.value) {
    return t('layout.status.symbol', {
      name: t(`layout.library.symbols.${pendingSymbol.value}`),
      size: symbolById(pendingSymbol.value)?.w ?? '',
    });
  }
  return t(`layout.status.${tool.value}`);
});

// a removed page or element must not stay selected
watch(layoutDoc, (stored) => {
  if (currentPageId.value && !stored.pages.some((page) => page.id === currentPageId.value)) {
    currentPageId.value = stored.pages[0]?.id ?? null;
  }
  const page = stored.pages.find((candidate) => candidate.id === (currentPageId.value ?? stored.pages[0]?.id));
  selectedIds.value = selectedIds.value.filter((id) => page?.elements.some((element) => element.id === id));
});
</script>
