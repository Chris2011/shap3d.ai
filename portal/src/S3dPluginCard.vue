<template>
  <article class="card">
    <h2>
      {{ plugin.name }}
      <span v-if="plugin.source === 'community'" class="badge" title="Built and published by its author, listed after a review"
        >Community</span
      >
    </h2>
    <div class="meta">{{ [plugin.version, plugin.author, plugin.license].filter(Boolean).join(' · ') }}</div>
    <p>{{ plugin.description }}</p>
    <div v-if="plugin.minAppVersion" class="meta">Needs Shap3D.ai {{ plugin.minAppVersion }} or newer</div>
    <div class="actions">
      <a v-if="appUrl" class="install" :href="installLink(appUrl, plugin)">Install</a>
      <button v-else class="install" title="Paste it into Shap3D.ai › Plugins › From URL…" @click="copy">
        {{ copied ? 'Copied – paste it into Plugins › From URL…' : 'Copy address' }}
      </button>
      <a v-if="plugin.zip" :href="plugin.zip">zip</a>
      <a v-if="plugin.homepage" :href="plugin.homepage" target="_blank" rel="noopener">source</a>
    </div>
  </article>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { installLink, type PortalPlugin } from './catalog';

/** one plugin of the catalog: what it is, and its install button */
const props = defineProps<{ plugin: PortalPlugin; appUrl: string }>();

const copied = ref(false);
const copy = async () => {
  await navigator.clipboard.writeText(props.plugin.installUrl);
  copied.value = true;
};
</script>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

h2 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--navy);
}

.badge {
  margin-left: 0.35rem;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 0.72rem;
  font-weight: 500;
  vertical-align: middle;
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
  gap: 0.6rem;
  align-items: center;
  font-size: 0.85rem;
}

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
