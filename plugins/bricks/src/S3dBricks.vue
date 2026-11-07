<template>
  <div class="s3d-bk">
    <section class="s3d-bk-section">
      <ol class="s3d-bk-steps">
        <li>{{ t('bricks.steps.color') }}</li>
        <li>{{ t('bricks.steps.brick') }}</li>
        <li>{{ t('bricks.steps.place') }}</li>
      </ol>
      <p v-if="state.placing" class="s3d-bk-hint strong">
        {{ t('bricks.tool.statusPlacing') }}
        <button class="s3d-btn small" @click="stop">{{ t('bricks.stop') }}</button>
      </p>
    </section>

    <section class="s3d-bk-section">
      <div class="s3d-bk-heading">
        {{ t('bricks.color') }}
        <span class="s3d-bk-hint">{{ colorName(state.color) }}</span>
      </div>
      <div class="s3d-bk-colors">
        <button
          v-for="color in COLORS"
          :key="color.id"
          class="s3d-bk-color"
          :class="{ active: color.id === state.color }"
          :style="{ background: color.hex, opacity: color.opacity ? 0.6 : 1 }"
          :title="colorName(color.id)"
          :aria-label="colorName(color.id)"
          :aria-pressed="color.id === state.color"
          @click="chooseColor(color.id)"
        ></button>
      </div>
    </section>

    <section v-if="selected.length" class="s3d-bk-section">
      <div class="s3d-bk-heading">
        {{ selected.length > 1 ? t('bricks.selection.many', { count: selected.length }) : selectedName }}
      </div>
      <div class="s3d-bk-row">
        <button class="s3d-btn small" :title="t('bricks.selection.turnTitle')" @click="turnSelected">⟲ 90°</button>
        <button class="s3d-btn small" @click="duplicateSelected">{{ t('bricks.selection.duplicate') }}</button>
        <button class="s3d-btn small" @click="removeSelected">{{ t('bricks.selection.remove') }}</button>
      </div>
      <p class="s3d-bk-hint">{{ t('bricks.selection.hint') }}</p>
    </section>

    <section class="s3d-bk-section">
      <div class="s3d-bk-heading">{{ t('bricks.catalog') }}</div>
      <div class="s3d-bk-chips">
        <button
          v-for="entry in CATEGORIES"
          :key="entry"
          class="s3d-bk-chip"
          :class="{ active: entry === category }"
          @click="category = entry"
        >
          {{ t(`bricks.categories.${entry}`) }}
        </button>
        <button v-if="loadedList.length" class="s3d-bk-chip" :class="{ active: category === 'loaded' }" @click="category = 'loaded'">
          {{ t('bricks.categories.loaded') }}
        </button>
      </div>
      <div class="s3d-bk-grid">
        <button
          v-for="part in shownParts"
          :key="part.id"
          class="s3d-bk-card"
          :class="{ active: part.id === state.placing }"
          :title="part.name"
          @click="choose(part.id)"
        >
          <span class="s3d-bk-thumb" v-html="previewSvg(part.id, state.color)"></span>
          <span class="s3d-bk-name">{{ part.name }}</span>
        </button>
      </div>
    </section>

    <S3dBricksModels @loaded="choose" />

    <S3dBricksOnline @loaded="onLoaded" />

    <section class="s3d-bk-section">
      <div class="s3d-bk-heading">
        {{ t('bricks.list.title') }}
        <button class="s3d-btn small" :disabled="!list.length" @click="downloadCsv">{{ t('bricks.list.csv') }}</button>
      </div>
      <p v-if="!list.length" class="s3d-bk-hint">{{ t('bricks.list.empty') }}</p>
      <button v-for="entry in list" :key="entry.key" class="s3d-bk-entry" @click="selectBricks(entry.ids)">
        <span class="s3d-bk-count">{{ entry.count }} ×</span>
        <span class="s3d-bk-dot" :style="{ background: colorById(entry.color).hex }" :title="colorName(entry.color)"></span>
        <span>{{ entry.name }}</span>
      </button>
      <p v-if="list.length" class="s3d-bk-hint">{{ t('bricks.list.total', { count: total }) }}</p>
      <p v-for="line in credits" :key="line" class="s3d-bk-credit">{{ line }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { duplicateBrick, recolorBricks, removeBricks, selectBricks, selectedBricks, turnBrick } from './bricks';
import { CATALOG, CATEGORIES, type Category } from './catalog';
import { colorById, colorName, COLORS } from './colors';
import { brickCsv, brickList, creditLines } from './list';
import { restoreStoredParts } from './online';
import { loadedParts, partInfo, preparePart } from './parts';
import { previewSvg } from './preview';
import { pluginContext, t } from './runtime';
import S3dBricksModels from './S3dBricksModels.vue';
import S3dBricksOnline from './S3dBricksOnline.vue';
import { useBrickState } from './state';
import { TOOL_ID } from './tool';

/** The designer's panel: colour, catalog, what is selected, finished models, more parts from the library, the parts list. */

const context = pluginContext();
const editor = context.editor;
const state = useBrickState();

// the model is not reactive – the editor bumps these after changes and selections
const revision = computed(() => editor.ui.revision + editor.ui.selRev + state.revision);
const selected = computed(() => {
  void revision.value;
  return selectedBricks();
});
const selectedName = computed(() => {
  const first = selected.value[0];
  return first ? (partInfo(first.data.part)?.name ?? first.data.name) : '';
});
const list = computed(() => {
  void revision.value;
  return brickList();
});
const total = computed(() => list.value.reduce((sum, entry) => sum + entry.count, 0));
const credits = computed(() => {
  void revision.value;
  return creditLines();
});

// ------------------------------------------------------------ the catalog
const category = ref<Category | 'loaded'>('bricks');
const loadedRevision = ref(0);
const loadedList = computed(() => {
  void loadedRevision.value;
  return loadedParts();
});
const shownParts = computed(() =>
  (category.value === 'loaded'
    ? loadedList.value.map((part) => part.id)
    : CATALOG.filter((part) => part.category === category.value).map((part) => part.id)
  ).flatMap((id) => {
    const info = partInfo(id);
    return info ? [info] : [];
  }),
);

onMounted(async () => {
  await restoreStoredParts();
  loadedRevision.value++;
});

/** a chosen brick follows the pointer in the 3D view straight away */
const choose = (id: string) => {
  // the tool first: switching tools ends what the old one was doing
  editor.setTool(TOOL_ID);
  state.placing = id;
  state.turn = 0;
  state.lift = 0;
  preparePart(id)?.catch(() => context.ui.toast(t('bricks.errors.prepare')));
};
const onLoaded = (id: string) => {
  loadedRevision.value++;
  category.value = 'loaded';
  choose(id);
};
const stop = () => {
  state.placing = null;
  state.preview = null;
  editor.redraw();
};

/** with bricks selected a colour paints them too, and it stays for the next bricks */
const chooseColor = (id: string) => {
  state.color = id;
  // a finished model keeps the colours of its bricks
  const paintable = selected.value.filter(({ data }) => !data.model);
  if (paintable.length && !state.placing) {
    recolorBricks(
      paintable.map(({ instance }) => instance),
      id,
    );
  }
  editor.redraw();
};

// ------------------------------------------------------------ the selected bricks
const turnSelected = () => selected.value.forEach(({ instance, data }) => turnBrick(instance, data, 90));
const duplicateSelected = () => {
  const copies = selected.value.flatMap(({ instance, data }) => {
    const copy = duplicateBrick(instance, data);
    return copy ? [copy.id] : [];
  });
  selectBricks(copies);
};
const removeSelected = () => {
  removeBricks(selected.value.map(({ instance }) => instance));
  editor.select([], 'set');
};

// ------------------------------------------------------------ the list
const downloadCsv = () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + brickCsv()], { type: 'text/csv' }));
  link.download = `${editor.model.name || t('bricks.plugin.name')} – ${t('bricks.list.title')}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
</script>
