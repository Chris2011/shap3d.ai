<template>
  <!-- a procedural group: what it is made with, its parameters and its inputs -->
  <div v-if="procedure" class="mt-2 border-t border-line-2 pt-2">
    <div class="mb-1.5 font-semibold">{{ t(`procedures.kinds.${procedure.kind}`) }}</div>

    <div v-if="procedure.kind === 'solid'" class="s3d-row">
      <span class="s3d-label">{{ t('procedures.operation') }}</span>
      <select class="s3d-input" :value="procedure.params.operation" @change="setParams({ operation: inputValue($event) })">
        <option v-for="operation in PROCEDURE_SOLID_OPS" :key="operation" :value="operation">{{ t(`commands.solid-${operation}`) }}</option>
      </select>
    </div>

    <template v-if="procedure.kind === 'copyalong'">
      <div class="s3d-row">
        <span class="s3d-label">{{ t('procedures.distribute') }}</span>
        <select class="s3d-input" :value="procedure.params.mode" @change="setParams({ mode: inputValue($event) })">
          <option value="count">{{ t('procedures.byCount') }}</option>
          <option value="spacing">{{ t('procedures.bySpacing') }}</option>
        </select>
      </div>
      <div v-if="procedure.params.mode === 'count'" class="s3d-row">
        <span class="s3d-label">{{ t('procedures.count') }}</span>
        <input class="s3d-input" type="number" min="1" step="1" :value="procedure.params.count" @change="setCount($event)" @keydown.stop />
      </div>
      <div v-else class="s3d-row">
        <span class="s3d-label">{{ t('procedures.spacing') }}</span>
        <input class="s3d-input" :value="editor.fmt(Number(procedure.params.spacing))" @change="setSpacing($event)" @keydown.stop />
      </div>
      <label class="s3d-check">
        <input
          type="checkbox"
          :checked="!!procedure.params.align"
          @change="setParams({ align: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('procedures.align') }}
      </label>
    </template>

    <div class="s3d-row">
      <span class="s3d-label">{{ t('procedures.inputs') }}</span>
      <span class="min-w-0 truncate" :title="inputNames">{{ inputNames }}</span>
    </div>
    <p v-if="procedure.error" class="my-1 text-red-600" role="alert">{{ t(procedure.error) }}</p>
    <p class="my-1 text-ink-2">{{ t('procedures.editHint') }}</p>
    <div class="mt-1.5 flex flex-wrap gap-1.5">
      <button class="s3d-btn" @click="runCommand(editor, 'editGroup')">{{ t('procedures.editInputs') }}</button>
      <button class="s3d-btn" @click="runCommand(editor, 'explodeToInputs')">{{ t('commands.explodeToInputs') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEditor } from '../keys';
import { isProcedureInput } from '../../core/model';
import { PROCEDURE_SOLID_OPS, rebuildProcedure } from '../../core/procedures';
import { parseLength } from '../../core/units';
import { runCommand } from '../../engine/commands';
import { useSelection } from '../../composables/useModel';
import { t } from '../../i18n';

const editor = useEditor();

const instance = useSelection(() => {
  const selection = editor.selected();
  const only = selection.length === 1 && selection[0].kind === 'instance' ? editor.entities.instances.get(selection[0].id) : undefined;
  return only?.definition.procedure ? only : null;
});
const procedure = computed(() => instance.value?.definition.procedure);
const inputNames = computed(() =>
  [...(instance.value?.definition.entities.instances.values() ?? [])]
    .filter(isProcedureInput)
    .map((input) => input.name || input.definition.name)
    .join(', '),
);

const inputValue = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;

const setParams = (change: Record<string, string | number | boolean>) => {
  const definition = instance.value?.definition;
  if (!definition?.procedure) {
    return;
  }
  editor.commit('procedures.undoParams', () => {
    Object.assign(definition.procedure!.params, change);
    const error = rebuildProcedure(definition, editor.model);
    if (error) {
      editor.toast(t(error));
    }
  });
};
const setCount = (event: Event) => {
  const count = Math.round(Number(inputValue(event)));
  if (Number.isFinite(count) && count >= 1) {
    setParams({ count });
  } else {
    (event.target as HTMLInputElement).value = String(procedure.value?.params.count ?? 1);
  }
};
const setSpacing = (event: Event) => {
  const spacing = parseLength(inputValue(event), editor.model.settings.units);
  if (spacing != null && spacing > 0) {
    setParams({ spacing });
  } else {
    (event.target as HTMLInputElement).value = editor.fmt(Number(procedure.value?.params.spacing ?? 1));
  }
};
</script>
