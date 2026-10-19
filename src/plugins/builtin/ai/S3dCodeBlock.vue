<template>
  <div class="my-1.5 border border-line bg-surface-2 whitespace-normal">
    <div class="flex items-center gap-1.5 bg-surface-2 py-0.5 pr-1 pl-0.5 text-[0.6875rem] text-ink-2" :class="{ 'border-b border-line': !collapsed }">
      <button class="w-4.5 bg-transparent p-0 text-navy" :title="collapsed ? 'Aufklappen' : 'Zuklappen'" @click="collapsed = !collapsed">{{ collapsed ? '▸' : '▾' }}</button>
      <span class="font-bold text-navy">{{ LABEL[lang] }}</span>
      <span class="flex-1">{{ lines }} Zeilen{{ streaming ? ' …' : '' }}</span>
      <button class="border border-transparent bg-transparent px-1.5 py-px text-[0.6875rem] hover:border-line-2 hover:bg-surface" :class="copied ? 'text-ok' : 'text-blue'" :title="'Code kopieren'" @click="copy">{{ copied ? '✓ Kopiert' : '⧉ Kopieren' }}</button>
    </div>
    <pre v-show="!collapsed" class="s3d-syntax m-0 max-h-65 overflow-auto px-2 py-1.5 font-mono text-[0.71875rem]/[1.45] whitespace-pre text-ink select-text [tab-size:2]" v-html="html"></pre>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useClipboard } from '@vueuse/core';
import { highlight, type CodeLang } from '../../../scripting/highlight';

const props = withDefaults(defineProps<{ code: string; lang?: CodeLang; streaming?: boolean; startCollapsed?: boolean }>(), { lang: 'js' });
const LABEL: Record<CodeLang, string> = { js: 'JavaScript', json: 'JSON', obj: 'OBJ-Mesh' };
const collapsed = ref(!!props.startCollapsed);
const lines = computed(() => props.code.split('\n').length);
const html = computed(() => highlight(props.code, props.lang));

// legacy: falls back to execCommand where the clipboard API is blocked (e.g. insecure context)
const { copy: write, copied } = useClipboard({ legacy: true, copiedDuring: 1500 });
const copy = () => write(props.code);
</script>
