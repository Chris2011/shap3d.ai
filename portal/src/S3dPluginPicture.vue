<template>
  <img
    v-if="plugin.thumbnail && !broken"
    class="picture"
    :src="plugin.thumbnail"
    :alt="plugin.name"
    loading="lazy"
    @error="broken = true"
  />
  <div v-else class="picture logo" :style="{ '--hue': hue }" aria-hidden="true">{{ initials }}</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PortalPlugin } from './catalog';

/** a plugin's picture – its thumbnail, or a logo of its initials in a colour of its own */
const props = defineProps<{ plugin: PortalPlugin }>();

const broken = ref(false);
const initials = computed(() =>
  props.plugin.name
    .split(/[\s()-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join(''),
);
// the same plugin always gets the same colour
const hue = computed(() => [...props.plugin.id].reduce((sum, char) => sum + char.charCodeAt(0) * 37, 0) % 360);
</script>

<style scoped>
.picture {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  object-fit: cover;
  background: var(--line);
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, hsl(var(--hue) 55% 42%), hsl(calc(var(--hue) + 40) 60% 30%));
  color: #fff;
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}
</style>
