<template>
  <a v-if="appUrl" class="install" :href="installLink(appUrl, plugin)" @click.stop>Install</a>
  <button v-else class="install" @click.stop="copy">{{ copied ? 'Copied' : 'Copy address' }}</button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { installLink, type PortalPlugin } from './catalog';

/**
 * Installs a plugin: opens the app with it when the portal knows the app's address – else copies the plugin's address
 * (the page says once, at the top, where to paste it).
 */
const props = defineProps<{ plugin: PortalPlugin; appUrl: string }>();

const copied = ref(false);
const copy = async () => {
  try {
    await navigator.clipboard.writeText(props.plugin.installUrl);
  } catch {
    // no clipboard access (not focused, an older browser): the classic way through a selected text field
    const field = document.createElement('textarea');
    field.value = props.plugin.installUrl;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 2500);
};
</script>

<style scoped>
.install {
  padding: 0.45rem 0.9rem;
  border: 0;
  border-radius: 6px;
  background: var(--navy);
  color: var(--on-navy);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
</style>
