<template>
  <article class="page">
    <a class="back" href="#/">‹ All plugins</a>
    <div class="head">
      <S3dPluginPicture class="picture" :plugin="plugin" />
      <div class="about">
        <h1>{{ plugin.name }} <S3dPluginBadges :plugin="plugin" /></h1>
        <div class="meta">{{ [plugin.version, plugin.author, plugin.license].filter(Boolean).join(' · ') }}</div>
        <p>{{ plugin.description }}</p>
        <div v-if="plugin.minAppVersion" class="meta">Needs Shap3D.ai {{ plugin.minAppVersion }} or newer</div>
        <div class="actions">
          <S3dInstallButton :plugin="plugin" :app-url="appUrl" />
          <a v-if="plugin.zip" :href="plugin.zip">Download zip</a>
          <a v-if="plugin.homepage" :href="plugin.homepage" target="_blank" rel="noopener">Source</a>
        </div>
      </div>
    </div>
    <p v-if="state === 'loading'" class="note">Loading its README …</p>
    <p v-else-if="state === 'failed'" class="note">Its README could not be loaded.</p>
    <p v-else-if="!readme" class="note">It has no README.</p>
    <!-- the README, rendered and cleaned (readmeHtml) -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else class="readme" v-html="readme"></div>
  </article>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import S3dInstallButton from './S3dInstallButton.vue';
import S3dPluginBadges from './S3dPluginBadges.vue';
import S3dPluginPicture from './S3dPluginPicture.vue';
import { readmeHtml, type PortalPlugin } from './catalog';

/** a plugin's page: its picture, what it is, install – and its README */
const props = defineProps<{ plugin: PortalPlugin; appUrl: string }>();

const readme = ref('');
const state = ref<'loading' | 'ready' | 'failed'>('loading');
watch(
  () => props.plugin,
  async (plugin) => {
    state.value = 'loading';
    readme.value = '';
    try {
      readme.value = await readmeHtml(plugin);
      state.value = 'ready';
    } catch {
      state.value = 'failed';
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.page {
  max-width: 56rem;
  margin: 0 auto;
}

.back {
  display: inline-block;
  margin-bottom: 1rem;
  text-decoration: none;
}

.head {
  display: grid;
  grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--line);
}

@media (max-width: 40rem) {
  .head {
    grid-template-columns: 1fr;
  }
}

h1 {
  margin: 0 0 0.25rem;
  font-size: 1.6rem;
  color: var(--navy);
}

.meta {
  font-size: 0.85rem;
  color: var(--muted);
}

.about p {
  margin: 0.6rem 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  align-items: center;
  margin-top: 0.8rem;
}

.note {
  color: var(--muted);
}

/* the README: Markdown as it reads on GitHub, in the portal's colours */
.readme {
  padding-top: 0.5rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.readme :deep(h1),
.readme :deep(h2),
.readme :deep(h3) {
  margin: 1.6rem 0 0.6rem;
  color: var(--navy);
}

.readme :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

.readme :deep(pre) {
  padding: 0.8rem;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: auto;
}

.readme :deep(code) {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 0.88em;
}

.readme :deep(table) {
  border-collapse: collapse;
  display: block;
  overflow: auto;
}

.readme :deep(th),
.readme :deep(td) {
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--line);
}
</style>
