<template>
  <div class="absolute inset-x-0 bottom-0 z-30 flex h-status items-center gap-1 bg-panel px-1.5 text-xs">
    <button class="s3d-iconbtn size-6.5" :title="t('statusbar.help')" @click="editor.ui.dialog = { kind: 'help' }">
      <S3dIcon name="help" :size="18" />
    </button>
    <span class="mx-0.5 h-4 w-px bg-edge"></span>
    <div ref="devBox" class="relative">
      <button
        class="s3d-iconbtn size-6.5"
        :class="{ active: devOpen }"
        :title="t('statusbar.inputDeviceTitle', { device: nav.device === 'mouse' ? t('statusbar.mouse') : t('statusbar.trackpad') })"
        @click="toggleDev()"
      >
        <S3dIcon :name="nav.device === 'mouse' ? 'mouse' : 'trackpad'" :size="18" />
      </button>
      <div v-if="devOpen" class="s3d-panel absolute bottom-8.5 left-0 z-50 w-75 px-3 py-2.5 text-xs" @click.stop @pointerdown.stop>
        <div :class="HEADING" class="mt-0!">{{ t('statusbar.inputDevice') }}</div>
        <S3dSegmentedControl v-model="nav.device" :options="DEVICES" />
        <template v-if="nav.device === 'trackpad'">
          <div :class="HEADING">{{ t('statusbar.twoFingerSwipe') }}</div>
          <S3dSegmentedControl v-model="nav.swipe" :options="SWIPES" />
        </template>
        <table class="mt-2 w-full border-collapse">
          <tr v-for="row in mapping" :key="row[0]">
            <td class="py-0.5">
              <kbd class="whitespace-nowrap border border-line-2 bg-surface px-1.25 font-mono text-[0.6875rem]">{{ row[0] }}</kbd>
            </td>
            <td class="py-0.5">{{ row[1] }}</td>
          </tr>
        </table>
        <div :class="HEADING">{{ t('statusbar.fineTuning') }}</div>
        <div v-for="action in ACTIONS" :key="'s' + action" class="my-0.75 flex items-center gap-1.5">
          <span class="w-16">{{ ACTION_LABEL[action] }}</span>
          <input class="flex-1" type="range" min="0.25" max="3" step="0.05" v-model.number="nav.sensitivity[action]" />
          <label class="flex items-center gap-0.75 whitespace-nowrap"
            ><input type="checkbox" v-model="nav.invert[action]" /> {{ t('statusbar.invert') }}</label
          >
        </div>
      </div>
    </div>
    <div class="min-w-0 flex-1 truncate ps-1.5 text-[0.83125rem] text-ink" :title="editor.ui.status">{{ editor.ui.status }}</div>
    <div v-if="selInfo" class="whitespace-nowrap px-3 text-ink-2">{{ selInfo }}</div>
    <div class="flex items-center gap-1 ps-2.5 text-[0.83125rem]">
      <label class="whitespace-nowrap text-ink">{{ localize(editor.ui.vcbLabel) || t('statusbar.measurements') }}</label>
      <input
        ref="input"
        v-model="value"
        dir="ltr"
        class="h-5.5 w-40 rounded-none border border-[#8e919c] bg-surface px-1 text-start text-[0.8125rem] outline-none focus:border-blue"
        spellcheck="false"
        @focus="onFocus"
        @blur="onBlur"
        @keydown.enter.prevent="submit"
        @keydown.esc.prevent="cancel"
        @keydown.stop
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import S3dSegmentedControl from './ui/S3dSegmentedControl.vue';
import { ref, shallowRef, computed, watch, nextTick } from 'vue';
import S3dIcon from './S3dIcon.vue';
import { nav, wheelAction, ACTION_LABEL, type NavAction } from '../engine/navigation';
import { useTemplateRef } from 'vue';
import { usePopover } from '../composables/usePopover';
import { useEditor } from './keys';
import { useSelection } from '../composables/useModel';
import { t, localize, shortcutLabel } from '../i18n';

const editor = useEditor();
const HEADING = 'mt-2 mb-1.25 font-bold tracking-[0.03125rem] text-navy';
const ACTIONS: NavAction[] = ['orbit', 'pan', 'zoom'];
const DEVICES = computed((): { value: 'mouse' | 'trackpad'; label: string; icon: string }[] => [
  { value: 'mouse', label: t('statusbar.mouse'), icon: 'mouse' },
  { value: 'trackpad', label: t('statusbar.trackpad'), icon: 'trackpad' },
]);
const SWIPES = computed(() => ACTIONS.map((action) => ({ value: action, label: ACTION_LABEL[action] })));
const mapping = computed(() => {
  const wheel = nav.device === 'mouse' ? t('statusbar.mouseWheel') : t('statusbar.twoFingers');
  const rows: [string, string][] = [
    [wheel, ACTION_LABEL[wheelAction(false, false)]],
    [`${shortcutLabel('Shift')} + ${wheel}`, ACTION_LABEL[wheelAction(true, false)]],
    [`${shortcutLabel('Ctrl')} + ${wheel}`, ACTION_LABEL[wheelAction(false, true)]],
  ];
  if (nav.device === 'trackpad') {
    rows.push([t('statusbar.pinch'), ACTION_LABEL.zoom]);
  } else {
    rows.push(
      [t('statusbar.middleDrag'), ACTION_LABEL.orbit],
      [`${shortcutLabel('Shift')} + ${t('statusbar.middleButton')}`, ACTION_LABEL.pan],
    );
  }
  return rows;
});
const { open: devOpen, toggle: toggleDev } = usePopover(useTemplateRef('devBox'));
const input = shallowRef<HTMLInputElement | null>(null);
const value = ref('');
/** the box is left-to-right: a mark after Arabic unit symbols keeps "1074 مم; 3617 مم" in reading order (removed again when parsing) */
const shown = (text: string) => text.replace(/[\u0600-\u06ff]+/g, (word) => `${word}\u200e`);
watch(
  () => editor.ui.vcbValue,
  (next) => {
    if (!editor.ui.vcbEditing) {
      value.value = shown(next);
    }
  },
);
const selInfo = useSelection(() => (editor.selection.size ? editor.selectionSummary() : ''));

const onFocus = () => {
  editor.ui.vcbEditing = true;
};
const onBlur = () => {
  editor.ui.vcbEditing = false;
  value.value = shown(editor.ui.vcbValue);
};
const submit = () => {
  const text = value.value;
  editor.ui.vcbEditing = false;
  input.value?.blur();
  editor.submitVcb(text);
  value.value = shown(editor.ui.vcbValue);
};
const cancel = () => {
  editor.ui.vcbEditing = false;
  input.value?.blur();
  value.value = shown(editor.ui.vcbValue);
};
const focusVcb = (initial: string) => {
  editor.ui.vcbEditing = true;
  value.value = initial;
  nextTick(() => {
    input.value?.focus();
    const length = value.value.length;
    input.value?.setSelectionRange(length, length);
  });
};
defineExpose({ focusVcb });
</script>
