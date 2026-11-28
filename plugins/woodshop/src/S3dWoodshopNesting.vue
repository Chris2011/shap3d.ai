<template>
  <label v-for="key in SIZES" :key="key" class="s3d-ws-field">
    <span>{{ t(`woodshop.nesting.${key}`) }}</span>
    <input
      class="s3d-input"
      type="number"
      min="0"
      step="1"
      :value="Math.round(settings[key] * 1000)"
      @change="setSize(key, ($event.target as HTMLInputElement).value)"
      @keydown.stop
    />
  </label>
  <label class="s3d-check">
    <input type="checkbox" :checked="settings.grain" @change="save({ grain: ($event.target as HTMLInputElement).checked })" />
    {{ t('woodshop.nesting.grain') }}
  </label>

  <section v-for="group in groups" :key="group.key" class="s3d-ws-nest">
    <div class="s3d-ws-nest-title">
      {{ t('woodshop.nesting.group', { material: group.material || '–', thickness: editor.fmt(group.thickness) }) }}
      <span>{{ t('woodshop.nesting.sheets', { count: group.sheets.length, usage: percent(group.usage) }) }}</span>
    </div>
    <p v-if="group.tooBig.length" class="s3d-ws-warning">
      {{ t('woodshop.nesting.tooBig', { names: [...new Set(group.tooBig.map((piece) => piece.name))].join(', ') }) }}
    </p>
    <svg
      v-for="(sheet, index) in group.sheets"
      :key="index"
      class="s3d-ws-sheet"
      :viewBox="`0 0 ${settings.length} ${settings.width}`"
      role="img"
      :aria-label="t('woodshop.nesting.sheet', { number: index + 1, usage: percent(sheet.usage) })"
    >
      <rect class="board" :width="settings.length" :height="settings.width" />
      <g v-for="(piece, number) in sheet.pieces" :key="number">
        <rect class="piece" :x="piece.x" :y="piece.y" :width="piece.sizeX" :height="piece.sizeY">
          <title>{{ `${piece.name}: ${editor.fmt(piece.length)} × ${editor.fmt(piece.width)}` }}</title>
        </rect>
        <text
          v-if="piece.sizeX > 0.25 && piece.sizeY > 0.08"
          :x="piece.x + piece.sizeX / 2"
          :y="piece.y + piece.sizeY / 2"
          :font-size="Math.min(0.07, piece.sizeY / 2.5)"
        >
          {{ piece.name }}
        </text>
      </g>
    </svg>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CutRow } from './boards';
import { DEFAULT_SHEET, nest, type Piece, type SheetSettings } from './nesting';
import { pluginContext, t } from './runtime';

/** Nesting: the sheet's size and saw cut, and the boards of each material and thickness laid out on sheets. */
const props = defineProps<{ rows: CutRow[] }>();
const context = pluginContext();
const editor = context.editor;
const SIZES = ['length', 'width', 'kerf', 'trim'] as const;

const settings = computed((): SheetSettings => {
  void editor.ui.revision;
  return { ...DEFAULT_SHEET, ...context.data.getModel<{ sheet?: Partial<SheetSettings> }>()?.sheet };
});

/** sheet settings belong to the model (saved with it) – one undo step */
const save = (patch: Partial<SheetSettings>) =>
  editor.commit('woodshop.undo.sheet', () => {
    const model = context.data.getModel<Record<string, unknown>>() ?? {};
    context.data.setModel({ ...model, sheet: { ...settings.value, ...patch } });
  });

/** sizes are typed in mm; sheet sides must be more than nothing, kerf and trim may be 0 */
const setSize = (key: (typeof SIZES)[number], text: string) => {
  const millimetres = Number(text.replace(',', '.'));
  if (Number.isFinite(millimetres) && millimetres >= 0 && (millimetres > 0 || key === 'kerf' || key === 'trim')) {
    save({ [key]: millimetres / 1000 });
  }
};

const groups = computed(() => {
  const byStock = new Map<string, { material: string; thickness: number; pieces: Piece[] }>();
  for (const row of props.rows) {
    const key = `${row.material}|${row.thickness.toFixed(4)}`;
    const group = byStock.get(key) ?? { material: row.material, thickness: row.thickness, pieces: [] };
    for (let index = 0; index < row.count; index++) {
      group.pieces.push({ name: row.name, length: row.length, width: row.width });
    }
    byStock.set(key, group);
  }
  return [...byStock].map(([key, group]) => {
    const { sheets, tooBig } = nest(group.pieces, settings.value);
    const usage = sheets.length ? sheets.reduce((sum, sheet) => sum + sheet.usage, 0) / sheets.length : 0;
    return { key, ...group, sheets, tooBig, usage };
  });
});

const percent = (share: number) => `${Math.round(share * 100)} %`;
</script>
