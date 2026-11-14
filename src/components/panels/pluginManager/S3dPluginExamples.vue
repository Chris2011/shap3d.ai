<template>
  <template v-if="shown.length">
    <div class="s3d-caption mt-4 mb-1 text-navy">{{ t('pluginManager.examples') }}</div>
    <div
      v-for="example in shown"
      :key="example.file"
      class="mb-1.5 flex items-start gap-2 border border-dashed border-line px-2.25 py-1.75"
    >
      <div class="flex-1">
        <div class="font-semibold text-navy">{{ example.name }}</div>
        <p class="mt-0.5 text-xs text-ink-2">{{ example.description }}</p>
      </div>
      <S3dButton small :disabled="busy" @click="install(example.code)">
        {{ example.installed ? t('pluginManager.update') : t('pluginManager.install') }}
      </S3dButton>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dButton from '../../ui/S3dButton.vue';
import { plugins, pluginSource, EXAMPLE_PLUGINS } from '../../../plugins/registry';
import { usePluginManagerState } from '../../../composables/usePluginManagerState';
import { t } from '../../../i18n';

/** The example plugins in the repository that are new, or changed since they were installed. */
const { busy, install, matches } = usePluginManagerState();
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
const shown = computed(() => examples.value.filter((example) => matches(example.name, example.description, example.id)));
</script>
