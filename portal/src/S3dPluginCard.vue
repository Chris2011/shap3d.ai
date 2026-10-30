<template>
  <article class="card" @click="open">
    <S3dPluginPicture :plugin="plugin" />
    <h2>
      <a :href="`#/${plugin.id}`" @click.stop>{{ plugin.name }}</a>
      <S3dPluginBadges :plugin="plugin" />
    </h2>
    <div class="meta">{{ [plugin.version, plugin.author, plugin.license].filter(Boolean).join(' · ') }}</div>
    <p>{{ plugin.description }}</p>
    <div v-if="plugin.minAppVersion" class="meta">Needs Shap3D.ai {{ plugin.minAppVersion }} or newer</div>
    <div class="actions">
      <S3dInstallButton :plugin="plugin" :app-url="appUrl" />
      <a :href="`#/${plugin.id}`" @click.stop>Details</a>
    </div>
  </article>
</template>

<script setup lang="ts">
import S3dInstallButton from './S3dInstallButton.vue';
import S3dPluginBadges from './S3dPluginBadges.vue';
import S3dPluginPicture from './S3dPluginPicture.vue';
import type { PortalPlugin } from './catalog';

/** one plugin of the catalog: its picture, what it is, its install button – a click opens its page */
const props = defineProps<{ plugin: PortalPlugin; appUrl: string }>();

const open = () => {
  location.hash = `#/${props.plugin.id}`;
};
</script>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.8rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s;
}

.card:hover {
  border-color: var(--navy);
}

h2 {
  margin: 0.3rem 0 0;
  font-size: 1.05rem;
}

h2 a {
  color: var(--navy);
  text-decoration: none;
}

.meta {
  font-size: 0.8rem;
  color: var(--muted);
}

p {
  flex: 1;
  margin: 0;
  font-size: 0.9rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  font-size: 0.85rem;
}
</style>
