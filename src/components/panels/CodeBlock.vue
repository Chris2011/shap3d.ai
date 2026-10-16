<template>
  <div class="cb" :class="{ collapsed }">
    <div class="cbh">
      <button class="tg" :title="collapsed ? 'Aufklappen' : 'Zuklappen'" @click="collapsed = !collapsed">{{ collapsed ? '▸' : '▾' }}</button>
      <span class="lg">{{ LABEL[lang] }}</span>
      <span class="ln">{{ lines }} Zeilen{{ streaming ? ' …' : '' }}</span>
      <button class="cp" :class="{ ok: copied }" :title="'Code kopieren'" @click="copy">{{ copied ? '✓ Kopiert' : '⧉ Kopieren' }}</button>
    </div>
    <pre v-show="!collapsed" class="hl" v-html="html"></pre>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { highlight, type CodeLang } from '../../scripting/highlight';

const props = withDefaults(defineProps<{ code: string; lang?: CodeLang; streaming?: boolean; startCollapsed?: boolean }>(), { lang: 'js' });
const LABEL: Record<CodeLang, string> = { js: 'JavaScript', json: 'JSON', obj: 'OBJ-Mesh' };
const collapsed = ref(!!props.startCollapsed);
const copied = ref(false);
const lines = computed(() => props.code.split('\n').length);
const html = computed(() => highlight(props.code, props.lang));

async function copy() {
  try { await navigator.clipboard.writeText(props.code); }
  catch {
    // clipboard API blocked (e.g. insecure context) – fall back to a hidden textarea
    const ta = document.createElement('textarea'); ta.value = props.code; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  copied.value = true; setTimeout(() => { copied.value = false; }, 1500);
}
</script>

<style scoped>
.cb { margin: 6px 0; border: 1px solid var(--s3d-line); background: var(--s3d-bg-2); white-space: normal; }
.cbh { display: flex; align-items: center; gap: 6px; padding: 2px 4px 2px 2px; border-bottom: 1px solid var(--s3d-line); background: var(--s3d-bg-2); font-size: 11px; color: var(--s3d-text-2); }
.collapsed .cbh { border-bottom: 0; }
.tg { border: 0; background: transparent; cursor: pointer; width: 18px; color: var(--s3d-navy); padding: 0; }
.lg { font-weight: 700; color: var(--s3d-navy); }
.ln { flex: 1; }
.cp { border: 1px solid transparent; background: transparent; cursor: pointer; font-size: 11px; color: var(--s3d-blue); padding: 1px 6px; }
.cp:hover { border-color: var(--s3d-line-2); background: var(--s3d-bg); }
.cp.ok { color: var(--s3d-ok); }
.hl { margin: 0; padding: 6px 8px; max-height: 260px; overflow: auto; font: 11.5px/1.45 Consolas, monospace; white-space: pre; color: var(--s3d-text); tab-size: 2; user-select: text; }
.hl :deep(.c) { color: var(--syn-c); font-style: italic; }
.hl :deep(.s) { color: var(--syn-s); }
.hl :deep(.n) { color: var(--syn-n); }
.hl :deep(.b) { color: var(--syn-b); font-weight: 600; }
.hl :deep(.k) { color: var(--syn-k); }
.hl :deep(.api) { color: var(--syn-api); font-weight: 600; }
</style>
