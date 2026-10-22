<template>
  <!-- status -->
  <div class="flex items-start gap-2 rounded-[3px] border px-2 py-1.5" :class="statusInfo.box">
    <span class="mt-1 size-2 shrink-0 rounded-full" :class="statusInfo.dot"></span>
    <div class="flex-1">
      <div class="font-bold">{{ statusInfo.text }}</div>
      <div class="text-[0.6875rem] text-ink-2">{{ t('remote.panel.server', { url: origin }) }}</div>
      <button v-if="remoteState.connected && !remoteState.active" class="s3d-btn small mt-1.5" @click="useThisTab">
        {{ t('remote.panel.useThisTab') }}
      </button>
    </div>
  </div>

  <!-- activity log -->
  <div class="s3d-section-title flex items-center">
    <span class="flex-1">{{ t('remote.panel.activity') }}</span>
    <button v-if="remoteState.log.length" class="s3d-link" @click="clearLog">{{ t('remote.panel.clear') }}</button>
  </div>
  <p v-if="!remoteState.log.length" class="s3d-label leading-[1.4]">{{ t('remote.panel.noActivity') }}</p>
  <div v-else class="max-h-72 overflow-auto rounded-[3px] border border-line">
    <div v-for="entry in remoteState.log" :key="entry.id" class="border-b border-line px-1.5 py-1 last:border-b-0">
      <div class="flex items-center gap-1.5 text-xs">
        <span :class="entry.ok ? 'text-ok' : 'text-danger'">{{ entry.ok ? '✓' : '✗' }}</span>
        <span class="rounded-[2px] bg-navy-bg px-1 text-[0.625rem] font-bold text-navy">{{ entry.source.toUpperCase() }}</span>
        <span class="s3d-ltr flex-1 truncate font-mono">{{ entry.action }}</span>
        <span class="text-[0.6875rem] text-ink-2 tabular-nums">{{ entry.durationMs }} ms · {{ timeFormat.format(entry.time) }}</span>
      </div>
      <div v-if="entry.summary" class="s3d-ltr truncate font-mono text-[0.6875rem] text-ink-2" :title="entry.summary">
        {{ entry.summary }}
      </div>
      <div v-if="entry.error" class="text-[0.6875rem] whitespace-pre-wrap text-danger">{{ entry.error.split('\n')[0] }}</div>
    </div>
  </div>

  <!-- documentation -->
  <div class="s3d-section-title">{{ t('remote.panel.docs') }}</div>
  <div class="flex flex-wrap gap-1.5">
    <a class="s3d-btn small no-underline" :href="`${origin}/api/docs`" target="_blank" rel="noopener">{{ t('remote.panel.swagger') }} ↗</a>
    <a class="s3d-btn small no-underline" :href="`${origin}/api/openapi.json`" target="_blank" rel="noopener">OpenAPI ↗</a>
  </div>
  <details class="mt-2" @toggle="loadEndpoints">
    <summary class="cursor-pointer text-xs text-navy">{{ t('remote.panel.endpoints') }}</summary>
    <p v-if="endpointsError" class="mt-1 text-xs text-danger">{{ endpointsError }}</p>
    <table v-else class="mt-1 w-full border-collapse text-[0.6875rem]">
      <tr
        v-for="endpoint in endpoints"
        :key="endpoint.method + endpoint.path"
        class="border-b border-line align-top"
        :title="endpoint.summary"
      >
        <td class="py-0.5 pe-1.5 font-mono font-bold text-navy">{{ endpoint.method }}</td>
        <td class="s3d-ltr py-0.5 pe-1.5 font-mono break-all">{{ endpoint.path }}</td>
        <td class="s3d-ltr py-0.5 font-mono text-ink-2">{{ endpoint.tool ?? '–' }}</td>
      </tr>
    </table>
  </details>

  <!-- MCP set-up -->
  <div class="s3d-section-title">{{ t('remote.panel.mcpSetup') }}</div>
  <p class="s3d-label mb-1.5 leading-[1.4]">{{ t('remote.panel.mcpHint') }}</p>
  <div v-for="snippet in snippets" :key="snippet.id" class="mb-2 border border-line bg-surface-2">
    <div class="flex items-center gap-1.5 border-b border-line py-0.5 pe-1 ps-1.5 text-[0.6875rem] text-ink-2">
      <span class="flex-1 font-bold text-navy">{{ snippet.label }}</span>
      <button
        class="border border-transparent bg-transparent px-1.5 py-px text-[0.6875rem] hover:border-line-2 hover:bg-surface"
        :class="copied && copiedId === snippet.id ? 'text-ok' : 'text-blue'"
        @click="copySnippet(snippet.id, snippet.code)"
      >
        {{ copied && copiedId === snippet.id ? `✓ ${t('toast.copied')}` : `⧉ ${t('commands.copy')}` }}
      </button>
    </div>
    <pre
      class="s3d-ltr m-0 overflow-auto px-2 py-1.5 font-mono text-[0.6875rem]/[1.45] break-all whitespace-pre-wrap text-ink select-text"
      >{{ snippet.code }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { useClipboard } from '@vueuse/core';
import { remoteState, useThisTab, clearLog } from './connection';
import { t, language } from '../../../i18n';

interface Endpoint {
  method: string;
  path: string;
  tool?: string;
  summary?: string;
}

const origin = location.origin;

const statusInfo = computed(() => {
  if (!remoteState.connected) {
    return { text: t('remote.panel.disconnected'), dot: 'bg-danger', box: 'border-danger' };
  }
  if (remoteState.active) {
    return { text: t('remote.panel.active'), dot: 'bg-ok', box: 'border-ok bg-ok-bg' };
  }
  return { text: t('remote.panel.otherTab', { count: remoteState.tabs }), dot: 'bg-warn', box: 'border-warn bg-warn-bg' };
});

const timeFormat = computed(() => new Intl.DateTimeFormat(language.value || undefined, { timeStyle: 'medium' }));

// i18n-ignore-start – the set-up snippets are commands and configuration, the same in every language
const snippets = computed(() => [
  { id: 'claude', label: 'Claude Code', code: `claude mcp add --transport http shap3d ${origin}/mcp` },
  {
    id: 'json',
    label: '.mcp.json (HTTP)',
    code: JSON.stringify({ mcpServers: { shap3d: { type: 'http', url: `${origin}/mcp` } } }, null, 2),
  },
  {
    id: 'stdio',
    label: 'stdio',
    code: JSON.stringify(
      { mcpServers: { shap3d: { command: 'node', args: ['src/plugins/builtin/remote/server/mcpStdio.mjs'], env: { S3D_URL: origin } } } },
      null,
      2,
    ),
  },
]);
// i18n-ignore-end

const copiedId = shallowRef('');
const { copy, copied } = useClipboard({ legacy: true, copiedDuring: 1500 });
const copySnippet = (id: string, code: string) => {
  copiedId.value = id;
  copy(code);
};

/** the endpoints and MCP tools, read from the dev server's OpenAPI definition when the list is opened */
const endpoints = shallowRef<Endpoint[]>([]);
const endpointsError = shallowRef('');
const loadEndpoints = async (event: Event) => {
  if (!(event.target as HTMLDetailsElement).open || endpoints.value.length) {
    return;
  }
  try {
    const definition = await fetch(`${origin}/api/openapi.json`).then((response) => response.json());
    endpoints.value = Object.entries(definition.paths as Record<string, Record<string, any>>).flatMap(([path, operations]) =>
      Object.entries(operations).map(([method, operation]) => ({
        method: method.toUpperCase(),
        path: `/api${path}`,
        tool: operation['x-mcp-tool'],
        summary: operation.summary,
      })),
    );
    endpointsError.value = '';
  } catch (error) {
    endpointsError.value = t('remote.panel.endpointsFailed', { error: (error as Error).message });
  }
};
</script>
