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
      <S3dMenuItem
        v-for="entry in languages"
        :key="entry.code"
        role="menuitemradio"
        :checked="isChosen(entry.code)"
        :aria-checked="isChosen(entry.code)"
        @click="choose(entry.code)"
      >
        <span class="flex-1" :dir="entry.dir">{{ entry.name }}</span>
        <span class="text-[0.6875rem] text-muted uppercase">{{ entry.code }}</span>
        <span v-if="entry.code !== SOURCE_LANGUAGE" class="w-9 text-end text-[0.6875rem] text-muted tabular-nums">{{
          percent(entry.code)
        }}</span>
      </S3dMenuItem>
      <S3dMenuItem role="menuitemradio" :checked="chosenLanguage === ''" :aria-checked="chosenLanguage === ''" @click="choose('')">{{
        t('i18n.switcher.automatic')
      }}</S3dMenuItem>
      <S3dMenuSeparator />
      <S3dMenuItem icon="language" @click="openEditor()">{{ t('i18n.switcher.edit') }}</S3dMenuItem>
    </div>
  </template>
</template>

<script setup lang="ts">
import S3dMenuItem from '../../../components/ui/S3dMenuItem.vue';
import S3dMenuSeparator from '../../../components/ui/S3dMenuSeparator.vue';
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
