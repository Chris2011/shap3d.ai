<template>
  <div ref="root" class="group relative mx-0.5 flex h-9 items-center">
    <button
      class="flex h-7.5 w-7 items-center justify-center rounded-s-[3px] p-0 text-ink-2 hover:text-navy group-hover:bg-hover"
      :class="open && 'bg-hover'"
      :title="theme.dark ? t('theme.darkOff') : t('theme.darkOn')"
      :aria-pressed="theme.dark"
      @click="toggleTheme()"
    >
      <S3dIcon :name="theme.dark ? 'moon' : 'sun'" :size="18" />
    </button>
    <button
      class="flex h-7.5 w-4 items-center justify-center rounded-e-[3px] border-s p-0 text-ink-2 hover:text-navy group-hover:border-line-2 group-hover:bg-hover"
      :class="open ? 'border-line-2 bg-hover' : 'border-transparent'"
      :title="t('theme.more')"
      :aria-expanded="open"
      @click="toggle()"
    >
      <S3dIcon name="chevronDown" :size="12" />
    </button>

    <div v-if="open" class="s3d-menu top-10 -left-2 w-67 cursor-default px-3 pt-2.5 pb-3">
      <label class="flex items-center justify-between gap-2.5">
        <span class="flex items-center gap-2 font-semibold"><S3dIcon name="moon" :size="16" /> {{ t('theme.darkMode') }}</span>
        <S3dToggleSwitch :model-value="theme.dark" :label="t('theme.darkMode')" @update:model-value="toggleTheme()" />
      </label>
      <div class="-mx-3 my-2.5 h-px bg-line"></div>
      <div class="mt-2 mb-1.25 s3d-caption text-muted">{{ t('theme.interface') }}</div>
      <S3dSegmentedControl :model-value="theme.mode" :options="INTERFACE_OPTIONS" @update:model-value="setTheme" />
      <div class="mt-2 mb-1.25 s3d-caption text-muted">{{ t('theme.scene') }}</div>
      <S3dSegmentedControl :model-value="theme.scene" :options="SCENE" @update:model-value="setScene" />
      <p class="mt-2.5 mb-0 text-[0.71875rem]/[1.4] text-ink-2">{{ hint }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import S3dToggleSwitch from './ui/S3dToggleSwitch.vue';
import S3dSegmentedControl from './ui/S3dSegmentedControl.vue';
import { computed, useTemplateRef } from 'vue';
import { usePopover } from '../composables/usePopover';
import S3dIcon from './S3dIcon.vue';
import { theme, toggleTheme, setTheme, setScene, type ThemeMode, type SceneMode } from '../theme';
import { t } from '../i18n';

const INTERFACE_OPTIONS = computed((): { value: ThemeMode; label: string; icon: string }[] => [
  { value: 'light', label: t('theme.light'), icon: 'sun' },
  { value: 'dark', label: t('theme.dark'), icon: 'moon' },
  { value: 'system', label: t('theme.system'), icon: 'monitor' },
]);
const SCENE = computed((): { value: SceneMode; label: string; icon: string }[] => [
  { value: 'day', label: t('theme.day'), icon: 'sun' },
  { value: 'night', label: t('theme.night'), icon: 'moon' },
  { value: 'auto', label: t('theme.likeInterface'), icon: 'monitor' },
]);
const hint = computed(() => {
  if (theme.dark && !theme.night) {
    return t('theme.hintDarkMenus');
  }
  if (!theme.dark && theme.night) {
    return t('theme.hintNightScene');
  }
  if (theme.night) {
    return t('theme.hintAllDark');
  }
  return t('theme.hintAllLight');
});
const { open, toggle } = usePopover(useTemplateRef('root'));
</script>
