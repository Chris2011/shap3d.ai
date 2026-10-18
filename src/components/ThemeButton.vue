<template>
  <div class="group relative mx-0.5 flex h-9 items-center" @click.stop>
    <button class="flex h-7.5 w-7 items-center justify-center rounded-l-[3px] p-0 text-ink-2 hover:text-navy group-hover:bg-hover" :class="open && 'bg-hover'" :title="theme.dark ? 'Dunkelmodus aus' : 'Dunkelmodus an'" :aria-pressed="theme.dark" @click="toggleTheme()">
      <Icon :name="theme.dark ? 'moon' : 'sun'" :size="18" />
    </button>
    <button class="flex h-7.5 w-4 items-center justify-center rounded-r-[3px] border-l p-0 text-ink-2 hover:text-navy group-hover:border-line-2 group-hover:bg-hover" :class="open ? 'border-line-2 bg-hover' : 'border-transparent'" title="Weitere Design-Optionen" :aria-expanded="open" @click="open = !open"><Icon name="chevronDown" :size="12" /></button>

    <div v-if="open" class="s3d-menu top-10 -left-2 w-67 cursor-default px-3 pt-2.5 pb-3">
      <label class="flex items-center justify-between gap-2.5">
        <span class="flex items-center gap-2 font-semibold"><Icon name="moon" :size="16" /> Dunkelmodus</span>
        <button class="relative h-5.5 w-9.5 rounded-[11px] p-0 transition-colors" role="switch" :aria-checked="theme.dark" :class="theme.dark ? 'bg-blue' : 'bg-line-2'" @click="toggleTheme()"><span class="absolute top-0.75 left-0.75 size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.3)] transition-transform" :class="theme.dark && 'translate-x-4'"></span></button>
      </label>
      <div class="-mx-3 my-2.5 h-px bg-line"></div>
      <div class="mt-2 mb-1.25 text-[0.6875rem] font-bold tracking-[0.025rem] text-muted uppercase">Oberfläche</div>
      <div class="grid grid-cols-[repeat(3,1fr)] overflow-hidden rounded border border-line-2">
        <button v-for="o in UI" :key="o.v" :class="[SEG, theme.mode === o.v ? SEG_ON : SEG_OFF]" @click="setTheme(o.v)"><Icon :name="o.icon" :size="14" />{{ o.label }}</button>
      </div>
      <div class="mt-2 mb-1.25 text-[0.6875rem] font-bold tracking-[0.025rem] text-muted uppercase">3D-Szene</div>
      <div class="grid grid-cols-[repeat(3,1fr)] overflow-hidden rounded border border-line-2">
        <button v-for="o in SCENE" :key="o.v" :class="[SEG, theme.scene === o.v ? SEG_ON : SEG_OFF]" @click="setScene(o.v)"><Icon :name="o.icon" :size="14" />{{ o.label }}</button>
      </div>
      <p class="mt-2.5 mb-0 text-[0.71875rem]/[1.4] text-ink-2">{{ hint }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Icon from './Icon.vue';
import { theme, toggleTheme, setTheme, setScene, type ThemeMode, type SceneMode } from '../theme';

const open = ref(false);
const SEG = 'flex items-center justify-center gap-1 whitespace-nowrap px-0.5 py-1.5 text-xs not-first:border-l not-first:border-line-2';
const SEG_ON = 'bg-sel font-bold text-navy';
const SEG_OFF = 'bg-surface text-ink hover:bg-hover';
const UI: { v: ThemeMode; label: string; icon: string }[] = [
  { v: 'light', label: 'Hell', icon: 'sun' }, { v: 'dark', label: 'Dunkel', icon: 'moon' }, { v: 'system', label: 'System', icon: 'monitor' },
];
const SCENE: { v: SceneMode; label: string; icon: string }[] = [
  { v: 'day', label: 'Tag', icon: 'sun' }, { v: 'night', label: 'Nacht', icon: 'moon' }, { v: 'auto', label: 'Wie Oberfläche', icon: 'monitor' },
];
const hint = computed(() => {
  if (theme.dark && !theme.night) return 'Nur die Menüs sind dunkel, die 3D-Szene bleibt hell.';
  if (!theme.dark && theme.night) return 'Helle Menüs, die 3D-Szene zeigt Nacht.';
  if (theme.night) return 'Alles dunkel: Menüs und 3D-Szene bei Nacht.';
  return 'Alles hell.';
});
const close = () => { open.value = false; };
onMounted(() => window.addEventListener('click', close));
onUnmounted(() => window.removeEventListener('click', close));
</script>
