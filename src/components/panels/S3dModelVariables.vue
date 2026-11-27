<template>
  <S3dSectionTitle>{{ t('variables.title') }}</S3dSectionTitle>
  <p class="s3d-label my-1">{{ t('variables.hint') }}</p>
  <div v-for="variable in rows" :key="variable.name" class="mb-1 flex items-center gap-1">
    <span class="text-ink-2">#</span>
    <S3dTextInput
      class="w-16 min-w-0"
      :model-value="variable.name"
      :aria-label="t('variables.name')"
      @commit="rename(variable.name, $event)"
      @keydown.stop
    />
    <S3dTextInput
      class="min-w-0 flex-1"
      :model-value="variable.value"
      :aria-label="t('variables.value')"
      @commit="change(variable.name, $event)"
      @keydown.stop
    />
    <span
      class="w-14 shrink-0 truncate text-end text-xs text-ink-2"
      :class="{ 'text-red-600': variable.result === null }"
      :title="variable.shown"
      >{{ variable.shown }}</span
    >
    <S3dButton small :title="t('commands.delete')" @click="remove(variable.name)">✕</S3dButton>
  </div>
  <S3dButton small @click="add">{{ t('variables.add') }}</S3dButton>
</template>

<script setup lang="ts">
import S3dButton from '../ui/S3dButton.vue';
import S3dSectionTitle from '../ui/S3dSectionTitle.vue';
import S3dTextInput from '../ui/S3dTextInput.vue';
import { useEditor } from '../keys';
import { useModel } from '../../composables/useModel';
import { parseExpression } from '../../core/units';
import { isVariableName } from '../../core/variables';
import { applyVariables, renameVariableUses } from '../../core/variableProcedures';
import { t, formatNumber } from '../../i18n';

/** The model's variables: name, expression and what it comes to; changing one builds the procedures that use it again. */
const editor = useEditor();
const rows = useModel(() =>
  editor.model.variables.map((variable) => {
    const result = parseExpression(`#${variable.name}`, editor.model.settings.units);
    const shown = result === null ? '?' : result.length ? editor.fmt(result.value) : formatNumber(result.value);
    return { ...variable, result, shown };
  }),
);

/** one undo step that also builds the procedures again whose typed parameters changed */
const commitVariables = (label: string, change: () => void) => {
  try {
    editor.commit(label, () => {
      change();
      applyVariables(editor.model, editor.model.settings.units).forEach((error) => editor.toast(t(error)));
    });
  } catch {
    // commit has put everything back and said why
  }
};
const find = (name: string) => editor.model.variables.find((variable) => variable.name === name);

const add = () => {
  let number = editor.model.variables.length + 1;
  while (find(`${t('variables.defaultName')}${number}`)) {
    number++;
  }
  commitVariables('variables.undoAdd', () => editor.model.variables.push({ name: `${t('variables.defaultName')}${number}`, value: '1 m' }));
};
/** a new expression – refused (and the old one kept) when it is no valid expression */
const change = (name: string, value: string) =>
  commitVariables('variables.undoChange', () => {
    find(name)!.value = value.trim();
    if (parseExpression(`#${name}`, editor.model.settings.units) === null) {
      throw new Error(t('variables.invalid', { value }));
    }
  });
/** a new name – the other variables and typed parameters that use the old one follow */
const rename = (from: string, to: string) => {
  const name = to.trim().replace(/^#/, '');
  if (name === from) {
    return;
  }
  if (!isVariableName(name) || find(name)) {
    editor.toast(t(find(name) ? 'variables.nameTaken' : 'variables.badName', { name }));
    return;
  }
  commitVariables('variables.undoChange', () => {
    find(from)!.name = name;
    renameVariableUses(editor.model, from, name);
  });
};
/** what used it keeps its last value (and shows "?" while the name is missing) */
const remove = (name: string) =>
  commitVariables('variables.undoRemove', () => {
    editor.model.variables = editor.model.variables.filter((variable) => variable.name !== name);
  });
</script>
