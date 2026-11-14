<template>
  <div class="flex h-full min-h-0 flex-col">
    <S3dScriptToolbar />
    <S3dScriptActions />
    <S3dObjOptions v-if="lang === 'obj'" />
    <S3dScriptHelp v-if="showHelp" />
    <S3dCodeArea />
    <S3dScriptConsole />
  </div>
</template>

<script setup lang="ts">
import S3dCodeArea from './scriptEditor/S3dCodeArea.vue';
import S3dObjOptions from './scriptEditor/S3dObjOptions.vue';
import S3dScriptActions from './scriptEditor/S3dScriptActions.vue';
import S3dScriptConsole from './scriptEditor/S3dScriptConsole.vue';
import S3dScriptHelp from './scriptEditor/S3dScriptHelp.vue';
import S3dScriptToolbar from './scriptEditor/S3dScriptToolbar.vue';
import { provideScriptEditorState } from '../../composables/useScriptEditorState';
import { useScriptDraft } from '../../composables/useScriptDraft';

/** Script editor: write or load code, run it, see the console. Its parts share one state (provide/inject). */
const state = provideScriptEditorState();
const { lang, showHelp } = state;
useScriptDraft(state);
</script>
