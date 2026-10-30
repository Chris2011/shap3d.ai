<template>
  <!-- the test run's display: health, what the player carries, the view, messages and the controls -->
  <div v-if="hud.active" class="s3d-lv-hud">
    <div class="s3d-lv-hud-bar">
      <span class="s3d-lv-hud-health"
        ><span class="s3d-lv-hud-fill" :style="{ width: `${Math.max(0, Math.round(hud.health))}%` }" /><b>{{
          t('level.play.health', { health: Math.max(0, Math.round(hud.health)) })
        }}</b></span
      >
      <span v-for="(amount, item) in hud.items" :key="item" class="s3d-lv-hud-item">{{ item }} × {{ amount }}</span>
      <span v-if="hud.torch" class="s3d-lv-hud-item torch">{{ t('level.play.torchOn') }}</span>
      <span class="s3d-lv-hud-view"
        >{{ t(`level.play.views.${hud.view}`) }}<template v-if="hud.view === 'fixed' && hud.camera"> · {{ hud.camera }}</template></span
      >
      <button class="s3d-lv-hud-stop" @click="stop">{{ t('level.play.stop') }}</button>
    </div>
    <div v-if="hud.sound" class="s3d-lv-hud-sound">♪ {{ hud.sound }}</div>
    <div v-for="(entry, index) in hud.messages" :key="index + entry.text" class="s3d-lv-hud-message">{{ entry.text }}</div>
    <div class="s3d-lv-hud-help">
      {{ t(hud.view === 'fixed' ? 'level.play.helpFixed' : hud.locked ? 'level.play.helpLocked' : 'level.play.help') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { pluginContext, t } from './runtime';
import { usePlayHud } from './play';

const hud = usePlayHud();
const stop = () => pluginContext().editor.setTool('select');
</script>
