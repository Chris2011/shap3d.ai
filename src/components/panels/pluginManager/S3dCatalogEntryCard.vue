<template>
  <div class="mb-1.5 flex items-start gap-2 border border-line px-2.25 py-1.75">
    <img
      v-if="entry.thumbnail"
      :src="entry.thumbnail"
      alt=""
      loading="lazy"
      class="mt-0.5 h-10 w-16 flex-none rounded-[3px] object-cover"
    />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-baseline gap-x-1.5">
        <span class="font-semibold text-navy">{{ entry.name }}</span>
        <span class="text-xs text-ink-2">{{ entry.version }}</span>
        <span
          v-if="entry.preview"
          class="rounded-[3px] bg-surface-2 px-1 text-[0.625rem] text-ink-2"
          :title="t('pluginManager.previewTitle')"
          >{{ t('pluginManager.preview') }}</span
        >
        <span
          v-if="fromOutside"
          class="rounded-[3px] bg-warn-bg px-1 text-[0.625rem] text-warn"
          :title="t('pluginManager.communityTitle')"
          >{{ entry.ownCatalog ? hostOf(entry.catalog) : t('pluginManager.community') }}</span
        >
      </div>
      <p class="mt-0.5 text-xs text-ink-2">{{ entry.description }}</p>
      <p v-if="entry.author || entry.homepage" class="mt-0.5 text-[0.6875rem] text-muted">
        <template v-if="entry.author">{{ entry.author }}</template>
        <a v-if="entry.homepage" :href="entry.homepage" target="_blank" rel="noopener" class="ms-1.5 s3d-link">{{
          hostOf(entry.homepage)
        }}</a>
      </p>
    </div>
    <S3dButton small class="flex-none" :disabled="busy || state === 'installed'" :title="entry.installUrl" @click="installEntry">
      {{
        state === 'installed'
          ? t('pluginManager.installedState')
          : state === 'update'
            ? t('pluginManager.updateTo', { version: entry.version })
            : t('pluginManager.install')
      }}
    </S3dButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dButton from '../../ui/S3dButton.vue';
import { useEditor } from '../../keys';
import { plugins, newerVersion } from '../../../plugins/registry';
import type { CatalogEntry } from '../../../plugins/catalog';
import { hostOf } from '../../../utils/urlText';
import { usePluginManagerState } from '../../../composables/usePluginManagerState';
import { t } from '../../../i18n';

/** One plugin of a catalog with its install button. */
const props = defineProps<{ entry: CatalogEntry }>();
const editor = useEditor();
const { busy, installFromUrl, urlUpdates } = usePluginManagerState();
const fromOutside = computed(() => props.entry.source === 'community' || props.entry.ownCatalog);
/** not installed, installed in this version (or newer), or installed in an older one */
const state = computed(() => {
  const installed = plugins.find((plugin) => plugin.id === props.entry.id);
  if (!installed) {
    return 'new';
  }
  const version = installed.package?.version ?? installed.version ?? '';
  return version && props.entry.version && newerVersion(props.entry.version, version) ? 'update' : 'installed';
});
const installEntry = async () => {
  const entry = props.entry;
  // a plugin from outside this repository runs with full access, like every plugin – the user says yes first
  if (fromOutside.value && state.value === 'new') {
    const ok = await editor.confirm(
      t('pluginManager.confirmCommunity', { name: entry.name, author: entry.author || hostOf(entry.installUrl), url: entry.installUrl }),
    );
    if (!ok) {
      return;
    }
  }
  await installFromUrl(entry.installUrl);
  delete urlUpdates[entry.id];
};
</script>
