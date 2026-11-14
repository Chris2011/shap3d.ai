<template>
  <S3dPluginInstallBar :updatable="updatable" />
  <S3dTextInput v-model="search" type="search" :placeholder="t('pluginManager.search')" :aria-label="t('pluginManager.search')" />
  <S3dInstalledPlugins :can-update="canUpdate" />
  <S3dPluginCatalog />
  <S3dPluginExamples />
  <p class="mt-3 text-xs text-ink-2">{{ t('pluginManager.howTo') }} <code>src/plugins/examples/</code>.</p>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useEventListener } from '@vueuse/core';
import S3dTextInput from '../ui/S3dTextInput.vue';
import S3dInstalledPlugins from './pluginManager/S3dInstalledPlugins.vue';
import S3dPluginCatalog from './pluginManager/S3dPluginCatalog.vue';
import S3dPluginExamples from './pluginManager/S3dPluginExamples.vue';
import S3dPluginInstallBar from './pluginManager/S3dPluginInstallBar.vue';
import { plugins } from '../../plugins/registry';
import { providePluginManagerState } from '../../composables/usePluginManagerState';
import { t } from '../../i18n';

/** Plugin manager: install, the installed plugins, catalogs to discover more, the example plugins. */
const { search, busy, folders, checkUrlUpdates } = providePluginManagerState();
const hasFolder = (id: string) => folders.folderIds.value.has(id) && !!plugins.find((entry) => entry.id === id)?.package;
/** "Update" only when the folder holds something new – or when it can't be read without asking */
const canUpdate = (id: string) => hasFolder(id) && !folders.upToDate[id];
const updatable = computed(() => plugins.some((plugin) => canUpdate(plugin.id)));
// silent check: only folders that are already readable, never a permission prompt –
// again when the window gets the focus back (e.g. after npm run build)
const checkFolders = () => {
  if (!busy.value) {
    folders.checkSilently();
  }
};
onMounted(() => {
  checkFolders();
  void checkUrlUpdates();
});
useEventListener(window, 'focus', checkFolders);
</script>
