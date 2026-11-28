<template>
  <div class="s3d-op">
    <div v-if="selected" class="s3d-op-heading">{{ t(`openings.kinds.${selected.kind}`) }}</div>
    <div v-else class="s3d-op-tabs" role="tablist">
      <button
        v-for="kind in KINDS"
        :key="kind"
        role="tab"
        :aria-selected="chosen.kind === kind"
        :class="{ active: chosen.kind === kind }"
        @click="chosen.kind = kind"
      >
        {{ t(`openings.kinds.${kind}`) }}
      </button>
    </div>
    <label v-for="key in SIZE_KEYS" :key="key" class="s3d-op-field">
      <span>{{ t(`openings.fields.${key}`) }}</span>
      <input
        class="s3d-input"
        type="number"
        min="1"
        step="10"
        :value="Math.round(shown[key] * 1000)"
        @change="setSize(key, ($event.target as HTMLInputElement).value)"
        @keydown.stop
      />
    </label>

    <label v-for="key in COUNT_KEYS" :key="key" class="s3d-op-field">
      <span>{{ t(`openings.fields.${key}`) }}</span>
      <select class="s3d-input" :value="String(shown[key])" @change="set({ [key]: Number(valueOf($event)) })">
        <option v-for="count in key === 'sashes' ? [1, 2, 3] : [0, 1, 2, 3, 4]" :key="count" :value="String(count)">{{ count }}</option>
      </select>
    </label>
    <label v-if="shown.kind === 'door'" class="s3d-op-field">
      <span>{{ t('openings.fields.hinge') }}</span>
      <select class="s3d-input" :value="shown.hinge" @change="set({ hinge: valueOf($event) as OpeningParams['hinge'] })">
        <option value="left">{{ t('openings.hinge.left') }}</option>
        <option value="right">{{ t('openings.hinge.right') }}</option>
      </select>
    </label>

    <p v-if="selected" class="s3d-op-hint">{{ t('openings.panel.sizeHint') }}</p>
    <template v-else>
      <button class="s3d-btn" @click="editor.setTool(TOOL_ID)">{{ t('openings.panel.place') }}</button>
      <p class="s3d-op-hint">{{ t('openings.panel.placeHint') }}</p>
    </template>

    <div class="s3d-op-heading">{{ t('openings.list.title') }}</div>
    <p v-if="!rows.length" class="s3d-op-hint">{{ t('openings.list.empty') }}</p>
    <template v-else>
      <table class="s3d-op-table">
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td class="count">{{ row.count }}×</td>
            <td>
              {{ t(`openings.kinds.${row.kind}`) }}
              <div class="sizes">{{ sizes(row) }}</div>
            </td>
          </tr>
        </tbody>
      </table>
      <button class="s3d-btn" @click="context.commands.run('export-openings.schedule')">{{ t('openings.list.save') }}</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { schedule } from './list';
import type { OpeningParams } from './parts';
import { changeOpening } from './change';
import { openingOf } from './place';
import { pluginContext, t } from './runtime';
import { useChosen, useDrafts } from './state';
import { TOOL_ID } from './tool';

/** Windows and doors: the settings for the next one (or the selected one's), the tool that sets it, and the schedule. */
const context = pluginContext();
const editor = context.editor;
const KINDS = ['window', 'door'] as const;
const drafts = useDrafts();
const chosen = useChosen();

// the model is not reactive – the editor bumps ui.revision after every change and ui.selRev after every selection change
const instance = computed(() => {
  void editor.ui.revision;
  void editor.ui.selRev;
  const selection = editor.selected();
  return selection.length === 1 && selection[0].kind === 'instance' ? editor.entities.instances.get(selection[0].id) : undefined;
});
const selected = computed(() => {
  const data = openingOf(context, instance.value);
  return data && { ...data };
});
const shown = computed((): OpeningParams => selected.value ?? drafts[chosen.kind]);
const SIZE_KEYS = computed(() => (shown.value.kind === 'door' ? (['width', 'height'] as const) : (['width', 'height', 'sill'] as const)));
const COUNT_KEYS = computed(() => (shown.value.kind === 'door' ? [] : (['sashes', 'barsAcross', 'barsUpright'] as const)));
const rows = computed(() => {
  void editor.ui.revision;
  return schedule(context);
});

const valueOf = (event: Event) => (event.target as HTMLSelectElement).value;
const sizes = (opening: { width: number; height: number; sill: number; kind: string }) =>
  [editor.fmt(opening.width), editor.fmt(opening.height)].join(' × ') +
  (opening.kind === 'window' ? ` · ${t('openings.list.sill')} ${editor.fmt(opening.sill)}` : '');

/** a setting: the selected opening is built again, otherwise it is kept for the next one */
const set = (patch: Partial<OpeningParams>) => {
  if (instance.value && selected.value) {
    changeOpening(context, instance.value, patch); // when it fails the app says why and nothing changes
  } else {
    Object.assign(drafts[chosen.kind], patch);
  }
};

/** sizes are typed in mm; the sill may be 0 */
const setSize = (key: 'width' | 'height' | 'sill', text: string) => {
  const millimetres = Number(text.replace(',', '.'));
  if (Number.isFinite(millimetres) && (millimetres > 0 || (key === 'sill' && millimetres === 0))) {
    set({ [key]: millimetres / 1000 });
  }
};
</script>
