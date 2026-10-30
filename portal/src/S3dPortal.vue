<template>
  <header>
    <h1>Shap<span>3D</span>.ai Plugins</h1>
    <p>
      Plugins for Shap3D.ai – install one with a click. Official plugins come from the Shap3D.ai repository; community plugins are built and
      published by their authors.
    </p>
  </header>
  <main>
    <div class="tools">
      <input v-model="search" type="search" placeholder="Search plugins …" aria-label="Search plugins" />
      <button v-for="option in FILTERS" :key="option.id" :aria-pressed="filter === option.id" @click="filter = option.id">
        {{ option.label }}
      </button>
    </div>
    <p v-if="state === 'loading'" class="note">Loading …</p>
    <p v-else-if="state === 'failed'" class="note">The plugin list could not be loaded.</p>
    <p v-else-if="!shown.length" class="note">{{ plugins.length ? 'No plugin matches.' : 'No plugins released yet.' }}</p>
    <div class="grid">
      <S3dPluginCard v-for="plugin in shown" :key="plugin.id" :plugin="plugin" :app-url="appUrl" />
    </div>
  </main>
  <footer>
    Not listed? Add your plugin to <code>plugins/community.json</code> in a pull request – or install any plugin folder in the app with
    <em>Plugins › From URL…</em>.
    <span v-if="updated"><br />Updated {{ updated }}</span>
  </footer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import S3dPluginCard from './S3dPluginCard.vue';
import { loadAppUrl, loadCatalog, type PortalPlugin } from './catalog';

/** The plugin portal: the catalog's plugins, searchable, official and community apart. */

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'official', label: 'Official' },
  { id: 'community', label: 'Community' },
] as const;

const plugins = ref<PortalPlugin[]>([]);
const appUrl = ref('');
const updated = ref('');
const state = ref<'loading' | 'ready' | 'failed'>('loading');
const search = ref('');
const filter = ref<(typeof FILTERS)[number]['id']>('all');

const shown = computed(() => {
  const term = search.value.trim().toLowerCase();
  return plugins.value.filter(
    (plugin) =>
      (filter.value === 'all' || plugin.source === filter.value) &&
      (!term || `${plugin.name} ${plugin.description} ${plugin.author ?? ''}`.toLowerCase().includes(term)),
  );
});

onMounted(async () => {
  appUrl.value = await loadAppUrl();
  try {
    const catalog = await loadCatalog();
    plugins.value = catalog.plugins;
    updated.value = catalog.updated ? new Date(catalog.updated).toLocaleDateString() : '';
    state.value = 'ready';
  } catch {
    state.value = 'failed';
  }
});
</script>

<style scoped>
header {
  padding: 2.5rem 1rem 1.5rem;
  text-align: center;
}

h1 {
  margin: 0;
  font-size: 1.9rem;
  color: var(--navy);
}

h1 span {
  color: var(--accent);
}

header p {
  max-width: 38rem;
  margin: 0.4rem auto 0;
  color: var(--muted);
}

main {
  max-width: 64rem;
  margin: 0 auto;
  padding: 0 1rem 3rem;
}

.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tools input {
  flex: 1 1 16rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.tools button {
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}

.tools button[aria-pressed='true'] {
  border-color: var(--navy);
  color: var(--navy);
  font-weight: 600;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: 0.9rem;
}

.note {
  color: var(--muted);
  font-size: 0.9rem;
}

footer {
  padding: 2rem 1rem;
  color: var(--muted);
  font-size: 0.85rem;
  text-align: center;
}
</style>
