<template>
  <S3dFieldRow :label="t('display.sectionDepth')">
    <S3dTextInput :model-value="depthText" :placeholder="t('display.sectionDepthAll')" @commit="setDepth" @keydown.stop />
  </S3dFieldRow>
  <div class="s3d-label">{{ t('display.sectionTags') }}</div>
  <S3dCheckbox v-for="tag in tags" :key="tag.name" :model-value="chosen.includes(tag.name)" @update:model-value="toggleTag(tag.name)">{{
    tag.name === 'Untagged' ? t('tags.untagged') : tag.name
  }}</S3dCheckbox>
</template>

<script setup lang="ts">
import S3dCheckbox from '../ui/S3dCheckbox.vue';
import S3dFieldRow from '../ui/S3dFieldRow.vue';
import S3dTextInput from '../ui/S3dTextInput.vue';
import { useEditor } from '../keys';
import { useModel } from '../../composables/useModel';
import { parseLength } from '../../core/units';
import type { SectionPlane } from '../../core/document';
import { t } from '../../i18n';

/** The active section's view depth and the tags it cuts (no tag ticked = it cuts everything). */
const props = defineProps<{ section: SectionPlane }>();
const editor = useEditor();
const tags = useModel(() => editor.model.tags);
// the section object stays the same while it changes – these follow the model's revision
const depthText = useModel(() => (props.section.depth ? editor.fmt(props.section.depth) : ''));
const chosen = useModel(() => [...(props.section.tags ?? [])]);

/** the section in the model – the prop may be a copy from before the last undo step */
const live = (change: (section: SectionPlane) => void) => () => {
  const section = editor.model.sections.find((candidate) => candidate.id === props.section.id);
  if (section) {
    change(section);
  }
};
/** empty or 0 shows everything behind the cut */
const setDepth = (text: string) => {
  const depth = text.trim() ? parseLength(text, editor.model.settings.units) : 0;
  if (depth === null || depth < 0) {
    editor.toast(t('toast.invalidLength', { value: text }));
    return;
  }
  editor.commit(
    'undo.sectionDepth',
    live((section) => (section.depth = depth || undefined)),
  );
};
const toggleTag = (name: string) =>
  editor.commit(
    'undo.sectionTags',
    live((section) => {
      const before = section.tags ?? [];
      const next = before.includes(name) ? before.filter((other) => other !== name) : [...before, name];
      section.tags = next.length ? next : undefined;
    }),
  );
</script>
