<template>
  <div class="s3d-panel absolute top-0 left-0 z-30 flex h-11 items-center gap-0.5 pe-3 ps-1">
    <button :class="[TOOLBAR_BUTTON, { 'bg-hover': menuOpen }]" :title="t('topbar.menu')" @click.stop="menuOpen = !menuOpen">
      <S3dIcon name="menu" :size="22" />
    </button>
    <S3dModelName />
    <button
      v-for="(button, i) in buttonsAt('name')"
      :key="i"
      :class="[TOOLBAR_BUTTON, { 'bg-hover': button.active?.() }]"
      :title="localize(button.title)"
      @click="button.run(editor, $event)"
    >
      <S3dIcon :name="button.icon" :size="22" /><span v-if="button.badge" class="ms-0.5 text-[0.625rem] font-bold">{{
        button.badge()
      }}</span>
    </button>
    <button
      :class="TB_SM"
      :title="toolBusy() ? t('topbar.cancelAction') : t('topbar.undo', { action: localize(editor.ui.undoLabel) })"
      :disabled="!editor.ui.canUndo && !toolBusy()"
      @click="editor.undo()"
    >
      <S3dIcon name="undo" :size="18" />
    </button>
    <button
      :class="TB_SM"
      :title="toolBusy() ? t('topbar.cancelAction') : t('topbar.redo', { action: localize(editor.ui.redoLabel) })"
      :disabled="!editor.ui.canRedo && !toolBusy()"
      @click="editor.redo()"
    >
      <S3dIcon name="redo" :size="18" />
    </button>
    <button :class="[TB_SM, 'hover:text-danger']" :title="t('topbar.clearAll')" @click="run('clearAll')">
      <S3dIcon name="trash" :size="18" />
    </button>
    <S3dThemeButton />
    <button
      v-for="(button, i) in buttonsAt('theme')"
      :key="'t' + i"
      :class="[TB_SM, 'w-auto gap-0.5 px-1', { 'bg-hover': button.active?.() }]"
      :title="localize(button.title)"
      @click="button.run(editor, $event)"
    >
      <S3dIcon :name="button.icon" :size="18" /><span v-if="button.badge" class="text-[0.625rem] font-bold">{{ button.badge() }}</span>
    </button>
    <span v-if="editor.ui.saved" class="whitespace-nowrap ps-3.5 text-sm font-bold text-[#90939f]">{{ t('topbar.saved') }}</span>
    <button
      v-else
      class="whitespace-nowrap border-0 bg-transparent ps-3.5 text-sm font-bold text-navy hover:underline"
      :title="t('topbar.saveTitle')"
      @click="run('save')"
    >
      {{ t('topbar.save') }}
    </button>
  </div>

  <S3dWorkspaceSwitch />
  <S3dExportMenu />

  <S3dMainMenu v-if="menuOpen" @close="menuOpen = false" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import S3dIcon from './S3dIcon.vue';
import S3dMainMenu from './S3dMainMenu.vue';
import S3dThemeButton from './S3dThemeButton.vue';
import S3dExportMenu from './topbar/S3dExportMenu.vue';
import S3dModelName from './topbar/S3dModelName.vue';
import S3dWorkspaceSwitch from './topbar/S3dWorkspaceSwitch.vue';
import { useEditor } from './keys';
import { runCommand } from '../engine/commands';
import { TOP_BAR_BUTTONS } from '../plugins/uiExtensions';
import { t, localize } from '../i18n';

/** Top bar: menu, model name, undo/redo/clear, theme, plugin buttons and save – plus the workspace switch and Export. */
const editor = useEditor();
/** a tool in the middle of an action – undo and redo cancel it then; the status line changes with every step of one */
const toolBusy = () => (void editor.ui.status, !!editor.tool?.busy());
const TB_BASE = 'flex h-9 items-center justify-center border-0 p-0 hover:enabled:bg-hover disabled:cursor-default disabled:opacity-35';
const TOOLBAR_BUTTON = `${TB_BASE} w-9 text-navy`;
const TB_SM = `${TB_BASE} w-6 text-[#6b6f7b] dark:text-ink-2`;
const menuOpen = ref(false);
const run = (id: string) => {
  runCommand(editor, id);
};
const buttonsAt = (position: 'name' | 'theme') => TOP_BAR_BUTTONS.filter((button) => (button.position ?? 'name') === position);
</script>
