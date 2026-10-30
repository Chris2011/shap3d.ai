<template>
  <div class="mb-2 flex flex-wrap gap-1.5 [&_.s3d-btn]:flex [&_.s3d-btn]:items-center [&_.s3d-btn]:gap-1">
    <button class="s3d-btn small" :disabled="busy" @click="installFromFile">
      <S3dIcon name="import" :size="14" /> {{ t('pluginManager.loadFile') }}
    </button>
    <button class="s3d-btn small" :disabled="busy" :title="t('pluginManager.loadFolderTitle')" @click="installFromFolderButton">
      <S3dIcon name="folder" :size="14" /> {{ t('pluginManager.loadFolder') }}
    </button>
    <button class="s3d-btn small" :disabled="busy" :title="t('pluginManager.loadZipTitle')" @click="installFromZip">
      <S3dIcon name="import" :size="14" /> {{ t('pluginManager.loadZip') }}
    </button>
    <button class="s3d-btn small" :disabled="busy" :title="t('pluginManager.loadUrlTitle')" @click="installFromUrl">
      <S3dIcon name="download" :size="14" /> {{ t('pluginManager.loadUrl') }}
    </button>
    <button
      v-if="updatablePlugins.length"
      class="s3d-btn small"
      :disabled="busy"
      :title="t('pluginManager.updateAllTitle')"
      @click="updateAllFolders"
    >
      <S3dIcon name="refresh" :size="14" /> {{ t('pluginManager.updateAll') }}
    </button>
    <input ref="folderInput" type="file" webkitdirectory multiple class="hidden" @change="installFromFolder" />
  </div>
  <p v-if="busy" class="mb-2 text-xs text-ink-2">{{ updating ? t('pluginManager.updating') : t('pluginManager.installing') }}</p>
  <p class="mb-2 text-xs text-ink-2">{{ t('pluginManager.warning') }}</p>
  <p
    v-if="message"
    class="mb-2 rounded-[3px] border px-2 py-1.5 text-xs"
    :class="message.error ? 'border-danger/40 bg-danger/8 text-danger' : 'border-line bg-surface text-ink-2'"
  >
    {{ message.text }}
  </p>

  <div class="s3d-caption mt-3 mb-1 text-navy">{{ t('pluginManager.installed') }}</div>
  <div v-for="plugin in plugins" :key="plugin.id" class="mb-1.5 border border-line bg-surface px-2.25 py-1.75">
    <div class="flex items-center gap-2">
      <S3dIcon name="plugin" :size="18" />
      <span class="flex-1 font-semibold text-navy"
        >{{ localize(plugin.name) }} <span v-if="plugin.version" class="font-normal text-ink-2">{{ plugin.version }}</span></span
      >
      <S3dToggleSwitch
        :model-value="plugin.enabled"
        :label="plugin.enabled ? t('pluginManager.switchOff') : t('pluginManager.switchOn')"
        @update:model-value="(value) => toggle(plugin.id, value)"
      />
    </div>
    <p v-if="plugin.description" class="mt-1 text-xs text-ink-2">{{ localize(plugin.description) }}</p>
    <p v-if="plugin.error" class="mt-1 text-xs text-danger">{{ t('pluginManager.error', { error: plugin.error }) }}</p>
    <p class="mt-1 text-[0.6875rem] text-ink-2">
      <template v-if="plugin.builtin">{{ t('pluginManager.builtin') }} · </template
      >{{ plugin.author ? `${t('pluginManager.by', { author: plugin.author })} · ` : '' }}<code>{{ plugin.id }}</code>
    </p>
    <p v-if="updateHints[plugin.id]" class="mt-1 text-xs font-semibold text-navy">{{ updateHints[plugin.id] }}</p>
    <p v-if="plugin.package" class="mt-0.5 text-[0.6875rem] text-ink-2">
      {{ t('pluginManager.package', { name: plugin.package.name })
      }}<template v-if="plugin.package.bundle"> · {{ t('pluginManager.fromBundle', { name: plugin.package.bundle }) }}</template> ·
      {{ t('pluginManager.files', { count: plugin.package.files }) }}, {{ megabytes(plugin.package.bytes)
      }}<template v-if="plugin.package.license"> · {{ t('pluginManager.license', { license: plugin.package.license }) }}</template>
    </p>
    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      <button
        v-if="urlUpdates[plugin.id]"
        class="s3d-btn small flex items-center gap-1"
        :disabled="busy"
        :title="plugin.package?.source"
        @click="updateFromUrl(plugin.id)"
      >
        <S3dIcon name="refresh" :size="13" /> {{ t('pluginManager.updateTo', { version: urlUpdates[plugin.id] }) }}
      </button>
      <button
        v-if="canUpdate(plugin.id)"
        class="s3d-btn small flex items-center gap-1"
        :disabled="busy"
        :title="t('pluginManager.updateTitle')"
        @click="update(plugin.id)"
      >
        <S3dIcon name="refresh" :size="13" /> {{ t('pluginManager.update') }}
      </button>
      <button v-for="panel in panelsOf(plugin.id)" :key="panel.id" class="s3d-link" @click="showPanel(panel.id)">
        {{ t('pluginManager.openPanel', { panel: panel.label }) }}
      </button>
      <button v-if="!plugin.builtin" class="s3d-link" @click="downloadSource(plugin.id)">{{ t('pluginManager.source') }}</button>
      <button v-if="!plugin.builtin" class="s3d-link" @click="remove(plugin.id, plugin.name)">{{ t('pluginManager.remove') }}</button>
    </div>
  </div>
  <div v-if="!plugins.length" class="px-0.5 py-2 text-xs text-ink-2">{{ t('pluginManager.none') }}</div>

  <!-- discover: the plugins of the catalogs, installed with one click -->
  <div class="s3d-caption mt-4 mb-1 flex items-center gap-2 text-navy">
    <span class="flex-1">{{ t('pluginManager.discover') }}</span>
    <button class="s3d-link text-xs normal-case" :disabled="catalogBusy" @click="refreshCatalogs">{{ t('pluginManager.reload') }}</button>
    <button class="s3d-link text-xs normal-case" @click="addCatalog">{{ t('pluginManager.addCatalog') }}</button>
  </div>
  <p v-if="catalogBusy" class="text-xs text-ink-2">{{ t('pluginManager.loadingCatalogs') }}</p>
  <p v-for="failure in catalog.failed" :key="failure.catalog" class="text-xs text-danger" :title="failure.catalog">
    {{ t('pluginManager.catalogFailed', { catalog: hostOf(failure.catalog), error: failure.error }) }}
  </p>
  <div
    v-for="entry in catalog.entries"
    :key="entry.catalog + entry.id"
    class="mb-1.5 flex items-start gap-2 border border-line px-2.25 py-1.75"
  >
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
          v-if="entry.source === 'community' || entry.ownCatalog"
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
    <button
      class="s3d-btn small flex-none"
      :disabled="busy || stateOf(entry) === 'installed'"
      :title="entry.installUrl"
      @click="installEntry(entry)"
    >
      {{
        stateOf(entry) === 'installed'
          ? t('pluginManager.installedState')
          : stateOf(entry) === 'update'
            ? t('pluginManager.updateTo', { version: entry.version })
            : t('pluginManager.install')
      }}
    </button>
  </div>
  <div v-for="url in ownCatalogs" :key="url" class="flex items-center gap-2 text-[0.6875rem] text-muted">
    <span class="min-w-0 flex-1 truncate" :title="url">{{ t('pluginManager.ownCatalog', { url }) }}</span>
    <button class="s3d-link" @click="removeCatalog(url)">{{ t('pluginManager.remove') }}</button>
  </div>

  <template v-if="examples.length">
    <div class="s3d-caption mt-4 mb-1 text-navy">{{ t('pluginManager.examples') }}</div>
    <div
      v-for="example in examples"
      :key="example.file"
      class="mb-1.5 flex items-start gap-2 border border-dashed border-line px-2.25 py-1.75"
    >
      <div class="flex-1">
        <div class="font-semibold text-navy">{{ example.name }}</div>
        <p class="mt-0.5 text-xs text-ink-2">{{ example.description }}</p>
      </div>
      <button class="s3d-btn small" :disabled="busy" @click="install(example.code)">
        {{ example.installed ? t('pluginManager.update') : t('pluginManager.install') }}
      </button>
    </div>
  </template>
  <p class="mt-3 text-xs text-ink-2">{{ t('pluginManager.howTo') }} <code>src/plugins/examples/</code>.</p>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import S3dToggleSwitch from '../ui/S3dToggleSwitch.vue';
import { useEditor } from '../keys';
import { PANEL_INFO, showPanel } from '../panelState';
import { pickFile, download } from '../../engine/commands';
import { usePluginFolders } from '../../composables/usePluginFolders';
import {
  plugins,
  installPlugin,
  installPluginPackages,
  installPluginFromUrl,
  installPluginZip,
  newerAtSource,
  newerVersion,
  setPluginEnabled,
  removePlugin,
  pluginSource,
  EXAMPLE_PLUGINS,
} from '../../plugins/registry';
import { t, localize, formatNumber } from '../../i18n';
import { loadCatalogs, ownCatalogs, type CatalogEntry } from '../../plugins/catalog';

const editor = useEditor();
const busy = ref(false);
const folderInput = shallowRef<HTMLInputElement | null>(null);
const megabytes = (bytes: number) => `${formatNumber(bytes / 1024 / 1024, { maximumFractionDigits: 1 })} MB`;
const message = shallowRef<{ text: string; error: boolean } | null>(null);

/** reads a metadata string field from source without running it */
const field = (code: string, name: string) => new RegExp(`\\b${name}:\\s*'([^']*)'`).exec(code)?.[1] ?? '';
const examples = computed(() =>
  EXAMPLE_PLUGINS.map((example) => ({
    ...example,
    id: field(example.code, 'id'),
    name: field(example.code, 'name'),
    description: field(example.code, 'description'),
  }))
    .map((example) => ({ ...example, installed: plugins.some((plugin) => plugin.id === example.id) }))
    // new examples, or bundled ones that changed since they were installed
    .filter((example) => !example.installed || pluginSource(example.id) !== example.code),
);

const folders = usePluginFolders();
const { updateHints, upToDate, updating } = folders;
const hasFolder = (id: string) => folders.folderIds.value.has(id) && !!plugins.find((entry) => entry.id === id)?.package;
/** "Update" only when the folder holds something new – or when it can't be read without asking */
const canUpdate = (id: string) => hasFolder(id) && !upToDate[id];
const updatablePlugins = computed(() => plugins.filter((plugin) => canUpdate(plugin.id)));
// silent check: only folders that are already readable, never a permission prompt –
// again when the window gets the focus back (e.g. after npm run build)
const checkFolders = () => {
  if (!busy.value) {
    folders.checkSilently();
  }
};
onMounted(() => {
  checkFolders();
  window.addEventListener('focus', checkFolders);
});
onBeforeUnmount(() => {
  window.removeEventListener('focus', checkFolders);
});

const install = async (code: string | File[] | (() => Promise<{ id: string; name: string } | null>)) => {
  busy.value = true;
  message.value = null;
  try {
    if (Array.isArray(code)) {
      // a folder may hold a bundle of several plugins
      const installed = await installPluginPackages(code);
      if (installed.length > 1) {
        const failed = installed.find((plugin) => plugins.find((candidate) => candidate.id === plugin.id)?.error);
        message.value = {
          text: t('pluginManager.installedBundle', {
            names: installed.map((plugin) => localize(plugin.name) + (plugin.kept ? ` (${t('pluginManager.keptNewer')})` : '')).join(', '),
          }),
          error: !!failed,
        };
        return;
      }
      code = async () => installed[0];
    }
    const plugin = typeof code === 'string' ? await installPlugin(code) : await code();
    if (!plugin) {
      return;
    } // folder picker cancelled
    const entry = plugins.find((candidate) => candidate.id === plugin.id);
    message.value = entry?.error
      ? { text: t('pluginManager.installedButFailed', { name: localize(plugin.name), error: entry.error }), error: true }
      : { text: t('pluginManager.installedActive', { name: localize(plugin.name) }), error: false };
  } catch (error: any) {
    message.value = { text: t('pluginManager.loadFailed', { error: error?.message ?? error }), error: true };
  } finally {
    busy.value = false;
  }
};

const installFromZip = async () => {
  const file = await pickFile('.zip,application/zip');
  if (file) {
    await install(() => installPluginZip(file).then((installed) => installed[installed.length - 1] ?? null));
  }
};

const installFromUrl = async () => {
  const url = (await editor.prompt(t('pluginManager.urlPrompt'), 'https://'))?.trim();
  if (url && url !== 'https://') {
    await install(() => installPluginFromUrl(url).then((installed) => installed[installed.length - 1] ?? null));
    void checkUrlUpdates();
  }
};

// plugins installed from a URL: is a newer version waiting there? (looked up when the panel opens)
const urlUpdates = reactive<Record<string, string>>({});
const checkUrlUpdates = async () => {
  for (const plugin of plugins.filter((entry) => entry.package?.source)) {
    const version = await newerAtSource(plugin.id);
    if (version) {
      urlUpdates[plugin.id] = version;
    } else {
      delete urlUpdates[plugin.id];
    }
  }
};
onMounted(checkUrlUpdates);
const updateFromUrl = async (id: string) => {
  const source = plugins.find((entry) => entry.id === id)?.package?.source;
  if (source) {
    await install(() => installPluginFromUrl(source).then((installed) => installed[installed.length - 1] ?? null));
    delete urlUpdates[id];
  }
};

// the catalogs: read when the panel opens, again with "Reload" and after adding one
const catalog = shallowRef<Awaited<ReturnType<typeof loadCatalogs>>>({ entries: [], failed: [] });
const catalogBusy = ref(false);
const refreshCatalogs = async () => {
  catalogBusy.value = true;
  try {
    catalog.value = await loadCatalogs();
  } finally {
    catalogBusy.value = false;
  }
};
onMounted(refreshCatalogs);
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
const addCatalog = async () => {
  const url = (await editor.prompt(t('pluginManager.catalogPrompt'), 'https://'))?.trim();
  if (url && url !== 'https://' && !ownCatalogs.value.includes(url)) {
    ownCatalogs.value = [...ownCatalogs.value, url];
    await refreshCatalogs();
  }
};
const removeCatalog = async (url: string) => {
  ownCatalogs.value = ownCatalogs.value.filter((other) => other !== url);
  await refreshCatalogs();
};
/** not installed, installed in this version (or newer), or installed in an older one */
const stateOf = (entry: CatalogEntry) => {
  const installed = plugins.find((plugin) => plugin.id === entry.id);
  if (!installed) {
    return 'new';
  }
  const version = installed.package?.version ?? installed.version ?? '';
  return version && entry.version && newerVersion(entry.version, version) ? 'update' : 'installed';
};
const installEntry = async (entry: CatalogEntry) => {
  // a plugin from outside this repository runs with full access, like every plugin – the user says yes first
  if ((entry.source === 'community' || entry.ownCatalog) && stateOf(entry) === 'new') {
    const ok = await editor.confirm(
      t('pluginManager.confirmCommunity', { name: entry.name, author: entry.author || hostOf(entry.installUrl), url: entry.installUrl }),
    );
    if (!ok) {
      return;
    }
  }
  await install(() => installPluginFromUrl(entry.installUrl).then((installed) => installed[installed.length - 1] ?? null));
  delete urlUpdates[entry.id];
};

const installFromFile = async () => {
  const file = await pickFile('.js,.mjs,text/javascript');
  if (!file) {
    return;
  }
  await install(await file.text());
};

// panels that belong to a mode open there, not from here
const panelsOf = (id: string) => PANEL_INFO.filter((panel) => panel.id.startsWith(id + '.') && !panel.inMode);
/** Chromium remembers the folder (for "Update"); other browsers use the folder input */
const installFromFolderButton = () => {
  if (folders.supported) {
    install(folders.installFromPicker);
  } else {
    folderInput.value?.click();
  }
};

const update = async (id: string) => {
  busy.value = true;
  message.value = null;
  try {
    message.value = await folders.updateFromFolder(id);
  } finally {
    busy.value = false;
  }
};

const updateAllFolders = async () => {
  busy.value = true;
  message.value = null;
  try {
    const results = await folders.updateAll();
    if (results.length) {
      message.value = { text: results.map((result) => result.text).join(' '), error: results.some((result) => result.error) };
    }
  } finally {
    busy.value = false;
  }
};

const installFromFolder = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length) {
    await install(files);
  }
};

const toggle = (id: string, enabled: boolean) => {
  setPluginEnabled(id, enabled);
};

const remove = async (id: string, name: string) => {
  if (!(await editor.confirm(t('pluginManager.confirmRemove', { name: localize(name) })))) {
    return;
  }
  removePlugin(id);
  delete updateHints[id];
  folders.forgetFolder(id);
  message.value = { text: t('pluginManager.removed', { name: localize(name) }), error: false };
};

const downloadSource = (id: string) => download(`${id}.js`, pluginSource(id), 'text/javascript');
</script>
