<template>
  <S3dSectionTitle>{{ t('display.show') }}</S3dSectionTitle>
  <S3dCheckbox
    v-for="option in OPTS"
    :key="option.id"
    :class="{ 'ms-5': option.parent, 'cursor-default opacity-50': option.parent && !check(option.parent) }"
    :model-value="check(option.id)"
    :disabled="!!option.parent && !check(option.parent)"
    @update:model-value="toggle(option.id)"
    >{{ t(option.label) }}</S3dCheckbox
  >
  <S3dSectionTitle>{{ t('commands.toggleSectionPlanes') }}</S3dSectionTitle>
  <div v-for="section in sections" :key="section.id" class="flex items-center gap-1 [&_.s3d-btn]:px-1.75">
    <S3dRadio class="flex-1" name="activesec" :checked="section.active" @select="activate(section.id)">{{ section.name }}</S3dRadio>
    <S3dButton small :title="t('display.flip')" @click="flip(section.id)">⇄</S3dButton>
    <S3dButton small :title="t('display.shift')" @click="shift(section.id, -0.1)">−</S3dButton>
    <S3dButton small :title="t('display.shift')" @click="shift(section.id, 0.1)">+</S3dButton>
    <S3dButton small :title="t('commands.delete')" @click="del(section.id)">✕</S3dButton>
  </div>
  <S3dRadio v-if="sections.length" name="activesec" :checked="!sections.some((section) => section.active)" @select="activate(-1)">{{
    t('display.noActive')
  }}</S3dRadio>
  <div v-if="!sections.length" class="s3d-label">{{ t('display.empty') }}</div>
  <S3dSectionOptions v-if="activeSection" :section="activeSection" />
</template>

<script setup lang="ts">
import S3dButton from '../ui/S3dButton.vue';
import S3dCheckbox from '../ui/S3dCheckbox.vue';
import S3dRadio from '../ui/S3dRadio.vue';
import S3dSectionTitle from '../ui/S3dSectionTitle.vue';
import S3dSectionOptions from './S3dSectionOptions.vue';
import { useEditor } from '../keys';
import { runCommand, findCommand } from '../../engine/commands';
import { useModel } from '../../composables/useModel';
import { t } from '../../i18n';

const editor = useEditor();
/** command ids with the message key of their label here; options with a parent only take effect while the parent is on */
const OPTS: { id: string; label: string; parent?: string }[] = [
  { id: 'toggleAxes', label: 'commands.toggleAxes' },
  { id: 'toggleRulers', label: 'display.rulers', parent: 'toggleAxes' },
  { id: 'toggleGrid', label: 'display.grid' },
  { id: 'toggleGridAxes', label: 'commands.toggleGridAxes', parent: 'toggleGrid' },
  { id: 'toggleGridLabels', label: 'display.labels', parent: 'toggleGrid' },
  { id: 'togglePeopleSize', label: 'commands.togglePeopleSize' },
  { id: 'toggleGuides', label: 'commands.toggleGuides' },
  { id: 'toggleSectionPlanes', label: 'commands.toggleSectionPlanes' },
  { id: 'toggleSectionCuts', label: 'commands.toggleSectionCuts' },
  { id: 'toggleHidden', label: 'commands.toggleHidden' },
  { id: 'toggleShadows', label: 'commands.toggleShadows' },
  { id: 'xray', label: 'commands.xray' },
];
const check = (id: string) => {
  void editor.ui.revision;
  return !!findCommand(id)?.checked?.(editor);
};
const toggle = (id: string) => {
  runCommand(editor, id);
  editor.ui.saved = false;
};
const sections = useModel(() => editor.model.sections);
const activeSection = useModel(() => editor.model.sections.find((section) => section.active));
const activate = (id: number) => {
  editor.commit('undo.activeSection', () => editor.model.sections.forEach((section) => (section.active = section.id === id)));
};
const flip = (id: number) => {
  editor.commit('undo.flipSection', () => {
    const section = editor.model.sections.find((candidate) => candidate.id === id);
    if (section) {
      section.normal.negate();
    }
  });
};
const shift = (id: number, distance: number) => {
  editor.commit('undo.moveSection', () => {
    const section = editor.model.sections.find((candidate) => candidate.id === id);
    if (section) {
      section.point.addScaledVector(section.normal, distance);
    }
  });
};
const del = (id: number) => {
  editor.commit('undo.deleteSection', () => {
    editor.model.sections = editor.model.sections.filter((section) => section.id !== id);
  });
};
</script>
