<template>
  <div class="mt-1.5 mb-2.5 flex items-center gap-3">
    <S3dIcon :name="info.icon" :size="28" />
    <div>
      <div class="text-[0.9375rem] font-bold">{{ info.name }}</div>
      <div v-if="info.key" class="text-xs text-ink-2">{{ t('instructor.shortcut', { key: info.key }) }}</div>
    </div>
  </div>
  <p class="mb-1.5">{{ text.desc }}</p>
  <div class="s3d-section-title">{{ t('instructor.usage') }}</div>
  <ol class="list-decimal ps-4.5">
    <li v-for="(step, i) in text.steps" :key="i" class="my-1">{{ step }}</li>
  </ol>
  <template v-if="text.mods?.length">
    <div class="s3d-section-title">{{ t('instructor.modifiers') }}</div>
    <ul class="list-disc ps-4.5">
      <li v-for="(modifier, i) in text.mods" :key="i" class="my-1">{{ modifier }}</li>
    </ul>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import { useEditor } from '../keys';
import { TOOL_INFO } from '../../engine/setup';
import { t, hasMessage } from '../../i18n';

const editor = useEditor();
const info = computed(() => TOOL_INFO[editor.ui.tool] ?? TOOL_INFO.select);
/** texts: `instructor.<tool>.desc`, `.step1`, `.step2` …, `.mod1` … */
const numbered = (tool: string, kind: 'step' | 'mod') => {
  const lines: string[] = [];
  for (let i = 1; hasMessage(`instructor.${tool}.${kind}${i}`); i++) {
    lines.push(t(`instructor.${tool}.${kind}${i}`));
  }
  return lines;
};
const text = computed(() => {
  const tool = editor.ui.tool;
  if (!hasMessage(`instructor.${tool}.desc`)) {
    return { desc: editor.ui.status, steps: [editor.ui.status] };
  }
  return { desc: t(`instructor.${tool}.desc`), steps: numbered(tool, 'step'), mods: numbered(tool, 'mod') };
});
</script>
