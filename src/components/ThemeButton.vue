<template>
  <div class="split" :class="{ open }" @click.stop>
    <button class="main" :title="theme.dark ? 'Dunkelmodus aus' : 'Dunkelmodus an'" :aria-pressed="theme.dark" @click="toggleTheme()">
      <Icon :name="theme.dark ? 'moon' : 'sun'" :size="18" />
    </button>
    <button class="more" title="Weitere Design-Optionen" :aria-expanded="open" @click="open = !open"><Icon name="chevronDown" :size="12" /></button>

    <div v-if="open" class="pop s3d-menu">
      <label class="row sw">
        <span><Icon name="moon" :size="16" /> Dunkelmodus</span>
        <button class="switch" role="switch" :aria-checked="theme.dark" :class="{ on: theme.dark }" @click="toggleTheme()"><span></span></button>
      </label>
      <div class="sep"></div>
      <div class="lbl">Oberfläche</div>
      <div class="seg">
        <button v-for="o in UI" :key="o.v" :class="{ on: theme.mode === o.v }" @click="setTheme(o.v)"><Icon :name="o.icon" :size="14" />{{ o.label }}</button>
      </div>
      <div class="lbl">3D-Szene</div>
      <div class="seg">
        <button v-for="o in SCENE" :key="o.v" :class="{ on: theme.scene === o.v }" @click="setScene(o.v)"><Icon :name="o.icon" :size="14" />{{ o.label }}</button>
      </div>
      <p class="hint">{{ hint }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Icon from './Icon.vue';
import { theme, toggleTheme, setTheme, setScene, type ThemeMode, type SceneMode } from '../theme';

const open = ref(false);
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

<style scoped>
.split { position: relative; display: flex; align-items: center; height: 36px; margin: 0 2px; }
.main, .more { border: 0; background: transparent; cursor: pointer; color: var(--s3d-text-2); height: 30px; display: flex; align-items: center; justify-content: center; padding: 0; }
.main { width: 28px; border-radius: 3px 0 0 3px; }
.more { width: 16px; border-radius: 0 3px 3px 0; border-left: 1px solid transparent; }
.split:hover .main, .split:hover .more, .split.open .main, .split.open .more { background: var(--s3d-hover); }
.split:hover .more, .split.open .more { border-left-color: var(--s3d-line-2); }
.main:hover, .more:hover { color: var(--s3d-navy); }
.pop { top: 40px; left: -8px; width: 268px; padding: 10px 12px 12px; cursor: default; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.row span { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.switch { width: 38px; height: 22px; border-radius: 11px; border: 0; background: var(--s3d-line-2); position: relative; cursor: pointer; padding: 0; transition: background .15s; }
.switch span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .3); transition: transform .15s; }
.switch.on { background: var(--s3d-blue); }
.switch.on span { transform: translateX(16px); }
.sep { height: 1px; background: var(--s3d-line); margin: 10px -12px; }
.lbl { font-size: 11px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: var(--s3d-muted); margin: 8px 0 5px; }
.seg { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--s3d-line-2); border-radius: 4px; overflow: hidden; }
.seg button { border: 0; background: var(--s3d-bg); color: var(--s3d-text); font-size: 12px; padding: 6px 2px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; }
.seg button + button { border-left: 1px solid var(--s3d-line-2); }
.seg button:hover { background: var(--s3d-hover); }
.seg button.on { background: var(--s3d-sel); color: var(--s3d-navy); font-weight: 700; }
.hint { font-size: 11.5px; color: var(--s3d-text-2); margin: 10px 0 0; line-height: 1.4; }
</style>
