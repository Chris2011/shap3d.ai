<template>
  <!-- model | modes and workspaces of plugins (e.g. the layout plugin's sheets) – centred, the active one coloured -->
  <div
    v-if="WORKSPACES.length || MODES.length"
    class="s3d-panel absolute top-0 left-1/2 z-30 flex h-11 -translate-x-1/2 items-center px-1.5"
    role="radiogroup"
  >
    <div class="flex gap-0.5 rounded bg-hover p-0.5">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        role="radio"
        :aria-checked="option.value === active"
        class="flex h-8 items-center gap-1 rounded-[3px] border-0 px-2.5 text-xs whitespace-nowrap"
        :class="option.value === active ? 'bg-blue font-bold text-white shadow-sm' : 'bg-transparent text-ink hover:bg-surface'"
        @click="switchView(editor, option.value || null)"
      >
        <S3dIcon v-if="option.icon" :name="option.icon" :size="14" />{{ option.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import { MODES, WORKSPACES, modeState, switchView, workspaceState } from '../../plugins/uiExtensions';
import { t, localize } from '../../i18n';

/** Switch between the model and the modes and workspaces plugins add – only there when a plugin adds one. */
const editor = useEditor();
const options = computed(() => [
  { value: '', label: t('workspace.model'), icon: 'cube' },
  ...MODES.map((mode) => ({ value: mode.id, label: localize(mode.label), icon: mode.icon })),
  ...WORKSPACES.map((workspace) => ({ value: workspace.id, label: localize(workspace.label), icon: workspace.icon })),
]);
const active = computed(() => workspaceState.active ?? modeState.active ?? '');
</script>
