<template>
  <div class="mb-1.5 border border-line bg-surface px-2.25 py-1.75">
    <div class="flex items-center gap-2">
      <S3dIcon name="plugin" :size="18" />
      <span class="flex-1 font-semibold text-navy"
        >{{ localize(plugin.name) }} <span v-if="plugin.version" class="font-normal text-ink-2">{{ plugin.version }}</span></span
      >
      <S3dToggleSwitch
        :model-value="plugin.enabled"
        :label="plugin.enabled ? t('pluginManager.switchOff') : t('pluginManager.switchOn')"
        @update:model-value="(value) => setPluginEnabled(plugin.id, value)"
      />
    </div>
    <p v-if="plugin.description" class="mt-1 text-xs text-ink-2">{{ localize(plugin.description) }}</p>
    <p v-if="plugin.error" class="mt-1 text-xs text-danger">{{ t('pluginManager.error', { error: plugin.error }) }}</p>
    <p class="mt-1 text-[0.6875rem] text-ink-2">
      <template v-if="plugin.builtin">{{ t('pluginManager.builtin') }} · </template
      >{{ plugin.author ? `${t('pluginManager.by', { author: plugin.author })} · ` : '' }}<code>{{ plugin.id }}</code>
    </p>
    <p v-if="folders.updateHints[plugin.id]" class="mt-1 text-xs font-semibold text-navy">{{ folders.updateHints[plugin.id] }}</p>
    <p v-if="plugin.package" class="mt-0.5 text-[0.6875rem] text-ink-2">
      {{ t('pluginManager.package', { name: plugin.package.name })
      }}<template v-if="plugin.package.bundle"> · {{ t('pluginManager.fromBundle', { name: plugin.package.bundle }) }}</template> ·
      {{ t('pluginManager.files', { count: plugin.package.files }) }}, {{ megabytes(plugin.package.bytes)
      }}<template v-if="plugin.package.license"> · {{ t('pluginManager.license', { license: plugin.package.license }) }}</template>
    </p>
    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      <S3dButton
        v-if="urlUpdates[plugin.id]"
        small
        class="flex items-center gap-1"
        :disabled="busy"
        :title="plugin.package?.source"
        @click="updateFromUrl"
      >
        <S3dIcon name="refresh" :size="13" /> {{ t('pluginManager.updateTo', { version: urlUpdates[plugin.id] }) }}
      </S3dButton>
      <S3dButton
        v-if="canUpdate"
        small
        class="flex items-center gap-1"
        :disabled="busy"
        :title="t('pluginManager.updateTitle')"
        @click="runBusy(() => folders.updateFromFolder(plugin.id))"
      >
        <S3dIcon name="refresh" :size="13" /> {{ t('pluginManager.update') }}
      </S3dButton>
      <button v-for="panel in panels" :key="panel.id" type="button" class="s3d-link" @click="showPanel(panel.id)">
        {{ t('pluginManager.openPanel', { panel: panel.label }) }}
      </button>
      <button v-if="!plugin.builtin" type="button" class="s3d-link" @click="downloadSource">{{ t('pluginManager.source') }}</button>
      <button v-if="!plugin.builtin" type="button" class="s3d-link" @click="remove">{{ t('pluginManager.remove') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dIcon from '../../S3dIcon.vue';
import S3dButton from '../../ui/S3dButton.vue';
import S3dToggleSwitch from '../../ui/S3dToggleSwitch.vue';
import { useEditor } from '../../keys';
import { PANEL_INFO, showPanel } from '../../panelState';
import { download } from '../../../engine/commands';
import { pluginSource, removePlugin, setPluginEnabled, type PluginEntry } from '../../../plugins/registry';
import { usePluginManagerState } from '../../../composables/usePluginManagerState';
import { t, localize, formatNumber } from '../../../i18n';

/** One installed plugin: switch, details, updates, its panels, source and remove. */
const props = defineProps<{ plugin: PluginEntry; canUpdate: boolean }>();
const editor = useEditor();
const { busy, message, folders, runBusy, installFromUrl, urlUpdates } = usePluginManagerState();
const megabytes = (bytes: number) => `${formatNumber(bytes / 1024 / 1024, { maximumFractionDigits: 1 })} MB`;
// panels that belong to a mode open there, not from here
const panels = computed(() => PANEL_INFO.filter((panel) => panel.id.startsWith(props.plugin.id + '.') && !panel.inMode));

const updateFromUrl = async () => {
  const source = props.plugin.package?.source;
  if (source) {
    await installFromUrl(source);
    delete urlUpdates[props.plugin.id];
  }
};
const downloadSource = () => download(`${props.plugin.id}.js`, pluginSource(props.plugin.id), 'text/javascript');
const remove = async () => {
  const { id, name } = props.plugin;
  if (!(await editor.confirm(t('pluginManager.confirmRemove', { name: localize(name) })))) {
    return;
  }
  removePlugin(id);
  delete folders.updateHints[id];
  folders.forgetFolder(id);
  message.value = { text: t('pluginManager.removed', { name: localize(name) }), error: false };
};
</script>
