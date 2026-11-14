<template>
  <!-- discover: the plugins of the catalogs, installed with one click -->
  <div class="s3d-caption mt-4 mb-1 flex items-center gap-2 text-navy">
    <span class="flex-1">{{ t('pluginManager.discover') }}</span>
    <button type="button" class="s3d-link text-xs normal-case" :disabled="loading" @click="refresh">{{ t('pluginManager.reload') }}</button>
    <button type="button" class="s3d-link text-xs normal-case" @click="add">{{ t('pluginManager.addCatalog') }}</button>
  </div>
  <p v-if="loading" class="text-xs text-ink-2">{{ t('pluginManager.loadingCatalogs') }}</p>
  <p v-for="failure in catalog.failed" :key="failure.catalog" class="text-xs text-danger" :title="failure.catalog">
    {{ t('pluginManager.catalogFailed', { catalog: hostOf(failure.catalog), error: failure.error }) }}
  </p>
  <S3dCatalogEntryCard v-for="entry in shown" :key="entry.catalog + entry.id" :entry="entry" />
  <div v-if="catalog.entries.length && !shown.length" class="px-0.5 py-2 text-xs text-ink-2">{{ t('pluginManager.noMatch') }}</div>
  <div v-for="url in ownCatalogs" :key="url" class="flex items-center gap-2 text-[0.6875rem] text-muted">
    <span class="min-w-0 flex-1 truncate" :title="url">{{ t('pluginManager.ownCatalog', { url }) }}</span>
    <button type="button" class="s3d-link" @click="remove(url)">{{ t('pluginManager.remove') }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dCatalogEntryCard from './S3dCatalogEntryCard.vue';
import { hostOf } from '../../../utils/urlText';
import { usePluginCatalogs } from '../../../composables/usePluginCatalogs';
import { usePluginManagerState } from '../../../composables/usePluginManagerState';
import { t } from '../../../i18n';

/** "Discover": the catalogs' plugins that match the search, failed catalogs, the user's own catalogs. */
const { catalog, loading, ownCatalogs, refresh, add, remove } = usePluginCatalogs();
const { matches } = usePluginManagerState();
const shown = computed(() => catalog.value.entries.filter((entry) => matches(entry.name, entry.description, entry.author, entry.id)));
</script>
