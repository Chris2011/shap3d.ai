<template>
  <div class="s3d-panel absolute top-0 left-0 z-30 flex h-11 items-center gap-0.5 pe-3 ps-1">
    <button :class="[TOOLBAR_BUTTON, { 'bg-hover': menuOpen }]" :title="t('topbar.menu')" @click.stop="menuOpen = !menuOpen">
      <S3dIcon name="menu" :size="22" />
    </button>
    <input
      v-if="editing"
      ref="nameInput"
      class="mx-1 h-7 w-50 border border-navy bg-surface px-2 font-bold text-navy outline-none"
      v-model="name"
      @keydown.enter="commitName"
      @blur="commitName"
      @keydown.esc="editing = false"
    />
    <div
      v-else
      class="max-w-65 cursor-text truncate pe-2 ps-1.5 text-sm/11 font-bold tracking-[0.05312rem] text-navy"
      :title="t('topbar.rename')"
      @click="startEdit"
    >
      {{ modelName }}
    </div>
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
      :title="t('topbar.undo', { action: localize(editor.ui.undoLabel) })"
      :disabled="!editor.ui.canUndo"
      @click="editor.undo()"
    >
      <S3dIcon name="undo" :size="18" />
    </button>
    <button
      :class="TB_SM"
      :title="t('topbar.redo', { action: localize(editor.ui.redoLabel) })"
      :disabled="!editor.ui.canRedo"
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

  <div ref="exportBox" class="s3d-panel absolute top-0 right-0 z-30 flex h-11 items-center gap-2 px-2">
    <button
      class="h-7 rounded-[2px] border-0 bg-navy-bg px-2.5 text-[0.8125rem] font-bold tracking-[0.01875rem] text-white hover:bg-[#0b3457]"
      @click="toggleExport()"
    >
      {{ t('topbar.export') }}
    </button>
    <div v-if="exportOpen" class="s3d-menu top-11 right-0" @click="closeExport()">
      <div class="s3d-menu-item" @click="run('save')"><S3dIcon name="save" :size="18" /> {{ t('topbar.exportModel') }}</div>
      <div class="s3d-menu-item" @click="run('export-glb')"><S3dIcon name="cube" :size="18" /> GLB</div>
      <div class="s3d-menu-item" @click="run('export-gltf')"><S3dIcon name="cube" :size="18" /> glTF</div>
      <div class="s3d-menu-item" @click="run('export-stl')"><S3dIcon name="cube" :size="18" /> {{ t('topbar.exportStl') }}</div>
      <div class="s3d-menu-item" @click="run('export-obj')"><S3dIcon name="cube" :size="18" /> OBJ</div>
      <div class="s3d-menu-item" @click="run('export-png')"><S3dIcon name="camera" :size="18" /> {{ t('topbar.exportPng') }}</div>
    </div>
  </div>

  <S3dMainMenu v-if="menuOpen" @close="menuOpen = false" />
</template>

<script setup lang="ts">
import { ref, shallowRef, nextTick, useTemplateRef } from 'vue';
import { usePopover } from '../composables/usePopover';
import S3dIcon from './S3dIcon.vue';
import S3dMainMenu from './S3dMainMenu.vue';
import { useEditor } from './keys';
import { runCommand } from '../engine/commands';
import { TOP_BAR_BUTTONS } from '../plugins/uiExtensions';
import S3dThemeButton from './S3dThemeButton.vue';
import { useModel } from '../composables/useModel';
import { t, localize } from '../i18n';

const editor = useEditor();
const TB_BASE = 'flex h-9 items-center justify-center border-0 p-0 hover:enabled:bg-hover disabled:cursor-default disabled:opacity-35';
const TOOLBAR_BUTTON = `${TB_BASE} w-9 text-navy`;
const TB_SM = `${TB_BASE} w-6 text-[#6b6f7b] dark:text-ink-2`;
const menuOpen = ref(false);
const editing = ref(false);
const name = ref('');
const nameInput = shallowRef<HTMLInputElement | null>(null);
const modelName = useModel(() => editor.model.name);
const startEdit = () => {
  name.value = editor.model.name;
  editing.value = true;
  nextTick(() => {
    nameInput.value?.focus();
    nameInput.value?.select();
  });
};
const commitName = () => {
  if (!editing.value) {
    return;
  }
  editing.value = false;
  if (name.value.trim()) {
    editor.model.name = name.value.trim();
    editor.ui.saved = false;
    editor.ui.revision++;
  }
};
const run = (id: string) => {
  runCommand(editor, id);
};
const buttonsAt = (position: 'name' | 'theme') => TOP_BAR_BUTTONS.filter((button) => (button.position ?? 'name') === position);
const { open: exportOpen, toggle: toggleExport, close: closeExport } = usePopover(useTemplateRef('exportBox'));
</script>
