<template>
  <div class="s3d-section-title">{{ t('display.show') }}</div>
  <label
    v-for="option in OPTS"
    :key="option.id"
    class="s3d-check"
    :class="{ 'ms-5': option.parent, 'cursor-default opacity-50': option.parent && !check(option.parent) }"
    ><input type="checkbox" :checked="check(option.id)" :disabled="!!option.parent && !check(option.parent)" @change="toggle(option.id)" />
    {{ t(option.label) }}</label
  >
  <div class="s3d-section-title">{{ t('commands.toggleSectionPlanes') }}</div>
  <div v-for="section in sections" :key="section.id" class="flex items-center gap-1 [&_.s3d-btn]:px-1.75">
    <label class="s3d-check flex-1"
      ><input type="radio" name="activesec" :checked="section.active" @change="activate(section.id)" /> {{ section.name }}</label
    >
    <button class="s3d-btn small" :title="t('display.flip')" @click="flip(section.id)">⇄</button>
    <button class="s3d-btn small" :title="t('display.shift')" @click="shift(section.id, -0.1)">−</button>
    <button class="s3d-btn small" :title="t('display.shift')" @click="shift(section.id, 0.1)">+</button>
    <button class="s3d-btn small" :title="t('commands.delete')" @click="del(section.id)">✕</button>
  </div>
  <label v-if="sections.length" class="s3d-check"
    ><input type="radio" name="activesec" :checked="!sections.some((section) => section.active)" @change="activate(-1)" />
    {{ t('display.noActive') }}</label
  >
  <div v-if="!sections.length" class="s3d-label">{{ t('display.empty') }}</div>
</template>

<script setup lang="ts">
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
