<template>
  <div class="s3d-caption mt-3 mb-1 text-navy">{{ t('pluginManager.installed') }}</div>
  <S3dInstalledPluginCard v-for="plugin in shown" :key="plugin.id" :plugin="plugin" :can-update="canUpdate(plugin.id)" />
  <div v-if="!plugins.length" class="px-0.5 py-2 text-xs text-ink-2">{{ t('pluginManager.none') }}</div>
  <div v-else-if="!shown.length" class="px-0.5 py-2 text-xs text-ink-2">{{ t('pluginManager.noMatch') }}</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dInstalledPluginCard from './S3dInstalledPluginCard.vue';
import { plugins } from '../../../plugins/registry';
import { usePluginManagerState } from '../../../composables/usePluginManagerState';
import { t, localize } from '../../../i18n';

/** The installed plugins that match the search. */
defineProps<{ canUpdate: (id: string) => boolean }>();
const { matches } = usePluginManagerState();
const shown = computed(() =>
  plugins.filter((plugin) => matches(localize(plugin.name), localize(plugin.description), plugin.author, plugin.id)),
);
</script>
