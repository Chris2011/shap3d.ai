<template>
  <aside class="s3d-lo-side s3d-lo-inspector">
    <!-- several elements -->
    <template v-if="selection.length > 1">
      <div class="s3d-lo-title">{{ t('layout.selection', { count: selection.length }) }}</div>
      <div class="s3d-lo-side-actions">
        <button class="s3d-btn small" :title="t('layout.actions.groupTitle')" @click="group">{{ t('layout.actions.group') }}</button>
        <button class="s3d-btn small" :disabled="!joinable" :title="t('layout.actions.joinTitle')" @click="join">
          {{ t('layout.actions.join') }}
        </button>
      </div>
    </template>

    <!-- one element -->
    <template v-else-if="element">
      <div class="s3d-lo-title">{{ t(`layout.elements.${element.type}`) }}</div>

      <template v-if="element.type === 'viewport'">
        <label class="s3d-lo-field">
          <span>{{ t('layout.viewport.scene') }}</span>
          <select
            class="s3d-input"
            :value="element.sceneId ?? ''"
            @change="update({ sceneId: value($event) ? Number(value($event)) : null })"
          >
            <option value="">{{ t('layout.viewport.storedView') }}</option>
            <option v-for="scene in scenes" :key="scene.id" :value="scene.id">{{ scene.name }}</option>
          </select>
        </label>
        <label class="s3d-lo-field">
          <span>{{ t('layout.viewport.scale') }}</span>
          <select class="s3d-input" :value="element.scale ?? ''" @change="update({ scale: value($event) ? Number(value($event)) : null })">
            <option value="">{{ t('layout.viewport.fit') }}</option>
            <option v-for="scale in SCALES" :key="scale" :value="scale">1:{{ scale }}</option>
          </select>
        </label>
        <label class="s3d-lo-field">
          <span>{{ t('layout.viewport.render') }}</span>
          <select class="s3d-input" :value="element.render" @change="update({ render: value($event) as RenderMode })">
            <option v-for="mode in RENDER_MODES" :key="mode" :value="mode">{{ t(`layout.viewport.${mode}`) }}</option>
          </select>
        </label>
        <button
          class="s3d-btn small"
          :title="t('layout.viewport.takeViewTitle')"
          @click="update({ sceneId: null, camera: editor.viewer.rig.getState() })"
        >
          {{ t('layout.viewport.takeView') }}
        </button>
        <label class="s3d-check" :title="t('layout.viewport.preserveScaleTitle')">
          <input
            type="checkbox"
            :checked="element.preserveScale !== false"
            @change="update({ preserveScale: checked($event) ? undefined : false })"
          />
          {{ t('layout.viewport.preserveScale') }}
        </label>
        <label class="s3d-check">
          <input
            type="checkbox"
            :checked="element.caption !== undefined"
            @change="update({ caption: checked($event) ? sceneName(element) : undefined })"
          />
          {{ t('layout.viewport.showCaption') }}
        </label>
        <input
          v-if="element.caption !== undefined"
          class="s3d-input"
          :value="element.caption"
          :placeholder="t('layout.viewport.caption')"
          @change="update({ caption: value($event) })"
        />

        <div class="s3d-section-title">{{ t('layout.viewport.section') }}</div>
        <label class="s3d-lo-field">
          <span>{{ t('layout.viewport.sectionPlane') }}</span>
          <select class="s3d-input" :value="sectionValue(element)" @change="update({ sectionId: sectionFromValue(value($event)) })">
            <option value="">{{ t('layout.viewport.sectionAsModel') }}</option>
            <option value="none">{{ t('layout.viewport.sectionNone') }}</option>
            <option v-for="section in sections" :key="section.id" :value="section.id">{{ section.name }}</option>
          </select>
        </label>
        <label class="s3d-check">
          <input
            type="checkbox"
            :checked="!!element.sectionFill"
            @change="update({ sectionFill: checked($event) ? { color: '#3a3f47', pattern: 'solid' } : undefined })"
          />
          {{ t('layout.viewport.sectionFill') }}
        </label>
        <template v-if="element.sectionFill">
          <label class="s3d-lo-field">
            <span>{{ t('layout.style.pattern') }}</span>
            <select
              class="s3d-input"
              :value="element.sectionFill.pattern"
              @change="update({ sectionFill: { ...element.sectionFill, pattern: value($event) as Pattern } })"
            >
              <option v-for="pattern in PATTERN_NAMES.filter((name) => name !== 'none')" :key="pattern" :value="pattern">
                {{ t(`layout.style.patterns.${pattern}`) }}
              </option>
            </select>
          </label>
          <label class="s3d-lo-field">
            <span>{{ t('layout.style.fill') }}</span>
            <input
              class="s3d-lo-color"
              type="color"
              :value="element.sectionFill.color"
              @change="update({ sectionFill: { ...element.sectionFill, color: value($event) } })"
            />
          </label>
        </template>
        <p v-if="!sections.length" class="s3d-lo-hint">{{ t('layout.viewport.noSections') }}</p>

        <div class="s3d-section-title">{{ t('layout.viewport.display') }}</div>
        <label class="s3d-lo-field">
          <span>{{ t('layout.viewport.faceStyle') }}</span>
          <select
            class="s3d-input"
            :value="element.faceStyle ?? ''"
            @change="update({ faceStyle: (value($event) || undefined) as FaceStyle | undefined })"
          >
            <option value="">{{ t('layout.viewport.asScene') }}</option>
            <option v-for="style in FACE_STYLES" :key="style" :value="style">{{ t(`layout.viewport.faceStyles.${style}`) }}</option>
          </select>
        </label>
        <template v-if="tags.length">
          <label class="s3d-check">
            <input
              type="checkbox"
              :checked="!!element.hiddenTags"
              @change="update({ hiddenTags: checked($event) ? sceneHiddenTags(element) : undefined })"
            />
            {{ t('layout.viewport.ownTags') }}
          </label>
          <div v-if="element.hiddenTags" class="s3d-lo-tags">
            <label v-for="tag in tags" :key="tag" class="s3d-check">
              <input type="checkbox" :checked="!element.hiddenTags.includes(tag)" @change="toggleTag(element, tag, checked($event))" />
              {{ tag }}
            </label>
          </div>
        </template>
      </template>

      <template v-if="element.type === 'text' || element.type === 'label'">
        <label class="s3d-lo-field column">
          <span>{{ t('layout.text.content') }}</span>
          <textarea class="s3d-input" rows="3" :value="element.text" @change="update({ text: value($event) })"></textarea>
        </label>
        <label class="s3d-lo-field">
          <span>{{ t('layout.text.size') }}</span>
          <input class="s3d-input" type="number" min="1" step="0.5" :value="element.size" @change="update({ size: number($event) })" />
        </label>
        <label v-if="element.type === 'text'" class="s3d-check">
          <input type="checkbox" :checked="element.bold" @change="update({ bold: checked($event) })" /> {{ t('layout.text.bold') }}
        </label>
      </template>

      <template v-if="element.type === 'symbol'">
        <div class="s3d-lo-hint">{{ t(`layout.library.symbols.${element.symbol}`) }}</div>
        <label class="s3d-lo-field">
          <span>{{ t('layout.viewport.scale') }}</span>
          <select class="s3d-input" :value="element.scale" @change="update({ scale: Number(value($event)) })">
            <option v-for="scale in SCALES" :key="scale" :value="scale">1:{{ scale }}</option>
          </select>
        </label>
        <label class="s3d-check">
          <input type="checkbox" :checked="element.mirror" @change="update({ mirror: checked($event) })" /> {{ t('layout.actions.mirror') }}
        </label>
      </template>

      <template v-if="element.type === 'rect'">
        <label class="s3d-lo-field">
          <span>{{ t('layout.shape.corners') }}</span>
          <select class="s3d-input" :value="element.corners ?? 'square'" @change="update({ corners: value($event) as Corners })">
            <option v-for="corners in CORNERS" :key="corners" :value="corners">{{ t(`layout.shape.${corners}`) }}</option>
          </select>
        </label>
        <label v-if="element.corners === 'rounded' || element.corners === 'bulged'" class="s3d-lo-field">
          <span>{{ t('layout.shape.radius') }}</span>
          <input
            class="s3d-input"
            type="number"
            min="0"
            step="0.5"
            :value="element.radius ?? 3"
            @change="update({ radius: number($event) })"
          />
        </label>
      </template>

      <label v-if="element.type === 'polygon'" class="s3d-lo-field">
        <span>{{ t('layout.shape.sides') }}</span>
        <input
          class="s3d-input"
          type="number"
          min="3"
          max="24"
          step="1"
          :value="element.sides"
          @change="update({ sides: Math.max(3, Math.round(number($event))) })"
        />
      </label>
      <label v-if="element.type === 'path'" class="s3d-check">
        <input type="checkbox" :checked="element.closed" @change="update({ closed: checked($event) })" /> {{ t('layout.shape.closed') }}
      </label>
      <label v-if="element.type === 'arc'" class="s3d-check">
        <input type="checkbox" :checked="element.pie" @change="update({ pie: checked($event) })" /> {{ t('layout.shape.pie') }}
      </label>

      <!-- position and size of boxes, rotation where it makes sense -->
      <div v-if="'w' in element" class="s3d-lo-grid">
        <label v-for="key in ['x', 'y', 'w', 'h'] as const" :key="key" class="s3d-lo-field">
          <span>{{ key.toUpperCase() }}</span>
          <input class="s3d-input" type="number" step="1" :value="round(element[key])" @change="update({ [key]: number($event) })" />
        </label>
      </div>
      <label v-if="element.type === 'circle' || element.type === 'polygon'" class="s3d-lo-field">
        <span>{{ t('layout.shape.radius') }}</span>
        <input class="s3d-input" type="number" min="0.5" step="0.5" :value="round(element.r)" @change="update({ r: number($event) })" />
      </label>
      <label v-if="rotatable" class="s3d-lo-field">
        <span>{{ t('layout.shape.rotation') }}</span>
        <input class="s3d-input" type="number" step="15" :value="round(rotation)" @change="update({ rotation: number($event) })" />
      </label>

      <div v-if="element.type === 'dimension'" class="s3d-lo-hint">{{ dimensionHint }}</div>

      <!-- line and fill -->
      <template v-if="styled">
        <div class="s3d-section-title">{{ t('layout.style.title') }}</div>
        <label class="s3d-lo-field">
          <span>{{ t('layout.style.stroke') }}</span>
          <input
            class="s3d-lo-color"
            type="color"
            :value="element.style?.stroke ?? '#000000'"
            @change="updateStyle({ stroke: value($event) })"
          />
        </label>
        <template v-if="hasLine">
          <label class="s3d-lo-field">
            <span>{{ t('layout.style.width') }}</span>
            <input
              class="s3d-input"
              type="number"
              min="0"
              step="0.05"
              :value="element.style?.width ?? 0.35"
              @change="updateStyle({ width: number($event) })"
            />
          </label>
          <label class="s3d-lo-field">
            <span>{{ t('layout.style.dash') }}</span>
            <select class="s3d-input" :value="element.style?.dash ?? 'solid'" @change="updateStyle({ dash: value($event) as Dash })">
              <option v-for="dash in DASH_NAMES" :key="dash" :value="dash">{{ t(`layout.style.dashes.${dash}`) }}</option>
            </select>
          </label>
        </template>
        <template v-if="closed">
          <label class="s3d-lo-field">
            <span>{{ t('layout.style.pattern') }}</span>
            <select
              class="s3d-input"
              :value="element.style?.pattern ?? (element.style?.fill ? 'solid' : 'none')"
              @change="updateStyle({ pattern: value($event) as Pattern })"
            >
              <option v-for="pattern in PATTERN_NAMES" :key="pattern" :value="pattern">{{ t(`layout.style.patterns.${pattern}`) }}</option>
            </select>
          </label>
          <label class="s3d-lo-field">
            <span>{{ t('layout.style.fill') }}</span>
            <input
              class="s3d-lo-color"
              type="color"
              :value="element.style?.fill ?? '#ffffff'"
              @change="updateStyle({ fill: value($event) })"
            />
          </label>
        </template>
      </template>

      <div class="s3d-lo-side-actions">
        <button v-if="element.type === 'group'" class="s3d-btn small" @click="ungroup">{{ t('layout.actions.ungroup') }}</button>
        <button v-if="element.type === 'rect' && (element.corners ?? 'square') === 'square'" class="s3d-btn small" @click="explode">
          {{ t('layout.actions.explode') }}
        </button>
      </div>
    </template>

    <!-- what every selection has: order, lock, delete -->
    <template v-if="selection.length">
      <div class="s3d-section-title">{{ t('layout.actions.arrange') }}</div>
      <div class="s3d-lo-side-actions">
        <button class="s3d-btn small" @click="arrange('front')">{{ t('layout.actions.toFront') }}</button>
        <button class="s3d-btn small" @click="arrange('back')">{{ t('layout.actions.toBack') }}</button>
        <button class="s3d-btn small" :title="t('layout.actions.duplicateTitle')" @click="duplicate">
          {{ t('layout.actions.duplicate') }}
        </button>
      </div>
      <label class="s3d-check">
        <input type="checkbox" :checked="selection.every((item) => item.locked)" @change="lock(checked($event))" />
        {{ t('layout.actions.lock') }}
      </label>
      <label class="s3d-lo-field">
        <span>{{ t('layout.layers.layer') }}</span>
        <select class="s3d-input" :value="selectionLayer" @change="moveToLayer(value($event))">
          <option v-if="!selectionLayer" value="">–</option>
          <option v-for="layer in layers" :key="layer.id" :value="layer.id">{{ layerName(layer) }}</option>
        </select>
      </label>
      <button class="s3d-btn small s3d-lo-danger" @click="remove">{{ t('layout.remove') }}</button>
    </template>

    <!-- the sheet -->
    <template v-else-if="page">
      <div class="s3d-lo-title">{{ t('layout.sheet') }}</div>
      <label class="s3d-lo-field column">
        <span>{{ t('layout.page.name') }}</span>
        <input class="s3d-input" :value="page.name" @change="updatePage({ name: value($event) || page.name })" />
      </label>
      <label class="s3d-lo-field">
        <span>{{ t('layout.page.size') }}</span>
        <select class="s3d-input" :value="page.size" @change="updatePage({ size: value($event) as PaperSize })">
          <option v-for="paper in PAPER_SIZES" :key="paper" :value="paper">{{ paper }}</option>
        </select>
      </label>
      <label class="s3d-lo-field">
        <span>{{ t('layout.page.orientation') }}</span>
        <select class="s3d-input" :value="page.orientation" @change="updatePage({ orientation: value($event) as Orientation })">
          <option value="landscape">{{ t('layout.page.landscape') }}</option>
          <option value="portrait">{{ t('layout.page.portrait') }}</option>
        </select>
      </label>
      <label class="s3d-check">
        <input type="checkbox" :checked="page.titleBlock" @change="updatePage({ titleBlock: checked($event) })" />
        {{ t('layout.page.titleBlock') }}
      </label>
      <div class="s3d-lo-side-actions">
        <button class="s3d-btn small" @click="emit('duplicatePage')">{{ t('layout.page.duplicate') }}</button>
        <button class="s3d-btn small" :title="t('layout.templates.saveTitle')" @click="emit('saveTemplate')">
          {{ t('layout.templates.save') }}
        </button>
        <button class="s3d-btn small s3d-lo-danger" @click="emit('removePage')">{{ t('layout.page.remove') }}</button>
      </div>
      <p class="s3d-lo-hint">{{ t('layout.hint') }}</p>

      <!-- document setup: for all sheets -->
      <div class="s3d-section-title">{{ t('layout.setup.title') }}</div>
      <label class="s3d-check">
        <input type="checkbox" :checked="setup.grid" @change="updateSetup({ grid: checked($event) })" /> {{ t('layout.setup.grid') }}
      </label>
      <label class="s3d-lo-field">
        <span>{{ t('layout.setup.gridSpacing') }}</span>
        <input
          class="s3d-input"
          type="number"
          min="1"
          step="1"
          :value="setup.gridSpacing"
          @change="updateSetup({ gridSpacing: Math.max(1, number($event)) })"
        />
      </label>
      <label class="s3d-check">
        <input type="checkbox" :checked="setup.snapToGrid" @change="updateSetup({ snapToGrid: checked($event) })" />
        {{ t('layout.setup.snapToGrid') }}
      </label>
      <label class="s3d-lo-field">
        <span>{{ t('layout.setup.dimensionUnits') }}</span>
        <select class="s3d-input" :value="setup.dimensionUnits" @change="updateSetup({ dimensionUnits: value($event) as DimensionUnits })">
          <option v-for="units in DIMENSION_UNITS" :key="units" :value="units">{{ t(`layout.setup.units.${units}`) }}</option>
        </select>
      </label>
      <label v-if="setup.dimensionUnits !== 'model'" class="s3d-lo-field">
        <span>{{ t('layout.setup.precision') }}</span>
        <select class="s3d-input" :value="setup.dimensionPrecision" @change="updateSetup({ dimensionPrecision: number($event) })">
          <option v-for="digits in [0, 1, 2, 3]" :key="digits" :value="digits">{{ (0).toFixed(digits) }}</option>
        </select>
      </label>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FaceStyle, Scene } from '../../../src/core/document';
import {
  PAPER_SIZES,
  SCALES,
  changeDocument,
  layerOf,
  layersOf,
  setupOf,
  type Corners,
  type DimensionUnits,
  type DocumentSetup,
  type LayoutDocument,
  type LayoutLayer,
  type ViewportElement,
  type Dash,
  type LayoutElement,
  type LayoutPage,
  type Orientation,
  type PaperSize,
  type Pattern,
  type RenderMode,
  type ShapeStyle,
} from './document';
import {
  arrangeElements,
  changeElements,
  changePage,
  duplicateElements,
  groupElements,
  joinSelected,
  removeElements,
  replaceElement,
  ungroupElement,
} from './edit';
import { explodeRect } from './geometry';
import { DASH_NAMES, PATTERN_NAMES, viewportUnder } from './render';
import { pluginContext, t } from './runtime';

/** The properties of the selection – or of the sheet when nothing is selected. */
const props = defineProps<{ document: LayoutDocument; page: LayoutPage | null; selection: LayoutElement[]; scenes: Scene[] }>();
const emit = defineEmits<{
  (event: 'select', ids: string[]): void;
  (event: 'duplicatePage'): void;
  (event: 'removePage'): void;
  (event: 'saveTemplate'): void;
}>();

const editor = pluginContext().editor;
const RENDER_MODES: RenderMode[] = ['hybrid', 'raster', 'vector'];
const CORNERS: Corners[] = ['square', 'rounded', 'lozenge', 'bulged'];
const FACE_STYLES: FaceStyle[] = ['wireframe', 'hiddenline', 'shaded', 'textured', 'monochrome'];
const DIMENSION_UNITS: DimensionUnits[] = ['model', 'mm', 'cm', 'm', 'in', 'ft'];

const element = computed(() => (props.selection.length === 1 ? props.selection[0] : null));
const ids = computed(() => props.selection.map((item) => item.id));
const pageId = () => props.page?.id ?? '';

const value = (event: Event) => (event.target as HTMLInputElement).value;
const number = (event: Event) => Number(value(event));
const checked = (event: Event) => (event.target as HTMLInputElement).checked;
const round = (amount: number) => Math.round(amount * 10) / 10;

const update = (values: Record<string, unknown>) => changeElements(pageId(), ids.value, (item) => Object.assign(item, values));
const updateStyle = (values: ShapeStyle) => changeElements(pageId(), ids.value, (item) => (item.style = { ...item.style, ...values }));
const updatePage = (values: Partial<LayoutPage>) => changePage(pageId(), (page) => Object.assign(page, values));

const LINE_TYPES = ['line', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'arc'];
const CLOSED_TYPES = ['rect', 'circle', 'ellipse', 'polygon'];
const styled = computed(
  () => !!element.value && element.value.type !== 'viewport' && element.value.type !== 'image' && element.value.type !== 'group',
);
const hasLine = computed(() => !!element.value && LINE_TYPES.includes(element.value.type));
const closed = computed(
  () =>
    !!element.value &&
    (CLOSED_TYPES.includes(element.value.type) ||
      (element.value.type === 'path' && element.value.closed) ||
      (element.value.type === 'arc' && !!element.value.pie)),
);
const rotatable = computed(() => !!element.value && ['text', 'symbol', 'polygon'].includes(element.value.type));
const rotation = computed(() => (element.value && 'rotation' in element.value ? (element.value.rotation ?? 0) : 0));
const joinable = computed(
  () => props.selection.filter((item) => item.type === 'line' || (item.type === 'path' && !item.closed)).length >= 2,
);

const dimensionHint = computed(() => {
  const item = element.value;
  if (item?.type !== 'dimension' || !props.page) {
    return '';
  }
  const viewport = viewportUnder(props.page, item.x1, item.y1);
  return viewport ? t('layout.dimension.model', { scale: viewport.scale }) : t('layout.dimension.paper');
});

// ---- viewports: sections, display, title (the model is not reactive – the editor bumps ui.revision)
const sections = computed(() => {
  void editor.ui.revision;
  return editor.model.sections.map((section) => ({ id: section.id, name: section.name }));
});
const tags = computed(() => {
  void editor.ui.revision;
  return editor.model.tags.map((tag) => tag.name);
});
const sceneOf = (viewport: ViewportElement) => props.scenes.find((scene) => scene.id === viewport.sceneId);
const sceneName = (viewport: ViewportElement) => sceneOf(viewport)?.name ?? t('layout.currentView');
const sceneHiddenTags = (viewport: ViewportElement) => [...(sceneOf(viewport)?.hiddenTags ?? [])];
const sectionValue = (viewport: ViewportElement) =>
  viewport.sectionId === undefined ? '' : viewport.sectionId === null ? 'none' : String(viewport.sectionId);
const sectionFromValue = (choice: string) => (choice === '' ? undefined : choice === 'none' ? null : Number(choice));
const toggleTag = (viewport: ViewportElement, tag: string, visible: boolean) => {
  const hidden = viewport.hiddenTags ?? [];
  update({ hiddenTags: visible ? hidden.filter((name) => name !== tag) : [...hidden, tag] });
};

// ---- layers and document setup
const layers = computed(() => layersOf(props.document));
const layerName = (layer: LayoutLayer) => layer.name || t('layout.layers.default');
const selectionLayer = computed(() => {
  const found = new Set(props.selection.map((item) => layerOf(props.document, item).id));
  return found.size === 1 ? [...found][0] : '';
});
const moveToLayer = (id: string) => changeElements(pageId(), ids.value, (item) => (item.layer = id));
const setup = computed(() => setupOf(props.document));
const updateSetup = (values: Partial<DocumentSetup>) => changeDocument((stored) => (stored.setup = { ...stored.setup, ...values }));

const group = () => emit('select', [groupElements(pageId(), ids.value)]);
const ungroup = () => emit('select', ungroupElement(pageId(), ids.value[0]));
const join = () => {
  const id = joinSelected(pageId(), props.selection);
  if (id) {
    emit('select', [id]);
  } else {
    pluginContext().ui.toast(t('layout.actions.joinFailed'));
  }
};
const explode = () => {
  const rect = element.value;
  if (rect?.type === 'rect') {
    const lines = explodeRect(rect).map((line) => ({ ...line, style: rect.style }));
    replaceElement(pageId(), rect.id, lines);
    emit(
      'select',
      lines.map((line) => line.id),
    );
  }
};
const arrange = (where: 'front' | 'back') => arrangeElements(pageId(), ids.value, where);
const duplicate = () => emit('select', duplicateElements(pageId(), props.selection));
const lock = (locked: boolean) => changeElements(pageId(), ids.value, (item) => (item.locked = locked || undefined));
const remove = () => {
  removeElements(pageId(), ids.value);
  emit('select', []);
};
</script>
