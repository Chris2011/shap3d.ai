<template>
  <div class="s3d-ws">
    <div class="s3d-ws-heading">{{ t('woodshop.panel.selected') }}</div>
    <p v-if="!instances.length" class="s3d-ws-hint">{{ t('woodshop.panel.selectGroups') }}</p>
    <template v-else-if="board">
      <p v-if="sides" class="s3d-ws-sides">{{ sides }}</p>
      <label class="s3d-ws-field">
        <span>{{ t('woodshop.fields.grain') }}</span>
        <select class="s3d-input" :value="board.grain" @change="change({ grain: valueOf($event) as BoardData['grain'] })">
          <option value="length">{{ t('woodshop.grain.length') }}</option>
          <option value="width">{{ t('woodshop.grain.width') }}</option>
        </select>
      </label>
      <label v-for="key in BANDS" :key="key" class="s3d-ws-field">
        <span>{{ t(`woodshop.fields.${key}`) }}</span>
        <select class="s3d-input" :value="String(board[key])" @change="change({ [key]: Number(valueOf($event)) })">
          <option v-for="count in [0, 1, 2]" :key="count" :value="String(count)">{{ count }}</option>
        </select>
      </label>
      <button class="s3d-btn" @click="setBoards(context, instances, null, 'woodshop.undo.unmark')">{{ t('woodshop.panel.unmark') }}</button>
    </template>
    <button v-else class="s3d-btn" @click="setBoards(context, instances, DEFAULT_BOARD, 'woodshop.undo.mark')">
      {{ t('woodshop.panel.mark') }}
    </button>

    <div class="s3d-ws-heading">{{ t('woodshop.cutList.title') }}</div>
    <p v-if="!rows.length" class="s3d-ws-hint">{{ t('woodshop.cutList.empty') }}</p>
    <template v-else>
      <table class="s3d-ws-table">
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td class="count">{{ row.count }}×</td>
            <td>
              {{ row.name }}
              <div class="material">{{ row.material || '–' }}</div>
            </td>
            <td class="size">{{ [row.length, row.width, row.thickness].map((size) => editor.fmt(size)).join(' × ') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="banding" class="s3d-ws-hint">{{ t('woodshop.cutList.banding', { length: editor.fmt(banding) }) }}</p>
      <button class="s3d-btn" @click="context.commands.run('export-woodshop.cut-list')">{{ t('woodshop.cutList.save') }}</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DEFAULT_BOARD, boardSides, cutList, type BoardData } from './boards';
import { boardOf, boardSize, collectBoards, setBoards } from './collect';
import { pluginContext, t } from './runtime';

/** Woodshop: mark groups as boards (grain, edge banding) and see the cut list of all boards in the model. */
const context = pluginContext();
const editor = context.editor;
const BANDS = ['bandLong', 'bandShort'] as const;

// the model is not reactive – the editor bumps ui.revision after every change and ui.selRev after every selection change
const instances = computed(() => {
  void editor.ui.revision;
  void editor.ui.selRev;
  return editor
    .selected()
    .filter((ref) => ref.kind === 'instance')
    .map((ref) => editor.entities.instances.get(ref.id)!)
    .filter(Boolean);
});
/** the settings shown: those of the first selected board, when all selected groups are boards */
const board = computed(() => {
  const boards = instances.value.map((instance) => boardOf(context, instance));
  return boards.length && boards.every(Boolean) ? { ...boards[0]! } : undefined;
});
const rows = computed(() => {
  void editor.ui.revision;
  return cutList(collectBoards(context));
});
const banding = computed(() => rows.value.reduce((sum, row) => sum + row.banding, 0));

/** length × width × thickness of a single selected board */
const sides = computed(() => {
  const instance = instances.value.length === 1 ? instances.value[0] : undefined;
  if (!instance || !board.value) {
    return '';
  }
  const { length, width, thickness } = boardSides(boardSize(instance, instance.matrix), board.value.grain);
  return [length, width, thickness].map((size) => editor.fmt(size)).join(' × ');
});

const valueOf = (event: Event) => (event.target as HTMLSelectElement).value;
const change = (patch: Partial<BoardData>) => setBoards(context, instances.value, { ...board.value!, ...patch }, 'woodshop.undo.change');
</script>
