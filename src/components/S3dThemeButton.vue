<template>
  <div ref="root" class="group relative mx-0.5 flex h-9 items-center">
    <button class="flex h-7.5 w-7 items-center justify-center rounded-l-[3px] p-0 text-ink-2 hover:text-navy group-hover:bg-hover" :class="open && 'bg-hover'" :title="theme.dark ? 'Dunkelmodus aus' : 'Dunkelmodus an'" :aria-pressed="theme.dark" @click="toggleTheme()">
      <S3dIcon :name="theme.dark ? 'moon' : 'sun'" :size="18" />
    </button>
    <button class="flex h-7.5 w-4 items-center justify-center rounded-r-[3px] border-l p-0 text-ink-2 hover:text-navy group-hover:border-line-2 group-hover:bg-hover" :class="open ? 'border-line-2 bg-hover' : 'border-transparent'" title="Weitere Design-Optionen" :aria-expanded="open" @click="toggle()"><S3dIcon name="chevronDown" :size="12" /></button>

    <div v-if="open" class="s3d-menu top-10 -left-2 w-67 cursor-default px-3 pt-2.5 pb-3">
      <label class="flex items-center justify-between gap-2.5">
        <span class="flex items-center gap-2 font-semibold"><S3dIcon name="moon" :size="16" /> Dunkelmodus</span>
        <S3dToggleSwitch :model-value="theme.dark" label="Dunkelmodus" @update:model-value="toggleTheme()" />
      </label>
      <div class="-mx-3 my-2.5 h-px bg-line"></div>
      <div class="mt-2 mb-1.25 s3d-caption text-muted">Oberfläche</div>
      <S3dSegmentedControl :model-value="theme.mode" :options="INTERFACE_OPTIONS" @update:model-value="setTheme" />
      <div class="mt-2 mb-1.25 s3d-caption text-muted">3D-Szene</div>
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

const INTERFACE_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Hell', icon: 'sun' }, { value: 'dark', label: 'Dunkel', icon: 'moon' }, { value: 'system', label: 'System', icon: 'monitor' },
];
const SCENE: { value: SceneMode; label: string; icon: string }[] = [
  { value: 'day', label: 'Tag', icon: 'sun' }, { value: 'night', label: 'Nacht', icon: 'moon' }, { value: 'auto', label: 'Wie Oberfläche', icon: 'monitor' },
];
const hint = computed(() => {
  if (theme.dark && !theme.night) return 'Nur die Menüs sind dunkel, die 3D-Szene bleibt hell.';
  if (!theme.dark && theme.night) return 'Helle Menüs, die 3D-Szene zeigt Nacht.';
  if (theme.night) return 'Alles dunkel: Menüs und 3D-Szene bei Nacht.';
  return 'Alles hell.';
});
const { open, toggle } = usePopover(useTemplateRef('root'));
</script>
