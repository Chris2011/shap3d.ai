<template>
  <S3dModalDialog v-if="dialog" panel-class="w-95 overflow-auto px-4.5 py-4" @close="cancel">
    <!-- prompt -->
    <template v-if="dialog.kind === 'prompt'">
      <div class="mb-3 text-[0.9375rem] font-semibold">{{ dialog.data.title }}</div>
      <textarea
        v-if="dialog.data.multiline"
        ref="first"
        v-model="val"
        class="s3d-input h-17.5 resize-y px-2 py-1.5"
        @keydown.enter.exact.prevent="ok"
        @keydown.esc="cancel"
      ></textarea>
      <input v-else ref="first" v-model="val" class="s3d-input" @keydown.enter="ok" @keydown.esc="cancel" />
      <div class="mt-3.5 flex justify-end gap-2">
        <button class="s3d-btn" @click="cancel">{{ t('common.cancel') }}</button
        ><button class="s3d-btn primary" @click="ok">{{ t('common.ok') }}</button>
      </div>
    </template>
    <!-- confirm -->
    <template v-else-if="dialog.kind === 'confirm'">
      <div class="mb-3 text-[0.9375rem] font-semibold">{{ dialog.data.title }}</div>
      <div class="mt-3.5 flex justify-end gap-2">
        <button class="s3d-btn" @click="answer(false)">{{ t('common.no') }}</button
        ><button ref="first" class="s3d-btn primary" @click="answer(true)">{{ t('common.yes') }}</button>
      </div>
    </template>
    <!-- help -->
    <template v-else-if="dialog.kind === 'help'">
      <div class="mb-3 text-[0.9375rem] font-semibold">{{ t('dialogs.helpTitle') }}</div>
      <div class="grid gap-1">
        <div v-for="row in HELP" :key="row[0]" class="flex items-baseline gap-2.5">
          <kbd class="min-w-32 rounded-[3px] border border-line-2 bg-surface-2 px-1.5 text-center font-mono text-[0.6875rem]/[1.6]">{{
            row[0]
          }}</kbd
          ><span>{{ row[1] }}</span>
        </div>
      </div>
      <div class="mt-3.5 flex justify-end gap-2">
        <button ref="first" class="s3d-btn primary" @click="editor.ui.dialog = null">{{ t('common.close') }}</button>
      </div>
    </template>
  </S3dModalDialog>
</template>

<script setup lang="ts">
import S3dModalDialog from './ui/S3dModalDialog.vue';
import { ref, shallowRef, computed, watch, nextTick, reactive } from 'vue';
import { useEditor } from './keys';
import { t, shortcutLabel } from '../i18n';

const editor = useEditor();
const dialog = computed(() => editor.ui.dialog);
const val = ref('');
const first = shallowRef<HTMLElement | null>(null);
watch(dialog, (current) => {
  if (current?.kind === 'prompt') {
    val.value = current.data.value ?? '';
  }
  nextTick(() => {
    (first.value as any)?.focus?.();
    (first.value as any)?.select?.();
  });
});
const ok = () => {
  dialog.value?.data.resolve(val.value);
};
const cancel = () => {
  const current = dialog.value;
  if (!current) {
    return;
  }
  if (current.kind === 'prompt') {
    current.data.resolve(null);
  } else if (current.kind === 'confirm') {
    current.data.resolve(false);
  } else {
    editor.ui.dialog = null;
  }
};
const answer = (accepted: boolean) => {
  dialog.value?.data.resolve(accepted);
};
/** [keys, what they do]; texts from `dialogs.help.*` */
const HELP = computed((): [string, string][] => [
  [shortcutLabel('Space'), t('tools.select')],
  ['L', t('tools.line')],
  ['R', t('tools.rectangle')],
  ['C', t('tools.circle')],
  ['A', t('dialogs.help.arc2')],
  ['P', t('tools.pushpull')],
  ['F', t('tools.offset')],
  ['M', t('dialogs.help.move')],
  ['Q', t('tools.rotate')],
  ['S', t('tools.scale')],
  ['T', t('tools.tape')],
  ['E', t('tools.eraser')],
  ['B', t('tools.paint')],
  [t('dialogs.help.orbitKeys'), t('tools.orbit')],
  [t('dialogs.help.panKeys'), t('tools.pan')],
  [t('dialogs.help.zoomKeys'), t('dialogs.help.zoom')],
  [shortcutLabel('Shift+Z'), t('commands.zoomExtents')],
  ['G', t('undo.makeComponent')],
  [t('dialogs.help.arrowKeys'), t('dialogs.help.lockAxis')],
  [t('dialogs.help.shiftHold'), t('dialogs.help.lockDirection')],
  [t('dialogs.help.typeNumbers'), t('dialogs.help.vcb')],
  [t('dialogs.help.doubleClick'), t('dialogs.help.doubleClickAction')],
  [t('dialogs.help.tripleClick'), t('dialogs.help.tripleClickAction')],
  [shortcutLabel('Esc'), t('dialogs.help.escape')],
  [`${shortcutLabel('Ctrl+Z')} / ${shortcutLabel('Ctrl+Y')}`, t('dialogs.help.undoRedo')],
  [shortcutLabel('Del'), t('dialogs.help.deleteSelection')],
  ['Alt+K', t('commands.xray')],
]);
</script>
