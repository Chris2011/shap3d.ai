<template>
  <template v-if="languageMenu.open">
    <div class="fixed inset-0 z-55" @pointerdown="closeLanguageMenu()"></div>
    <div
      class="s3d-menu fixed z-60 w-60"
      :style="{ left: `${languageMenu.x}px`, top: `${languageMenu.y}px` }"
      role="menu"
      @pointerdown.stop
    >
      <div class="px-3 pt-1.5 pb-1 s3d-caption text-muted">{{ t('i18n.switcher.title') }}</div>
      <div
        v-for="entry in languages"
        :key="entry.code"
        class="s3d-menu-item"
        role="menuitemradio"
        :aria-checked="isChosen(entry.code)"
        @click="choose(entry.code)"
      >
        <span class="inline-block w-3.5 font-bold text-blue">{{ isChosen(entry.code) ? '✓' : '' }}</span>
        <span class="flex-1" :dir="entry.dir">{{ entry.name }}</span>
        <span class="text-[0.6875rem] text-muted uppercase">{{ entry.code }}</span>
        <span v-if="entry.code !== SOURCE_LANGUAGE" class="w-9 text-end text-[0.6875rem] text-muted tabular-nums">{{
          percent(entry.code)
        }}</span>
      </div>
      <div class="s3d-menu-item" role="menuitemradio" :aria-checked="chosenLanguage === ''" @click="choose('')">
        <span class="inline-block w-3.5 font-bold text-blue">{{ chosenLanguage === '' ? '✓' : '' }}</span
        >{{ t('i18n.switcher.automatic') }}
      </div>
      <div class="s3d-menu-sep"></div>
      <div class="s3d-menu-item" @click="openEditor()"><S3dIcon name="language" :size="18" /> {{ t('i18n.switcher.edit') }}</div>
    </div>
  </template>
</template>

<script setup lang="ts">
import S3dIcon from '../../../components/S3dIcon.vue';
import { showPanel } from '../../../components/panelState';
import { t, languages, chosenLanguage, setLanguage, formatNumber, SOURCE_LANGUAGE } from '../../../i18n';
import { languageMenu, closeLanguageMenu, EDITOR_PANEL } from './state';
import { progressOf } from './store';

/** a language counts as chosen when it is picked explicitly (automatic has its own row) */
const isChosen = (code: string) => chosenLanguage.value === code;
const percent = (code: string) => `${formatNumber(Math.floor(progressOf(code) * 100))} %`;
const choose = (code: string) => {
  setLanguage(code);
  closeLanguageMenu();
};
const openEditor = () => {
  closeLanguageMenu();
  showPanel(EDITOR_PANEL);
};
</script>
