<template>
  <div class="s3d-lv">
    <!-- drawing: choose a piece, set how it is built, then draw it in the 3D view -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">{{ t('level.blockout.draw') }}</div>
      <div class="s3d-lv-kinds three">
        <button v-for="kind in BLOCK_KINDS" :key="kind" class="s3d-lv-kind" :class="{ active: drawing === kind }" @click="draw(kind)">
          {{ t(`level.blockout.kinds.${kind}`) }}
        </button>
      </div>
      <div class="s3d-lv-grid">
        <label class="s3d-lv-field">
          <span>{{ t('level.blockout.fields.floor') }}</span>
          <input class="s3d-input" type="number" step="0.5" :value="state.block.floor" @change="state.block.floor = value($event)" />
        </label>
        <label class="s3d-lv-field">
          <span>{{ t('level.blockout.fields.height') }}</span>
          <input class="s3d-input" type="number" step="0.5" :value="state.block.height" @change="state.block.height = value($event)" />
        </label>
        <label v-if="state.block.kind === 'corridor'" class="s3d-lv-field">
          <span>{{ t('level.blockout.fields.width') }}</span>
          <input class="s3d-input" type="number" step="0.5" :value="state.block.width" @change="state.block.width = value($event)" />
        </label>
        <label v-if="state.block.kind === 'stairs'" class="s3d-lv-field">
          <span>{{ t('level.blockout.fields.rise') }}</span>
          <input class="s3d-input" type="number" step="0.5" :value="state.block.rise" @change="state.block.rise = value($event)" />
        </label>
      </div>
      <label class="s3d-lv-field check">
        <input type="checkbox" :checked="state.block.ceiling" @change="state.block.ceiling = checked($event)" />
        <span>{{ t('level.blockout.fields.ceiling') }}</span>
      </label>
      <p class="s3d-lv-hint">{{ t(`level.blockout.hints.${state.block.kind}`) }}</p>
    </section>

    <!-- a whole floor plan from a seed -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">{{ t('level.generate.title') }}</div>
      <div class="s3d-lv-grid">
        <label class="s3d-lv-field">
          <span>{{ t('level.generate.seed') }}</span>
          <span class="s3d-lv-inline">
            <input class="s3d-input" type="number" step="1" :value="plan.seed" @change="plan.seed = Math.round(value($event))" />
            <button class="s3d-lv-remove" :title="t('level.generate.dice')" @click="plan.seed = Math.floor(Math.random() * 9999) + 1">
              🎲
            </button>
          </span>
        </label>
        <label class="s3d-lv-field">
          <span>{{ t('level.generate.rooms') }}</span>
          <input
            class="s3d-input"
            type="number"
            min="1"
            max="40"
            step="1"
            :value="plan.rooms"
            @change="plan.rooms = Math.round(value($event)) || 1"
          />
        </label>
        <label class="s3d-lv-field">
          <span>{{ t('level.generate.size') }}</span>
          <input class="s3d-input" type="number" min="10" step="5" :value="plan.size" @change="plan.size = value($event) || 40" />
        </label>
        <label class="s3d-lv-field">
          <span>{{ t('level.blockout.fields.height') }}</span>
          <input class="s3d-input" type="number" step="0.5" :value="plan.height" @change="plan.height = value($event) || 3" />
        </label>
      </div>
      <label class="s3d-lv-field check">
        <input type="checkbox" :checked="plan.ceiling" @change="plan.ceiling = checked($event)" />
        <span>{{ t('level.blockout.fields.ceiling') }}</span>
      </label>
      <label class="s3d-lv-field check">
        <input type="checkbox" :checked="plan.objects" @change="plan.objects = checked($event)" />
        <span>{{ t('level.generate.objects') }}</span>
      </label>
      <button class="s3d-btn" @click="generate">{{ t('level.generate.run') }}</button>
      <p class="s3d-lv-hint">{{ result || t('level.generate.hint') }}</p>
    </section>

    <!-- the pieces -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">
        {{ t('level.blockout.pieces', { count: pieces.length }) }}
        <button
          v-if="pieces.length"
          class="s3d-btn small"
          :title="t('level.blockout.refreshTitle')"
          @click="runBlock('s3d.levelBlockout();')"
        >
          {{ t('level.blockout.refresh') }}
        </button>
      </div>
      <p v-if="!pieces.length" class="s3d-lv-hint">{{ t('level.blockout.empty') }}</p>
      <div v-for="piece in pieces" :key="piece.id" class="s3d-lv-piece" :class="{ open: open === piece.id }">
        <button class="s3d-lv-entry" @click="open = open === piece.id ? null : piece.id">
          <span class="s3d-lv-entry-name">{{ t(`level.blockout.kinds.${piece.kind}`) }} · {{ describe(piece) }}</span>
          <span class="s3d-lv-entry-id">{{ piece.id }}</span>
        </button>
        <div v-if="open === piece.id" class="s3d-lv-grid">
          <label v-for="field in fieldsOf(piece)" :key="field.name" class="s3d-lv-field" :class="{ check: field.type === 'boolean' }">
            <input
              v-if="field.type === 'boolean'"
              type="checkbox"
              :checked="!!field.value"
              @change="edit(piece, field.name, checked($event))"
            />
            <span>{{ t(`level.blockout.fields.${field.name}`) }}</span>
            <input
              v-if="field.type === 'number'"
              class="s3d-input"
              type="number"
              step="0.5"
              :value="field.value"
              @change="edit(piece, field.name, value($event))"
            />
            <select
              v-else-if="field.type === 'choice'"
              class="s3d-input"
              :value="field.value"
              @change="edit(piece, field.name, text($event))"
            >
              <option v-for="option in field.options" :key="option" :value="option">{{ t(`level.blockout.options.${option}`) }}</option>
            </select>
          </label>
          <button class="s3d-btn small" @click="remove(piece)">{{ t('level.blockout.remove') }}</button>
        </div>
      </div>
      <label v-if="pieces.length" class="s3d-lv-field">
        <span>{{ t('level.blockout.fields.cell') }}</span>
        <select class="s3d-input" :value="cell" @change="runBlock(`s3d.levelBlockout({ cell: ${Number(text($event))} });`)">
          <option v-for="size in [0.25, 0.5, 1, 2]" :key="size" :value="size">{{ size }} m</option>
        </select>
      </label>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { lastGenerated } from './generate';
import { blockoutData, runBlock, type Block, type BlockKind } from './blockout';
import { BLOCK_TOOL_ID } from './names';
import { pluginContext, t } from './runtime';
import { useLevelState } from './state';

/** The blockout panel: the piece to draw and how it is built, the list of pieces to change or remove, the grid. */

const BLOCK_KINDS: BlockKind[] = ['room', 'corridor', 'stairs'];

const context = pluginContext();
const editor = context.editor;
const state = useLevelState();
const open = ref<string | null>(null);

// the model is not reactive – the editor bumps these after changes
const revision = computed(() => editor.ui.revision + state.revision);
const data = computed(() => {
  void revision.value;
  return blockoutData();
});
const pieces = computed(() => data.value.pieces);
const cell = computed(() => data.value.cell);
const drawing = computed(() => (editor.ui.tool === BLOCK_TOOL_ID ? state.block.kind : null));

// ------------------------------------------------------------ a floor plan from a seed
const plan = reactive({ seed: 1, rooms: 8, size: 48, height: 3, ceiling: false, objects: true });
const result = ref('');
const generate = async () => {
  // the pieces (and with objects the level's objects) are replaced – ask first when there are any
  if (pieces.value.length && !(await editor.confirm(t('level.generate.replace')))) {
    return;
  }
  if (runBlock(`s3d.levelGenerate(${JSON.stringify(plan)});`)) {
    const made = lastGenerated();
    result.value = t('level.generate.done', { ...made });
    state.revision++;
  }
};

const draw = (kind: BlockKind) => {
  state.block.kind = kind;
  editor.setTool(BLOCK_TOOL_ID);
};

const text = (event: Event) => (event.target as HTMLInputElement).value;
const value = (event: Event) => Number(text(event)) || 0;
const checked = (event: Event) => (event.target as HTMLInputElement).checked;

const metres = (number: number) => (Math.round(number * 100) / 100).toString();
/** a short description: size and floor height */
const describe = (piece: Block) => {
  const floor = piece.floor ? ` · ${t('level.blockout.at', { floor: metres(piece.floor) })}` : '';
  if (piece.kind === 'corridor') {
    // along its bend: first one way, then the other
    return `${metres(Math.abs(piece.to[0] - piece.from[0]) + Math.abs(piece.to[1] - piece.from[1]))} m${floor}`; // i18n-ignore – unit symbol
  }
  return `${metres(piece.width)} × ${metres(piece.depth)} m${floor}`; // i18n-ignore – unit symbol
};

interface Field {
  name: string;
  type: 'number' | 'boolean' | 'choice';
  value: number | string | boolean;
  options?: string[];
}

/** what can be changed on a piece */
const fieldsOf = (piece: Block): Field[] => {
  const common: Field[] = [
    { name: 'floor', type: 'number', value: piece.floor },
    { name: 'height', type: 'number', value: piece.height },
    { name: 'ceiling', type: 'boolean', value: !!piece.ceiling },
  ];
  if (piece.kind === 'corridor') {
    return [
      { name: 'fromX', type: 'number', value: piece.from[0] },
      { name: 'fromY', type: 'number', value: piece.from[1] },
      { name: 'toX', type: 'number', value: piece.to[0] },
      { name: 'toY', type: 'number', value: piece.to[1] },
      { name: 'width', type: 'number', value: piece.width },
      { name: 'bend', type: 'choice', value: piece.bend ?? 'x', options: ['x', 'y'] },
      ...common,
    ];
  }
  const rect: Field[] = [
    { name: 'x', type: 'number', value: piece.x },
    { name: 'y', type: 'number', value: piece.y },
    { name: 'width', type: 'number', value: piece.width },
    { name: 'depth', type: 'number', value: piece.depth },
  ];
  if (piece.kind === 'stairs') {
    return [
      ...rect,
      { name: 'rise', type: 'number', value: piece.rise },
      { name: 'direction', type: 'choice', value: piece.direction, options: ['+x', '-x', '+y', '-y'] },
      ...common,
    ];
  }
  return [...rect, ...common];
};

const edit = (piece: Block, name: string, changed: number | string | boolean) => {
  // a corridor's ends are pairs
  const changes: Record<string, unknown> =
    piece.kind === 'corridor' && ['fromX', 'fromY', 'toX', 'toY'].includes(name)
      ? name.startsWith('from')
        ? { from: name === 'fromX' ? [changed, piece.from[1]] : [piece.from[0], changed] }
        : { to: name === 'toX' ? [changed, piece.to[1]] : [piece.to[0], changed] }
      : { [name]: changed };
  if (runBlock(`s3d.levelBlockEdit(${JSON.stringify(piece.id)}, ${JSON.stringify(changes)});`)) {
    state.revision++;
  }
};

const remove = (piece: Block) => {
  if (runBlock(`s3d.levelBlockEdit(${JSON.stringify(piece.id)}, null);`)) {
    open.value = null;
    state.revision++;
  }
};
</script>
